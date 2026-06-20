# 4️⃣ 회계 비서 (Google Sheets Assistant)

이 비서는 Google Sheets API를 사용하여 시트 데이터를 읽어오고 파이썬의 `pandas` 라이브러리로 분석, 집계해 줍니다.

## ⚙️ 초기 설정 방법

1. 1번, 2번 비서에서 사용한 `credentials.json` 파일 복사 후 붙여넣기
2. Google Cloud Console에서 **Google Sheets API** 사용 설정
3. 스크립트(`sheets_assistant.py`) 내의 `SAMPLE_SPREADSHEET_ID` 값을 본인의 구글 시트 ID로 변경 (시트 URL의 `/d/`와 `/edit` 사이 문자열)

## 📦 필수 패키지 설치
```bash
pip install pandas google-api-python-client google-auth-httplib2 google-auth-oauthlib
```

## 🚀 사용 예시

1. 터미널에서 스크립트를 실행하여 데이터 집계를 수행합니다.
```bash
python sheets_assistant.py
```
2. 저(AI)에게 이렇게 명령해 보세요.
> "매주 금요일 퇴근 시간에 `sheets_assistant.py`를 실행해서 주간 매출 데이터를 분석해줘."
