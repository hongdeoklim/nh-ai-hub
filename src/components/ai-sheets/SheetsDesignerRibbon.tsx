import { useCallback, useState } from 'react'

import type { CellStyle } from '../../lib/sheet-cell-styles'
import { SheetsRibbonIcon } from './SheetsRibbonIcons'
import {
  RibbonDropdown,
  RibbonDropdownTrigger,
  RibbonGroupShell,
  RibbonIconButton,
  type RibbonDropdownItem,
} from './SheetsRibbonDropdown'
import './sheets-designer.css'

export const RIBBON_TABS = [
  '홈',
  '삽입',
  '페이지 레이아웃',
  '수식',
  '데이터',
  '보기',
  '설정',
] as const

export type RibbonTabId = (typeof RIBBON_TABS)[number]

export type RibbonActionId =
  | 'undo'
  | 'paste'
  | 'copy'
  | 'cut'
  | 'wrap-text'
  | 'merge-center'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-top'
  | 'align-middle'
  | 'align-bottom'
  | 'number-general'
  | 'number-number'
  | 'number-currency'
  | 'number-percent'
  | 'conditional-highlight'
  | 'conditional-new-rule'
  | 'conditional-clear'
  | 'table-style'
  | 'cell-style'
  | 'cell-editor-style'
  | 'cell-insert'
  | 'cell-delete'
  | 'cell-format'
  | 'autosum'
  | 'autosum-average'
  | 'autosum-count'
  | 'autosum-max'
  | 'autosum-min'
  | 'fill-down'
  | 'fill-right'
  | 'fill-up'
  | 'fill-left'
  | 'clear-all'
  | 'clear-format'
  | 'clear-content'
  | 'sort-asc'
  | 'sort-desc'
  | 'filter'
  | 'find'
  | 'replace'
  | 'insert-function'
  | 'stub'

export type RibbonStylePatch = Partial<
  Pick<
    CellStyle,
    | 'fontFamily'
    | 'fontSize'
    | 'bold'
    | 'italic'
    | 'underline'
    | 'numberFormat'
    | 'textAlign'
    | 'verticalAlign'
  >
>

const FONT_FAMILIES = ['맑은 고딕', 'Calibri', 'Arial', 'Segoe UI']
const FONT_SIZES = [10, 11, 12, 14]

const ALIGN_ITEMS: RibbonDropdownItem[] = [
  { id: 'wrap', label: '자동 줄 바꿈', action: 'wrap-text' },
  { id: 'merge', label: '병합하고 가운데 맞춤', action: 'merge-center' },
  {
    id: 'align-menu',
    label: '맞춤',
    children: [
      { id: 'al', label: '왼쪽 맞춤', action: 'align-left' },
      { id: 'ac', label: '가운데 맞춤', action: 'align-center' },
      { id: 'ar', label: '오른쪽 맞춤', action: 'align-right' },
      { id: 'at', label: '위쪽 맞춤', action: 'align-top' },
      { id: 'am', label: '가운데 맞춤(세로)', action: 'align-middle' },
      { id: 'ab', label: '아래쪽 맞춤', action: 'align-bottom' },
    ],
  },
  { id: 'para', label: '일반', action: 'number-general' },
]

const FORMAT_ITEMS: RibbonDropdownItem[] = [
  { id: 'gen', label: '일반', action: 'number-general' },
  { id: 'num', label: '숫자', action: 'number-number' },
  { id: 'cur', label: '통화', action: 'number-currency' },
  { id: 'pct', label: '백분율', action: 'number-percent' },
]

