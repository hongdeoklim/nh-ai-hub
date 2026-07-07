"""
SketchUp 실행기.

SketchUp은 AutoCAD와 달리 COM 자동화 인터페이스가 없고, Ruby API로 제어한다.
공식 자동화 진입점은 시작 인자 `-RubyStartup <script.rb>` 로, SketchUp이 켜질 때
지정한 Ruby 스크립트를 실행한다. 우리는 작업마다 Ruby 스크립트를 생성해
`SketchUp.exe -RubyStartup startup.rb` 로 띄우고, Ruby가 결과를 텍스트 파일(key=value)
로 남기면 에이전트가 그 파일을 폴링해 읽어온다.

- 프로세스 수명은 파이썬(에이전트)이 관리한다. export/run_ruby 처럼 1회성 작업은
  결과 파일이 생기면 프로세스를 종료하고, open_skp 는 모델을 연 채로 남겨둔다.
  (SketchUp Ruby에는 신뢰할 수 있는 공개 quit API가 없어 외부에서 종료한다.)
- SketchUp이 설치되지 않은 개발 환경에서는 MockSketchUp 으로 대체된다.
"""
from __future__ import annotations

import logging
import os
import subprocess
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# 이 실행기가 처리하는 command 이름들 (allowed_programs 화이트리스트와 일치)
SKETCHUP_COMMANDS = {"open_skp", "export_skp", "run_ruby_sketchup"}

# 결과 파일 폴링 설정
_RESULT_TIMEOUT_SEC = 120
_RESULT_POLL_SEC = 1.0


def _ruby_str(value: str) -> str:
    """파이썬 문자열을 Ruby 단일따옴표 문자열 리터럴로 안전하게 변환한다."""
    escaped = value.replace("\\", "\\\\").replace("'", "\\'")
    return f"'{escaped}'"


class SketchUpRunner:
    def __init__(self, exe_path: str, workspace: str) -> None:
        self._exe = exe_path
        self._workspace = workspace
        self._job_dir = Path(workspace) / ".nh_agent"

    @property
    def available(self) -> bool:
        return bool(self._exe) and os.path.isfile(self._exe)

    # ------------------------------------------------------------------
    def execute(self, command: str, params: dict, job_id: str) -> dict:
        if command not in SKETCHUP_COMMANDS:
            raise NotImplementedError(f"SketchUp 미지원 command: {command}")
        if not self.available:
            raise RuntimeError(
                f"SketchUp 실행 파일을 찾을 수 없습니다: {self._exe or '(미설정)'}"
            )

        work = self._job_dir / job_id
        work.mkdir(parents=True, exist_ok=True)
        result_path = work / "result.txt"
        startup_path = work / "startup.rb"
        if result_path.exists():
            result_path.unlink()

        keep_open = command == "open_skp"
        startup_path.write_text(
            self._build_ruby(command, params, str(result_path)),
            encoding="utf-8",
        )

        logger.info("SketchUp 실행 job_id=%s command=%s", job_id, command)
        proc = subprocess.Popen([self._exe, "-RubyStartup", str(startup_path)])

        try:
            result = self._await_result(result_path, proc)
        finally:
            if not keep_open and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()

        if result.get("ok") != "true":
            raise RuntimeError(result.get("error", "SketchUp 작업 실패"))
        result.pop("ok", None)
        return {"backend": "sketchup", "command": command, **result}

    # ------------------------------------------------------------------
    def _await_result(self, result_path: Path, proc: subprocess.Popen) -> dict:
        deadline = time.time() + _RESULT_TIMEOUT_SEC
        while time.time() < deadline:
            if result_path.exists():
                return self._parse_result(result_path)
            if proc.poll() is not None and not result_path.exists():
                # SketchUp이 결과를 남기지 못하고 종료됨
                time.sleep(_RESULT_POLL_SEC)
                if result_path.exists():
                    return self._parse_result(result_path)
                raise RuntimeError("SketchUp이 결과를 남기지 못하고 종료되었습니다.")
            time.sleep(_RESULT_POLL_SEC)
        raise TimeoutError(f"SketchUp 작업 시간 초과({_RESULT_TIMEOUT_SEC}s)")

    @staticmethod
    def _parse_result(result_path: Path) -> dict:
        out: dict = {}
        for line in result_path.read_text(encoding="utf-8").splitlines():
            if "=" in line:
                k, _, v = line.partition("=")
                out[k.strip()] = v.strip()
        return out

    # ------------------------------------------------------------------
    def _build_ruby(self, command: str, params: dict, result_path: str) -> str:
        header = (
            "# NH-AI-HUB SketchUp job runner (auto-generated)\n"
            f"$nh_result = {_ruby_str(result_path)}\n"
            "def nh_done(lines)\n"
            "  File.open($nh_result, 'w') { |f| f.write(lines.join(\"\\n\")) }\n"
            "end\n"
            "begin\n"
        )
        footer = (
            "rescue => e\n"
            "  nh_done(['ok=false', \"error=#{e.message}\"])\n"
            "end\n"
        )
        body = self._ruby_body(command, params)
        return header + body + footer

    def _ruby_body(self, command: str, params: dict) -> str:
        if command == "open_skp":
            path = _ruby_str(str(params["path"]))
            return (
                f"  Sketchup.open_file({path})\n"
                f"  nh_done(['ok=true', \"opened=\" + {path}])\n"
            )
        if command == "export_skp":
            path = _ruby_str(str(params["path"]))
            out = _ruby_str(str(params["out"]))
            return (
                f"  Sketchup.open_file({path})\n"
                "  model = Sketchup.active_model\n"
                f"  target = {out}\n"
                "  if target.downcase.end_with?('.png')\n"
                "    model.active_view.write_image(target, 1920, 1080, false, 0.0)\n"
                "  else\n"
                "    model.export(target, false)\n"
                "  end\n"
                "  nh_done(['ok=true', \"exported=\" + target])\n"
            )
        if command == "run_ruby_sketchup":
            expr = str(params["expr"])
            # 사용자 Ruby 표현식은 destructive 로 분류되어 사람 승인 후에만 도달한다.
            return (
                "  Sketchup.open_file(" + _ruby_str(str(params["path"])) + ")\n"
                if params.get("path")
                else ""
            ) + (
                f"  __nh_ret = eval({_ruby_str(expr)})\n"
                "  nh_done(['ok=true', \"returned=#{__nh_ret.inspect}\"])\n"
            )
        raise NotImplementedError(command)


class MockSketchUp:
    """SketchUp 미설치 개발 환경용 스텁."""

    available = True

    def execute(self, command: str, params: dict, job_id: str) -> dict:  # noqa: D401
        logger.info("[MockSketchUp] %s params=%s", command, params)
        return {"backend": "sketchup-mock", "command": command, **{k: str(v) for k, v in params.items()}}


def make_runner(exe_path: str, workspace: str) -> Any:
    """설정된 exe 경로가 유효하면 SketchUpRunner, 아니면 None(미지원)."""
    runner = SketchUpRunner(exe_path, workspace)
    if runner.available:
        return runner
    logger.info("SketchUp 실행 파일 미발견(%s) — SketchUp 백엔드 비활성화", exe_path or "미설정")
    return None
