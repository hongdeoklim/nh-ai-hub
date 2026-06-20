import datetime
import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Google Calendar API 권한 설정 (읽기 전용)
SCOPES = ['https://www.googleapis.com/auth/calendar.readonly']

def get_calendar_service():
    """Calendar API 서비스 객체를 반환합니다."""
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                'credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())

    return build('calendar', 'v3', credentials=creds)

def show_upcoming_events(service, max_results=5):
    """다가오는 일정을 가져옵니다."""
    now = datetime.datetime.utcnow().isoformat() + 'Z'  # 'Z'는 UTC를 의미
    print(f"📅 다가오는 일정 최대 {max_results}개를 불러옵니다...\n")

    try:
        events_result = service.events().list(
            calendarId='primary', timeMin=now,
            maxResults=max_results, singleEvents=True,
            orderBy='startTime').execute()
        events = events_result.get('items', [])

        if not events:
            print('예정된 일정이 없습니다.')
            return

        for event in events:
            start = event['start'].get('dateTime', event['start'].get('date'))
            print(f"- {start} : {event['summary']}")

    except Exception as error:
        print(f'오류가 발생했습니다: {error}')

if __name__ == '__main__':
    service = get_calendar_service()
    show_upcoming_events(service)
