import { stripMarkdownForSpeech } from './normalize-ai-markdown'

export type AssistantSharePayload = {
  userPrompt: string
  assistantAnswer: string
  threadUrl?: string
}

export function buildAssistantShareText(payload: AssistantSharePayload): string {
  const lines = [
    payload.userPrompt.trim() ? `질문:\n${payload.userPrompt.trim()}` : '',
    payload.assistantAnswer.trim()
      ? `답변:\n${payload.assistantAnswer.trim()}`
      : '',
    payload.threadUrl?.trim() ? `\n링크: ${payload.threadUrl.trim()}` : '',
  ].filter(Boolean)
  return lines.join('\n\n')
}

export async function shareAssistantMessage(
  payload: AssistantSharePayload,
): Promise<'shared' | 'copied'> {
  const text = buildAssistantShareText(payload)
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({
        title: 'NH-AX-HUB 대화',
        text,
        url: payload.threadUrl,
      })
      return 'shared'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}

let speechUtterance: SpeechSynthesisUtterance | null = null

export function speakAssistantAnswer(rawMarkdown: string): boolean {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    window.alert('이 브라우저에서는 음성 읽기를 지원하지 않습니다.')
    return false
  }

  window.speechSynthesis.cancel()

  const text = stripMarkdownForSpeech(rawMarkdown)
  if (!text) {
    window.alert('읽을 내용이 없습니다.')
    return false
  }

  speechUtterance = new SpeechSynthesisUtterance(text)
  speechUtterance.lang = 'ko-KR'
  speechUtterance.rate = 1
  window.speechSynthesis.speak(speechUtterance)
  return true
}

export function stopAssistantSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }
  speechUtterance = null
}

export async function exportAssistantToGoogleDocs(
  title: string,
  body: string,
): Promise<void> {
  const plain = stripMarkdownForSpeech(body) || body
  try {
    await navigator.clipboard.writeText(plain)
  } catch {
    window.prompt('아래 내용을 복사한 뒤 Google Docs에 붙여넣으세요.', plain)
    window.open('https://docs.google.com/document/create', '_blank', 'noopener,noreferrer')
    return
  }
  window.open('https://docs.google.com/document/create', '_blank', 'noopener,noreferrer')
  window.alert(
    `답변 내용을 클립보드에 복사했습니다.\n새 Google 문서 탭에서 붙여넣기(Ctrl+V) 하세요.\n\n제목 제안: ${title.slice(0, 48)}`,
  )
}

export function openGmailDraft(params: {
  subject: string
  body: string
}): void {
  const subject = encodeURIComponent(params.subject.slice(0, 120))
  const body = encodeURIComponent(params.body.slice(0, 6000))
  window.open(
    `https://mail.google.com/mail/?view=cm&fs=1&su=${subject}&body=${body}`,
    '_blank',
    'noopener,noreferrer',
  )
}

export function reportAssistantLegalIssue(params: {
  modelLabel: string
  threadUrl?: string
  answerPreview: string
}): void {
  const subject = encodeURIComponent('[NH-AX-HUB] AI 응답 법적 문제 신고')
  const body = encodeURIComponent(
    [
      '신고 내용을 아래에 작성해 주세요.',
      '',
      `모델: ${params.modelLabel}`,
      params.threadUrl ? `대화 링크: ${params.threadUrl}` : '',
      '',
      '--- AI 답변 미리보기 ---',
      params.answerPreview.slice(0, 1500),
    ]
      .filter(Boolean)
      .join('\n'),
  )
  window.open(`mailto:?subject=${subject}&body=${body}`, '_self')
}
