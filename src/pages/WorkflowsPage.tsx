import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { fetchMyWorkflows, createWorkflow, type WorkflowRow } from '../services/workflows'
import { writeWorkflowBootstrap } from '../lib/workflow-bootstrap'
import { rememberLastPrivateThread } from '../lib/private-chat-storage'

type TemplateFilter = 'all' | 'email' | 'productivity' | 'marketing'

const TEMPLATE_FILTERS: { id: TemplateFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'email', label: 'Email' },
  { id: 'productivity', label: 'Productivity' },
  { id: 'marketing', label: 'Marketing' },
]

const TEMPLATES = [
  {
    title: 'Daily email digest',
    category: 'email',
    system_prompt: '당신은 이메일 요약 전문 비서입니다. 사용자가 제공하는 이메일 내역을 읽고, 중요도 순으로 핵심만 3줄씩 요약해 주세요.',
  },
  {
    title: 'Meeting prep',
    category: 'productivity',
    system_prompt: '당신은 회의 준비 비서입니다. 사용자가 회의 주제와 참석자를 알려주면, 예상 질문 5가지와 꼭 확인해야 할 체크리스트를 만들어 주세요.',
  },
  {
    title: 'Report export',
    category: 'productivity',
    system_prompt: '당신은 보고서 작성 전문가입니다. 사용자의 산발적인 메모를 받아 기승전결이 있는 공식적인 사내 보고서 포맷으로 깔끔하게 변환해 주세요.',
  },
  {
    title: 'Marketing copy',
    category: 'marketing',
    system_prompt: '당신은 카피라이터입니다. 제품 정보와 타겟 고객을 입력하면, 인스타그램, 페이스북, 링크드인에 올릴 만한 매력적인 광고 카피를 각각 1개씩 작성해 주세요.',
  }
]

