r"""
NH-AX-HUB 에이전트 설치기 (다운로드형 단일 exe) — Inno Setup·관리자 권한 불필요.

이 설치기는 용량이 작고, 실행 시 공개 스토리지에서 실제 실행 파일을 내려받아 설치한다
(설치본 하나만 배포하면 되고, 개별 실행 파일은 스토리지 용량 제한 아래로 유지됨).

동작:
  1. 공개 버킷에서 nh-agent.exe / setup_wizard.exe 다운로드
     → %LOCALAPPDATA%\NH-AX-HUB-Agent 에 저장
  2. 작업 폴더(C:\NH-AI-HUB-workspace + snapshots/incoming_quarantine) 생성
  3. Windows 시작 시 자동 실행 등록 (HKCU\...\Run — 사용자 권한)
  4. 설정 마법사 실행 → 접속 정보/작업 폴더 입력(config.json 저장)
  5. config.json 이 저장되면 에이전트를 백그라운드로 실행

두 exe 가 같은 폴더에 있으므로 setup_wizard 가 저장한 config.json 을
nh-agent 가 같은 폴더에서 읽는다(둘 다 frozen 시 실행파일 옆 config.json 사용).
"""
from __future__ import annotations

import ctypes
import os
import subprocess
import sys
import urllib.request
import winreg
from pathlib import Path

APP_NAME = "NH-AX-HUB Agent"
BASE_URL = "https://wndnjrcljdvbnezfpisb.supabase.co/storage/v1/object/public/agent-installer"
FILES = ("nh-agent.exe", "setup_wizard.exe")
INSTALL_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "NH-AX-HUB-Agent"
WORKSPACE = Path(r"C:\NH-AI-HUB-workspace")
RUN_KEY = r"Software\Microsoft\Windows\CurrentVersion\Run"
RUN_VALUE = "NH-AX-HUB-Agent"
CREATE_NO_WINDOW = 0x08000000


def _msgbox(text: str, title: str = APP_NAME, style: int = 0x40) -> None:
    # 0x40 정보 / 0x30 경고 / 0x10 오류
    ctypes.windll.user32.MessageBoxW(0, text, title, style)


def _download(url: str, dest: Path) -> None:
    print(f"[다운로드] {url}")

    def _hook(block: int, block_size: int, total: int) -> None:
        if total > 0:
            pct = min(100, block * block_size * 100 // total)
            print(f"\r  {dest.name}: {pct}%", end="", flush=True)

    urllib.request.urlretrieve(url, dest, _hook)
    print(f"\r  {dest.name}: 완료           ")


def main() -> int:
    print(f"[설치] {APP_NAME} 설치를 시작합니다...")
    try:
        INSTALL_DIR.mkdir(parents=True, exist_ok=True)

        # 1) 실행 파일 다운로드
        for name in FILES:
            _download(f"{BASE_URL}/{name}", INSTALL_DIR / name)

        # 2) 작업 폴더 생성
        for sub in ("", "snapshots", "incoming_quarantine"):
            (WORKSPACE / sub).mkdir(parents=True, exist_ok=True)

        # 3) 자동 실행 등록 (사용자 권한 HKCU)
        agent_path = INSTALL_DIR / "nh-agent.exe"
        with winreg.CreateKey(winreg.HKEY_CURRENT_USER, RUN_KEY) as key:
            winreg.SetValueEx(key, RUN_VALUE, 0, winreg.REG_SZ, f'"{agent_path}"')
        print("[설치] 시작 프로그램 등록 완료")

        # 4) 설정 마법사 실행 (접속 정보 입력 → config.json 저장)
        wizard = INSTALL_DIR / "setup_wizard.exe"
        if wizard.exists():
            print("[설치] 설정 마법사를 실행합니다. 접속 정보를 입력하고 저장하세요.")
            subprocess.call([str(wizard)])

        # 5) config.json 이 있으면 에이전트 백그라운드 실행
        if (INSTALL_DIR / "config.json").exists():
            subprocess.Popen(
                [str(agent_path)],
                creationflags=CREATE_NO_WINDOW,
                cwd=str(INSTALL_DIR),
            )
            _msgbox(
                f"설치가 완료되었습니다.\n\n"
                f"설치 위치: {INSTALL_DIR}\n"
                f"작업 폴더: {WORKSPACE}\n\n"
                f"에이전트가 백그라운드에서 실행 중입니다.\n"
                f"이제 NH-AX-HUB 채팅에서 CAD 명령을 요청할 수 있습니다.",
            )
        else:
            _msgbox(
                f"파일 설치는 끝났지만 접속 정보가 저장되지 않았습니다.\n\n"
                f"{wizard}\n를 다시 실행해 접속 정보를 입력·저장한 뒤,\n"
                f"{agent_path}\n를 실행하세요.",
                style=0x30,
            )
        return 0
    except Exception as exc:  # noqa: BLE001
        _msgbox(f"설치 중 오류가 발생했습니다:\n{exc}", style=0x10)
        return 1


if __name__ == "__main__":
    sys.exit(main())
