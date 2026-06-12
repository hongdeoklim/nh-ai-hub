import {
  startTransition,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import type { ChatBubble } from '../components/chat/ChatArea'
import { ChatArea } from '../components/chat/ChatArea'
import { ChatArtifactLayout } from '../components/chat/ChatArtifactLayout'
import { ChatArtifactProvider } from '../store/chat-artifact'
import type { ChatSendPayload } from '../components/chat/ChatInput'
import { ChatInput } from '../components/chat/ChatInput'
import { TokenRequestModal } from '../components/settings/TokenRequestModal'
import { supabase } from '../lib/supabase'
import { buildMessagesForApi } from '../lib/chat-history-for-api'
import { invokeAiChat } from '../services/ai/invoke-chat'
import { insertBookmarkedChat } from '../services/scrapbook/bookmarked-chats'
import {
  bumpConversationUpdatedAt,
  fetchChatMessages,
  insertChatMessage,
} from '../services/teams'
import type { ChatMessageRow } from '../services/teams'

function mapRowsToBubbles(rows: ChatMessageRow[], myId: string): ChatBubble[] {
  return rows.map((row) => {
    const time = new Date(row.created_at).toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
    })
    const role = row.role === 'assistant' ? 'assistant' : 'user'
    const authorDisplay =
      role === 'user' && row.author_user_id !== myId
        ? (row.author_label ?? '팀원')
        : undefined

    return {
      id: row.id,
      role,
      content: row.content,
      time,
      authorDisplay,
    }
  })
}

