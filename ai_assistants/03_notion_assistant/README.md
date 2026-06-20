# 3️⃣ 기록 서기 (Notion Assistant)

이 비서는 Notion API를 사용하여 아이디어나 회의록을 특정 데이터베이스에 자동으로 기록해 줍니다.

## ⚙️ 초기 설정 방법 (API 키 발급)

1. **Notion 내 통합(Integration) 만들기:** https://www.notion.so/my-integrations 에 접속하여 '새 API 통합 생성'을 클릭합니다.
2. 생성 후 나오는 **프라이빗 API 통합 토큰 (Internal Integration Token)** 을 복사합니다.
3. **데이터베이스 ID 찾기:** 노션에서 아이디어를 저장할 '표(Table)' 기반의 데이터베이스를 만듭니다. 해당 페이지 링크(URL)에서 `notion.so/` 와 `?v=` 사이의 32자리 문자열이 Database ID 입니다.
4. **연결 권한 부여:** 만든 데이터베이스 페이지 우측 상단의 `...` 메뉴 -> '연결(Connections)' -> '연결 추가'에서 방금 만든 통합(Integration) 이름을 검색해 권한을 부여합니다.
5. 환경 변수로 설정하거나 스크립트 파일(`notion_assistant.py`) 상단 변수에 토큰과 ID를 직접 입력합니다.

## 📦 필수 패키지 설치
```bash
pip install requests
```

## 🚀 실행 및 사용 예시

1. 터미널에서 스크립트를 실행합니다.
```bash
cd ai_assistants/03_notion_assistant
python notion_assistant.py
```
2. 프롬프트 창에 제목과 내용을 입력하면 즉시 지정된 노션 DB에 페이지가 생성됩니다.

### 💡 응용 예시
저(AI)에게 이렇게 명령해 보세요.
> "내가 방금 말한 마케팅 아이디어를 `notion_assistant.py`를 사용해서 노션에 '마케팅' 태그 달아서 저장해줘."
