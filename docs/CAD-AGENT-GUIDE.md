# NH-AX-HUB CAD 에이전트 사용·배포 가이드

내 PC의 정품 **AutoCAD / SketchUp**을 NH-AX-HUB 채팅으로 원격 실행하는 기능입니다.
도면·모델 데이터는 클라우드로 나가지 않고, 내 PC에서만 실행됩니다.

> 앱 안에서도 볼 수 있습니다: 로그인 → 사이드바 **자동화 → CAD** ( `/cad-agent` )

---

## 1. 직원용 — 처음 사용하기 (3단계)

1. **설치본 다운로드**
   NH-AX-HUB → **자동화 → CAD** 페이지에서 **「설치본 다운로드 (setup.exe)」** 버튼 클릭.
   *(버튼이 "준비 중"이면 아직 관리자가 설치본을 올리지 않은 것 — 관리자에게 문의)*

2. **설치 & 접속 정보 입력**
   내려받은 `setup.exe` 실행 → 설치 마법사에서:
   - **접속 정보(URL·키)**: 관리자에게서 받은 값을 입력
   - **작업 폴더**: 기본값 `C:\NH-AI-HUB-workspace` 그대로 두면 됨
   - **SketchUp**(선택): SketchUp을 쓰면 `SketchUp.exe` 경로 지정 (자동 감지됨)
   설치가 끝나면 에이전트가 **백그라운드에서 자동 실행**됩니다. (Windows 시작 시 자동 실행)

3. **채팅으로 요청**
   도면·모델 파일을 작업 폴더(`C:\NH-AI-HUB-workspace`)에 넣고, AI 채팅에 자연어로 요청:

   | 프로그램 | 예시 |
   |----------|------|
   | AutoCAD | "작업 폴더의 `plan.dwg` 열어줘", "지금 도면 저장해줘" |
   | SketchUp | "`house.skp` 열어줘", "이 모델 PNG로 내보내줘", "`a.skp`를 `a.dae`로 변환해줘" |

   요청은 자동으로 안전 검증을 거쳐 **CAD 페이지의 작업 큐**에 등록되고, 내 PC 에이전트가 실행합니다.

> ⚠️ 파일 삭제·일괄 정리처럼 **되돌리기 어려운(파괴적) 명령**은 바로 실행되지 않고
> **승인 대기**로 등록됩니다. 관리자가 작업 큐에서 승인해야 실행됩니다.

---

## 2. 관리자용 — 설치본(exe) 만들기 & 배포

> **현재 상태:** 설치본이 이미 빌드·업로드되어 있어 **직원은 바로 다운로드**할 수 있습니다.
> 아래는 코드를 고쳐 **다시 빌드/갱신**할 때만 필요합니다.

### 배포 구조 (다운로드형)
스토리지 파일당 용량 제한(약 50MB) 때문에, 배포는 세 파일로 나뉩니다 —
모두 공개 버킷 **`agent-installer`** 에 있습니다.

| 파일 | 역할 | 크기 |
|------|------|------|
| `nh-agent-setup.exe` | **직원이 받는 설치기**(다운로드 스텁). 실행하면 아래 둘을 받아 설치 | ~8 MB |
| `nh-agent.exe` | 실제 에이전트(폴링·실행) | ~43 MB |
| `setup_wizard.exe` | 접속 정보 입력 GUI | ~23 MB |

`nh-agent-setup.exe` 실행 시: 두 파일을 `%LOCALAPPDATA%\NH-AX-HUB-Agent` 로 내려받고 →
작업 폴더 생성 → 시작 프로그램(HKCU) 등록 → 설정 마법사 실행 → 에이전트 백그라운드 실행.
**관리자 권한·Inno Setup 불필요.**

### 다시 빌드하기 (코드 변경 시)
필요: **Python 3.10+** (Windows).

```bat
:: 1) 에이전트 + 마법사 빌드 → agent\dist\nh-agent.exe, setup_wizard.exe
cd agent
build.bat

:: 2) 다운로드 스텁 빌드 → agent\dist\NH-AX-HUB-Agent-Setup.exe
python -m PyInstaller --onefile --name NH-AX-HUB-Agent-Setup --console installer_lite.py
```

### 스토리지 업로드 (다운로드 버튼 활성화)
세 파일을 `agent-installer` 버킷에 아래 이름으로 올립니다(업로드/삭제는 관리자만 가능):

