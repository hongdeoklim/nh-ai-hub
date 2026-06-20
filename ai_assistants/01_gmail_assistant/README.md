# 1️⃣ 비서실장 (Gmail Assistant)

이 비서는 Gmail API를 사용하여 안 읽은 메일을 가져오고 분류하는 파이썬 스크립트 기반 비서입니다.

## ⚙️ 초기 설정 방법 (API 키 발급)

실제 Google 서비스와 연동하기 위해 Google Cloud Console에서 자격 증명을 발급받아야 합니다.

1. **Google Cloud Console 접속:** https://console.cloud.google.com/
2. **새 프로젝트 생성:** 상단에서 새 프로젝트를 만듭니다 (예: `AI-Assistant-Project`).
3. **Gmail API 사용 설정:** 'API 및 서비스' > '라이브러리'에서 **Gmail API**를 검색하고 '사용'을 클릭합니다.
4. **OAuth 동의 화면 구성:** 'API 및 서비스' > 'OAuth 동의 화면'에서 User Type을 '외부(External)'로 선택하고 앱 이름과 이메일을 입력합니다.
5. **사용자 인증 정보(Credentials) 발급:**
   - 'API 및 서비스' > '사용자 인증 정보'로 이동
   - 상단의 '+ 사용자 인증 정보 만들기' 클릭 -> 'OAuth 클라이언트 ID' 선택
   - 애플리케이션 유형을 '데스크톱 앱'으로 선택
   - 생성 후 **JSON 다운로드** 버튼을 클릭하여 파일을 다운로드합니다.
6. **파일 이름 변경 및 위치 이동:**
   - 다운로드한 JSON 파일의 이름을 `credentials.json`으로 변경합니다.
   - 이 파일을 현재 폴더(`01_gmail_assistant/`) 안에 넣습니다.

## 📦 필수 패키지 설치

터미널을 열고 아래 명령어를 실행하여 구글 API 파이썬 라이브러리를 설치합니다.
```bash
pip install --upgrade google-api-python-client google-auth-httplib2 google-auth-oauthlib
```

## 🚀 실행 및 사용 예시

1. 터미널에서 스크립트를 실행합니다.
```bash
cd ai_assistants/01_gmail_assistant
python gmail_assistant.py
```
2. 최초 실행 시 웹 브라우저가 열리며 Google 로그인을 요구합니다. 권한을 허용해 줍니다.
3. 인증이 완료되면 `token.json` 파일이 생성되며, 앞으로는 브라우저 로그인 없이 스크립트가 실행됩니다.

### 💡 응용 예시 (스케줄러 연동)
저(AI)에게 이렇게 명령해 보세요.
> "매일 아침 9시에 `gmail_assistant.py`를 실행해서 새로 온 메일을 확인해줘."
(이 명령은 `/schedule` 도구를 사용하여 자동화할 수 있습니다.)
