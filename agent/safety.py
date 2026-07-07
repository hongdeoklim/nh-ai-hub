"""
Phase 3 — 안전장치.
스펙 4번 표의 1, 2, 3, 7번 항목을 구현한다.

1. 사람-AI 동시 작업 충돌 방지 → "AI 작업 중" 오버레이 팝업
2. 모달 다이얼로그 감지 워치독 → 5초 간격, 별도 스레드
3. Undo 스택 관리 → step마다 UNDO Mark + SaveAs 스냅샷
7. 환경 정보 로깅 → UNITS, INSUNITS, acad.Version
"""
from __future__ import annotations

import logging
import os
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Callable

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# AutoCAD 설정 상수
# ---------------------------------------------------------------------------
_AUTOCAD_INIT_CMDS = (
    "FILEDIA 0\n"
    "CMDDIA 0\n"
    "ATTDIA 0\n"
    "SECURELOAD 2\n"
)

# 잔여 모달 다이얼로그로 판단할 윈도우 제목 키워드 (대소문자 무시)
_DIALOG_KEYWORDS = [
    "저장", "save", "경고", "warning", "오류", "error",
    "확인", "confirm", "알림", "alert",
]

# ---------------------------------------------------------------------------
# 환경 정보 수집 (스펙 7)
# ---------------------------------------------------------------------------

def collect_env_info(acad: Any) -> dict:
    """AutoCAD 버전·단위 정보를 dict로 반환한다."""
    info: dict = {"acad_version": "unknown", "units": None, "insunits": None}
    try:
        info["acad_version"] = getattr(acad, "Version", "unknown")
        doc = getattr(acad, "ActiveDocument", None)
        if doc:
            db = getattr(doc, "Database", None)
            if db:
                info["units"] = getattr(db, "Lunits", None)
                info["insunits"] = getattr(db, "Insunits", None)
    except Exception as exc:
        logger.debug("env_info 수집 실패: %s", exc)
    return info


# ---------------------------------------------------------------------------
# AutoCAD 초기 설정 (스펙 2·5)
# ---------------------------------------------------------------------------

def apply_autocad_settings(acad: Any) -> None:
    """
    자동화 시작 시 AutoCAD 시스템 변수를 설정한다.
    FILEDIA/CMDDIA/ATTDIA=0 : 대화상자 억제
    SECURELOAD=2            : 외부 파일 보안 강화
    """
    try:
        doc = acad.ActiveDocument
        for cmd in _AUTOCAD_INIT_CMDS.strip().split("\n"):
            doc.Util.SendCommand(cmd + "\n")
        logger.info("AutoCAD 초기 보안 설정 완료")
    except Exception as exc:
        logger.warning("AutoCAD 설정 적용 실패: %s", exc)


# ---------------------------------------------------------------------------
# "AI 작업 중" 오버레이 팝업 (스펙 1)
# ---------------------------------------------------------------------------