```bash
npx supabase storage cp ./agent/dist/nh-agent.exe               ss:///agent-installer/nh-agent.exe             --experimental
npx supabase storage cp ./agent/dist/setup_wizard.exe           ss:///agent-installer/setup_wizard.exe         --experimental
npx supabase storage cp ./agent/dist/NH-AX-HUB-Agent-Setup.exe  ss:///agent-installer/nh-agent-setup.exe       --experimental
```

앱의 CAD 페이지 다운로드 버튼은 `nh-agent-setup.exe` 존재를 런타임에 확인해 **자동 노출**됩니다(앱 재배포 불필요).
Supabase 대시보드 → Storage → `agent-installer` 에서 직접 올려도 됩니다.

### 2-3. 접속 정보(키) 배부 — **중요**
에이전트는 `cad_jobs` 큐를 읽고 상태를 갱신해야 하므로 접속 키가 필요합니다.
**키 종류에 따라 배포 모델이 달라집니다.** 아래 "3. 운영 모델"을 먼저 결정하세요.

---

## 3. 운영 모델 (배포 전 결정 필요)

| | **모델 A · 공용 CAD 워크스테이션** (지금 바로 가능) | **모델 B · 직원별 개인 PC** (추가 개발 필요) |
|---|---|---|
| 설치 대상 | 팀 공용 CAD PC **1대** | 필요한 직원 **각자**의 PC |
| 사용하는 키 | `service_role` 키 (그 1대에만 보관) | 직원 개인 로그인(이메일/비번 또는 개인 토큰) |
| 실행 위치 | 모든 작업이 공용 PC에서 실행 | 각자 자기 PC에서 실행 |
| 보안 | 키가 1대에만 있어 통제 용이 | service_role 키를 배포하면 안 됨 → 개인 인증 필요 |
| 상태 | ✅ 현재 코드로 동작 | ⚠️ 에이전트 개인 인증 흐름 + 본인-작업 UPDATE RLS 추가 필요 |

- **지금 당장 쓰려면 → 모델 A** 권장. 공용 CAD PC 1대에 `service_role` 키로 설치.
- **직원마다 자기 AutoCAD로 돌리려면 → 모델 B**. (다음 단계에서 구현: 아래 참고)

> `service_role` 키는 모든 RLS를 우회하는 마스터 키입니다. **직원 개개인 PC에 배포하면 안 됩니다.**
> 그래서 "다른 직원 각자 사용(모델 B)"은 개인 인증 방식으로의 전환이 선행되어야 합니다.

---

## 4. 안전장치 (이미 구현됨)

- **명령 화이트리스트**: `allowed_programs`에 등록된 명령만 실행 (open_dwg/save_dwg/run_lisp, open_skp/export_skp/run_ruby_sketchup).
- **경로 제한**: 파일 경로는 작업 폴더(`C:\NH-AI-HUB-workspace`) 하위만 허용.
- **파괴적 명령 승인**: `run_lisp`, `run_ruby_sketchup`, purge/explode 등은 관리자 승인 후 실행.
- **외부 파일 격리 스캔**: 작업 폴더 밖에서 온 파일은 격리·검사 후 반입.
- **기밀 프로젝트 마스킹**: `confidential` 분류 작업은 전송 전 민감 메타데이터 마스킹.
- **아웃바운드 폴링만**: 클라우드가 PC로 접속하지 않음. 에이전트가 밖으로 폴링만 함.

---

## 5. 문제 해결

| 증상 | 확인 |
|------|------|
| 다운로드 버튼이 "준비 중" | 관리자가 `agent-installer` 버킷에 `nh-agent-setup.exe`를 올렸는지 |
| 작업이 "대기"에서 안 넘어감 | 대상 PC에서 에이전트(`nh-agent.exe`)가 실행 중인지, 접속 키가 맞는지 |
| "허용되지 않은 명령" | `allowed_programs`에 등록된 명령인지 (관리자) |
| "경로 밖" 오류 | 파일이 `C:\NH-AI-HUB-workspace` 하위에 있는지 |
| SketchUp 명령이 실패 | 설치 마법사에서 `SketchUp.exe` 경로를 지정했는지 |

설정 파일 위치: `C:\Program Files\NH-AI-HUB-Agent\config.json`
