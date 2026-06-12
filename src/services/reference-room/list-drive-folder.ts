import { invokeGoogleWorkspaceApi } from '../integrations/workspace-tools'

export type DriveFolderItem = {
  id: string
  name: string
  mimeType: string
  webViewLink?: string
  modifiedTime?: string
  size?: string
}

export async function listDriveFolderContents(
  folderId: string | null | undefined,
): Promise<
  { ok: true; items: DriveFolderItem[] } | { ok: false; message: string }
> {
  try {
    const data = await invokeGoogleWorkspaceApi<Record<string, unknown>>(
      'drive.listFolderContents',
      {
        folderId:
          folderId && typeof folderId === 'string' && folderId.trim().length > 0
            ? folderId.trim()
            : undefined,
        pageSize: 120,
      },
    )

    if (typeof data.error === 'string' && data.error.trim()) {
      return { ok: false, message: data.error.trim() }
    }

    if (data.ok !== true || !Array.isArray(data.items)) {
      return { ok: false, message: 'Drive 폴더 응답이 올바르지 않습니다.' }
    }

    const items = (data.items as Record<string, unknown>[])
      .map((row) => ({
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        mimeType: String(row.mimeType ?? ''),
        webViewLink:
          typeof row.webViewLink === 'string' ? row.webViewLink : undefined,
        modifiedTime:
          typeof row.modifiedTime === 'string' ? row.modifiedTime : undefined,
        size: typeof row.size === 'string' ? row.size : undefined,
      }))
      .filter((x) => x.id.length > 0 && x.name.length > 0)

    return { ok: true, items }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    }
  }
}