class WorkingOverlay:
    """
    작업 시작 시 화면에 "AI 작업 중" 팝업을 띄우고,
    작업 종료 시 닫는다. win32gui를 쓰되 없으면 tkinter fallback.
    """

    def __init__(self, job_id: str, project_classification: str = "general") -> None:
        self._job_id = job_id
        self._classification = project_classification
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._hwnd: int | None = None

    def show(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def hide(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=3)

    def _run(self) -> None:
        try:
            self._run_win32()
        except Exception:
            try:
                self._run_tkinter()
            except Exception as exc:
                logger.debug("오버레이 팝업 표시 실패: %s", exc)

    def _title_and_msg(self) -> tuple[str, str]:
        title = "⚠️  NH-AI-HUB — AI 작업 중"
        msg = (
            f"AI가 AutoCAD 작업을 수행하고 있습니다.\n"
            f"작업 ID : {self._job_id}\n\n"
            "작업이 완료될 때까지 AutoCAD를 직접 조작하지 마세요."
        )
        if self._classification == "confidential":
            msg += (
                "\n\n🔒 기밀 프로젝트\n"
                "도면 데이터가 NH-AI-HUB 서버로 전송됩니다.\n"
                "민감 메타데이터(회사명·타이틀블록)는 마스킹 처리됩니다."
            )
        return title, msg

    def _run_win32(self) -> None:
        import win32gui  # type: ignore[import]
        import win32con  # type: ignore[import]
        import win32api  # type: ignore[import]

        title, msg = self._title_and_msg()

        # 모달 없이 비차단 MessageBox는 없으므로 별도 스레드에서 MessageBox 호출,
        # stop_event 시 EnumWindows로 찾아서 닫는다.
        def _show_box() -> None:
            win32api.MessageBox(
                0, msg, title,
                win32con.MB_OK | win32con.MB_ICONINFORMATION | win32con.MB_TOPMOST,
            )

        box_thread = threading.Thread(target=_show_box, daemon=True)
        box_thread.start()

        # stop_event 대기 후 팝업 강제 종료
        self._stop_event.wait()

        def _close_cb(hwnd: int, _: Any) -> bool:
            if win32gui.IsWindowVisible(hwnd):
                wtext = win32gui.GetWindowText(hwnd)
                if "NH-AI-HUB" in wtext or "AI 작업 중" in wtext:
                    import win32con as wc
                    win32gui.PostMessage(hwnd, wc.WM_CLOSE, 0, 0)
            return True

        win32gui.EnumWindows(_close_cb, None)

    def _run_tkinter(self) -> None:
        """win32gui 없는 환경(개발 PC) 전용 fallback."""
        import tkinter as tk
        from tkinter import ttk

        title, msg = self._title_and_msg()

        root = tk.Tk()
        root.title(title)
        root.attributes("-topmost", True)
        root.resizable(False, False)

        frame = ttk.Frame(root, padding=20)
        frame.pack(fill="both", expand=True)
        ttk.Label(frame, text=msg, justify="left", wraplength=380).pack()

        def _poll_stop() -> None:
            if self._stop_event.is_set():
                root.destroy()
            else:
                root.after(500, _poll_stop)

        root.after(500, _poll_stop)
        root.mainloop()


# ---------------------------------------------------------------------------
# 모달 다이얼로그 워치독 (스펙 2)
# ---------------------------------------------------------------------------

class DialogWatchdog:
    """
    5초 간격으로 잔여 모달 다이얼로그를 감지하고 강제 종료한다.
    AutoCAD 창 핸들을 기준으로 자식 다이얼로그를 찾는다.
    """

    def __init__(self, interval_sec: int = 5) -> None:
        self._interval = interval_sec
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()

    def start(self) -> None:
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info("다이얼로그 워치독 시작")

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=self._interval + 2)
        logger.info("다이얼로그 워치독 종료")

    def _loop(self) -> None:
        while not self._stop_event.wait(self._interval):
            self._dismiss_dialogs()

    def _dismiss_dialogs(self) -> None:
        try:
            import win32gui   # type: ignore[import]
            import win32con   # type: ignore[import]
            import win32process  # type: ignore[import]
            import psutil     # type: ignore[import]

            # AutoCAD 프로세스 PID 목록만 수집 — 다른 앱 창 건드리지 않음
            acad_pids: set[int] = {
                p.pid for p in psutil.process_iter(["pid", "name"])
                if "acad" in (p.info.get("name") or "").lower()
            }

            def _cb(hwnd: int, _: Any) -> bool:
                if not win32gui.IsWindowVisible(hwnd):
                    return True
                try:
                    _, pid = win32process.GetWindowThreadProcessId(hwnd)
                except Exception:
                    return True
                if pid not in acad_pids:
                    return True   # AutoCAD 프로세스 창이 아니면 건너뜀
                title = win32gui.GetWindowText(hwnd).lower()
                if any(kw in title for kw in _DIALOG_KEYWORDS):
                    logger.warning("AutoCAD 잔여 다이얼로그 감지, 강제 종료: '%s'", title)
                    win32gui.PostMessage(hwnd, win32con.WM_KEYDOWN, win32con.VK_ESCAPE, 0)
                    win32gui.PostMessage(hwnd, win32con.WM_CLOSE, 0, 0)
                return True

            win32gui.EnumWindows(_cb, None)
        except ImportError:
            pass  # win32gui 없는 환경에서는 건너뜀
        except Exception as exc:
            logger.debug("워치독 예외: %s", exc)


# ---------------------------------------------------------------------------
# Step 실행기 — UNDO Mark + 스냅샷 (스펙 3)
# ---------------------------------------------------------------------------

