"""
작업 실행기.
cad_jobs 한 건을 받아 AutoCAD COM으로 실행한 뒤 결과를 반환한다.
Phase 2(validator), Phase 3(safety)와 연동 예정.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import validator as val
import safety
import quarantine as quar
import masking
import sketchup_exec

logger = logging.getLogger(__name__)


class JobExecutor:
    def __init__(
        self,
        acad: Any,
        queue: Any,
        cfg: dict,
        validator: val.Validator | None = None,
        sketchup: Any = None,
    ) -> None:
        self._acad = acad
        self._queue = queue
        self._cfg = cfg
        self._validator = validator
        self._sketchup = sketchup
        self._quarantine = quar.QuarantineManager(
            quarantine_dir=cfg.get("quarantine_dir", r"C:\NH-AI-HUB-workspace\incoming_quarantine"),
            workspace_dir=cfg.get("dwg_workspace", r"C:\NH-AI-HUB-workspace"),
            queue=queue,
        )

    def run(self, job: dict) -> None:
        job_id: str = job["id"]
        command: str = job["command"]
        params: dict = job.get("params", {})
        risk_tier: str = job.get("risk_tier", "safe")

        logger.info("작업 시작 job_id=%s command=%s", job_id, command)

        # 화이트리스트 검증
        if self._validator:
            try:
                self._validator.validate(job)
            except val.ValidationError as e:
                if e.should_approve:
                    logger.warning("승인 필요 job_id=%s: %s", job_id, e.reason)
                    self._queue.set_pending_approval(job_id)
                else:
                    logger.error("검증 실패 job_id=%s: %s", job_id, e.reason)
                    self._queue.set_failed(job_id, e.reason)
                return

        # validator 없을 때 fallback: destructive는 직접 차단
        elif risk_tier == "destructive":
            logger.warning("destructive 명령 — 사람 승인 대기로 전환: %s", job_id)
            self._queue.set_pending_approval(job_id)
            return

        self._queue.set_running(job_id)

        # SketchUp 명령은 COM이 아닌 Ruby API 백엔드로 라우팅한다(AutoCAD SafeJobContext 우회).
        if command in sketchup_exec.SKETCHUP_COMMANDS:
            self._run_sketchup(job, command, params, job_id)
            return

        try:
            with safety.SafeJobContext(job, self._acad, self._queue, self._cfg) as ctx:
                result = self._dispatch(command, params, job_id, ctx)
            # 기밀 프로젝트는 전송 전 마스킹 적용
            result = masking.prepare_for_transmission(job, result)
            self._queue.set_completed(job_id, result)
            logger.info("작업 완료 job_id=%s", job_id)
        except Exception as exc:
            logger.exception("작업 실패 job_id=%s", job_id)
            self._queue.set_failed(job_id, str(exc))

    def _run_sketchup(self, job: dict, command: str, params: dict, job_id: str) -> None:
        """SketchUp 백엔드 실행(별도 프로세스). 성공/실패를 큐에 반영한다."""
        if self._sketchup is None:
            self._queue.set_failed(job_id, "SketchUp 백엔드가 이 PC에 설정되지 않았습니다.")
            return
        try:
            result = self._sketchup.execute(command, params, job_id)
            result = masking.prepare_for_transmission(job, result)
            self._queue.set_completed(job_id, result)
            logger.info("SketchUp 작업 완료 job_id=%s", job_id)
        except Exception as exc:
            logger.exception("SketchUp 작업 실패 job_id=%s", job_id)
            self._queue.set_failed(job_id, str(exc))

    def _dispatch(self, command: str, params: dict, job_id: str, ctx: safety.SafeJobContext) -> dict:
        """command 이름에 따라 실제 AutoCAD 동작을 StepRunner로 감싸 실행한다."""
        step_no = 1

        params_with_id = {**params, "_job_id": job_id}

        def _run() -> dict:
            if command == "open_dwg":
                return self._open_dwg(params_with_id)
            elif command == "save_dwg":
                return self._save_dwg(params)
            elif command == "run_lisp":
                return self._run_lisp(params)
            elif command == "dwg_to_dxf":
                return self._dwg_to_dxf(params)
            else:
                raise NotImplementedError(f"알 수 없는 command: {command}")

        return ctx.step_runner.run(job_id, step_no, _run, ctx.env_info)

    # ------------------------------------------------------------------
    # 개별 명령 구현 (AutoCAD COM 호출)
    # ------------------------------------------------------------------

    def _open_dwg(self, params: dict) -> dict:
        path: str = params["path"]
        # 외부 파일 여부: dwg_workspace 밖에서 온 파일은 격리 스캔 선행
        # os.path.commonpath로 대소문자·슬래시 정규화 후 비교 (Windows 경로 탈출 방지)
        workspace = self._cfg.get("dwg_workspace", r"C:\NH-AI-HUB-workspace")
        try:
            is_external = os.path.commonpath(
                [os.path.abspath(path), os.path.abspath(workspace)]
            ) != os.path.abspath(workspace)
        except ValueError:
            is_external = True  # 드라이브가 다르면 무조건 외부
        if is_external:
            job_id: str = params.get("_job_id", "unknown")
            safe_path = self._quarantine.receive(path, job_id)
            if not safe_path:
                raise RuntimeError(f"외부 파일 격리 스캔 실패 또는 승인 대기: {path}")
            path = safe_path
        self._acad.ActiveDocument.Util.SendCommand(f'._OPEN "{path}"\n')
        return {"opened": path}

    def _save_dwg(self, params: dict) -> dict:
        path: str = params.get("path", self._acad.ActiveDocument.FullName)
        self._acad.ActiveDocument.SaveAs(path)
        return {"saved": path}

    def _run_lisp(self, params: dict) -> dict:
        expr: str = params["expr"]
        # TODO: LISP 표현식 화이트리스트 검증 (Phase 2)
        self._acad.ActiveDocument.Util.SendCommand(expr + "\n")
        return {"executed": expr}

    # 인라인으로 반환할 DXF 텍스트 최대 크기(약 6MB). 초과 시 에러로 안내.
    _MAX_DXF_INLINE = 6_000_000

    def _dwg_to_dxf(self, params: dict) -> dict:
        """
        DWG를 열어 DXF로 내보내고, 그 텍스트를 result로 반환한다(브라우저 CAD 에디터가 사용).
        FILEDIA=0(safety.apply_autocad_settings)로 대화상자가 억제된 상태를 가정한다.
        """
        import time

        path: str = params["path"]
        if not os.path.isfile(path):
            raise FileNotFoundError(f"DWG 파일을 찾을 수 없습니다: {path}")

        dxf_path = os.path.splitext(path)[0] + ".nh-export.dxf"
        try:
            if os.path.exists(dxf_path):
                os.remove(dxf_path)
        except OSError:
            pass

        # DWG 열기 → 활성 도면 갱신
        self._acad.ActiveDocument.Util.SendCommand(f'._OPEN "{path}"\n')
        doc = self._acad.ActiveDocument
        # DXF 내보내기: DXFOUT 후 파일명, 정밀도(16)
        doc.Util.SendCommand(f'._DXFOUT\n"{dxf_path}"\n16\n')

        # SendCommand는 비동기라 파일 생성/안정화를 폴링한다(최대 ~40s).
        deadline = time.time() + 40
        last_size = -1
        stable = 0
        while time.time() < deadline:
            if os.path.exists(dxf_path):
                size = os.path.getsize(dxf_path)
                if size > 0 and size == last_size:
                    stable += 1
                    if stable >= 2:
                        break
                else:
                    stable = 0
                last_size = size
            time.sleep(1)
        if not os.path.exists(dxf_path) or os.path.getsize(dxf_path) == 0:
            raise RuntimeError("DXF 내보내기에 실패했습니다(파일 미생성).")

        size = os.path.getsize(dxf_path)
        if size > self._MAX_DXF_INLINE:
            raise RuntimeError(
                f"도면이 너무 큽니다({size} bytes). 인라인 변환 한도({self._MAX_DXF_INLINE}) 초과 — "
                "도면을 나누거나 정리 후 다시 시도하세요."
            )
        with open(dxf_path, "r", encoding="utf-8", errors="replace") as f:
            text = f.read()
        return {"dxf_text": text, "source": path, "bytes": size}
