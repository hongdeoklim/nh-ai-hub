import { invokeGoogleWorkspaceApi } from '../integrations/workspace-tools'

export type DriveExportForChatResult =
  | {
      kind: 'text'
      fileName: string
      mimeType: string
      text: string
      webViewLink?: string
    }
  | {
      kind: 'image'
      fileName: string
      mimeType: string
      dataUrl: string
      webViewLink?: string
    }
  | {
      kind: 'binary_link'
      fileName: string
      mimeType: string
      webViewLink?: string
      message?: string
    }

export async function exportDriveFileForChat(
  fileId: string,
): Promise<
  { ok: true; result: DriveExportForChatResult } | { ok: false; message: string }
> {
  try {
    const data = await invokeGoogleWorkspaceApi<Record<string, unknown>>(
      'drive.exportForChat',
      { fileId },
    )

    if (typeof data.error === 'string' && data.error.trim()) {
      return { ok: false, message: data.error.trim() }
    }

    if (data.ok !== true || typeof data.kind !== 'string') {
      return { ok: false, message: 'Drive 응답 형식이 올바르지 않습니다.' }
    }

    const kind = data.kind as DriveExportForChatResult['kind']
    const fileName = typeof data.fileName === 'string' ? data.fileName : '문서'
    const mimeType = typeof data.mimeType === 'string' ? data.mimeType : ''

    if (kind === 'text' && typeof data.text === 'string') {
      const webViewLink =
        typeof data.webViewLink === 'string' ? data.webViewLink : undefined
      return {
        ok: true,
        result: { kind: 'text', fileName, mimeType, text: data.text, webViewLink },
      }
    }

    if (
      kind === 'image' &&
      typeof data.dataUrl === 'string' &&
      data.dataUrl.startsWith('data:')
    ) {
      const webViewLink =
        typeof data.webViewLink === 'string' ? data.webViewLink : undefined
      return {
        ok: true,
        result: {
          kind: 'image',
          fileName,
          mimeType: mimeType || 'image/png',
          dataUrl: data.dataUrl,
          webViewLink,
        },
      }
    }

    if (kind === 'binary_link') {
      const webViewLink =
        typeof data.webViewLink === 'string' ? data.webViewLink : undefined
      const message = typeof data.message === 'string' ? data.message : undefined
      return {
        ok: true,
        result: {
          kind: 'binary_link',
          fileName,
          mimeType,
          webViewLink,
          message,
        },
      }
    }

    return { ok: false, message: '지원하지 않는 Drive 응답입니다.' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, message }
  }
}
