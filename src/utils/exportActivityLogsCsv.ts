import { downloadCsvFile, gridToCsvString } from './csvExport'

import type { ActivityLogRow } from '../hooks/admin/useActivityLogs'
import { actorLabel } from '../hooks/admin/useActivityLogs'
import { resolveActivityAction } from './admin-activity-badge'

export function exportActivityLogsCsv(
  rows: ActivityLogRow[],
  filename = '시스템_로그',
): void {
  const header = ['발생 일시', '작업자', '이메일', '액션', '상세 내역']
  const grid = [
    header,
    ...rows.map((row) => [
      new Date(row.created_at).toLocaleString('ko-KR'),
      actorLabel(row),
      row.actor_email,
      resolveActivityAction(row.action_type).label,
      row.description?.trim() ?? '',
    ]),
  ]

  downloadCsvFile(filename, gridToCsvString(grid))
}
