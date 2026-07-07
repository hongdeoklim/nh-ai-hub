import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import mermaid from 'mermaid'
import * as XLSX from 'xlsx'
import { type ModelMessage } from 'ai'

import { useAuth } from '../components/auth/useAuth'
import { AccountHeaderActions } from '../components/layout/AccountHeaderActions'
import { useAppUi } from '../contexts/AppUiContext'
import { supabase } from '../lib/supabase'
import { generateProductPlan, chatWithPlanner, type PlannerFullResult } from '../services/ai/planner-client'
import {
  createPlannerSession,
  fetchPlannerSession,
  fetchPlannerSessionSummaries,
  savePlannerSession,
} from '../services/ai/planner-sessions'
import { fetchActiveTextAiModels, filterActiveTextModels, buildModelSelectOptions } from '../services/ai/ai-models-client'
import {
  canGeneratePlannerPlan,
  hasPlannerReadySignal,
  messagesForPlannerGeneration,
  stripPlannerReadyMarker,
  messageContentToString,
} from '../services/ai/planner-readiness'
import { ModelSelectRow } from '../components/chat/ChatStartHub'
import { ThinkingProcessPanel } from '../components/chat/ThinkingProcessPanel'
import { parseThinkingContent } from '../utils/thinking-content'

type PlannerMessage = ModelMessage & { truncated?: boolean }

function plannerAssistantDisplay(content: ModelMessage['content']) {
  const raw = stripPlannerReadyMarker(messageContentToString(content))
  const parsed = parseThinkingContent(raw)
  if (!parsed.answer.trim() && raw.trim()) {
    return { ...parsed, answer: raw }
  }
  return parsed
}

mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'loose' })

