# 5️⃣ 자료 비서 (Google Drive Assistant)

이 비서는 Google Drive API를 사용하여 드라이브 내의 파일을 검색하고 최근 수정된 중요 문서 목록을 추출합니다.

## ⚙️ 초기 설정 방법

1. 1번, 2번 비서에서 사용한 `credentials.json` 파일 복사 후 붙여넣기
2. Google Cloud Console에서 **Google Drive API** 사용 설정

## 📦 필수 패키지 설치
```bash
pip install google-api-python-client google-auth-httplib2 google-auth-oauthlib
```

## 🚀 사용 예시

1. 터미널에서 스크립트를 실행합니다.
```bash
python drive_assistant.py
```
2. 저(AI)에게 이렇게 명령해 보세요.
> "어제 작업한 문서 파일들을 찾기 위해 `drive_assistant.py`를 실행해서 목록을 정리해줘."