export function TeamSharedChatPage() {
  const { teamId, conversationId } = useParams<{
    teamId: string
    conversationId: string
  }>()
  const { profile, refreshProfile } = useAuth()
  const chatAreaRef = useRef<HTMLElement>(null)

  const [title, setTitle] = useState('공유 채팅')
  const [conversationTeamId, setConversationTeamId] = useState<string | null>(
    null,
  )
  const [messages, setMessages] = useState<ChatBubble[]>([])
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [selectedModel, setSelectedModel] = useState<string>('gpt-4o')
  const [tokenModalOpen, setTokenModalOpen] = useState(false)
  const [modalPreset, setModalPreset] = useState<string | undefined>(undefined)

  const hydrateMeta = useCallback(async () => {
    if (!conversationId) return
    const { data, error } = await supabase
      .from('team_conversations')
      .select('title,team_id')
      .eq('id', conversationId)
      .maybeSingle()
    if (!error && data?.title) {
      startTransition(() => {
        setTitle(data.title as string)
        setConversationTeamId((data.team_id as string) ?? null)
      })
    }
  }, [conversationId])

  const refreshMessages = useCallback(async () => {
    if (!conversationId) return
    const res = await fetchChatMessages(supabase, conversationId)
    if (!res.ok || !profile?.id) return
    startTransition(() => setMessages(mapRowsToBubbles(res.rows, profile.id)))
  }, [conversationId, profile])

  useEffect(() => {
    void hydrateMeta()
  }, [hydrateMeta])

  useEffect(() => {
    const preferred = profile?.preferred_ai?.trim()
    if (!preferred) return
    queueMicrotask(() => {
      startTransition(() => setSelectedModel(preferred))
    })
  }, [profile?.preferred_ai])

  useEffect(() => {
    if (!conversationTeamId || !teamId) return
    if (conversationTeamId !== teamId) {
      window.alert('이 채팅은 현재 선택한 팀과 일치하지 않습니다.')
      window.location.href = '/teams'
    }
  }, [conversationTeamId, teamId])

  useEffect(() => {
    if (!conversationId || !profile?.id) return
    void (async () => {
      const { data } = await supabase
        .from('conversation_participants')
        .select('user_id')
        .eq('conversation_id', conversationId)
        .eq('user_id', profile.id)
        .maybeSingle()

      if (!data) {
        await supabase.from('conversation_participants').insert({
          conversation_id: conversationId,
          user_id: profile.id,
        })
      }
    })()
  }, [conversationId, profile])

  useEffect(() => {
    if (isSending) return
    void refreshMessages()
    const timer = window.setInterval(() => {
      void refreshMessages()
    }, 4000)
    return () => window.clearInterval(timer)
  }, [refreshMessages, isSending])

  const tokenLimit = profile?.token_limit ?? 0
  const currentTokenUsage = profile?.current_token_usage ?? 0
  const remaining = Math.max(0, tokenLimit - currentTokenUsage)
  const remainingPct =
    tokenLimit > 0 ? Math.round((remaining / tokenLimit) * 100) : 0

  const handleBookmarkAssistant = useCallback(
    async (detail: { prompt: string; aiResponse: string }) => {
      if (!profile?.id) {
        return { ok: false as const, message: '로그인 프로필이 필요합니다.' }
      }
      return insertBookmarkedChat(supabase, {
        userId: profile.id,
        prompt: detail.prompt,
        aiResponse: detail.aiResponse,
        note: '',
      })
    },
    [profile],
  )

  async function handleSend(payload: ChatSendPayload) {
    const trimmed = payload.text.trim()
    if (!trimmed || isSending || !profile?.id || !conversationId) return

    const clock = () =>
      new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit',
      })

    const userInsert = await insertChatMessage(supabase, {
      conversation_id: conversationId,
      role: 'user',
      content: trimmed,
      author_user_id: profile.id,
      author_label:
        profile.display_name?.trim() ||
        profile.email?.split('@')[0] ||
        profile.email ||
        profile.id.slice(0, 8),
    })

    if (!userInsert.ok) {
      window.alert(userInsert.message)
      return
    }

    const historyRes = await fetchChatMessages(supabase, conversationId)
    const historyBubbles =
      historyRes.ok && profile
        ? mapRowsToBubbles(historyRes.rows, profile.id)
        : []
    const apiMessages = buildMessagesForApi(historyBubbles, trimmed)

    await refreshMessages()

    setDraft('')
    setIsSending(true)

    const streamingLocalId = `streaming-${Date.now()}`
    startTransition(() => {
      setMessages((prev) => [
        ...prev,
        {
          id: streamingLocalId,
          role: 'assistant',
          content: '',
          time: clock(),
          streaming: true,
        },
      ])
    })

    let assistantAccum = ''

    try {
      const outcome = await invokeAiChat({
        supabase,
        messages: apiMessages,
        activeModel: selectedModel,
        conversationId,
        billingUserId: profile.id,
        tokenLimit,
        currentTokenUsage,
        onTextDelta: (delta) => {
          assistantAccum += delta
          setMessages((prev) =>
            prev.map((m) =>
              m.id === streamingLocalId
                ? { ...m, content: m.content + delta }
                : m,
            ),
          )
        },
      })

      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingLocalId ? { ...m, streaming: false } : m,
        ),
      )

      if (!outcome.ok) {
        if (
          outcome.httpStatus === 429 ||
          /토큰|한도|초과/.test(outcome.message)
        ) {
          const preset =
            'AI 호출에 필요한 월간 토큰이 부족합니다. 아래 요청 폼으로 한도 또는 정책 조정을 요청해 주세요.'
          startTransition(() => {
            setModalPreset(preset)
            setTokenModalOpen(true)
          })
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.id === streamingLocalId
              ? {
                  ...m,
                  content:
                    m.content.trim().length > 0
                      ? `${m.content}\n\n[오류] ${outcome.message}`
                      : outcome.message,
                  streaming: false,
                }
              : m,
          ),
        )
        return
      }

      await insertChatMessage(supabase, {
        conversation_id: conversationId,
        role: 'assistant',
        content:
          assistantAccum.trim().length > 0
            ? assistantAccum
            : '(응답 본문이 비었습니다)',
        author_user_id: null,
        author_label: null,
      })
      await bumpConversationUpdatedAt(supabase, conversationId)
      await refreshMessages()

      await refreshProfile()
      await new Promise((r) => setTimeout(r, 400))
      await refreshProfile()
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      setMessages((prev) =>
        prev.map((m) =>
          m.id === streamingLocalId
            ? {
                ...m,
                content: m.content.trim()
                  ? `${m.content}\n\n[오류] ${message}`
                  : message,
                streaming: false,
              }
            : m,
        ),
      )
    } finally {
      setIsSending(false)
      queueMicrotask(() => chatAreaRef.current?.scrollTo({
        top: chatAreaRef.current.scrollHeight,
        behavior: 'smooth',
      }))
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#FAF9F6] dark:bg-stone-950">
      <TokenRequestModal
        open={tokenModalOpen}
        onClose={() => {
          startTransition(() => {
            setTokenModalOpen(false)
            setModalPreset(undefined)
          })
        }}
        supabase={supabase}
        userId={profile?.id}
        presetSummary={modalPreset}
      />

      <header className="shrink-0 border-b border-stone-200/90 px-4 py-3 backdrop-blur-md dark:border-stone-800 md:px-6">
        <nav className="mb-2 text-[11px] text-stone-600 dark:text-stone-400">
          <Link
            to={`/teams/${teamId ?? ''}`}
            className="underline hover:text-stone-900 dark:hover:text-stone-200"
          >
            ← 팀으로
          </Link>
          <span className="mx-1">/</span>
          <span className="text-stone-800 dark:text-stone-200">{title}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-[15px] font-semibold text-stone-900 dark:text-stone-50 md:text-base">
            공유 채팅
          </h1>
          {tokenLimit > 0 && remainingPct <= 10 ? (
            <button
              type="button"
              onClick={() => {
                startTransition(() => {
                  setModalPreset(
                    `현재 예상 잔여 토큰 비율은 약 ${remainingPct}% 입니다.`,
                  )
                  setTokenModalOpen(true)
                })
              }}
              className="rounded-full border border-amber-500/60 bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
            >
              관리자에게 요청
            </button>
          ) : null}
        </div>
      </header>

      <ChatArtifactProvider>
        <ChatArtifactLayout className="min-h-0 flex-1">
          <ChatArea
            ref={chatAreaRef}
            messages={messages}
            variant="claude"
            messageType="team"
            className="min-h-0 flex-1 md:min-h-[18rem]"
            onBookmarkAssistant={handleBookmarkAssistant}
          />
        </ChatArtifactLayout>
      </ChatArtifactProvider>

      <div className="shrink-0 border-t border-stone-200/90 bg-[#FAF9F6] px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] dark:border-stone-800 dark:bg-stone-950 md:px-6 md:py-3 md:pb-4">
        <ChatInput
          value={draft}
          onChange={setDraft}
          onSend={(d) => void handleSend(d)}
          disabled={isSending}
          allowSend={Boolean(profile)}
          variant="claude"
          placeholder="공유 채팅 메시지(텍스트만, MVP)…"
          disableAttachments
          toolbarBeforeSend={
            <select
              aria-label="모델"
              value={selectedModel}
              disabled={isSending || !profile}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="min-w-0 max-w-[min(70vw,16rem)] flex-1 cursor-pointer truncate rounded-md border border-stone-300/90 bg-white py-0.5 pl-1.5 pr-1 text-[11px] font-medium text-stone-800 shadow-sm outline-none ring-orange-600/20 focus:ring-1 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100 sm:text-[12px]"
            >
              <option value="gpt-4o">GPT‑4o</option>
              <option value="gpt-4o-mini">GPT‑4o mini</option>
              <option value="gpt-5-mini">GPT‑5 mini</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
              <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
            </select>
          }
          composerMeta={
            <div className="flex flex-col gap-1">
              <p className="text-[10px] leading-tight text-stone-500 dark:text-stone-500">
                같은 팀 대화에는 약 4초 간격 동기화(MVP)·토큰은 발신자(JWT 기준)
              </p>
              <Link
                to="/workspace-tools"
                className="text-[10px] font-semibold text-orange-800 underline underline-offset-2 hover:text-orange-950 dark:text-orange-300 dark:hover:text-orange-200"
              >
                워크스페이스 연동·문서 업로드 열기
              </Link>
            </div>
          }
        />
      </div>
    </div>
  )
}