function stripMermaidMarkdown(text: string) {
  let cleaned = text.replace(/^\uFEFF/, '').trim()
  const fenced = cleaned.match(/```(?:mermaid)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) cleaned = fenced[1]

  cleaned = cleaned
    .replace(/<\/?\s*MERMAID\b[^>]*>/gi, '')
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const lines = cleaned.split(/\r?\n/)
  const declarationIndex = lines.findIndex((line) =>
    /^(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|xychart-beta)\b/i.test(
      line.trim(),
    ),
  )

  return (declarationIndex >= 0 ? lines.slice(declarationIndex).join('\n') : cleaned).trim()
}

function quoteNodeLabel(open: string, label: string, close: string): string {
  // Already quoted
  if (label.startsWith('"') && label.endsWith('"')) return `${open}${label}${close}`
  // Contains characters that break Mermaid parsing: comma, colon, parens
  if (/[,:()/]/.test(label)) return `${open}"${label}"${close}`
  return `${open}${label}${close}`
}

function sanitizeMermaidContent(text: string): string {
  const lines = text.split(/\r?\n/)
  const result: string[] = []
  for (const line of lines) {
    // Quote node labels that contain special characters (comma, colon, parens).
    // Handles [], (), {} shapes — skips already-quoted labels.
    let sanitized = line
      .replace(/(\[)([^\]"]+?)(\])/g, (_, o, label, c) => quoteNodeLabel(o, label, c))
      .replace(/(?<!\[)\(([^)"]+?)\)(?!-->)/g, (_, label) => quoteNodeLabel('(', label, ')'))
      .replace(/(\{)([^}"]+?)(\})/g, (_, o, label, c) => quoteNodeLabel(o, label, c))

    // Normalize edge labels: strip inner quotes, then re-wrap if label contains special chars.
    const fixEdgeLabel = (prefix: string, label: string, suffix: string) => {
      const stripped = label.replace(/"/g, '').trim()
      if (!stripped) return `${prefix}${label}${suffix}`
      return /[,:()/]/.test(stripped)
        ? `${prefix}"${stripped}"${suffix}`
        : `${prefix}${stripped}${suffix}`
    }
    sanitized = sanitized
      .replace(/(--\s*)([^|>\n]*)(\s*-->)/g, (_, p, l, s) => fixEdgeLabel(p, l, s))
      .replace(/(--\|)([^|>\n]*)(\|-->)/g, (_, p, l, s) => fixEdgeLabel(p, l, s))

    result.push(sanitized)
  }

  // Drop trailing lines that have unclosed node brackets (truncated content)
  while (result.length > 0) {
    const last = result[result.length - 1].trim()
    if (last && /[\[({]/.test(last) && !/[\])}]/.test(last.replace(/^[^[\](){}]*/, ''))) {
      result.pop()
    } else {
      break
    }
  }

  return result.join('\n').trim()
}

const INVALID_WIREFRAME_HTML = `<!doctype html>
<html lang="ko">
  <body style="margin:0;padding:40px;font-family:sans-serif;text-align:center;color:#64748b;background:#fff;">
    <p style="margin:0;">와이어프레임 형식이 올바르지 않습니다. 기획안을 다시 생성해 주세요.</p>
  </body>
</html>`

function getWireframePreview(html?: string) {
  const trimmed = html?.trim() ?? ''
  if (!trimmed) return INVALID_WIREFRAME_HTML

  const isHtml = /<(?:!doctype\s+html|html|body|main|section|div)\b/i.test(trimmed)
  const isMermaidError = /syntax error in text|mermaid version/i.test(trimmed)
  const isMermaidSource = /^\s*(?:flowchart|graph)\s+(?:TD|TB|BT|RL|LR)\b/i.test(trimmed)

  return isHtml && !isMermaidError && !isMermaidSource
    ? trimmed
    : INVALID_WIREFRAME_HTML
}

function splitMarkdownTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim().replace(/\\\|/g, '|'))
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(line.trim())
}

function markdownSpecToGrid(markdown: string): string[][] | null {
  const lines = markdown.split(/\r?\n/)

  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!lines[i].includes('|') || !isMarkdownTableSeparator(lines[i + 1])) continue

    const tableLines: string[] = [lines[i]]
    for (let j = i + 2; j < lines.length; j += 1) {
      const line = lines[j].trim()
      if (!line || !line.includes('|')) break
      tableLines.push(lines[j])
    }

    const rows = tableLines
      .filter((line) => !isMarkdownTableSeparator(line))
      .map(splitMarkdownTableRow)
      .filter((row) => row.some((cell) => cell.length > 0))

    if (rows.length > 0) return rows
  }

  return null
}

function hasGridContent(grid: string[][]): boolean {
  return grid.some((row) => row.some((cell) => cell.trim().length > 0))
}

function fitWorksheetColumns(worksheet: XLSX.WorkSheet, grid: string[][]) {
  const colCount = Math.max(...grid.map((row) => row.length), 1)
  worksheet['!cols'] = Array.from({ length: colCount }, (_, colIndex) => {
    const maxLength = Math.max(
      ...grid.map((row) => String(row[colIndex] ?? '').length),
      10,
    )
    return { wch: Math.min(Math.max(maxLength + 2, 12), 48) }
  })
}

export function AiProductPlannerPage() {
  const navigate = useNavigate()
  const { sessionId: routeSessionId } = useParams<{ sessionId?: string }>()
  const { profile, signOut } = useAuth()
  const { openSettings } = useAppUi()

  const [sessionId, setSessionId] = useState<string | null>(routeSessionId ?? null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const hydratedSessionRef = useRef<string | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [messages, setMessages] = useState<PlannerMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [isChatting, setIsChatting] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [result, setResult] = useState<PlannerFullResult | null>(null)
  const [activeTab, setActiveTab] = useState<'prd' | 'spec' | 'mermaid' | 'wireframe'>('prd')

  const [selectedModel, setSelectedModel] = useState('auto')
  const [registryModels, setRegistryModels] = useState<Awaited<ReturnType<typeof fetchActiveTextAiModels>>>([])

  const mermaidRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchActiveTextAiModels().then(rows => setRegistryModels(filterActiveTextModels(rows))).catch(() => {})
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const bootstrapSession = useCallback(async () => {
    setSessionLoading(true)
    setSessionError(null)
    hydratedSessionRef.current = null

    if (!routeSessionId) {
      const summaries = await fetchPlannerSessionSummaries(supabase, 1)
      if (summaries.length > 0) {
        navigate(`/ai-planner/${summaries[0].id}`, { replace: true })
        return
      }

      const created = await createPlannerSession(supabase)
      if (!created.ok) {
        setSessionError(created.message)
        setSessionLoading(false)
        return
      }
      navigate(`/ai-planner/${created.id}`, { replace: true })
      return
    }

    const loaded = await fetchPlannerSession(supabase, routeSessionId)
    if (!loaded.ok) {
      if (loaded.message === 'not_found') {
        const created = await createPlannerSession(supabase)
        if (created.ok) {
          navigate(`/ai-planner/${created.id}`, { replace: true })
          return
        }
        setSessionError(created.message)
      } else {
        setSessionError(loaded.message)
      }
      setSessionLoading(false)
      return
    }

    setSessionId(loaded.session.id)
    setMessages(loaded.session.messages)
    setSelectedModel(loaded.session.preferred_model || 'auto')
    setResult(loaded.session.plan_result)
    hydratedSessionRef.current = loaded.session.id
    setSessionLoading(false)
  }, [navigate, routeSessionId])

  useEffect(() => {
    void bootstrapSession()
  }, [bootstrapSession])

  useEffect(() => {
    if (!sessionId || sessionLoading) return
    if (hydratedSessionRef.current !== sessionId) return

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
    }

    saveTimerRef.current = setTimeout(() => {
      void savePlannerSession(supabase, sessionId, {
        messages,
        preferredModel: selectedModel,
        planResult: result,
      })
    }, 700)

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [sessionId, sessionLoading, messages, selectedModel, result])

  useEffect(() => {
    let isMounted = true
    if (activeTab === 'mermaid' && result?.mermaidFlow && mermaidRef.current) {
      const cleanMermaid = sanitizeMermaidContent(stripMermaidMarkdown(result.mermaidFlow))

      const renderGraph = async () => {
        try {
          const { svg } = await mermaid.render('mermaid-svg-' + Date.now(), cleanMermaid)
          if (isMounted && mermaidRef.current) {
            mermaidRef.current.innerHTML = svg
          }
        } catch (err) {
          console.error('Mermaid render error:', err)
          if (isMounted && mermaidRef.current) {
            const errorBox = document.createElement('div')
            errorBox.className = 'w-full rounded-lg bg-red-50 p-4 text-left text-red-700 dark:bg-red-950/30 dark:text-red-300'

            const message = document.createElement('p')
            message.className = 'font-medium'
            message.textContent = '다이어그램 렌더링에 실패했습니다. 아래 Mermaid 원본을 확인해 주세요.'

            const source = document.createElement('pre')
            source.className = 'mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-white/80 p-3 text-xs text-slate-700 dark:bg-slate-950/70 dark:text-slate-300'
            source.textContent = cleanMermaid

            errorBox.append(message, source)
            mermaidRef.current.replaceChildren(errorBox)
          }
        }
      }
      renderGraph()
    }
    return () => { isMounted = false }
  }, [activeTab, result?.mermaidFlow])

  const versionRows = useMemo(() => buildModelSelectOptions(registryModels, selectedModel), [registryModels, selectedModel])
  const canGenerate = useMemo(() => canGeneratePlannerPlan(messages), [messages])
  const pmReadySignal = useMemo(() => hasPlannerReadySignal(messages), [messages])

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isChatting || sessionLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')

    const newMessages: PlannerMessage[] = [...messages, { role: 'user', content: userMsg }]
    setMessages(newMessages)
    setIsChatting(true)

    try {
      const response = await chatWithPlanner(newMessages, selectedModel)
      setMessages([
        ...newMessages,
        { role: 'assistant', content: response.text, truncated: response.truncated },
      ])
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error ? err.message : '죄송합니다. 통신 중 오류가 발생했습니다.'
      setMessages([...newMessages, { role: 'assistant', content: message }])
    } finally {
      setIsChatting(false)
    }
  }

  const handleGeneratePlan = async () => {
    if (messages.length === 0 || isGenerating || sessionLoading || !canGenerate) return
    setIsGenerating(true)
    setGenerateError(null)
    setActiveTab('prd')

    try {
      const res = await generateProductPlan(
        messagesForPlannerGeneration(messages),
        selectedModel,
      )
      setResult(res)
    } catch (err) {
      console.error(err)
      const message =
        err instanceof Error
          ? err.message
          : '기획서 생성 중 오류가 발생했습니다.'
      setGenerateError(message)
    } finally {
      setIsGenerating(false)
    }
  }

  const exportToExcel = () => {
    const specMarkdown = result?.specMarkdown?.trim() ?? ''
    if (!specMarkdown) {
      window.alert('내보낼 기능 명세서가 없습니다. 먼저 기획안을 생성해 주세요.')
      return
    }
    const wb = XLSX.utils.book_new()
    const specGrid = markdownSpecToGrid(specMarkdown)

    if (specGrid && hasGridContent(specGrid)) {
      const specSheet = XLSX.utils.aoa_to_sheet(specGrid)
      fitWorksheetColumns(specSheet, specGrid)
      XLSX.utils.book_append_sheet(wb, specSheet, 'Feature Specs')
    } else {
      const fallbackGrid = [['Feature Specs'], ...specMarkdown.split(/\r?\n/).map((line) => [line])]
      const fallbackSheet = XLSX.utils.aoa_to_sheet(fallbackGrid)
      fitWorksheetColumns(fallbackSheet, fallbackGrid)
      XLSX.utils.book_append_sheet(wb, fallbackSheet, 'Feature Specs')
    }

    const rawGrid = [['Markdown Source'], [specMarkdown]]
    const rawSheet = XLSX.utils.aoa_to_sheet(rawGrid)
    fitWorksheetColumns(rawSheet, rawGrid)
    XLSX.utils.book_append_sheet(wb, rawSheet, 'Markdown Source')
    XLSX.writeFile(wb, 'feature_specs.xlsx')
  }

  const exportToDesigner = async () => {
    if (!result) {
      alert('전달할 기획 데이터가 없습니다. 먼저 기획안을 생성해 주세요.')
      return
    }

    const plannerContext = [
      '# PRD',
      result.prdMarkdown,
      '# 기능 명세',
      result.specMarkdown,
      '# 유저 플로우',
      result.mermaidFlow,
      '# 와이어프레임',
      result.wireframeHtml,
    ].join('\n\n')

    try {
      await navigator.clipboard.writeText(plannerContext)
      alert('기획 데이터가 클립보드에 복사되었습니다. AI 디자이너로 이동합니다.')
      navigate('/ai-designer')
    } catch (error) {
      console.error(error)
      alert('기획 데이터를 클립보드에 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.')
    }
  }

  if (sessionLoading) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center bg-[#fafafa] dark:bg-[#09090b]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        <p className="mt-3 text-sm text-slate-500">기획 세션을 불러오는 중…</p>
      </div>
    )
  }

  if (sessionError) {
    return (
      <div className="flex h-full min-h-[50vh] flex-col items-center justify-center bg-[#fafafa] px-6 dark:bg-[#09090b]">
        <p className="text-sm text-red-600 dark:text-red-400">{sessionError}</p>
        <button
          type="button"
          onClick={() => void bootstrapSession()}
          className="mt-4 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#fafafa] dark:bg-[#09090b] font-sans selection:bg-indigo-500/30">
      <header className="flex shrink-0 items-center gap-2 border-b border-stone-200/50 bg-white/60 px-4 py-3 backdrop-blur-xl dark:border-stone-800/40 dark:bg-black/60 z-20">
        <button
          type="button"
          onClick={() => navigate('/')}
          aria-label="기본 페이지로 돌아가기"
          title="기본 페이지로 돌아가기"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-indigo-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-indigo-300 dark:focus-visible:ring-offset-slate-950"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 11.5 12 4l9 7.5M5.5 10v9h13v-9M9.5 19v-5h5v5" />
          </svg>
        </button>
        <h1 className="min-w-0">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="text-left text-lg font-extrabold tracking-tight text-slate-900 transition hover:text-indigo-600 dark:text-white dark:hover:text-indigo-400"
          >
            NH-AX-HUB
          </button>
        </h1>
        <div className="flex items-center ml-2 space-x-2">
           <span className="h-4 w-[1px] bg-slate-300 dark:bg-slate-700"></span>
           <span className="flex items-center gap-1.5 px-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400">
             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
             AI Planner
           </span>
        </div>
        <div className="ml-auto flex items-center">
          <AccountHeaderActions onOpenSettings={openSettings} onSignOut={signOut} />
        </div>
      </header>

      <div className="flex flex-1 flex-col overflow-hidden relative lg:flex-row">
        <div className="flex-1 flex flex-col bg-transparent z-0 relative min-h-0">

          {(!result && !isGenerating && !generateError) && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
               <div className="w-[800px] h-[800px] bg-gradient-to-tr from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/20 dark:to-purple-500/20 rounded-full blur-[100px] animate-pulse" style={{ animationDuration: '4s' }} />
            </div>
          )}

          {isGenerating ? (
            <div className="flex h-full flex-col items-center justify-center space-y-6 z-10">
              <div className="relative flex items-center justify-center">
                <div className="absolute inset-0 h-16 w-16 animate-ping rounded-full bg-indigo-500/20" />
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-indigo-100 border-t-indigo-600 dark:border-indigo-900 dark:border-t-indigo-400" />
              </div>
              <div className="text-center">
                <p className="text-lg font-bold bg-gradient-to-r from-indigo-500 to-purple-500 bg-clip-text text-transparent animate-pulse">
                  AI 에이전트들이 기획안을 작성 중입니다
                </p>
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  PRD·기능명세·플로우·와이어프레임을 생성합니다. 1~2분 걸릴 수 있습니다.
                </p>
              </div>
            </div>
          ) : generateError && !result ? (
            <div className="flex h-full items-center justify-center p-8 z-10">
              <div className="max-w-lg rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm dark:border-red-900/60 dark:bg-slate-900">
                <p className="text-base font-semibold text-red-700 dark:text-red-300">기획안 생성에 실패했습니다</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{generateError}</p>
                <button
                  type="button"
                  onClick={() => void handleGeneratePlan()}
                  disabled={!canGenerate || isChatting}
                  className="mt-6 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  다시 생성하기
                </button>
              </div>
            </div>
          ) : !result ? (
            <div className="flex h-full items-center justify-center text-slate-400 dark:text-slate-500 p-8 z-10">
              <div className="text-center max-w-lg space-y-6">
                <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white dark:bg-slate-900 shadow-xl border border-slate-100 dark:border-slate-800 transform rotate-3 transition-transform hover:rotate-0">
                   <span className="text-4xl">✨</span>
                </div>
                <div>
                  <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">기획을 시작해볼까요?</h2>
                  <p className="mt-4 leading-relaxed text-slate-500 dark:text-slate-400 text-lg">
                    <span className="text-indigo-600 dark:text-indigo-400 font-medium">AI Copilot</span>과 대화하며 아이디어를 구체화하세요.
                    <br/>충분한 논의 후 <span className="font-medium text-slate-600 dark:text-slate-300">기획안 생성</span>을 누르면 이 공간에 산출물이 작성됩니다.
                  </p>
                  <p className="mt-3 text-sm text-slate-400 dark:text-slate-500">
                    대화는 자동 저장됩니다. 사이드바의 <strong className="font-medium text-slate-600 dark:text-slate-400">기획 세션</strong>에서 이전 기록을 열 수 있습니다.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-1 border-b border-slate-200/60 px-6 py-3 dark:border-slate-800/60 bg-white/50 backdrop-blur-md dark:bg-black/50 shrink-0 z-10 sticky top-0">
                {[
                  { id: 'prd', label: '📝 PRD' },
                  { id: 'spec', label: '⚙️ 기능 명세서' },
                  { id: 'mermaid', label: '🌊 유저 플로우' },
                  { id: 'wireframe', label: '🎨 와이어프레임' }
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={`relative px-4 py-2 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === tab.id ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm border border-slate-200/50 dark:border-slate-700' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800/50 dark:hover:text-slate-200 border border-transparent'}`}
                  >
                    {tab.label}
                  </button>
                ))}

                <div className="ml-auto flex gap-3 pl-4 border-l border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={exportToExcel}
                    disabled={!result?.specMarkdown?.trim()}
                    title={result?.specMarkdown?.trim() ? '기능 명세서를 Excel 파일로 다운로드' : '내보낼 기능 명세서가 없습니다'}
                    className="group relative rounded-lg bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm border border-slate-200 hover:bg-slate-50 hover:text-emerald-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-slate-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:disabled:hover:text-slate-300 transition-all flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    명세서 엑셀
                  </button>
                  <button type="button" onClick={() => void exportToDesigner()} disabled={!result} className="group relative rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-md hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 transition-all flex items-center gap-2 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-95">
                    <svg className="w-4 h-4 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    디자이너로 넘기기
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-8 relative z-0 bg-slate-50/50 dark:bg-black/20">
                  <div className="mx-auto max-w-5xl bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200/50 dark:border-slate-800/50 min-h-full overflow-hidden">
                    {activeTab === 'prd' && (
                      <div className="prose prose-slate dark:prose-invert max-w-none p-10 prose-headings:font-bold prose-h1:text-3xl prose-h2:text-2xl prose-a:text-indigo-600">
                        <div className="not-prose mb-6 flex items-start gap-3 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 px-4 py-3 text-sm text-indigo-700 dark:text-indigo-300">
                          <span className="mt-0.5 shrink-0 text-base">📝</span>
                          <span><strong className="font-semibold">PRD (제품 요구사항 문서)</strong> — 기획 배경, 목표, 핵심 기능, 비기능 요구사항 등을 담은 문서입니다. AI Copilot과의 대화를 바탕으로 자동 작성됩니다.</span>
                        </div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result?.prdMarkdown || '내용이 없습니다.'}</ReactMarkdown>
                      </div>
                    )}
                    {activeTab === 'spec' && (
                      <div className="prose prose-slate dark:prose-invert max-w-none p-10 prose-headings:font-bold prose-table:w-full prose-th:bg-slate-100 dark:prose-th:bg-slate-800">
                        <div className="not-prose mb-6 flex items-start gap-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                          <span className="mt-0.5 shrink-0 text-base">⚙️</span>
                          <span><strong className="font-semibold">기능 명세서</strong> — 각 기능의 입력·출력·예외 처리 등을 표 형식으로 정리한 문서입니다. 우측 상단의 <strong className="font-semibold">명세서 엑셀</strong> 버튼으로 다운로드할 수 있습니다.</span>
                        </div>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{result?.specMarkdown || '내용이 없습니다.'}</ReactMarkdown>
                      </div>
                    )}
                    {activeTab === 'mermaid' && (
                      <div className="flex flex-col p-10 min-h-[500px] bg-slate-50/50 dark:bg-slate-950/50">
                        <div className="mb-6 flex items-start gap-3 rounded-lg bg-sky-50 dark:bg-sky-950/30 px-4 py-3 text-sm text-sky-700 dark:text-sky-300">
                          <span className="mt-0.5 shrink-0 text-base">🌊</span>
                          <span><strong className="font-semibold">유저 플로우</strong> — 사용자가 서비스를 이용하는 흐름을 Mermaid 다이어그램으로 시각화합니다. 노드(도형)와 화살표로 주요 분기와 단계를 나타냅니다.</span>
                        </div>
                        <div ref={mermaidRef} className="flex justify-center w-full" />
                      </div>
                    )}
                    {activeTab === 'wireframe' && (
                      <div className="flex flex-col">
                        <div className="flex items-start gap-3 rounded-lg bg-violet-50 dark:bg-violet-950/30 px-4 py-3 text-sm text-violet-700 dark:text-violet-300 m-6 mb-0">
                          <span className="mt-0.5 shrink-0 text-base">🎨</span>
                          <span><strong className="font-semibold">와이어프레임</strong> — AI가 생성한 HTML 기반 화면 시안입니다. 실제 구현 전 레이아웃·구성요소 배치를 빠르게 확인하는 용도이며, 디자인 완성도보다 구조 파악에 초점을 맞춥니다.</span>
                        </div>
                        <div className="h-[800px] w-full bg-slate-100 dark:bg-black mt-6">
                          <iframe
                            srcDoc={getWireframePreview(result?.wireframeHtml)}
                            sandbox="allow-scripts"
                            referrerPolicy="no-referrer"
                            className="w-full h-full border-0 bg-white"
                            title="Wireframe Preview"
                          />
                        </div>
                      </div>
                    )}
                  </div>
              </div>
            </>
          )}
        </div>

        <div className="flex h-[55vh] w-full min-h-0 shrink-0 flex-col border-t border-slate-200/80 bg-white/80 backdrop-blur-xl dark:border-slate-800/80 dark:bg-[#0a0a0c]/80 shadow-[0_0_40px_rgba(0,0,0,0.05)] z-10 relative lg:h-auto lg:w-[420px] lg:border-l lg:border-t-0">

          <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800/60 shrink-0 bg-white/50 dark:bg-slate-900/50">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <div>
                  <h2 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight">
                    AI PM
                  </h2>
                  <p className="text-[11px]! font-medium text-slate-500 dark:text-slate-400 mt-0.5">대화로 아이디어 스케치</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <button
                  onClick={handleGeneratePlan}
                  disabled={!canGenerate || isGenerating || isChatting}
                  className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-bold shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed group/btn ${
                    pmReadySignal
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/40 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-600'
                      : canGenerate
                        ? 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                        : 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                  }`}
                  title={
                    pmReadySignal
                      ? 'PM이 준비 완료를 확인했습니다. 지금 기획안을 생성할 수 있습니다.'
                      : canGenerate
                        ? '지금까지의 대화를 바탕으로 기획안을 생성합니다. 생성 후에도 PM과 대화를 이어갈 수 있습니다.'
                        : 'PM과 한 번 이상 대화한 뒤 기획안을 생성할 수 있습니다.'
                  }
                >
                  <span className="text-sm group-hover/btn:scale-110 transition-transform">🚀</span>
                  기획안 생성
                </button>
                {pmReadySignal ? (
                  <p className="max-w-[11rem] text-right text-[10px]! font-medium leading-snug text-emerald-600 dark:text-emerald-400">
                    PM 준비 완료 — 생성을 권장합니다
                  </p>
                ) : canGenerate ? (
                  <p className="max-w-[11rem] text-right text-[10px]! leading-snug text-indigo-600 dark:text-indigo-400">
                    대화 내용으로 생성 가능 · 이어서 수정·질문도 OK
                  </p>
                ) : messages.length > 0 ? (
                  <p className="max-w-[11rem] text-right text-[10px]! leading-snug text-slate-400 dark:text-slate-500">
                    PM 답변을 받으면 버튼이 활성화됩니다
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5 space-y-6 scroll-smooth">
            {messages.length === 0 && (
              <div className="mt-8 flex flex-col items-center justify-center text-center px-4">
                <div className="h-16 w-16 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center mb-4 text-indigo-500">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
                </div>
                <h3 className="text-base font-bold text-slate-800 dark:text-slate-200 mb-2">안녕하세요! 담당 기획자입니다.</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                  어떤 프로덕트를 만들고 싶으신가요?<br/>편하게 아이디어를 말씀해주시면,<br/>제가 구체적인 기획안으로 만들어드릴게요.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => {
              const assistantDisplay =
                msg.role === 'assistant' ? plannerAssistantDisplay(msg.content) : null

              return (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-2xl px-5 py-3.5 text-[15.5px]! leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-br-sm'
                    : 'bg-white border border-slate-100 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200 rounded-bl-sm shadow-sm'
                }`}>
                  {msg.role === 'user' ? (
                    <div className="whitespace-pre-wrap">{msg.content as string}</div>
                  ) : (
                    <>
                      {assistantDisplay?.hasThinking ? (
                        <ThinkingProcessPanel
                          thinking={assistantDisplay.thinking}
                          streaming={false}
                          thinkingOpen={false}
                        />
                      ) : null}
                      <div className="prose dark:prose-invert max-w-none text-[15.5px]! prose-p:my-0 prose-p:leading-relaxed prose-a:text-indigo-500">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {assistantDisplay?.answer ?? stripPlannerReadyMarker(messageContentToString(msg.content))}
                        </ReactMarkdown>
                      </div>
                      {msg.truncated ? (
                        <p className="mt-2 rounded-lg border border-amber-200/80 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                          답변이 출력 한도에서 잘렸을 수 있습니다. 같은 질문을 다시 보내거나 더 짧게 나눠 요청해 주세요.
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              </div>
              )
            })}

            {isChatting && (
               <div className="flex justify-start">
                 <div className="bg-white border border-slate-100 dark:bg-slate-800 dark:border-slate-700 rounded-2xl rounded-bl-sm px-5 py-4 shadow-sm flex items-center gap-1.5">
                   <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay: '0ms'}}/>
                   <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay: '150ms'}}/>
                   <div className="h-2 w-2 rounded-full bg-indigo-400 animate-bounce" style={{animationDelay: '300ms'}}/>
                 </div>
               </div>
            )}
            <div ref={chatEndRef} className="h-4" />
          </div>

          <div className="p-5 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200/50 dark:border-slate-800/60 shrink-0">
            <div className="mb-3">
              <ModelSelectRow
                selectedModel={selectedModel}
                modelVersionSelectId="planner-model-select"
                versionRows={versionRows}
                modelSaving={false}
                profileReady={Boolean(profile)}
                onModelChange={(id) => setSelectedModel(id)}
              />
            </div>

            <div className="relative group">
              <textarea
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                className="w-full resize-none rounded-2xl border border-slate-200 bg-white pr-12 pl-5 py-4 text-sm text-slate-900 shadow-sm outline-none transition duration-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 placeholder:text-slate-400"
                placeholder="어떤 기능이 필요할까요?"
                rows={2}
              />
              <button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || isChatting}
                className="absolute right-3 bottom-3 p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-600 transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100 shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" /></svg>
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
