import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '../auth/useAuth'
import { supabase } from '../../lib/supabase'

export function NotificationsAndTodos() {
  const { profile } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'notifications' | 'todos'>('notifications')
  
  const [notifications, setNotifications] = useState<any[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [unreadCount, setUnreadCount] = useState(0)

  useEffect(() => {
    if (!profile?.id) return

    const fetchData = async () => {
      // 1. Fetch Notifications
      const { data: notifs } = await supabase
        .from('nh_user_notifications')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (notifs) {
        setNotifications(notifs)
        setUnreadCount(notifs.filter(n => !n.is_read).length)
      }

      // 2. Fetch Todos
      const { data: todoList } = await supabase
        .from('nh_user_todos')
        .select('*')
        .eq('user_id', profile.id)
        .order('created_at', { ascending: false })
      
      if (todoList) {
        setTodos(todoList)
      }
    }

    void fetchData()

    // Realtime Subscription
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nh_user_notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev])
          setUnreadCount(c => c + 1)
          const title = (payload.new as { title?: string })?.title
          toast.success(title ? `새 알림: ${title}` : '새로운 알림이 도착했습니다.')
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nh_user_todos', filter: `user_id=eq.${profile.id}` },
        () => {
          // 할 일 변경 시 목록 재조회 (단순화)
          void fetchData()
        }
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [profile?.id])

  const markAsRead = async (id: string) => {
    await supabase.from('nh_user_notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  const toggleTodoStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed'
    await supabase.from('nh_user_todos').update({ status: newStatus }).eq('id', id)
    setTodos(prev => prev.map(t => t.id === id ? { ...t, status: newStatus } : t))
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label={unreadCount > 0 ? `알림 (안 읽음 ${unreadCount}건)` : '알림'}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="relative inline-flex h-[36px] w-[36px] items-center justify-center rounded-[10px] text-fg-muted transition hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus/50"
      >
        <svg className="h-[20px] w-[20px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-[7px] top-[7px] flex h-[9px] w-[9px] rounded-full bg-danger ring-2 ring-surface"></span>
        )}
      </button>

      {isOpen && (
        <>
        <div className="fixed inset-0 z-[60]" aria-hidden="true" onClick={() => setIsOpen(false)} />
        <div className="absolute right-0 top-[44px] z-[61] flex w-[320px] max-w-[calc(100vw-16px)] flex-col overflow-hidden rounded-[14px] border border-border bg-surface shadow-pop">
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-3 text-sm font-medium ${activeTab === 'notifications' ? 'border-b-2 border-brand text-brand' : 'text-fg-muted hover:text-fg'}`}
            >
              알림{unreadCount > 0 && ` (${unreadCount})`}
            </button>
            <button
              onClick={() => setActiveTab('todos')}
              className={`flex-1 py-3 text-sm font-medium ${activeTab === 'todos' ? 'border-b-2 border-brand text-brand' : 'text-fg-muted hover:text-fg'}`}
            >
              할 일
            </button>
          </div>

          <div className="max-h-[384px] overflow-y-auto p-[8px]">
            {activeTab === 'notifications' && (
              notifications.length === 0 ? (
                <p className="py-[32px] text-center text-sm text-fg-muted">새로운 알림이 없습니다.</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} role="button" tabIndex={0} onClick={() => markAsRead(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); markAsRead(n.id) } }} className={`mb-[4px] cursor-pointer rounded-[10px] p-[10px] transition hover:bg-surface-2 ${n.is_read ? 'opacity-60' : 'bg-brand-soft/60'}`}>
                    <h4 className="text-[13px] font-semibold text-fg">{n.title}</h4>
                    <p className="mt-[4px] text-[12px] text-fg-muted line-clamp-2">{n.content}</p>
                  </div>
                ))
              )
            )}

            {activeTab === 'todos' && (
              todos.length === 0 ? (
                <p className="py-[32px] text-center text-sm text-fg-muted">할 일이 없습니다.</p>
              ) : (
                todos.map(t => (
                  <div key={t.id} className="mb-[4px] flex items-start gap-[10px] rounded-[10px] p-[10px] hover:bg-surface-2">
                    <input
                      type="checkbox"
                      checked={t.status === 'completed'}
                      onChange={() => toggleTodoStatus(t.id, t.status)}
                      className="mt-[2px] h-[16px] w-[16px] rounded border-border-strong accent-brand"
                    />
                    <div>
                      <p className={`text-[13px] font-medium ${t.status === 'completed' ? 'text-fg-subtle line-through' : 'text-fg'}`}>
                        {t.task}
                      </p>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
        </>
      )}
    </div>
  )
}

