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

# 공개 기본값 — 개인 계정 모드(모델 B)에서 직원은 이메일/비번만 입력하면 되도록 URL·anon 키를
# 내장한다. anon 키는 공개 값(프런트엔드 번들에도 포함)이라 하드코딩해도 안전하다.
_DEFAULT_SUPABASE_URL = "https://wndnjrcljdvbnezfpisb.supabase.co"
_DEFAULT_ANON_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InduZG5qcmNsamR2Ym5lemZwaXNiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwNjg1MzMsImV4cCI6MjA5NDY0NDUzM30"
    ".EKlmjR3itw2KoPQt4_ecBNTnQPW9Y5wgF_IbRea-tgk"
)


def load() -> dict:
    cfg: dict = {}
    if _DEFAULT_CONFIG_PATH.exists():
        with open(_DEFAULT_CONFIG_PATH, encoding="utf-8") as f:
            cfg = json.load(f)

    # 환경 변수가 config.json보다 우선
    return {
        "supabase_url": os.environ.get(
            "SUPABASE_URL", cfg.get("supabase_url", "") or _DEFAULT_SUPABASE_URL
        ),
        # 모델 A(공용 PC): service_role 키. 있으면 서비스 키 모드로 동작.
        "supabase_key": os.environ.get("SUPABASE_KEY", cfg.get("supabase_key", "")),
        # 모델 B(직원 PC): anon 키 + 개인 이메일/비번. 직원은 이메일/비번만 입력.
        "supabase_anon_key": os.environ.get(
            "SUPABASE_ANON_KEY", cfg.get("supabase_anon_key", "") or _DEFAULT_ANON_KEY
        ),
        "supabase_email": os.environ.get("SUPABASE_EMAIL", cfg.get("supabase_email", "")),
        "supabase_password": os.environ.get(
            "SUPABASE_PASSWORD", cfg.get("supabase_password", "")
        ),
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
