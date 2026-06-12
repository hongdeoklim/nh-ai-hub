import type { SupabaseClient } from '@supabase/supabase-js'

import type { KnowledgeBaseRow } from './knowledge-base'
import {
  collectDescendantStoragePaths,
  displayPathFromStorage,
  isPersonalStorageFolderPath,
  remapStoragePathPrefix,
  storagePathFromDisplay,
  type KnowledgeFolderVisibility,
} from '../../lib/knowledge-folder-path'

export type KnowledgeFolderRecord = {
  storagePath: string
  displayPath: string
  visibility: KnowledgeFolderVisibility
  createdBy: string
  createdAt: string
}

const LOCAL_FOLDERS_KEY = 'nh-ai:knowledge-folders-v2'

type LocalFolderRow = {
  storagePath: string
  visibility: KnowledgeFolderVisibility
  createdBy: string
  createdAt: string
}

function readLocalFolders(): LocalFolderRow[] {
  try {
    const raw = localStorage.getItem(LOCAL_FOLDERS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r): r is LocalFolderRow =>
        typeof r === 'object' &&
        r !== null &&
        typeof (r as LocalFolderRow).storagePath === 'string' &&
        ((r as LocalFolderRow).visibility === 'public' ||
          (r as LocalFolderRow).visibility === 'personal'),
    )
  } catch {
    return []
  }
}

function writeLocalFolders(rows: LocalFolderRow[]) {
  try {
    localStorage.setItem(LOCAL_FOLDERS_KEY, JSON.stringify(rows))
  } catch {
    /* quota */
  }
}

