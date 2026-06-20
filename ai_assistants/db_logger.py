import os
from dotenv import load_dotenv
from supabase import create_client, Client

# 프로젝트 최상단 .env 파일 로드
env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
load_dotenv(dotenv_path=env_path)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL")
# 파이썬 스크립트에서는 서비스 롤 키(Service Role Key)를 사용하는 것이 안전하고 권한 제약이 없습니다.
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("VITE_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("⚠️ Supabase 환경변수(VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)가 .env에 설정되지 않았습니다.")

def get_supabase_client() -> Client:
    if SUPABASE_URL and SUPABASE_KEY:
        return create_client(SUPABASE_URL, SUPABASE_KEY)
    return None

def log_assistant_activity(assistant_name: str, task_description: str, result_text: str = None, image_url: str = None):
    """
    모든 AI 비서의 활동을 Supabase DB에 기록합니다.
    """
    supabase = get_supabase_client()
    if not supabase:
        print(f"[DB 저장 실패] {assistant_name}: 환경변수 누락")
        return

    data = {
        "assistant_name": assistant_name,
        "task_description": task_description,
        "result_text": result_text,
        "image_url": image_url,
        "status": "success"
    }

    try:
        response = supabase.table("ai_assistant_logs").insert(data).execute()
        print(f"✅ [Supabase 기록 완료] {assistant_name} 작업 내역 저장됨.")
        return response
    except Exception as e:
        print(f"❌ [Supabase 기록 실패] {assistant_name}: {e}")

# 테스트용 코드
if __name__ == "__main__":
    print("Supabase 연결 테스트 중...")
    log_assistant_activity("db_logger_test", "Supabase DB 연결 테스트", "연결 성공!")
