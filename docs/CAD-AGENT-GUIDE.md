# NH-AX-HUB CAD 에이전트 사용·배포 가이드

내 PC의 정품 **AutoCAD / SketchUp**을 NH-AX-HUB 채팅으로 원격 실행하는 기능입니다.
도면·모델 데이터는 클라우드로 나가지 않고, 내 PC에서만 실행됩니다.

> 앱 안에서도 볼 수 있습니다: 로그인 → 사이드바 **자동화 → CAD** ( `/cad-agent` )

---

## 1. 직원용 — 처음 사용하기 (3단계)

1. **설치본 다운로드**
   NH-AX-HUB → **자동화 → CAD** 페이지에서 **「설치본 다운로드 (setup.exe)」** 버튼 클릭.
   *(버튼이 "준비 중"이면 아직 관리자가 설치본을 올리지 않은 것 — 관리자에게 문의)*

2. **설치 & 로그인**
   내려받은 설치본 실행 → 설치 마법사에서:
   - **인증 방식**: 기본값 **개인 계정(직원)** 선택 → **NH-AX-HUB 로그인 이메일/비밀번호** 입력
     (URL·키는 내장돼 있어 따로 받을 필요 없음). *공용 CAD PC 설치라면 관리자가 「서비스 키」 선택.*
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

### (권장) 코드 서명 — SmartScreen 경고 제거
현재 설치본은 **미서명**이라 실행 시 Windows SmartScreen이 "확인되지 않은 게시자" 경고를 냅니다.
사내 배포 전 코드서명을 권장합니다.

1. 코드서명 인증서(.pfx) 준비 — DigiCert·Sectigo 등에서 발급(조직 인증). *이 부분만 외부 구매 필요.*
2. 업로드 전 서명: `installer\sign-exes.bat  경로\인증서.pfx  비밀번호`
   (Windows SDK의 `signtool.exe` 필요. 3개 exe를 SHA256 + 타임스탬프로 서명)
3. 서명된 3개 exe를 스토리지에 재업로드.

인증서 없이 당장 쓰려면, IT에서 그룹 정책으로 설치본 해시를 화이트리스트에 넣거나
사용자에게 "추가 정보 → 실행" 을 안내하세요.

### 2-3. 접속 정보(키) 배부 — **중요**
에이전트는 `cad_jobs` 큐를 읽고 상태를 갱신해야 하므로 접속 키가 필요합니다.
**키 종류에 따라 배포 모델이 달라집니다.** 아래 "3. 운영 모델"을 먼저 결정하세요.

---

## 3. 운영 모델 (설치 마법사에서 선택)

설치 마법사 첫 화면의 **인증 방식**에서 둘 중 하나를 고릅니다. **둘 다 지원됩니다.**

| | **모델 B · 직원별 개인 PC** (권장·기본값) | **모델 A · 공용 CAD 워크스테이션** |
|---|---|---|
| 인증 방식 | **개인 계정(직원)** — NH-AX-HUB 로그인 이메일/비번 | **서비스 키(공용 PC·관리자)** |
| 설치 대상 | 필요한 직원 **각자**의 PC | 팀 공용 CAD PC **1대** |
| 실행 위치 | 각자 자기 PC의 AutoCAD/SketchUp | 공용 PC 1대 |
| 처리 범위 | **본인이 요청한 작업만**(RLS로 격리) | 모든 사용자의 작업 |
| 보안 | service_role 키 불필요, 개인 로그인만 | `service_role` 키가 그 1대에만 보관됨 |

- **직원마다 자기 AutoCAD로 돌리려면 → 모델 B**(개인 계정). 직원은 설치본 받아 실행 →
  마법사에서 **자기 NH-AX-HUB 이메일/비번**만 입력하면 끝. (URL·키는 내장돼 있음)
- **작업을 공용 CAD PC 1대에 모으려면 → 모델 A**(서비스 키). 관리자가 그 PC에만
  `service_role` 키를 입력해 설치.

> ⚠️ `service_role` 키는 모든 RLS를 우회하는 마스터 키입니다. **직원 개개인 PC에 배포하면 안 됩니다.**
> 그래서 직원 개인 PC 배포에는 반드시 **개인 계정(모델 B)** 을 쓰세요.

### 모델 B 동작 원리 (안전장치)
- 에이전트가 직원 개인 계정으로 로그인 → RLS에 의해 **본인이 요청한 작업만** 조회·실행.
- 채팅에서 요청한 작업은 `requested_by = 본인` 으로 큐잉되므로, 남의 작업은 보이지 않음.
- **파괴적 명령 자가 승인 불가**: 승인 대기(`pending_approval`) 상태 작업은 본인도 상태를
  바꿀 수 없음(관리자만 승인 가능). 즉 개인 PC라도 파괴적 명령은 여전히 관리자 승인 필요.

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
