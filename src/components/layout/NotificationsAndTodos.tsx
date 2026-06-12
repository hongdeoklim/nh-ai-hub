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
          toast.success('?덈줈??AI ?뚮┝???꾩갑?덉뒿?덈떎.')
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'nh_user_todos', filter: `user_id=eq.${profile.id}` },
        () => {
          // ?좎씪 媛깆떊 ???ъ“??(?⑥닚??
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
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-1.5 top-1.5 flex h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-stone-900"></span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 flex w-80 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900 z-50">
          <div className="flex border-b border-stone-100 dark:border-stone-800">
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 py-3 text-sm font-medium ${activeTab === 'notifications' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}
            >
              ?뚮┝??{unreadCount > 0 && `(${unreadCount})`}
            </button>
            <button
              onClick={() => setActiveTab('todos')}
              className={`flex-1 py-3 text-sm font-medium ${activeTab === 'todos' ? 'border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}`}
            >
              ??????            </button>
          </div>

          <div className="max-h-96 overflow-y-auto p-2">
            {activeTab === 'notifications' && (
              notifications.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">?덈줈???뚮┝???놁뒿?덈떎.</p>
              ) : (
                notifications.map(n => (
                  <div key={n.id} onClick={() => markAsRead(n.id)} className={`mb-1 cursor-pointer rounded-lg p-3 transition hover:bg-stone-50 dark:hover:bg-stone-800/50 ${n.is_read ? 'opacity-60' : 'bg-indigo-50/50 dark:bg-indigo-900/10'}`}>
                    <h4 className="text-[13px] font-semibold text-stone-900 dark:text-stone-100">{n.title}</h4>
                    <p className="mt-1 text-[12px] text-stone-600 dark:text-stone-400 line-clamp-2">{n.content}</p>
                  </div>
                ))
              )
            )}

            {activeTab === 'todos' && (
              todos.length === 0 ? (
                <p className="py-8 text-center text-sm text-stone-500">???쇱씠 ?놁뒿?덈떎.</p>
              ) : (
                todos.map(t => (
                  <div key={t.id} className="mb-1 flex items-start gap-3 rounded-lg p-3 hover:bg-stone-50 dark:hover:bg-stone-800/50">
                    <input
                      type="checkbox"
                      checked={t.status === 'completed'}
                      onChange={() => toggleTodoStatus(t.id, t.status)}
                      className="mt-0.5 h-4 w-4 rounded border-stone-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <p className={`text-[13px] font-medium ${t.status === 'completed' ? 'text-stone-400 line-through' : 'text-stone-900 dark:text-stone-100'}`}>
                        {t.task}
                      </p>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>
      )}
    </div>
  )
}

