# -*- mode: python ; coding: utf-8 -*-
# setup_wizard.py PyInstaller spec
# pyinstaller setup_wizard.spec

block_cipher = None

a = Analysis(
    ['setup_wizard.py'],
    pathex=['.'],
    binaries=[],
    datas=[],
    hiddenimports=[
        'tkinter', 'tkinter.ttk', 'tkinter.filedialog', 'tkinter.messagebox',
        'win32com', 'win32com.client', 'win32api', 'win32con', 'pywintypes', 'pythoncom',
        'winreg',
        'supabase', 'supabase._sync.client',
        'gotrue', 'httpx', 'httpcore', 'postgrest',
        'certifi', 'charset_normalizer', 'urllib3',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=['ezdxf'],  # 마법사에는 불필요
    cipher=block_cipher,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='setup_wizard',
    debug=False,
    strip=False,
    upx=True,
    upx_exclude=['pywintypes*.dll', 'pythoncom*.dll'],
    console=False,   # GUI 전용 — 콘솔 창 없음
    onefile=True,
)
