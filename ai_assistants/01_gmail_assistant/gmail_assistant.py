import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Gmail API 권한 설정 (읽기 전용)
SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']

def get_gmail_service():
    """Gmail API 서비스 객체를 반환합니다."""
    creds = None
    # token.json은 사용자의 액세스 및 새로고침 토큰을 저장합니다.
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    # 유효한 자격 증명이 없는 경우 사용자가 로그인하도록 합니다.
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        # 다음 실행을 위해 자격 증명 저장
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    return build('gmail', 'v1', credentials=creds)

def read_unread_emails(service, max_results=5):
    """읽지 않은 메일을 가져와 요약합니다."""
    print("📬 읽지 않은 이메일을 불러옵니다...\n")
    try:
        results = service.users().messages().list(userId='me', labelIds=['UNREAD'], maxResults=max_results).execute()
        messages = results.get('messages', [])

        if not messages:
            print("읽지 않은 이메일이 없습니다.")
            return

        summary_text = ""
        for msg in messages:
            msg_data = service.users().messages().get(userId='me', id=msg['id'], format='metadata', metadataHeaders=['Subject', 'From']).execute()
            headers = msg_data['payload']['headers']

            subject = next((header['value'] for header in headers if header['name'] == 'Subject'), '(제목 없음)')
            sender = next((header['value'] for header in headers if header['name'] == 'From'), '(보낸사람 알 수 없음)')

            print(f"[{sender}]\n제목: {subject}\n" + "-"*40)
            summary_text += f"[{sender}] {subject}\n"

        # Supabase DB에 로그 저장
        try:
            import sys
            import os
            sys.path.append(os.path.dirname(os.path.dirname(__file__)))
            from db_logger import log_assistant_activity
            log_assistant_activity("01_gmail_assistant", f"{len(messages)}개의 안 읽은 메일 요약", summary_text)
        except Exception as e:
            print(f"DB 저장 오류: {e}")

    except Exception as error:
        print(f'오류가 발생했습니다: {error}')

if __name__ == '__main__':
    service = get_gmail_service()
    read_unread_emails(service)