class StepRunner:
    """
    명령 1개 = 1 step.
    step 시작 전 UNDO Mark, 완료 후 SaveAs 스냅샷.
    실패 시 UNDO Back으로 해당 step만 롤백한다.
    """

    def __init__(self, acad: Any, queue: Any, snapshot_dir: str) -> None:
        self._acad = acad
        self._queue = queue
        self._snapshot_dir = Path(snapshot_dir)
        self._snapshot_dir.mkdir(parents=True, exist_ok=True)

    def run(
        self,
        job_id: str,
        step_no: int,
        fn: Callable[[], dict],
        env_info: dict,
    ) -> dict:
        """
        fn()을 UNDO Mark로 감싸서 실행한다.
        성공 시 스냅샷 저장 후 cad_job_logs에 기록.
        실패 시 UNDO Back 후 예외를 재발생.
        """
        doc = self._acad.ActiveDocument
        util = doc.Util

        # UNDO Mark
        try:
            util.SendCommand("UNDO Mark\n")
        except Exception as exc:
            logger.debug("UNDO Mark 실패: %s", exc)

        try:
            result = fn()
        except Exception as exc:
            # UNDO Back으로 해당 step만 롤백
            try:
                util.SendCommand("UNDO Back\n")
                logger.warning("step %d 실패 → UNDO Back 완료", step_no)
            except Exception as undo_exc:
                logger.error("UNDO Back 실패: %s", undo_exc)

            self._queue.log_step(
                job_id=job_id,
                step_no=step_no,
                status="failed",
                env_info=env_info,
            )
            raise

        # 스냅샷 저장
        snapshot_path = self._save_snapshot(job_id, step_no, doc)

        self._queue.log_step(
            job_id=job_id,
            step_no=step_no,
            status="done",
            snapshot_path=snapshot_path,
            env_info=env_info,
        )
        return result

    def _save_snapshot(self, job_id: str, step_no: int, doc: Any) -> str:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{job_id[:8]}_{step_no:03d}_{ts}.dwg"
        path = str(self._snapshot_dir / filename)
        try:
            doc.SaveAs(path)
            logger.info("스냅샷 저장: %s", path)
        except Exception as exc:
            logger.warning("스냅샷 저장 실패: %s", exc)
            path = ""
        return path


# ---------------------------------------------------------------------------
# 통합 컨텍스트 매니저
# ---------------------------------------------------------------------------

class SafeJobContext:
    """
    with SafeJobContext(job, acad, queue, cfg) as ctx:
        ctx.step_runner.run(job_id, 1, fn, ctx.env_info)
    """

    def __init__(self, job: dict, acad: Any, queue: Any, cfg: dict) -> None:
        self._job = job
        self._acad = acad
        self._queue = queue
        self._cfg = cfg

        self.env_info: dict = {}
        self.step_runner: StepRunner | None = None
        self._overlay: WorkingOverlay | None = None
        self._watchdog: DialogWatchdog | None = None

    def __enter__(self) -> SafeJobContext:
        job_id = self._job["id"]
        classification = self._job.get("project_classification", "general")

        # 환경 정보 수집 (스펙 7)
        self.env_info = collect_env_info(self._acad)
        logger.info("환경 정보: %s", self.env_info)

        # AutoCAD 초기 설정 (FILEDIA 등)
        apply_autocad_settings(self._acad)

        # "AI 작업 중" 팝업 표시 (스펙 1)
        self._overlay = WorkingOverlay(job_id, classification)
        self._overlay.show()

        # 다이얼로그 워치독 시작 (스펙 2)
        self._watchdog = DialogWatchdog()
        self._watchdog.start()

        # StepRunner 초기화 (스펙 3)
        self.step_runner = StepRunner(
            self._acad,
            self._queue,
            self._cfg.get("snapshot_dir", r"C:\NH-AI-HUB-workspace\snapshots"),
        )
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self._watchdog:
            self._watchdog.stop()
        if self._overlay:
            self._overlay.hide()
        # 종료 시 환경 정보 재수집해서 로깅 (스펙 7)
        end_env = collect_env_info(self._acad)
        logger.info("작업 종료 환경 정보: %s", end_env)
