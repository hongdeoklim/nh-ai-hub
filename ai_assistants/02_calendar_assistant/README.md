# 2️⃣ 일정 비서 (Google Calendar Assistant)

이 비서는 Google Calendar API를 사용하여 다가오는 일정을 가져오고 알려주는 파이썬 스크립트 기반 비서입니다.

## ⚙️ 초기 설정 방법 (API 키 발급)

1번 비서(Gmail)와 설정 방법이 거의 동일합니다.

1. **Google Cloud Console 접속:** https://console.cloud.google.com/
2. **이전에 만든 프로젝트 사용:** `AI-Assistant-Project`를 선택합니다.
3. **Calendar API 사용 설정:** 'API 및 서비스' > '라이브러리'에서 **Google Calendar API**를 검색하고 '사용'을 클릭합니다.
4. **사용자 인증 정보(Credentials) 다운로드:**
   - 1번 비서에서 사용했던 `credentials.json` 파일을 그대로 복사해서 이 폴더(`02_calendar_assistant/`)에 넣으셔도 작동합니다. (단, OAuth 동의 화면 설정이 제대로 되어 있어야 합니다.)

## 📦 필수 패키지 설치

터미널을 열고 아래 명령어를 실행하여 구글 API 파이썬 라이브러리를 설치합니다. (1번 비서에서 설치했다면 생략 가능)
```bash
pip install --upgrade google-api-python-client google-auth-httplib2 google-auth-oauthlib
```

## 🚀 실행 및 사용 예시

1. 터미널에서 스크립트를 실행합니다.
```bash
cd ai_assistants/02_calendar_assistant
python calendar_assistant.py
```
2. 최초 실행 시 웹 브라우저가 열리며 Google 로그인을 요구합니다. 권한을 허용해 줍니다.
3. 인증이 완료되면 `token.json` 파일이 생성되며, 앞으로는 브라우저 로그인 없이 스크립트가 실행되어 일정을 보여줍니다.

### 💡 응용 예시 (스케줄러 연동)
저(AI)에게 이렇게 명령해 보세요.
> "1시간 뒤에 있을 일정을 확인하기 위해 `calendar_assistant.py`를 실행해줘."
(이 명령은 `/schedule` 도구를 사용하여 자동화할 수 있습니다.)
