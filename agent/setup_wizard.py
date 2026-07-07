r"""
Phase 9 — NH-AI-HUB Agent 설정 마법사 (tkinter GUI)
Inno Setup 설치 중 또는 독립 실행으로 호출된다.

실행 방법:
  python setup_wizard.py               # 독립 실행
  python setup_wizard.py --post-install # 설치 완료 후 Inno Setup이 호출

기능:
  - Supabase URL / Key 입력
  - AutoCAD 작업 폴더 선택 (폴더 탐색 다이얼로그)
  - AutoCAD COM ProgID 자동 감지 및 표시
  - "테스트 연결" 버튼 → Supabase ping + AutoCAD COM 연결 검증
  - 저장 → C:\Program Files\NH-AI-HUB-Agent\config.json 기록
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import threading
import winreg
from pathlib import Path
from tkinter import filedialog, messagebox
import tkinter as tk
import tkinter.ttk as ttk


# ---------------------------------------------------------------------------
# 경로 상수
# ---------------------------------------------------------------------------

def _default_config_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).parent / "config.json"
    return Path(r"C:\Program Files\NH-AI-HUB-Agent\config.json")


CONFIG_PATH = _default_config_path()
WORKSPACE_DEFAULT = r"C:\NH-AI-HUB-workspace"


# ---------------------------------------------------------------------------
# 유틸
# ---------------------------------------------------------------------------

def detect_autocad_progid() -> str:
    """레지스트리에서 AutoCAD.Application.XX ProgID를 찾아 반환한다."""
    try:
        root = winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, "")
        latest = ""
        i = 0
        while True:
            try:
                name = winreg.EnumKey(root, i)
                if name.startswith("AutoCAD.Application"):
                    latest = name
                i += 1
            except OSError:
                break
        winreg.CloseKey(root)
        return latest
    except Exception:
        return ""


def detect_sketchup_exe() -> str:
    """일반적인 설치 경로에서 SketchUp.exe를 찾아 반환한다(없으면 빈 문자열)."""
    base = Path(r"C:\Program Files\SketchUp")
    if base.exists():
        # 최신 연도 폴더 우선 (SketchUp 2024, 2023 …)
        candidates = sorted(base.glob("SketchUp*/SketchUp.exe"), reverse=True)
        if candidates:
            return str(candidates[0])
    return ""


def load_existing_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}


def save_config(cfg: dict) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


# ---------------------------------------------------------------------------
# 테스트 연결 로직 (별도 스레드 실행)
# ---------------------------------------------------------------------------

def test_supabase(url: str, key: str) -> tuple[bool, str]:
    try:
        from supabase import create_client  # type: ignore[import]
        client = create_client(url, key)
        # 간단한 ping — allowed_programs 테이블 1행 조회
        client.table("allowed_programs").select("id").limit(1).execute()
        return True, "Supabase 연결 성공 ✅"
    except ImportError:
        return False, "supabase 패키지가 설치되어 있지 않습니다."
    except Exception as exc:
        return False, f"Supabase 연결 실패: {exc}"


def test_autocad(progid: str) -> tuple[bool, str]:
    try:
        import win32com.client  # type: ignore[import]
        acad = win32com.client.Dispatch(progid)
        caption = getattr(acad, "Caption", progid)
        return True, f"AutoCAD 연결 성공 ✅\n{caption}"
    except ImportError:
        return False, "pywin32가 설치되어 있지 않습니다."
    except Exception as exc:
        return False, f"AutoCAD COM 연결 실패: {exc}\nAutoCAD가 실행 중인지 확인하세요."


# ---------------------------------------------------------------------------
# 마법사 GUI
# ---------------------------------------------------------------------------

class SetupWizard(tk.Tk):
    def __init__(self, post_install: bool = False) -> None:
        super().__init__()
        self._post_install = post_install
        self._progid = detect_autocad_progid()
        self._skp_detected = detect_sketchup_exe()

        self.title("NH-AI-HUB Agent 설정 마법사")
        self.resizable(False, False)
        self.attributes("-topmost", True)
        self._center()
        self._build_ui()
        self._load_saved()

    def _center(self) -> None:
        self.update_idletasks()
        w, h = 520, 660
        x = (self.winfo_screenwidth() - w) // 2
        y = (self.winfo_screenheight() - h) // 2
        self.geometry(f"{w}x{h}+{x}+{y}")

    # ------------------------------------------------------------------
    # UI 구성
    # ------------------------------------------------------------------

    def _build_ui(self) -> None:
        pad = {"padx": 20, "pady": 6}

        # 헤더
        header = tk.Frame(self, bg="#1a472a")
        header.pack(fill="x")
        tk.Label(
            header,
            text="NH-AI-HUB Agent 설정",
            font=("맑은 고딕", 14, "bold"),
            bg="#1a472a", fg="white",
            pady=16,
        ).pack()

        body = ttk.Frame(self, padding=20)
        body.pack(fill="both", expand=True)

        # ── Supabase URL ──
        ttk.Label(body, text="Supabase URL", font=("맑은 고딕", 9, "bold")).grid(
            row=0, column=0, sticky="w", pady=(0, 2))
        self._url_var = tk.StringVar(value="https://")
        self._url_entry = ttk.Entry(body, textvariable=self._url_var, width=52)
        self._url_entry.grid(row=1, column=0, columnspan=2, sticky="ew", **pad)

        # ── Supabase Key ──
        ttk.Label(body, text="Supabase Anon/Service Key", font=("맑은 고딕", 9, "bold")).grid(
            row=2, column=0, sticky="w", pady=(8, 2))
        self._key_var = tk.StringVar()
        key_frame = ttk.Frame(body)
        key_frame.grid(row=3, column=0, columnspan=2, sticky="ew", padx=20, pady=6)
        self._key_entry = ttk.Entry(key_frame, textvariable=self._key_var, show="*", width=44)
        self._key_entry.pack(side="left")
        self._show_key = tk.BooleanVar(value=False)
        ttk.Checkbutton(
            key_frame, text="표시",
            variable=self._show_key,
            command=self._toggle_key_visibility,
        ).pack(side="left", padx=6)

        # ── AutoCAD 작업 폴더 ──
        ttk.Label(body, text="AutoCAD 작업 폴더", font=("맑은 고딕", 9, "bold")).grid(
            row=4, column=0, sticky="w", pady=(8, 2))
        ttk.Label(body, text="DWG 파일이 저장되는 기본 폴더를 선택하세요.",
                  foreground="gray").grid(row=5, column=0, columnspan=2, sticky="w", padx=20)
        ws_frame = ttk.Frame(body)
        ws_frame.grid(row=6, column=0, columnspan=2, sticky="ew", padx=20, pady=6)
        self._ws_var = tk.StringVar(value=WORKSPACE_DEFAULT)
        ttk.Entry(ws_frame, textvariable=self._ws_var, width=42).pack(side="left")
        ttk.Button(ws_frame, text="찾아보기…", command=self._browse_workspace).pack(
            side="left", padx=6)

        # ── AutoCAD 감지 결과 ──
        ttk.Separator(body, orient="horizontal").grid(
            row=7, column=0, columnspan=2, sticky="ew", pady=12, padx=20)

        acad_frame = ttk.LabelFrame(body, text="AutoCAD COM 감지 결과", padding=10)
        acad_frame.grid(row=8, column=0, columnspan=2, sticky="ew", padx=20)

        if self._progid:
            icon, color, msg = "✅", "#006600", f"감지됨: {self._progid}"
        else:
            icon, color, msg = "⚠️", "#cc6600", \
                "AutoCAD를 찾을 수 없습니다.\n설치 후 아래 ProgID를 직접 입력하세요."

        tk.Label(acad_frame, text=f"{icon} {msg}", fg=color,
                 justify="left", wraplength=440).pack(anchor="w")

        progid_frame = ttk.Frame(acad_frame)
        progid_frame.pack(fill="x", pady=(6, 0))
        ttk.Label(progid_frame, text="ProgID:").pack(side="left")
        self._progid_var = tk.StringVar(value=self._progid or "AutoCAD.Application")
        ttk.Entry(progid_frame, textvariable=self._progid_var, width=30).pack(
            side="left", padx=6)

        # ── SketchUp (선택) ──
        skp_frame = ttk.LabelFrame(body, text="SketchUp (선택 — 설치 시 자동 감지)", padding=10)
        skp_frame.grid(row=9, column=0, columnspan=2, sticky="ew", padx=20, pady=(12, 0))
        ttk.Label(skp_frame, text="SketchUp.exe 경로를 지정하면 SketchUp 명령도 실행됩니다.",
                  foreground="gray", wraplength=440).pack(anchor="w")
        skp_row = ttk.Frame(skp_frame)
        skp_row.pack(fill="x", pady=(6, 0))
        self._skp_var = tk.StringVar(value=self._skp_detected)
        ttk.Entry(skp_row, textvariable=self._skp_var, width=40).pack(side="left")
        ttk.Button(skp_row, text="찾아보기…", command=self._browse_sketchup).pack(
            side="left", padx=6)

        # ── 테스트 연결 ──
        ttk.Separator(body, orient="horizontal").grid(
            row=10, column=0, columnspan=2, sticky="ew", pady=12, padx=20)

        test_frame = ttk.Frame(body)
        test_frame.grid(row=11, column=0, columnspan=2, sticky="ew", padx=20)

        ttk.Button(test_frame, text="🔗 테스트 연결", command=self._run_test).pack(side="left")
        self._test_status = tk.StringVar(value="")
        ttk.Label(test_frame, textvariable=self._test_status, wraplength=320,
                  justify="left").pack(side="left", padx=12)

        # ── 하단 버튼 ──
        btn_frame = ttk.Frame(self, padding=(20, 10))
        btn_frame.pack(fill="x", side="bottom")
        ttk.Button(btn_frame, text="저장 후 닫기", command=self._save_and_close,
                   style="Accent.TButton").pack(side="right", padx=4)
        ttk.Button(btn_frame, text="취소", command=self.destroy).pack(side="right")

        body.columnconfigure(0, weight=1)

    # ------------------------------------------------------------------
    # 이벤트 핸들러
    # ------------------------------------------------------------------

    def _toggle_key_visibility(self) -> None:
        self._key_entry.config(show="" if self._show_key.get() else "*")

    def _browse_workspace(self) -> None:
        chosen = filedialog.askdirectory(
            title="AutoCAD 작업 폴더 선택",
            initialdir=self._ws_var.get(),
        )
        if chosen:
            self._ws_var.set(chosen.replace("/", "\\"))

    def _browse_sketchup(self) -> None:
        chosen = filedialog.askopenfilename(
            title="SketchUp.exe 선택",
            filetypes=[("SketchUp", "SketchUp.exe"), ("실행 파일", "*.exe")],
            initialdir=r"C:\Program Files\SketchUp",
        )
        if chosen:
            self._skp_var.set(chosen.replace("/", "\\"))

    def _load_saved(self) -> None:
        cfg = load_existing_config()
        if cfg.get("supabase_url"):
            self._url_var.set(cfg["supabase_url"])
        if cfg.get("supabase_key"):
            self._key_var.set(cfg["supabase_key"])
        if cfg.get("dwg_workspace"):
            self._ws_var.set(cfg["dwg_workspace"])
        if cfg.get("autocad_progid"):
            self._progid_var.set(cfg["autocad_progid"])
        if cfg.get("sketchup_exe"):
            self._skp_var.set(cfg["sketchup_exe"])

    def _run_test(self) -> None:
        url = self._url_var.get().strip()
        key = self._key_var.get().strip()
        progid = self._progid_var.get().strip()

        if not url or not key:
            self._test_status.set("❌ URL과 Key를 먼저 입력하세요.")
            return

        self._test_status.set("⏳ 연결 테스트 중...")
        self.update()

        def _worker() -> None:
            sb_ok, sb_msg = test_supabase(url, key)
            ac_ok, ac_msg = test_autocad(progid)
            combined = f"{sb_msg}\n{ac_msg}"
            icon = "✅" if (sb_ok and ac_ok) else "⚠️"
            self._test_status.set(f"{icon} {combined}")

        threading.Thread(target=_worker, daemon=True).start()

    def _validate(self) -> bool:
        url = self._url_var.get().strip()
        key = self._key_var.get().strip()
        ws  = self._ws_var.get().strip()

        if not url or not url.startswith("https://"):
            messagebox.showerror("입력 오류", "Supabase URL은 https:// 로 시작해야 합니다.")
            return False
        if not key:
            messagebox.showerror("입력 오류", "Supabase Key를 입력하세요.")
            return False
        if not ws:
            messagebox.showerror("입력 오류", "AutoCAD 작업 폴더를 입력하세요.")
            return False
        return True

    def _save_and_close(self) -> None:
        if not self._validate():
            return

        ws = self._ws_var.get().strip()
        cfg = {
            "supabase_url":     self._url_var.get().strip(),
            "supabase_key":     self._key_var.get().strip(),
            "autocad_progid":   self._progid_var.get().strip() or "AutoCAD.Application",
            "sketchup_exe":     self._skp_var.get().strip(),
            "dwg_workspace":    ws,
            "poll_interval_sec": 5,
            "snapshot_dir":     str(Path(ws) / "snapshots"),
            "quarantine_dir":   str(Path(ws) / "incoming_quarantine"),
        }

        # 작업 폴더 하위 디렉터리 생성
        for sub in ("snapshots", "incoming_quarantine"):
            Path(ws, sub).mkdir(parents=True, exist_ok=True)

        try:
            save_config(cfg)
            messagebox.showinfo(
                "저장 완료",
                f"설정이 저장되었습니다.\n{CONFIG_PATH}\n\n"
                "에이전트가 백그라운드에서 실행됩니다.",
            )
            self.destroy()
        except PermissionError:
            messagebox.showerror(
                "저장 실패",
                f"{CONFIG_PATH} 에 쓸 수 없습니다.\n"
                "관리자 권한으로 다시 실행해 주세요.",
            )


# ---------------------------------------------------------------------------
# 진입점
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="NH-AI-HUB Agent 설정 마법사")
    parser.add_argument("--post-install", action="store_true",
                        help="Inno Setup 설치 완료 후 자동 호출 모드")
    args = parser.parse_args()

    app = SetupWizard(post_install=args.post_install)
    app.mainloop()


if __name__ == "__main__":
    main()
