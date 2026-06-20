import os.path
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/drive.readonly']

def get_drive_service():
    """Google Drive API 서비스 객체를 반환합니다."""
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return build('drive', 'v3', credentials=creds)

def search_files(service, query=""):
    """드라이브에서 파일을 검색합니다."""
    try:
        print("📁 구글 드라이브 파일 검색을 시작합니다...\n")
        # 최근 수정된 10개의 파일 가져오기 (쿼리가 없으면)
        results = service.files().list(
            q=query, pageSize=10, fields="nextPageToken, files(id, name, mimeType, modifiedTime)",
            orderBy="modifiedTime desc"
        ).execute()
        items = results.get('files', [])

        if not items:
            print('파일을 찾을 수 없습니다.')
        else:
            for item in items:
                print(f"{item['name']} ({item['mimeType']}) - 최근 수정일: {item['modifiedTime']}")

    except Exception as error:
        print(f"오류가 발생했습니다: {error}")

if __name__ == '__main__':
    service = get_drive_service()

    # 예시 쿼리: 문서 파일(문서, 시트, 프레젠테이션) 검색
    search_query = "mimeType='application/vnd.google-apps.document' or mimeType='application/vnd.google-apps.spreadsheet'"
    print("기본 검색: 최근 문서 및 스프레드시트")
    search_files(service, query=search_query)
