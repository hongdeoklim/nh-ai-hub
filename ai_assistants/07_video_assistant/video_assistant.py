import os
import requests

# 외부 Video 생성 API 예시 (실제 Higgsfield API 키로 교체해야 함)
VIDEO_API_KEY = os.getenv('HIGGSFIELD_API_KEY', 'YOUR_VIDEO_API_KEY')

def generate_video_script(topic):
    """영상 비서가 주제를 바탕으로 15초 영상 대본과 프롬프트를 작성합니다."""
    print(f"🎬 [영상 비서] '{topic}' 주제로 15초 광고 영상 대본을 생성합니다.\n")

    script = f"""
[15초 숏폼 대본]
주제: {topic}

- 0~3초 (Hook): "아직도 {topic} 때문에 고민이신가요?" (시선을 끄는 역동적인 인트로 영상 프롬프트)
- 3~10초 (Body): "이제 AI 비서에게 맡기세요. 클릭 한 번으로 끝!" (자동화되는 화면을 보여주는 프롬프트)
- 10~15초 (Outro): "프로필 링크에서 무료로 시작하세요." (로고와 CTA가 포함된 프롬프트)
"""
    print(script)

    # 향후 API 연동 시 아래 코드를 활성화하여 비디오 생성 요청
    # url = "https://api.higgsfield.ai/v1/generate"
    # headers = {"Authorization": f"Bearer {VIDEO_API_KEY}"}
    # requests.post(url, json={"prompt": script}, headers=headers)

    print("\n✅ 대본 초안이 완성되었습니다. 외부 AI 영상 생성기에 이 대본을 붙여넣으세요.")

if __name__ == "__main__":
    topic_input = input("어떤 제품/주제로 영상을 만들까요? (예: AI 자동화 컨설팅): ")
    generate_video_script(topic_input)
