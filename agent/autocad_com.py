"""
AutoCAD COM 연결 래퍼.
pywin32(win32com)으로 AutoCAD 인스턴스를 가져오거나 새로 띄운다.
AutoCAD가 없는 환경에서는 MockAcad로 대체되어 테스트/개발이 가능하다.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)


class MockAcad:
    """AutoCAD 없는 환경에서 사용하는 스텁. 개발/CI 전용."""

    Caption = "MockAutoCAD (no AutoCAD installed)"
    Version = "mock-0.0"

    class _Doc:
        class _Util:
            def SendCommand(self, cmd: str) -> None:  # noqa: N802
                logger.info("[MockAcad] SendCommand: %s", cmd.strip())

        Util = _Util()
        FullName = r"C:\NH-AI-HUB-workspace\mock.dwg"

        def SaveAs(self, path: str) -> None:  # noqa: N802
            logger.info("[MockAcad] SaveAs: %s", path)

    ActiveDocument = _Doc()

    def GetInterfaceObject(self, prog_id: str) -> Any:  # noqa: N802
        logger.info("[MockAcad] GetInterfaceObject: %s", prog_id)
        return self


def connect(progid: str = "AutoCAD.Application") -> Any:
    """
    실행 중인 AutoCAD 인스턴스에 붙거나, 없으면 새로 실행한다.
    AutoCAD가 설치되지 않은 환경에서는 MockAcad를 반환한다.
    """
    try:
        import win32com.client  # type: ignore[import]

        try:
            acad = win32com.client.GetActiveObject(progid)
            logger.info("AutoCAD 인스턴스 연결 성공: %s", acad.Caption)
        except Exception:
            logger.info("실행 중인 AutoCAD 없음 — 새로 실행합니다.")
            acad = win32com.client.Dispatch(progid)

        return acad

    except ImportError:
        logger.warning("pywin32 없음 — MockAcad로 대체합니다.")
        return MockAcad()
    except Exception as exc:
        logger.warning("AutoCAD COM 연결 실패(%s) — MockAcad로 대체합니다.", exc)
        return MockAcad()