function rowToRecord(
  row: {
    path: string
    visibility?: string
    created_by: string
    created_at: string
  },
  userId: string | null | undefined,
): KnowledgeFolderRecord {
  const storagePath = row.path.trim()
  const visibility: KnowledgeFolderVisibility =
    row.visibility === 'personal' ? 'personal' : 'public'
  return {
    storagePath,
    displayPath: displayPathFromStorage(storagePath, userId),
    visibility,
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function isSchemaMissing(message: string | undefined): boolean {
  return /does not exist|relation.*knowledge_folders|schema cache|column.*visibility/i.test(
    message ?? '',
  )
}

export function filterFoldersForScope(
  folders: KnowledgeFolderRecord[],
  visibility: KnowledgeFolderVisibility,
  userId: string | null | undefined,
): KnowledgeFolderRecord[] {
  if (!userId) {
    return visibility === 'public'
      ? folders.filter((f) => f.visibility === 'public')
      : []
  }
  if (visibility === 'public') {
    return folders.filter((f) => f.visibility === 'public')
  }
  return folders.filter(
    (f) => f.visibility === 'personal' && f.createdBy === userId,
  )
}

export function filterKnowledgeRowsForScope(
  rows: KnowledgeBaseRow[],
  visibility: KnowledgeFolderVisibility,
  userId: string | null | undefined,
): KnowledgeBaseRow[] {
  return rows.filter((row) => {
    const raw = (row.folder_path?.trim() || row.category?.trim() || '').trim()
    const personal = isPersonalStorageFolderPath(raw)
    if (visibility === 'public') return !personal
    if (!userId) return false
    if (!personal) return false
    return raw.startsWith(`__private/${userId}/`)
  })
}

export async function fetchKnowledgeFolderRecords(
  client: SupabaseClient,
  userId: string | null | undefined,
): Promise<
  { ok: true; folders: KnowledgeFolderRecord[] } | { ok: false; message: string }
> {
  const { data, error } = await client
    .from('knowledge_folders')
    .select('path, visibility, created_by, created_at')
    .order('path', { ascending: true })

  if (error) {
    if (isSchemaMissing(error.message)) {
      const local = readLocalFolders().map((r) =>
        rowToRecord(
          {
            path: r.storagePath,
            visibility: r.visibility,
            created_by: r.createdBy,
            created_at: r.createdAt,
          },
          userId,
        ),
      )
      return { ok: true, folders: local }
    }
    console.warn('[knowledge_folders] 조회 실패, 로컬 폴더 사용', error.message)
    const local = readLocalFolders().map((r) =>
      rowToRecord(
        {
          path: r.storagePath,
          visibility: r.visibility,
          created_by: r.createdBy,
          created_at: r.createdAt,
        },
        userId,
      ),
    )
    return { ok: true, folders: local }
  }

  const dbFolders = (data ?? []).map((row) =>
    rowToRecord(row as { path: string; visibility?: string; created_by: string; created_at: string }, userId),
  )

  const local = readLocalFolders()
  const mergedMap = new Map<string, KnowledgeFolderRecord>()
  for (const f of dbFolders) mergedMap.set(f.storagePath, f)
  for (const r of local) {
    if (!mergedMap.has(r.storagePath)) {
      mergedMap.set(
        r.storagePath,
        rowToRecord(
          {
            path: r.storagePath,
            visibility: r.visibility,
            created_by: r.createdBy,
            created_at: r.createdAt,
          },
          userId,
        ),
      )
    }
  }

  return {
    ok: true,
    folders: [...mergedMap.values()].sort((a, b) =>
      a.displayPath.localeCompare(b.displayPath, 'ko'),
    ),
  }
}

export async function createKnowledgeFolderRecord(
  client: SupabaseClient,
  params: {
    displayPath: string
    visibility: KnowledgeFolderVisibility
    userId: string
  },
): Promise<
  { ok: true; folder: KnowledgeFolderRecord } | { ok: false; message: string }
> {
  const storagePath = storagePathFromDisplay(
    params.displayPath,
    params.visibility,
    params.userId,
  )
  if (!storagePath) {
    return { ok: false, message: '폴더 경로가 올바르지 않습니다.' }
  }

  const { error } = await client.from('knowledge_folders').insert({
    path: storagePath,
    visibility: params.visibility,
    created_by: params.userId,
  })

  if (error) {
    if (/duplicate key|unique/i.test(error.message ?? '')) {
      return {
        ok: true,
        folder: {
          storagePath,
          displayPath: displayPathFromStorage(storagePath, params.userId),
          visibility: params.visibility,
          createdBy: params.userId,
          createdAt: new Date().toISOString(),
        },
      }
    }
    if (isSchemaMissing(error.message)) {
      const local = readLocalFolders()
      if (!local.some((f) => f.storagePath === storagePath)) {
        local.push({
          storagePath,
          visibility: params.visibility,
          createdBy: params.userId,
          createdAt: new Date().toISOString(),
        })
        writeLocalFolders(local)
      }
      return {
        ok: true,
        folder: {
          storagePath,
          displayPath: displayPathFromStorage(storagePath, params.userId),
          visibility: params.visibility,
          createdBy: params.userId,
          createdAt: new Date().toISOString(),
        },
      }
    }
    return {
      ok: false,
      message: error.message ?? '폴더를 만들지 못했습니다.',
    }
  }

  const local = readLocalFolders()
  if (!local.some((f) => f.storagePath === storagePath)) {
    local.push({
      storagePath,
      visibility: params.visibility,
      createdBy: params.userId,
      createdAt: new Date().toISOString(),
    })
    writeLocalFolders(local)
  }

  return {
    ok: true,
    folder: {
      storagePath,
      displayPath: displayPathFromStorage(storagePath, params.userId),
      visibility: params.visibility,
      createdBy: params.userId,
      createdAt: new Date().toISOString(),
    },
  }
}

export async function renameKnowledgeFolderRecord(
  client: SupabaseClient,
  params: {
    oldStoragePath: string
    newDisplayPath: string
    visibility: KnowledgeFolderVisibility
    userId: string
    allFolderPaths: string[]
  },
): Promise<{ ok: true } | { ok: false; message: string }> {
  const newStoragePath = storagePathFromDisplay(
    params.newDisplayPath,
    params.visibility,
    params.userId,
  )
  if (!newStoragePath) {
    return { ok: false, message: '새 폴더 이름이 올바르지 않습니다.' }
  }
  if (newStoragePath === params.oldStoragePath) {
    return { ok: true }
  }

  const affectedFolderPaths = collectDescendantStoragePaths(
    params.allFolderPaths,
    params.oldStoragePath,
  )

  for (const oldPath of affectedFolderPaths) {
    const nextPath = remapStoragePathPrefix(
      params.oldStoragePath,
      newStoragePath,
      oldPath,
    )
    if (!nextPath) continue

    const { error: folderErr } = await client
      .from('knowledge_folders')
      .update({ path: nextPath })
      .eq('path', oldPath)

    if (folderErr && !isSchemaMissing(folderErr.message)) {
      return {
        ok: false,
        message: folderErr.message ?? '폴더 이름을 바꾸지 못했습니다.',
      }
    }
  }

  const { data: docs, error: docsErr } = await client
    .from('knowledge_base')
    .select('id, category')

  if (!docsErr && docs) {
    for (const doc of docs) {
      const cat = String(doc.category ?? '').trim()
      const nextCat = remapStoragePathPrefix(
        params.oldStoragePath,
        newStoragePath,
        cat,
      )
      if (!nextCat || nextCat === cat) continue
      await client
        .from('knowledge_base')
        .update({ category: nextCat })
        .eq('id', doc.id)
    }
  }

  const local = readLocalFolders()
  const nextLocal = local.map((f) => {
    const next = remapStoragePathPrefix(
      params.oldStoragePath,
      newStoragePath,
      f.storagePath,
    )
    return next ? { ...f, storagePath: next } : f
  })
  writeLocalFolders(nextLocal)

  return { ok: true }
}

export async function deleteKnowledgeFolderRecord(
  client: SupabaseClient,
  params: {
    storagePath: string
    allFolderPaths: string[]
  },
): Promise<{ ok: true; deletedPaths: string[] } | { ok: false; message: string }> {
  const toDelete = collectDescendantStoragePaths(
    params.allFolderPaths,
    params.storagePath,
  ).sort((a, b) => b.length - a.length)

  for (const path of toDelete) {
    const { error } = await client.from('knowledge_folders').delete().eq('path', path)
    if (error && !isSchemaMissing(error.message)) {
      return {
        ok: false,
        message: error.message ?? '폴더를 삭제하지 못했습니다.',
      }
    }
  }

  const local = readLocalFolders().filter(
    (f) => !toDelete.includes(f.storagePath),
  )
  writeLocalFolders(local)

  return { ok: true, deletedPaths: toDelete }
}
