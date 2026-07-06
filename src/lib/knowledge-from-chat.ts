import { supabase } from './supabase'
import { ingestDocumentToRag } from '../services/ai/googleDriveSync'

/**
 * 👍 좋은 답변을 사내 지식으로 자동 저장
 * - nh_knowledge_nodes (지식 그래프 시각화용)
 * - company_documents / rag-ingest (AI 채팅 RAG 검색용)
 */
export async function saveGoodAnswerToKnowledge(
  question: string,
  answer: string,
): Promise<void> {
  if (!question.trim() || !answer.trim()) return

  const title = question.length > 80 ? question.slice(0, 80) + '…' : question
  const content = `Q: ${question.trim()}\n\nA: ${answer.trim()}`

  // 1. 지식 그래프 노드로 저장 (시각화용)
  const { data: { user } } = await supabase.auth.getUser()
  const { error: nodeErr } = await supabase
    .from('nh_knowledge_nodes')
    .insert({
      title,
      content,
      node_type: 'faq',
      department: '전체',
      source_drive_id: 'chat_feedback',
      owner_id: user?.id ?? null,
      visibility: 'public',
    })

  if (nodeErr) {
    console.warn('[knowledge-from-chat] 노드 저장 실패:', nodeErr.message)
  }

  // 2. RAG 검색에도 포함되도록 rag-ingest 호출
  const ragResult = await ingestDocumentToRag({
    fileName: `[AI피드백] ${title}`,
    text: content,
  })

  if (!ragResult.ok) {
    console.warn('[knowledge-from-chat] RAG 저장 실패:', ragResult.message)
  }
}
