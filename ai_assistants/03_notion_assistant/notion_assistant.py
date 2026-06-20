import os
import requests
import json
from datetime import datetime

# Notion API 설정
NOTION_TOKEN = os.getenv('NOTION_TOKEN', 'YOUR_NOTION_INTEGRATION_TOKEN')
DATABASE_ID = os.getenv('NOTION_DATABASE_ID', 'YOUR_DATABASE_ID')

headers = {
    "Authorization": f"Bearer {NOTION_TOKEN}",
    "Content-Type": "application/json",
    "Notion-Version": "2022-06-28"
}

def create_notion_page(title, content, tags=None):
    """Notion 데이터베이스에 새 페이지(아이디어 기록)를 생성합니다."""
    if tags is None:
        tags = ["Idea"]

    url = "https://api.notion.com/v1/pages"

    data = {
        "parent": {"database_id": DATABASE_ID},
        "properties": {
            "이름": {
                "title": [{"text": {"content": title}}]
            },
            "태그": {
                "multi_select": [{"name": tag} for tag in tags]
            },
            "날짜": {
                "date": {"start": datetime.now().strftime("%Y-%m-%d")}
            }
        },
        "children": [
            {
                "object": "block",
                "type": "paragraph",
                "paragraph": {
                    "rich_text": [{"type": "text", "text": {"content": content}}]
                }
            }
        ]
    }

    try:
        response = requests.post(url, headers=headers, data=json.dumps(data))
        if response.status_code == 200:
            print(f"✅ Notion에 성공적으로 기록되었습니다: {title}")
        else:
            print(f"❌ 오류 발생 ({response.status_code}): {response.text}")
    except Exception as e:
        print(f"네트워크 오류: {e}")

if __name__ == "__main__":
    print("📝 기록 서기 비서가 실행되었습니다.")
    title_input = input("제목(아이디어)을 입력하세요: ")
    content_input = input("상세 내용을 입력하세요: ")
    create_notion_page(title_input, content_input)