const STYLE_ITEMS: RibbonDropdownItem[] = [
  {
    id: 'cond',
    label: '조건부 서식',
    children: [
      {
        id: 'cond-hl',
        label: '셀 강조 규칙',
        children: [
          { id: 'gt', label: '보다 큼...', action: 'conditional-highlight' },
          { id: 'lt', label: '보다 작음...', action: 'conditional-highlight' },
          { id: 'eq', label: '같음...', action: 'conditional-highlight' },
          { id: 'txt', label: '텍스트 포함...', action: 'conditional-highlight' },
        ],
      },
      { id: 'cond-new', label: '새 규칙...', action: 'conditional-new-rule' },
      { id: 'cond-clear', label: '규칙 지우기', action: 'conditional-clear' },
    ],
  },
  { id: 'tbl', label: '표 스타일', action: 'table-style' },
  { id: 'cell-st', label: '셀 스타일', action: 'cell-style' },
  { id: 'cell-ed', label: '셀 편집기 스타일', action: 'cell-editor-style' },
]

const CELL_ITEMS: RibbonDropdownItem[] = [
  {
    id: 'ins',
    label: '삽입',
    children: [
      { id: 'ins-cell', label: '셀 삽입...', action: 'cell-insert' },
      { id: 'ins-row', label: '시트 행 삽입', action: 'cell-insert' },
      { id: 'ins-col', label: '시트 열 삽입', action: 'cell-insert' },
      { id: 'ins-sheet', label: '시트 삽입', action: 'cell-insert' },
    ],
  },
  {
    id: 'del',
    label: '삭제',
    children: [
      { id: 'del-cell', label: '셀 삭제...', action: 'cell-delete' },
      { id: 'del-row', label: '시트 행 삭제', action: 'cell-delete' },
      { id: 'del-col', label: '시트 열 삭제', action: 'cell-delete' },
      { id: 'del-sheet', label: '시트 삭제', action: 'cell-delete' },
    ],
  },
  {
    id: 'fmt',
    label: '서식',
    children: [
      { id: 'fmt-cell', label: '셀 서식...', action: 'cell-format' },
      { id: 'fmt-row-h', label: '행 높이...', action: 'cell-format' },
      { id: 'fmt-col-w', label: '열 너비...', action: 'cell-format' },
    ],
  },
  { id: 'cell', label: '셀', action: 'cell-format' },
]

const EDIT_ITEMS: RibbonDropdownItem[] = [
  {
    id: 'sum',
    label: '합계',
    children: [
      { id: 'sum-t', label: '합계', action: 'autosum' },
      { id: 'sum-a', label: '평균', action: 'autosum-average' },
      { id: 'sum-c', label: '숫자 개수', action: 'autosum-count' },
      { id: 'sum-x', label: '최대값', action: 'autosum-max' },
      { id: 'sum-n', label: '최소값', action: 'autosum-min' },
    ],
  },
  {
    id: 'fill',
    label: '채우기',
    children: [
      { id: 'fd', label: '아래쪽', action: 'fill-down' },
      { id: 'fr', label: '오른쪽', action: 'fill-right' },
      { id: 'fu', label: '위쪽', action: 'fill-up' },
      { id: 'fl', label: '왼쪽', action: 'fill-left' },
    ],
  },
  {
    id: 'clr',
    label: '지우기',
    children: [
      { id: 'clr-all', label: '모두 지우기', action: 'clear-all' },
      { id: 'clr-fmt', label: '서식 지우기', action: 'clear-format' },
      { id: 'clr-cnt', label: '내용 지우기', action: 'clear-content' },
    ],
  },
  {
    id: 'sort',
    label: '정렬 및 필터',
    children: [
      { id: 'sa', label: '텍스트 오름차순 정렬', action: 'sort-asc' },
      { id: 'sd', label: '텍스트 내림차순 정렬', action: 'sort-desc' },
      { id: 'sf', label: '필터', action: 'filter' },
    ],
  },
  {
    id: 'find',
    label: '찾기',
    children: [
      { id: 'find-f', label: '찾기...', action: 'find' },
      { id: 'find-r', label: '바꾸기...', action: 'replace' },
    ],
  },
  { id: 'edit', label: '편집', action: 'find' },
]

