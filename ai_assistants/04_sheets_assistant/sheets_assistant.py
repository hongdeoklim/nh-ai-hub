import os.path
import pandas as pd
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']

# 샘플 스프레드시트 ID와 범위 설정
SAMPLE_SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'
SAMPLE_RANGE_NAME = 'Sheet1!A1:E'

def get_sheets_service():
    """Google Sheets API 서비스 객체를 반환합니다."""
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
    return build('sheets', 'v4', credentials=creds)

def analyze_sheet_data(service):
    """시트 데이터를 읽어와 Pandas로 간단히 분석합니다."""
    try:
        sheet = service.spreadsheets()
        result = sheet.values().get(spreadsheetId=SAMPLE_SPREADSHEET_ID,
                                    range=SAMPLE_RANGE_NAME).execute()
        values = result.get('values', [])

        if not values:
            print('데이터를 찾을 수 없습니다.')
            return

        # 첫 번째 줄을 헤더로 사용하여 Pandas DataFrame 생성
        df = pd.DataFrame(values[1:], columns=values[0])
        print("📊 [회계 비서 데이터 분석 결과]\n")
        print(df.head()) # 상위 5개 행 출력

        # 특정 열(예: '매출')의 합계 계산 기능은 데이터 형태에 따라 추가 가능
        print("\n✅ 데이터 분석이 완료되었습니다. 더 복잡한 집계는 스크립트를 수정해 적용하세요.")

    except Exception as err:
        print(f"오류가 발생했습니다: {err}")

if __name__ == '__main__':
    service = get_sheets_service()
    analyze_sheet_data(service)
