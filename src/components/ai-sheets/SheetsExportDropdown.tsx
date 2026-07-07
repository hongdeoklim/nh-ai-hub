import { useCallback, useEffect, useRef, useState } from 'react'

import { downloadCsvFromGrid, downloadXlsxFromGrid } from '../../lib/export-spreadsheet'
import { IconExport } from './SheetsRibbonIcons'

type SheetsExportDropdownProps = {
  grid: string[][]
  filename: string
  sheetName?: string
}

type ExportFormat = 'xlsx' | 'csv'

const EXPORT_OPTIONS: { id: ExportFormat; label: string; hint: string }[] = [
  { id: 'xlsx', label: 'Excel 통합 문서 (.xlsx)', hint: 'Excel' },
  { id: 'csv', label: 'CSV (쉼표로 분리) (.csv)', hint: 'CSV' },
]

export function SheetsExportDropdown({
  grid,
  filename,
  sheetName = 'Sheet1',
}: SheetsExportDropdownProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      close()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('mousedown', onPointer, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  const exportAs = (format: ExportFormat) => {
    if (format === 'xlsx') {
      downloadXlsxFromGrid(grid, filename, sheetName)
    } else {
      downloadCsvFromGrid(grid, filename)
    }
    close()
  }

  return (
    <div ref={rootRef} className="gc-export-dropdown">
      <button
        type="button"
        className="gc-qat-btn gc-export-btn"
        title="파일 내보내기"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="gc-qat-btn-icon">
          <IconExport className="h-[18px] w-[18px]" />
        </span>
        내보내기
        <span className="gc-export-chevron" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div className="gc-export-menu" role="menu" aria-label="내보내기 형식">
          {EXPORT_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="menuitem"
              className="gc-export-menu-item"
              onClick={() => exportAs(option.id)}
            >
              <span className="gc-export-menu-label">{option.label}</span>
              <span className="gc-export-menu-hint">{option.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

