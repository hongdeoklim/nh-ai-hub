import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

interface ScheduledTask {
  id: string
  user_id: string
  cron_expr: string
  prompt: string
  is_active: boolean
  created_at: string
}

const CRON_OPTIONS = [
  { label: '매일 오전 9시', value: '0 9 * * *' },
  { label: '매일 자정', value: '0 0 * * *' },
  { label: '매주 월요일 오전 9시', value: '0 9 * * 1' },
  { label: '매월 1일 오전 9시', value: '0 9 1 * *' },
  { label: '매분기 첫날 오전 9시', value: '0 9 1 1,4,7,10 *' },
  { label: '날짜/시간 직접 선택', value: 'datetime' },
  { label: '고급 설정 (Cron 수식 직접 입력)', value: 'custom' },
]

export function ScheduledTasksPanel() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)

  const [newPrompt, setNewPrompt] = useState('')
  const [newCron, setNewCron] = useState(CRON_OPTIONS[0].value)
  const [customCron, setCustomCron] = useState('')
  const [customDatetime, setCustomDatetime] = useState('')

  const fetchTasks = async () => {
    setLoading(true)
    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    const { data } = await supabase
      .from('nh_scheduled_tasks')
      .select('*')
      .eq('user_id', user.user.id)
      .order('created_at', { ascending: false })

    if (data) {
      setTasks(data as ScheduledTask[])
    }
    setLoading(false)
  }

  useEffect(() => {
    fetchTasks()
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPrompt.trim()) return

    const { data: user } = await supabase.auth.getUser()
    if (!user.user) return

    let finalCron = newCron
    if (newCron === 'custom') {
      finalCron = customCron.trim()
    } else if (newCron === 'datetime') {
      if (!customDatetime) return
      const d = new Date(customDatetime)
      finalCron = `${d.getMinutes()} ${d.getHours()} ${d.getDate()} ${d.getMonth() + 1} *`
    }

    if (!finalCron) return

    const { data } = await supabase
      .from('nh_scheduled_tasks')
      .insert({
        user_id: user.user.id,
        prompt: newPrompt,
        cron_expr: finalCron,
        is_active: true
      })
      .select()
      .single()

    if (data) {
      setTasks([data as ScheduledTask, ...tasks])
      setNewPrompt('')
      setNewCron(CRON_OPTIONS[0].value)
      setCustomCron('')
      setCustomDatetime('')
      setIsAdding(false)
    }
  }

  const handleToggle = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('nh_scheduled_tasks')
      .update({ is_active: !currentStatus })
      .eq('id', id)

    if (!error) {
      setTasks(tasks.map(t => t.id === id ? { ...t, is_active: !currentStatus } : t))
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('nh_scheduled_tasks')
      .delete()
      .eq('id', id)

    if (!error) {
      setTasks(tasks.filter(t => t.id !== id))
    }
  }

  const getCronLabel = (cron: string) => {
    const option = CRON_OPTIONS.find(o => o.value === cron)
    if (option) return option.label

    // Check if it's a specific datetime cron (e.g., M H D M *)
    const parts = cron.split(' ')
    if (parts.length === 5 && parts[4] === '*' && !cron.includes(',') && !cron.includes('-') && !cron.includes('/')) {
      return `${parts[3]}월 ${parts[2]}일 ${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')} 실행`
    }

    return cron
  }

  return (
    <section className="animate-in fade-in slide-in-from-bottom-2 duration-300 space-y-5 pt-1">
      <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-stone-800">
        <div className="flex items-center space-x-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-100/80 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
          </div>
          <h3 className="text-lg font-semibold tracking-tight text-stone-900 dark:text-stone-100">
            예약된 작업
          </h3>
        </div>
        {!isAdding && (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center space-x-1.5 rounded-lg bg-stone-900 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>새 작업 추가</span>
          </button>
        )}
      </div>

      {isAdding && (
        <form onSubmit={handleCreate} className="rounded-xl border border-stone-200 bg-stone-50/50 p-4 dark:border-stone-800 dark:bg-stone-900/50">
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
                실행할 프롬프트
              </label>
              <textarea
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="예: 이번 주 안전 점검 보고서를 요약해줘."
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-600 dark:focus:border-stone-400 dark:focus:ring-stone-400"
                rows={3}
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-stone-700 dark:text-stone-300">
                실행 주기
              </label>
              <select
                value={newCron}
                onChange={(e) => setNewCron(e.target.value)}
                className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:focus:border-stone-400 dark:focus:ring-stone-400"
              >
                {CRON_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {newCron === 'datetime' && (
                <input
                  type="datetime-local"
                  value={customDatetime}
                  onChange={(e) => setCustomDatetime(e.target.value)}
                  className="mt-3 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-600 dark:focus:border-stone-400 dark:focus:ring-stone-400"
                  required
                />
              )}
              {newCron === 'custom' && (
                <input
                  type="text"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="Cron 수식 (예: */5 * * * *)"
                  className="mt-3 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100 dark:placeholder:text-stone-600 dark:focus:border-stone-400 dark:focus:ring-stone-400"
                  required
                />
              )}
            </div>
            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
              >
                취소
              </button>
              <button
                type="submit"
                className="rounded-lg bg-stone-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">불러오는 중...</p>
        ) : tasks.length === 0 ? (
          <div className="rounded-xl border border-stone-100 bg-stone-50/50 p-8 text-center dark:border-stone-800/50 dark:bg-stone-900/20">
            <p className="text-sm text-stone-500 dark:text-stone-400">등록된 예약 작업이 없습니다.</p>
          </div>
        ) : (
          tasks.map(task => (
            <div key={task.id} className={`group relative flex items-start gap-4 rounded-xl border p-4 transition-all ${task.is_active ? 'border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-950' : 'border-stone-100 bg-stone-50 dark:border-stone-800/50 dark:bg-stone-900/50'}`}>
              <div className="mt-1 shrink-0">
                <button
                  onClick={() => handleToggle(task.id, task.is_active)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${task.is_active ? 'bg-green-500' : 'bg-stone-200 dark:bg-stone-700'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${task.is_active ? 'translate-x-4' : 'translate-x-1'}`} />
                </button>
              </div>
              <div className="flex-1 space-y-1.5 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-1 text-xs font-medium text-stone-600 dark:bg-stone-800 dark:text-stone-300">
                    {getCronLabel(task.cron_expr)}
                  </span>
                  <button
                    onClick={() => handleDelete(task.id)}
                    className="text-stone-400 hover:text-red-500 transition-colors"
                    title="삭제"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
                <p className={`text-sm ${task.is_active ? 'text-stone-900 dark:text-stone-100' : 'text-stone-500 dark:text-stone-400'} whitespace-pre-wrap break-words line-clamp-3`}>
                  {task.prompt}
                </p>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
