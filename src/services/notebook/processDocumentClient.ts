import { supabase } from '../../lib/supabase'

export type ProcessDocumentResult =
  | {
      ok: true
      chunks: number
      entities: number
      relations: number
      parse_method: string
    }
  | { ok: false; message: string }

export async function invokeProcessDocument(
  documentId: string,
  sourceKind: 'knowledge_base' | 'user_upload' = 'user_upload',
): Promise<ProcessDocumentResult> {
  const { data, error } = await supabase.functions.invoke('process-document', {
    body: {
      document_id: documentId,
      source_kind: sourceKind,
    },
  })

  if (error) {
    return { ok: false, message: error.message }
  }

  if (!data || typeof data !== 'object') {
    return { ok: false, message: 'process-document 응답 오류' }
  }

  const row = data as Record<string, unknown>
  if (row.ok === false) {
    return {
      ok: false,
      message: String(row.error ?? '문서 처리 실패'),
    }
  }

  return {
    ok: true,
    chunks: Number(row.chunks ?? 0),
    entities: Number(row.entities ?? 0),
    relations: Number(row.relations ?? 0),
    parse_method: String(row.parse_method ?? 'unknown'),
  }
}
