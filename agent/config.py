"""
에이전트 설정 로더.
설치 마법사(Phase 8)가 생성한 config.json을 읽어 환경 변수와 병합한다.
"""
import json
import os
import sys
from pathlib import Path

# PyInstaller onefile 번들에서는 실행 파일 옆에 config.json이 있다
def _default_config_path() -> Path:
    env = os.environ.get("NH_AGENT_CONFIG")
    if env:
        return Path(env)
    # 번들 실행 시 sys.executable 디렉터리 우선
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / "config.json"
    return Path(r"C:\Program Files\NH-AI-HUB-Agent\config.json")

_DEFAULT_CONFIG_PATH = _default_config_path()

_WORKSPACE_DEFAULT = r"C:\NH-AI-HUB-workspace"


def load() -> dict:
    cfg: dict = {}
    if _DEFAULT_CONFIG_PATH.exists():
        with open(_DEFAULT_CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)

    # 환경 변수가 config.json보다 우선
    return {
        "supabase_url": os.environ.get("SUPABASE_URL", cfg.get("supabase_url", "")),
        "supabase_key": os.environ.get("SUPABASE_KEY", cfg.get("supabase_key", "")),
        # 설치 마법사에서 사용자가 선택한 AutoCAD 작업 폴더
        "dwg_workspace": os.environ.get(
            "NH_DWG_WORKSPACE",
            cfg.get("dwg_workspace", _WORKSPACE_DEFAULT),
        ),
        # AutoCAD COM ProgID — 설치 마법사가 레지스트리에서 자동 감지
        "autocad_progid": os.environ.get(
            "AUTOCAD_PROGID",
            cfg.get("autocad_progid", "AutoCAD.Application"),
        ),
        # SketchUp.exe 경로 — 설치 마법사가 감지하거나 사용자가 지정. 비면 SketchUp 백엔드 비활성.
        "sketchup_exe": os.environ.get(
            "SKETCHUP_EXE",
            cfg.get("sketchup_exe", ""),
        ),
        "poll_interval_sec": int(cfg.get("poll_interval_sec", 5)),
        "snapshot_dir": cfg.get(
            "snapshot_dir",
            str(Path(_WORKSPACE_DEFAULT) / "snapshots"),
        ),
        "quarantine_dir": cfg.get(
            "quarantine_dir",
            str(Path(_WORKSPACE_DEFAULT) / "incoming_quarantine"),
        ),
    }
