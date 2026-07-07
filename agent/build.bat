@echo off
setlocal EnableDelayedExpansion

echo ================================================
echo  NH-AI-HUB AutoCAD Agent - PyInstaller Build
echo ================================================
echo.

:: Python 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python을 찾을 수 없습니다.
    echo         https://www.python.org/downloads/ 에서 설치 후 PATH에 추가하세요.
    pause & exit /b 1
)

:: PyInstaller 설치 확인
python -c "import PyInstaller" >nul 2>&1
if errorlevel 1 (
    echo [INFO] PyInstaller가 없습니다. 설치합니다...
    python -m pip install pyinstaller
    if errorlevel 1 (
        echo [ERROR] PyInstaller 설치 실패.
        pause & exit /b 1
    )
)

:: 의존성 설치
echo [INFO] 의존성 설치 중...
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] 의존성 설치 실패.
    pause & exit /b 1
)

:: pywin32 후처리 (COM 등록)
python -m pywin32_postinstall -install >nul 2>&1
echo [INFO] pywin32 COM 등록 완료 (오류 무시 가능)

:: 이전 빌드 정리
if exist dist\nh-agent.exe (
    echo [INFO] 이전 빌드 파일 삭제...
    del /f /q dist\nh-agent.exe
)
if exist build (
    rmdir /s /q build
)

echo.
echo [INFO] PyInstaller 빌드 시작...
echo.

python -m PyInstaller ^
    --onefile ^
    --name nh-agent ^
    --icon NONE ^
    --console ^
    --clean ^
    --noconfirm ^
    ^
    --hidden-import win32com ^
    --hidden-import win32com.client ^
    --hidden-import win32com.server ^
    --hidden-import win32com.shell ^
    --hidden-import win32api ^
    --hidden-import win32gui ^
    --hidden-import win32con ^
    --hidden-import win32con ^
    --hidden-import pywintypes ^
    --hidden-import pythoncom ^
    --hidden-import win32com.shell.shell ^
    --hidden-import win32com.shell.shellcon ^
    ^
    --hidden-import supabase ^
    --hidden-import supabase._sync.client ^
    --hidden-import supabase._async.client ^
    --hidden-import gotrue ^
    --hidden-import gotrue._sync.client ^
    --hidden-import gotrue._async.client ^
    --hidden-import httpx ^
    --hidden-import httpcore ^
    --hidden-import postgrest ^
    --hidden-import postgrest._sync.client ^
    --hidden-import postgrest._async.client ^
    --hidden-import realtime ^
    --hidden-import storage3 ^
    --hidden-import storage3._sync.client ^
    ^
    --hidden-import ezdxf ^
    --hidden-import ezdxf.layouts ^
    --hidden-import ezdxf.entities ^
    --hidden-import ezdxf.document ^
    --hidden-import ezdxf.recover ^
    ^
    --hidden-import requests ^
    --hidden-import certifi ^
    --hidden-import charset_normalizer ^
    --hidden-import urllib3 ^
    ^
    --hidden-import tkinter ^
    --hidden-import tkinter.ttk ^
    ^
    --collect-all ezdxf ^
    --collect-all supabase ^
    ^
    main.py

if errorlevel 1 (
    echo.
    echo [ERROR] 빌드 실패. 위 오류 메시지를 확인하세요.
    pause & exit /b 1
)

echo.
echo ================================================
echo  빌드 성공: dist\nh-agent.exe
echo ================================================
echo.

:: 빌드 결과 확인
if exist dist\nh-agent.exe (
    for %%A in (dist\nh-agent.exe) do (
        echo  파일 크기: %%~zA bytes
    )
) else (
    echo [ERROR] dist\nh-agent.exe 파일이 생성되지 않았습니다.
    pause & exit /b 1
)

echo.
echo [INFO] nh-agent.exe 빌드 완료.
echo.
echo [INFO] 설정 마법사(setup_wizard.exe) 빌드 중...
python -m PyInstaller setup_wizard.spec --noconfirm
if errorlevel 1 (
    echo [WARN] setup_wizard.exe 빌드 실패 — 건너뜁니다.
) else (
    echo [INFO] setup_wizard.exe 빌드 완료.
)

echo.
echo ================================================
echo  전체 빌드 완료
echo    - dist\nh-agent.exe
echo    - dist\setup_wizard.exe  (설정 마법사)
echo  다음 단계: installer\build_installer.bat 실행
echo ================================================
echo.
pause
endlocal
