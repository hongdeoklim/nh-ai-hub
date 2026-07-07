# -*- mode: python ; coding: utf-8 -*-
#
# PyInstaller spec 파일 — build.bat 대신 직접 사용 가능:
#   pyinstaller nh-agent.spec
#
# pywin32 계열의 hidden-import 누락 문제를 spec으로 정밀 제어한다.

import sys
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# ezdxf, supabase 전체 수집
datas_ezdxf,    binaries_ezdxf,    hiddenimports_ezdxf    = collect_all('ezdxf')
datas_supabase, binaries_supabase, hiddenimports_supabase = collect_all('supabase')

# pywin32 관련 submodule 전체
hiddenimports_win32 = (
    collect_submodules('win32com') +
    collect_submodules('win32com.client') +
    collect_submodules('win32com.server') +
    collect_submodules('win32com.shell') +
    [
        'win32api', 'win32gui', 'win32con',
        'win32con', 'pywintypes', 'pythoncom',
        'win32com.shell.shell', 'win32com.shell.shellcon',
    ]
)

a = Analysis(
    ['main.py'],
    pathex=['.'],
    binaries=binaries_ezdxf + binaries_supabase,
    datas=datas_ezdxf + datas_supabase,
    hiddenimports=(
        hiddenimports_ezdxf +
        hiddenimports_supabase +
        hiddenimports_win32 +
        [
            # supabase 내부
            'gotrue', 'gotrue._sync.client', 'gotrue._async.client',
            'httpx', 'httpcore',
            'postgrest', 'postgrest._sync.client', 'postgrest._async.client',
            'realtime', 'storage3', 'storage3._sync.client',
            # requests
            'requests', 'certifi', 'charset_normalizer', 'urllib3',
            # tkinter fallback
            'tkinter', 'tkinter.ttk',
        ]
    ),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='nh-agent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,           # UPX 압축 (없으면 자동 건너뜀)
    upx_exclude=[
        # pywin32 DLL은 UPX 압축 시 깨지는 경우가 있어 제외
        'python*.dll',
        'win32*.pyd',
        'pythoncom*.dll',
        'pywintypes*.dll',
    ],
    runtime_tmpdir=None,
    console=True,        # 트레이 전환은 Phase 8 설치 후 --noconsole 으로 재빌드 가능
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    onefile=True,
)
