import os

def create_design_prompt(topic, format="카드뉴스"):
    """디자인 생성을 위한 최적화된 프롬프트를 작성합니다."""
    print(f"🎨 [디자인 비서] '{topic}' 주제로 {format} 프롬프트를 생성합니다.\n")

    prompt = f"""
[요청 사항]
주제: {topic}
형식: {format}
스타일: 현대적이고 깔끔한 미니멀리즘 스타일, 파스텔 톤 색상 활용.

[출력 데이터]
이 내용을 바탕으로 AI 이미지 생성기(또는 저에게) 넘겨줄 영문 프롬프트 1장과,
카드뉴스에 들어갈 텍스트(제목, 본문 3문장)를 추출해 주세요.
"""
    print(prompt)
    print("\n✅ 위 프롬프트를 복사하여 저(AI 비서)에게 전달하면 이미지를 직접 생성해 드립니다!")

if __name__ == "__main__":
    topic = input("디자인할 주제를 입력하세요 (예: 1인 사업가 시간관리): ")
    format_type = input("원하는 포맷을 입력하세요 (예: 인스타 카드뉴스, 블로그 썸네일): ")
    create_design_prompt(topic, format_type)