const CLIPBOARD_ITEMS: RibbonDropdownItem[] = [
  { id: 'cut', label: '잘라내기', action: 'cut' },
  { id: 'copy', label: '복사', action: 'copy' },
  { id: 'paste', label: '붙여넣기', action: 'paste' },
]

function useRibbonDropdown() {
  const [openId, setOpenId] = useState<string | null>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)
  const [items, setItems] = useState<RibbonDropdownItem[]>([])

  const open = useCallback(
    (id: string, rect: DOMRect, menuItems: RibbonDropdownItem[]) => {
      setOpenId(id)
      setAnchorRect(rect)
      setItems(menuItems)
    },
    [],
  )

  const close = useCallback(() => {
    setOpenId(null)
    setAnchorRect(null)
    setItems([])
  }, [])

  return { openId, anchorRect, items, open, close }
}

function formatLabel(style: CellStyle): string {
  switch (style.numberFormat) {
    case 'number':
      return '숫자'
    case 'currency':
      return '통화'
    case 'percent':
      return '백분율'
    default:
      return '일반'
  }
}

function HomeRibbonPanel({
  styleState,
  onAction,
  onStyleChange,
}: {
  styleState: CellStyle
  onAction?: (action: RibbonActionId) => void
  onStyleChange?: (patch: RibbonStylePatch) => void
}) {
  const dropdown = useRibbonDropdown()

  const fire = (action: RibbonActionId) => onAction?.(action)

  return (
    <div className="gc-designer-ribbon-tab">
      <div className="gc-designer-ribbon-tabs-content">
        <div className="gc-designer-ribbon-scrollbar-container">
          <div className="gc-designer-ribbon-scrollbar-container-inner">
            <div className="gc-designer-ribbon-tab-panel">
              <div className="gc-designer-ribbon-group-container">
                <div className="gc-designer-ribbon-group-container-inner">
                  <RibbonGroupShell label="실행 취소" variant="compact">
                    <button
                      type="button"
                      className="gc-designer-ribbon-list gc-designer-ribbon-list-large"
                      title="실행 취소"
                      onClick={() => fire('undo')}
                    >
                      <span className="gc-designer-ribbon-button-icon">
                        <SheetsRibbonIcon id="undo" className="h-8 w-8" />
                      </span>
                      <span className="gc-designer-ribbon-button-label">실행 취소</span>
                    </button>
                  </RibbonGroupShell>

                  <RibbonGroupShell label="클립보드">
                    <RibbonDropdownTrigger
                      label="붙여넣기"
                      ariaLabel="클립보드"
                      icon={<SheetsRibbonIcon id="paste" className="h-8 w-8" />}
                      large
                      split
                      open={dropdown.openId === 'clipboard'}
                      onPrimaryClick={() => fire('paste')}
                      onToggle={(rect) =>
                        dropdown.open('clipboard', rect, CLIPBOARD_ITEMS)
                      }
                    />
                  </RibbonGroupShell>

                  <RibbonGroupShell label="글꼴">
                    <div className="gc-designer-ribbon-font-group">
                      <select
                        className="gc-designer-ribbon-select"
                        value={styleState.fontFamily ?? '맑은 고딕'}
                        onChange={(e) =>
                          onStyleChange?.({ fontFamily: e.target.value })
                        }
                        aria-label="글꼴"
                      >
                        {FONT_FAMILIES.map((font) => (
                          <option key={font} value={font}>
                            {font}
                          </option>
                        ))}
                      </select>
                      <select
                        className="gc-designer-ribbon-select gc-designer-ribbon-select-sm"
                        value={styleState.fontSize ?? 11}
                        onChange={(e) =>
                          onStyleChange?.({ fontSize: Number(e.target.value) })
                        }
                        aria-label="글꼴 크기"
                      >
                        {FONT_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                      <div className="gc-designer-ribbon-font-toolbar">
                        <RibbonIconButton
                          title="굵게"
                          pressed={styleState.bold}
                          onClick={() =>
                            onStyleChange?.({ bold: !styleState.bold })
                          }
                        >
                          <SheetsRibbonIcon id="bold" className="h-4 w-4" />
                        </RibbonIconButton>
                        <RibbonIconButton
                          title="기울임"
                          pressed={styleState.italic}
                          onClick={() =>
                            onStyleChange?.({ italic: !styleState.italic })
                          }
                        >
                          <SheetsRibbonIcon id="italic" className="h-4 w-4" />
                        </RibbonIconButton>
                        <RibbonIconButton
                          title="밑줄"
                          pressed={styleState.underline}
                          onClick={() =>
                            onStyleChange?.({ underline: !styleState.underline })
                          }
                        >
                          <SheetsRibbonIcon id="underline" className="h-4 w-4" />
                        </RibbonIconButton>
                      </div>
                    </div>
                  </RibbonGroupShell>

                  <RibbonGroupShell label="맞춤" variant="compact">
                    <RibbonDropdownTrigger
                      label="맞춤"
                      ariaLabel="맞춤"
                      icon={<SheetsRibbonIcon id="align" className="h-8 w-8" />}
                      large
                      open={dropdown.openId === 'align'}
                      onToggle={(rect) => dropdown.open('align', rect, ALIGN_ITEMS)}
                    />
                  </RibbonGroupShell>

                  <RibbonGroupShell label="표시 형식" variant="compact">
                    <RibbonDropdownTrigger
                      label={formatLabel(styleState)}
                      ariaLabel="표시 형식"
                      icon={<SheetsRibbonIcon id="number-format" className="h-8 w-8" />}
                      large
                      open={dropdown.openId === 'format'}
                      onToggle={(rect) => dropdown.open('format', rect, FORMAT_ITEMS)}
                    />
                    <div className="gc-designer-ribbon-mini-toolbar">
                      <RibbonIconButton
                        title="통화"
                        size="sm"
                        pressed={styleState.numberFormat === 'currency'}
                        onClick={() => fire('number-currency')}
                      >
                        $
                      </RibbonIconButton>
                      <RibbonIconButton
                        title="백분율"
                        size="sm"
                        pressed={styleState.numberFormat === 'percent'}
                        onClick={() => fire('number-percent')}
                      >
                        %
                      </RibbonIconButton>
                      <RibbonIconButton
                        title="숫자"
                        size="sm"
                        pressed={styleState.numberFormat === 'number'}
                        onClick={() => fire('number-number')}
                      >
                        123
                      </RibbonIconButton>
                    </div>
                  </RibbonGroupShell>

                  <RibbonGroupShell label="스타일" variant="compact">
                    <RibbonDropdownTrigger
                      label="스타일"
                      ariaLabel="스타일"
                      icon={<SheetsRibbonIcon id="table-style" className="h-8 w-8" />}
                      large
                      open={dropdown.openId === 'style'}
                      onToggle={(rect) =>
                        dropdown.open('style', rect, STYLE_ITEMS)
                      }
                    />
                  </RibbonGroupShell>

                  <RibbonGroupShell label="셀" variant="compact">
                    <RibbonDropdownTrigger
                      label="셀"
                      ariaLabel="셀"
                      icon={<SheetsRibbonIcon id="cell" className="h-8 w-8" />}
                      large
                      open={dropdown.openId === 'cell'}
                      onToggle={(rect) => dropdown.open('cell', rect, CELL_ITEMS)}
                    />
                  </RibbonGroupShell>

                  <RibbonGroupShell label="편집" variant="compact">
                    <RibbonDropdownTrigger
                      label="편집"
                      ariaLabel="편집"
                      icon={<SheetsRibbonIcon id="edit" className="h-8 w-8" />}
                      large
                      open={dropdown.openId === 'edit'}
                      onToggle={(rect) => dropdown.open('edit', rect, EDIT_ITEMS)}
                    />
                  </RibbonGroupShell>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {dropdown.openId ? (
        <RibbonDropdown
          items={dropdown.items}
          anchorRect={dropdown.anchorRect}
          onAction={(action) => {
            fire(action)
            dropdown.close()
          }}
          onClose={dropdown.close}
          wide={dropdown.openId === 'style'}
        />
      ) : null}
    </div>
  )
}

function GenericRibbonPanel({
  tab,
  onAction,
}: {
  tab: Exclude<RibbonTabId, '홈'>
  onAction?: (action: RibbonActionId) => void
}) {
  const groups: Record<
    Exclude<RibbonTabId, '홈'>,
    { label: string; icon: Parameters<typeof SheetsRibbonIcon>[0]['id'] }[]
  > = {
    삽입: [
      { label: '표', icon: 'table-style' },
      { label: '차트', icon: 'chart' },
      { label: '그림', icon: 'image' },
      { label: '링크', icon: 'link' },
    ],
    '페이지 레이아웃': [
      { label: '여백', icon: 'margin' },
      { label: '방향', icon: 'orientation' },
      { label: '눈금선', icon: 'gridlines' },
      { label: '제목', icon: 'headings' },
    ],
    수식: [
      { label: '함수 삽입', icon: 'function' },
      { label: '자동 합계', icon: 'autosum' },
      { label: '이름 정의', icon: 'name' },
    ],
    데이터: [
      { label: '정렬', icon: 'sort' },
      { label: '필터', icon: 'filter' },
      { label: '텍스트 나누기', icon: 'text-split' },
    ],
    보기: [
      { label: '일반', icon: 'view-normal' },
      { label: '100%', icon: 'zoom' },
    ],
    설정: [{ label: '시트 설정', icon: 'settings' }],
  }

  return (
    <div className="gc-designer-ribbon-tab">
      <div className="gc-designer-ribbon-tabs-content">
        <div className="gc-designer-ribbon-scrollbar-container">
          <div className="gc-designer-ribbon-scrollbar-container-inner">
            <div className="gc-designer-ribbon-tab-panel">
              <div className="gc-designer-ribbon-group-container">
                <div className="gc-designer-ribbon-group-container-inner">
                  {groups[tab].map((item) => (
                    <RibbonGroupShell key={item.label} label={item.label} variant="compact">
                      <button
                        type="button"
                        className="gc-designer-ribbon-list gc-designer-ribbon-list-large"
                        onClick={() => onAction?.('stub')}
                      >
                        <span className="gc-designer-ribbon-button-icon">
                          <SheetsRibbonIcon id={item.icon} className="h-8 w-8" />
                        </span>
                        <span className="gc-designer-ribbon-button-label">
                          {item.label}
                        </span>
                      </button>
                    </RibbonGroupShell>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type SheetsDesignerRibbonProps = {
  activeTab: RibbonTabId
  onTabChange: (tab: RibbonTabId) => void
  onAction?: (action: RibbonActionId) => void
  styleState?: CellStyle
  onStyleChange?: (patch: RibbonStylePatch) => void
}

export function SheetsDesignerRibbon({
  activeTab,
  onTabChange,
  onAction,
  styleState = {},
  onStyleChange,
}: SheetsDesignerRibbonProps) {
  return (
    <div
      className="gc-designer-ribbon gc-designer-component-container gc-designer-component-container-vertical gc-designer-flex-default"
      data-ribbon-mode="Classic"
      role="toolbar"
    >
      <div className="gc-designer-ribbon-tab">
        <div className="gc-ribbon-tab-row">
          {RIBBON_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`gc-ribbon-tab ${activeTab === tab ? 'is-active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>
      {activeTab === '홈' ? (
        <HomeRibbonPanel
          styleState={styleState}
          onAction={onAction}
          onStyleChange={onStyleChange}
        />
      ) : (
        <GenericRibbonPanel tab={activeTab} onAction={onAction} />
      )}
    </div>
  )
}