export function WorkflowsPage() {
  const navigate = useNavigate()
  const [templateFilter, setTemplateFilter] = useState<TemplateFilter>('all')
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([])
  const [loading, setLoading] = useState(true)
  
  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newPrompt, setNewPrompt] = useState('')
  const [newCategory, setNewCategory] = useState<TemplateFilter>('productivity')
  const [creating, setCreating] = useState(false)

  const loadWorkflows = useCallback(async () => {
    setLoading(true)
    const data = await fetchMyWorkflows()
    setWorkflows(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadWorkflows()
  }, [loadWorkflows])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim() || !newPrompt.trim()) return
    setCreating(true)
    const wf = await createWorkflow({
      title: newTitle.trim(),
      description: newDesc.trim(),
      category: newCategory,
      system_prompt: newPrompt.trim(),
    })
    setCreating(false)
    if (wf) {
      setShowModal(false)
      void loadWorkflows()
    } else {
      alert("워크플로우 생성에 실패했습니다.")
    }
  }

  const launchWorkflow = (wf: WorkflowRow) => {
    const threadId = crypto.randomUUID()
    writeWorkflowBootstrap(threadId, {
      workflowId: wf.id,
      title: wf.title,
      systemPrompt: wf.system_prompt
    })
    rememberLastPrivateThread(threadId)
    navigate(`/chat/${threadId}`)
  }

  const filteredTemplates = TEMPLATES.filter(
    (t) => templateFilter === 'all' || t.category === templateFilter
  )

  const openTemplateModal = (t: typeof TEMPLATES[0]) => {
    setNewTitle(t.title)
    setNewDesc('')
    setNewCategory(t.category as TemplateFilter)
    setNewPrompt(t.system_prompt)
    setShowModal(true)
  }

  const openEmptyModal = () => {
    setNewTitle('')
    setNewDesc('')
    setNewCategory('productivity')
    setNewPrompt('')
    setShowModal(true)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#FAF9F6] dark:bg-stone-950 relative">
      <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 text-[13px] md:px-8 md:pt-[4vh]">
        <header className="mb-8 text-center">
          <p className="font-semibold uppercase tracking-wider text-orange-800 dark:text-orange-300">
            NH-AX-HUB
          </p>
          <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-stone-900 dark:text-stone-50 md:text-[34px]">
            My Workflows
          </h1>
          <p className="mx-auto mt-2 max-w-2xl text-[13px] leading-relaxed text-stone-600 dark:text-stone-400">
            맞춤형 AI 자동화 봇을 만들어 업무 효율을 높이세요
          </p>
          <button
            type="button"
            onClick={openEmptyModal}
            className="mt-6 inline-flex items-center justify-center rounded-full bg-orange-800 px-6 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:bg-orange-900 dark:bg-orange-700 dark:hover:bg-orange-600"
          >
            Create Workflow
          </button>
        </header>

        <section className="mb-10 rounded-2xl border border-stone-200/90 bg-white/90 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/70">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[13px] font-semibold text-stone-900 dark:text-stone-50">
              Active Workflows
            </h2>
          </div>
          
          {loading ? (
            <div className="py-10 text-center text-stone-500">로딩 중...</div>
          ) : workflows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-stone-50/80 px-6 py-10 text-center dark:border-stone-600 dark:bg-stone-950/40">
              <p className="text-[13px] font-medium text-stone-800 dark:text-stone-200">
                생성된 워크플로우가 없습니다.
              </p>
              <p className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
                아래 템플릿을 선택하거나 Create 버튼을 눌러 첫 워크플로우를 만들어 보세요.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {workflows.map((wf) => (
                <button
                  key={wf.id}
                  onClick={() => launchWorkflow(wf)}
                  className="text-left group rounded-xl border border-stone-200 bg-white p-4 shadow-sm transition hover:border-orange-500 hover:ring-1 hover:ring-orange-500/30 dark:border-stone-700 dark:bg-stone-900"
                >
                  <h3 className="font-semibold text-stone-900 dark:text-stone-50">{wf.title}</h3>
                  {wf.description && <p className="mt-1 text-[12px] text-stone-500 line-clamp-2">{wf.description}</p>}
                  <p className="mt-2 text-[11px] font-mono text-stone-400 bg-stone-50 dark:bg-stone-800 px-2 py-1 rounded inline-block uppercase">
                    {wf.category}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-stone-900 dark:text-stone-50">
            Start from Template
          </h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {TEMPLATE_FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setTemplateFilter(filter.id)}
                className={`rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
                  templateFilter === filter.id
                    ? 'border-orange-500 bg-orange-50 text-orange-900 dark:border-orange-600 dark:bg-orange-950/40 dark:text-orange-100'
                    : 'border-stone-200 bg-white text-stone-700 hover:border-stone-300 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-200'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((t) => (
              <button
                key={t.title}
                onClick={() => openTemplateModal(t)}
                className="text-left rounded-xl border border-stone-200/90 bg-white p-4 shadow-sm transition hover:border-orange-300/80 dark:border-stone-700 dark:bg-stone-900/80"
              >
                <p className="text-[13px] font-medium text-stone-900 dark:text-stone-50">
                  {t.title}
                </p>
                <p className="mt-1 text-[13px] text-stone-500 dark:text-stone-400">
                  {t.system_prompt.slice(0, 40)}...
                </p>
              </button>
            ))}
          </div>
        </section>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
            <h2 className="text-lg font-semibold text-stone-900 dark:text-stone-50 mb-4">
              워크플로우 봇 생성
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">제목 (이름)</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                  placeholder="예: 회의 요약 봇"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">설명 (선택)</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">시스템 프롬프트 (핵심 규칙)</label>
                <textarea
                  required
                  rows={4}
                  value={newPrompt}
                  onChange={e => setNewPrompt(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 resize-none"
                  placeholder="예: 당신은 보고서 작성 전문가입니다. 제공된 텍스트를 기승전결로 요약하세요."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="rounded-lg bg-orange-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-orange-900 disabled:opacity-50"
                >
                  {creating ? '생성 중...' : '생성하기'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
