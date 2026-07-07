@echo off
chcp 65001 >nul
REM ============================================================
REM  NH-AX-HUB 에이전트 exe 코드 서명 (SmartScreen 경고 제거)
REM  필요: Windows SDK 의 signtool.exe + 코드서명 인증서(.pfx)
REM  사용법: sign-exes.bat  경로\인증서.pfx  인증서비밀번호
REM ============================================================
setlocal EnableDelayedExpansion
set "PFX=%~1"
set "PWD=%~2"
if "%PFX%"=="" (
  echo 사용법: sign-exes.bat  인증서.pfx  비밀번호
  echo   ^(인증서는 DigiCert/Sectigo 등에서 발급한 코드서명 .pfx^)
  exit /b 1
)

REM signtool.exe 자동 탐색 (Windows SDK)
set "SIGNTOOL="
for /f "delims=" %%P in ('dir /b /s "%ProgramFiles(x86)%\Windows Kits\10\bin\*\x64\signtool.exe" 2^>nul') do set "SIGNTOOL=%%P"
if "%SIGNTOOL%"=="" (
  echo [ERROR] signtool.exe 를 찾을 수 없습니다. Windows SDK 를 설치하세요.
  echo         https://developer.microsoft.com/windows/downloads/windows-sdk/
  exit /b 1
)
echo [INFO] signtool: %SIGNTOOL%

for %%F in (
  "..\agent\dist\nh-agent.exe"
  "..\agent\dist\setup_wizard.exe"
  "..\agent\dist\NH-AX-HUB-Agent-Setup.exe"
) do (
  if exist %%F (
    echo [SIGN] %%~nxF
    "!SIGNTOOL!" sign /f "%PFX%" /p "%PWD%" /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 %%F
    if errorlevel 1 ( echo [ERROR] 서명 실패: %%~nxF & exit /b 1 )
  ) else (
    echo [SKIP] 없음: %%F  ^(먼저 agent\build.bat 로 빌드^)
  )
)

echo.
echo [DONE] 서명 완료. 이제 세 exe 를 agent-installer 버킷에 재업로드하세요.
echo        (DB-적용.bat 처럼 supabase storage rm --yes 후 cp)
endlocal
