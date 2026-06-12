import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useAuth } from '../components/auth/useAuth'
import { GoogleDriveWidget } from '../components/drive/GoogleDriveWidget'
import {
  displayPathFromStorage,
  joinKnowledgeFolderPath,
  normalizeKnowledgeFolderPath,
  storagePathFromDisplay,
  type KnowledgeFolderVisibility,
} from '../lib/knowledge-folder-path'
import {
  buildKnowledgeFolderTree,
  flattenKnowledgeFolders,
  getKnowledgeFolderNode,
  type KnowledgeFolderNode,
} from '../lib/knowledge-folder-tree'
import {
  KNOWLEDGE_DEPARTMENT_OPTIONS,
  KNOWLEDGE_SHARED_DEPARTMENT,
  knowledgeDepartmentLabel,
} from '../lib/knowledge-departments'
import { rememberLastPrivateThread } from '../lib/private-chat-storage'
import { writeReferenceBootstrap } from '../lib/reference-chat-bootstrap'
import { supabase } from '../lib/supabase'
import {
  fetchKnowledgeBase,
  uploadKnowledgeBaseDocument,
  type KnowledgeBaseRow,
} from '../services/reference-room/knowledge-base'
import {
  createKnowledgeFolderRecord,
  deleteKnowledgeFolderRecord,
  fetchKnowledgeFolderRecords,
  filterFoldersForScope,
  filterKnowledgeRowsForScope,
  renameKnowledgeFolderRecord,
  type KnowledgeFolderRecord,
} from '../services/reference-room/knowledge-folders'

function countFolderDescendants(node: KnowledgeFolderNode): {
  fileCount: number
  subfolderCount: number
} {
  let fileCount = node.files.length
  let subfolderCount = 0
  for (const child of node.folders.values()) {
    subfolderCount += 1
    const sub = countFolderDescendants(child)
    fileCount += sub.fileCount
    subfolderCount += sub.subfolderCount
  }
  return { fileCount, subfolderCount }
}

const MOCK_REFERENCE: KnowledgeBaseRow[] = [
  {
    id: 'mock-ref-1',
    uploader_id: 'mock',
    file_name: '2026 사업계획서 초안 (농협).pdf',
    file_url: 'https://drive.google.com/',
    category: '정책/규정',
    target_department: '공통',
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-ref-2',
    uploader_id: 'mock',
    file_name: '대출 심사 가이드',
    file_url: 'https://drive.google.com/',
    category: '여신/대출/심사',
    target_department: '준법지원단',
    created_at: new Date().toISOString(),
  },
  {
    id: 'mock-ref-3',
    uploader_id: 'mock',
    file_name: '농업금융 상품 안내서',
    file_url: 'https://drive.google.com/',
    category: '상품/안내',
    target_department: '경영전략부',
    created_at: new Date().toISOString(),
  },
]

type SourceTab = 'registry' | 'gdrive'

function kbSel(id: string) {
  return `kb:${id}`
}

export function ReferenceRoom() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<KnowledgeBaseRow[]>([])
  const [folders, setFolders] = useState<KnowledgeFolderRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [uploadBusy, setUploadBusy] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadCategory, setUploadCategory] = useState('미분류')
  const [uploadDepartment, setUploadDepartment] = useState<string>(
    KNOWLEDGE_SHARED_DEPARTMENT,
  )

  useEffect(() => {
    const dept = profile?.department?.trim()
    if (dept && (KNOWLEDGE_DEPARTMENT_OPTIONS as readonly string[]).includes(dept)) {
      setUploadDepartment(dept)
    }
  }, [profile?.department])

  const [sourceTab, setSourceTab] = useState<SourceTab>('registry')
  const [folderScope, setFolderScope] = useState<KnowledgeFolderVisibility>('public')

  const [registryPathKey, setRegistryPathKey] = useState('')
  const [folderCreateOpen, setFolderCreateOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderCreateBusy, setFolderCreateBusy] = useState(false)
  const [folderCreateError, setFolderCreateError] = useState<string | null>(null)
  const [folderMenuKey, setFolderMenuKey] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [renameTargetPath, setRenameTargetPath] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [renameBusy, setRenameBusy] = useState(false)
  const [renameError, setRenameError] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{
    storagePath: string
    displayPath: string
    fileCount: number
    subfolderCount: number
  } | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [kbRes, folderRes] = await Promise.all([
      fetchKnowledgeBase(supabase),
      fetchKnowledgeFolderRecords(supabase, profile?.id),
    ])
    if (!kbRes.ok) {
      setError(kbRes.message)
      setRows([])
    } else {
      setRows(kbRes.rows)
    }
    if (folderRes.ok) {
      setFolders(folderRes.folders)
    }
    setLoading(false)
  }, [profile?.id])

  useEffect(() => {
    queueMicrotask(() => void load())
  }, [load])

  const displayRows = useMemo(() => {
    if (rows.length > 0) return rows
    return MOCK_REFERENCE
  }, [rows])

  const scopedFolders = useMemo(
    () => filterFoldersForScope(folders, folderScope, profile?.id),
    [folders, folderScope, profile?.id],
  )

  const scopedRows: KnowledgeBaseRow[] = useMemo(() => {
    const filtered = filterKnowledgeRowsForScope(
      displayRows,
      folderScope,
      profile?.id,
    )
    return filtered.map((row) => ({
      ...row,
      category: displayPathFromStorage(
        row.folder_path?.trim() || row.category?.trim() || '미분류',
        profile?.id,
      ),
    }))
  }, [displayRows, folderScope, profile?.id])

  const scopedFolderDisplayPaths = useMemo(
    () => scopedFolders.map((f) => f.displayPath),
    [scopedFolders],
  )

  const allStoragePaths = useMemo(
    () => folders.map((f) => f.storagePath),
    [folders],
  )

  const kbTree = useMemo(
    () => buildKnowledgeFolderTree(scopedRows, scopedFolderDisplayPaths),
    [scopedRows, scopedFolderDisplayPaths],
  )

  const folderByDisplayPath = useMemo(() => {
    const map = new Map<string, KnowledgeFolderRecord>()
    for (const f of scopedFolders) map.set(f.displayPath, f)
    return map
  }, [scopedFolders])

  useEffect(() => {
    if (registryPathKey.trim().length > 0) {
      setUploadCategory(registryPathKey)
    }
  }, [registryPathKey])

  useEffect(() => {
    setRegistryPathKey('')
    setFolderMenuKey(null)
    setSelectedIds(new Set())
  }, [folderScope])

  useEffect(() => {
    if (loading || sourceTab !== 'registry') return
    setRegistryPathKey((prev) => {
      if (prev !== '') return prev
      const keys = [...kbTree.folders.keys()].sort((a, b) =>
        a.localeCompare(b, 'ko'),
      )
      const first = keys[0]
      if (!first) return ''
      return kbTree.folders.get(first)?.pathKey ?? ''
    })
  }, [loading, sourceTab, kbTree, folderScope])

  const registryNode = useMemo(
    () => getKnowledgeFolderNode(kbTree, registryPathKey),
    [kbTree, registryPathKey],
  )

  const folderSidebarEntries = useMemo(
    () => flattenKnowledgeFolders(kbTree),
    [kbTree],
  )

  const showMockBanner = rows.length === 0

  function toggleSelect(key: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearSelection() {
    setSelectedIds(new Set())
  }

  async function handleCreateFolder() {
    if (!profile?.id) {
      window.alert('로그인 후 폴더를 만들 수 없습니다.')
      return
    }
    const joined = joinKnowledgeFolderPath(registryPathKey, newFolderName)
    if (!joined) {
      setFolderCreateError('폴더 이름을 입력해 주세요. 슬래시(/)는 사용할 수 없습니다.')
      return
    }
    setFolderCreateBusy(true)
    setFolderCreateError(null)
    const res = await createKnowledgeFolderRecord(supabase, {
      displayPath: joined,
      visibility: folderScope,
      userId: profile.id,
    })
    setFolderCreateBusy(false)
    if (!res.ok) {
      setFolderCreateError(res.message)
      return
    }
    setFolders((prev) => {
      const next = [
        ...prev.filter((f) => f.storagePath !== res.folder.storagePath),
        res.folder,
      ]
      return next.sort((a, b) => a.displayPath.localeCompare(b.displayPath, 'ko'))
    })
    setRegistryPathKey(res.folder.displayPath)
    setUploadCategory(res.folder.displayPath)
    setNewFolderName('')
    setFolderCreateOpen(false)
    setFolderMenuKey(null)
    clearSelection()
  }

  function openRenameFolder(displayPath: string) {
    const parts = displayPath.split('/')
    setRenameTargetPath(displayPath)
    setRenameValue(parts[parts.length - 1] ?? displayPath)
    setRenameError(null)
    setRenameOpen(true)
    setFolderMenuKey(null)
  }

  async function handleRenameFolder() {
    if (!profile?.id || !renameTargetPath.trim()) return
    const record = folderByDisplayPath.get(renameTargetPath)
    const oldStoragePath =
      record?.storagePath ??
      storagePathFromDisplay(renameTargetPath, folderScope, profile.id)
    if (!oldStoragePath) {
      setRenameError('폴더를 찾을 수 없습니다.')
      return
    }
    const parentParts = renameTargetPath.split('/').filter(Boolean)
    parentParts.pop()
    const parentDisplay = parentParts.join('/')
    const newDisplayPath =
      parentDisplay.length > 0
        ? joinKnowledgeFolderPath(parentDisplay, renameValue)
        : normalizeKnowledgeFolderPath(renameValue)
    if (!newDisplayPath) {
      setRenameError('새 이름을 입력해 주세요. 슬래시(/)는 사용할 수 없습니다.')
      return
    }
    setRenameBusy(true)
    setRenameError(null)
    const res = await renameKnowledgeFolderRecord(supabase, {
      oldStoragePath,
      newDisplayPath,
      visibility: folderScope,
      userId: profile.id,
      allFolderPaths: allStoragePaths,
    })
    setRenameBusy(false)
    if (!res.ok) {
      setRenameError(res.message)
      return
    }
    await load()
    if (
      registryPathKey === renameTargetPath ||
      registryPathKey.startsWith(`${renameTargetPath}/`)
    ) {
      const suffix = registryPathKey.slice(renameTargetPath.length)
      setRegistryPathKey(`${newDisplayPath}${suffix}`)
      setUploadCategory(`${newDisplayPath}${suffix}`)
    }
    setRenameOpen(false)
    setRenameValue('')
    setRenameTargetPath('')
  }

  function requestDeleteFolder(displayPath: string) {
    const node = getKnowledgeFolderNode(kbTree, displayPath)
    const counts = node
      ? countFolderDescendants(node)
      : { fileCount: 0, subfolderCount: 0 }
    const record = folderByDisplayPath.get(displayPath)
    const storagePath =
      record?.storagePath ??
      (profile?.id
        ? storagePathFromDisplay(displayPath, folderScope, profile.id)
        : null)
    if (!storagePath) return
    setDeleteConfirm({
      storagePath,
      displayPath,
      fileCount: counts.fileCount,
      subfolderCount: counts.subfolderCount,
    })
    setFolderMenuKey(null)
  }

  async function handleConfirmDeleteFolder() {
    if (!deleteConfirm) return
    setDeleteBusy(true)
    const res = await deleteKnowledgeFolderRecord(supabase, {
      storagePath: deleteConfirm.storagePath,
      allFolderPaths: allStoragePaths,
    })
    setDeleteBusy(false)
    if (!res.ok) {
      window.alert(res.message)
      return
    }
    setFolders((prev) =>
      prev.filter((f) => !res.deletedPaths.includes(f.storagePath)),
    )
    if (
      deleteConfirm.displayPath === registryPathKey ||
      registryPathKey.startsWith(`${deleteConfirm.displayPath}/`)
    ) {
      setRegistryPathKey('')
      setUploadCategory(folderScope === 'public' ? '미분류' : '')
    }
    setDeleteConfirm(null)
    clearSelection()
  }

  async function handleKnowledgeUpload(file: File) {
    if (!profile?.id) {
      window.alert('로그인 후 업로드할 수 없습니다.')
      return
    }
    setUploadBusy(true)
    setUploadError(null)
    const storageCategory =
      storagePathFromDisplay(uploadCategory, folderScope, profile.id) ??
      uploadCategory
    const res = await uploadKnowledgeBaseDocument(supabase, {
      file,
      userId: profile.id,
      targetDepartment: uploadDepartment,
      category: storageCategory,
    })
    setUploadBusy(false)
    if (!res.ok) {
      setUploadError(res.message)
      return
    }
    await load()
  }

  function openChatWithItems(
    items: Pick<KnowledgeBaseRow, 'id' | 'file_name' | 'file_url'>[],
  ) {
    if (items.length === 0) {
      window.alert('자료를 한 개 이상 선택해 주세요.')
      return
    }
    const threadId = crypto.randomUUID()
    rememberLastPrivateThread(threadId)
    writeReferenceBootstrap(threadId, { items })
    navigate(`/chat/${threadId}`)
  }

  function collectSelectionForChat() {
    const items: Pick<KnowledgeBaseRow, 'id' | 'file_name' | 'file_url'>[] = []
    for (const key of selectedIds) {
      if (key.startsWith('kb:')) {
        const id = key.slice(3)
        const row = scopedRows.find((r) => r.id === id)
        if (row) {
          items.push({
            id: row.id,
            file_name: row.file_name,
            file_url: row.file_url,
          })
        }
      }
    }
    openChatWithItems(items)
  }

  function registryBreadcrumb(): string {
    if (!registryPathKey) return '전체 자료실'
    return registryPathKey.split('/').join(' › ')
  }

  const rowBtn =
    'rounded-lg border border-stone-200/90 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800'

  const scopeTabBtn = (scope: KnowledgeFolderVisibility, label: string) => (
    <button
      type="button"
      onClick={() => setFolderScope(scope)}
      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
        folderScope === scope
          ? 'bg-orange-800 text-white dark:bg-orange-900'
          : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-stone-800'
      }`}
    >
      {label}
    </button>
  )

  const renderRegistrySidebar = () => (
    <aside className="flex w-full shrink-0 flex-col border-b border-stone-200/90 bg-[#F4F1EA]/90 dark:border-stone-700 dark:bg-stone-900/80 md:w-56 md:border-b-0 md:border-r">
      <div className="border-b border-stone-200/80 px-2 py-2 dark:border-stone-700">
        <div className="flex gap-1 rounded-lg border border-stone-200/90 bg-white/80 p-0.5 dark:border-stone-600 dark:bg-stone-950/50">
          {scopeTabBtn('public', '공개 폴더')}
          {scopeTabBtn('personal', '내 폴더')}
        </div>
        <p className="mt-1.5 px-1 text-[10px] leading-snug text-stone-500 dark:text-stone-400">
          {folderScope === 'public'
            ? '전사가 볼 수 있는 공유 폴더·문서입니다.'
            : '본인만 보는 개인 폴더·문서입니다.'}
        </p>
      </div>
      <div className="flex items-center justify-between gap-1 border-b border-stone-200/80 px-2 py-2 dark:border-stone-700">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
          폴더
        </p>
        <button
          type="button"
          onClick={() => {
            setFolderCreateOpen((v) => !v)
            setFolderCreateError(null)
          }}
          disabled={!profile?.id}
          className="rounded-md px-2 py-1 text-[11px] font-semibold text-orange-900 hover:bg-orange-100/80 disabled:opacity-50 dark:text-orange-200 dark:hover:bg-orange-950/40"
        >
          + 새 폴더
        </button>
      </div>
      {folderCreateOpen ? (
        <div className="border-b border-stone-200/80 px-2 py-2 dark:border-stone-700">
          <p className="mb-1.5 text-[10px] text-stone-500 dark:text-stone-400">
            {registryPathKey.trim().length > 0
              ? `위치: ${registryPathKey} 아래`
              : '최상위 폴더 만들기'}
          </p>
          <div className="flex gap-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreateFolder()
                if (e.key === 'Escape') {
                  setFolderCreateOpen(false)
                  setFolderCreateError(null)
                }
              }}
              disabled={folderCreateBusy}
              placeholder="폴더 이름"
              className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500/30 disabled:opacity-60 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
            />
            <button
              type="button"
              disabled={folderCreateBusy || !newFolderName.trim()}
              onClick={() => void handleCreateFolder()}
              className="shrink-0 rounded-lg bg-orange-800 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900"
            >
              {folderCreateBusy ? '…' : '만들기'}
            </button>
          </div>
          <label className="mt-2 flex flex-col gap-0.5 text-[10px] text-stone-500 dark:text-stone-400">
            또는 전체 경로
            <input
              type="text"
              disabled={folderCreateBusy}
              placeholder="예: 정책/규정"
              className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs text-stone-900 focus:border-orange-500 focus:outline-none dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                const path = normalizeKnowledgeFolderPath(
                  (e.target as HTMLInputElement).value,
                )
                if (!path || !profile?.id) return
                void (async () => {
                  setFolderCreateBusy(true)
                  setFolderCreateError(null)
                  const res = await createKnowledgeFolderRecord(supabase, {
                    displayPath: path,
                    visibility: folderScope,
                    userId: profile.id,
                  })
                  setFolderCreateBusy(false)
                  if (!res.ok) {
                    setFolderCreateError(res.message)
                    return
                  }
                  setFolders((prev) => {
                    const next = [
                      ...prev.filter(
                        (f) => f.storagePath !== res.folder.storagePath,
                      ),
                      res.folder,
                    ]
                    return next.sort((a, b) =>
                      a.displayPath.localeCompare(b.displayPath, 'ko'),
                    )
                  })
                  setRegistryPathKey(res.folder.displayPath)
                  setUploadCategory(res.folder.displayPath)
                  ;(e.target as HTMLInputElement).value = ''
                  setFolderCreateOpen(false)
                })()
              }}
            />
          </label>
          {folderCreateError ? (
            <p className="mt-1.5 text-[10px] text-red-700 dark:text-red-300">
              {folderCreateError}
            </p>
          ) : null}
        </div>
      ) : null}
      <nav className="max-h-48 overflow-y-auto px-1 py-2 md:max-h-none md:flex-1">
        {folderSidebarEntries.length === 0 ? (
          <p className="px-2 py-3 text-xs text-stone-500">폴더가 없습니다.</p>
        ) : (
          folderSidebarEntries.map((e) => (
            <div
              key={e.pathKey}
              className="relative flex items-center"
              style={{ paddingLeft: `${10 + e.depth * 14}px` }}
            >
              <button
                type="button"
                onClick={() => {
                  setRegistryPathKey(e.pathKey)
                  setFolderMenuKey(null)
                  clearSelection()
                }}
                className={`flex min-w-0 flex-1 items-center gap-1 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                  registryPathKey === e.pathKey
                    ? 'bg-orange-200/90 font-semibold text-orange-950 dark:bg-orange-950/40 dark:text-orange-50'
                    : 'text-stone-700 hover:bg-white/70 dark:text-stone-200 dark:hover:bg-stone-800'
                }`}
              >
                <span aria-hidden="true">📁</span>
                <span className="truncate">{e.name}</span>
              </button>
              <button
                type="button"
                aria-label={`${e.name} 폴더 메뉴`}
                onClick={(ev) => {
                  ev.stopPropagation()
                  setFolderMenuKey((k) => (k === e.pathKey ? null : e.pathKey))
                }}
                className="shrink-0 rounded px-1.5 py-1 text-[10px] text-stone-500 hover:bg-stone-200/80 dark:text-stone-400 dark:hover:bg-stone-700"
              >
                ⋮
              </button>
              {folderMenuKey === e.pathKey ? (
                <div className="absolute right-1 top-full z-20 mt-0.5 min-w-[9rem] rounded-lg border border-stone-200 bg-white py-1 shadow-lg dark:border-stone-600 dark:bg-stone-900">
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[11px] text-stone-800 hover:bg-stone-50 dark:text-stone-100 dark:hover:bg-stone-800"
                    onClick={() => {
                      setRegistryPathKey(e.pathKey)
                      setFolderCreateOpen(true)
                      setFolderMenuKey(null)
                    }}
                  >
                    하위 폴더 만들기
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[11px] text-stone-800 hover:bg-stone-50 dark:text-stone-100 dark:hover:bg-stone-800"
                    onClick={() => openRenameFolder(e.pathKey)}
                  >
                    이름 바꾸기
                  </button>
                  <button
                    type="button"
                    className="block w-full px-3 py-1.5 text-left text-[11px] text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                    onClick={() => requestDeleteFolder(e.pathKey)}
                  >
                    삭제…
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </nav>
    </aside>
  )

  const renderRegistryMain = () => {
    const node = registryNode
    const subfolders = node
      ? [...node.folders.values()].sort((a, b) =>
          a.name.localeCompare(b.name, 'ko'),
        )
      : []

    return (
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <div className="shrink-0 border-b border-stone-200/80 bg-[#FAF9F6]/95 px-3 py-2 dark:border-stone-700 dark:bg-stone-950/90 md:px-4">
          <p className="text-[10px] font-medium uppercase tracking-wide text-stone-500 dark:text-stone-400">
            위치
          </p>
          <p className="truncate text-sm font-semibold text-stone-900 dark:text-stone-50">
            {registryBreadcrumb()}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {subfolders.length > 0 ? (
            <div className="border-b border-stone-200/70 dark:border-stone-700">
              <p className="px-3 py-2 text-[11px] font-semibold text-stone-600 dark:text-stone-300 md:px-4">
                하위 폴더
              </p>
              <ul className="grid gap-1 px-3 pb-3 md:grid-cols-2 md:px-4">
                {subfolders.map((sf) => (
                  <li key={sf.pathKey}>
                    <button
                      type="button"
                      onClick={() => {
                        setRegistryPathKey(sf.pathKey)
                        clearSelection()
                      }}
                      className="flex w-full items-center gap-2 rounded-xl border border-stone-200/90 bg-white px-3 py-2.5 text-left text-sm font-medium text-stone-800 hover:border-orange-300/70 hover:bg-orange-50/50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:border-orange-700/50"
                    >
                      <span className="text-lg" aria-hidden="true">
                        📁
                      </span>
                      <span className="truncate">{sf.name}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="px-3 py-3 md:px-4">
            <p className="mb-2 text-[11px] font-semibold text-stone-600 dark:text-stone-300">
              파일 ({node?.files.length ?? 0})
            </p>
            {!node || node.files.length === 0 ? (
              <div className="rounded-xl border border-dashed border-stone-300/80 bg-white/60 px-3 py-8 text-center dark:border-stone-600 dark:bg-stone-900/40">
                <p className="text-sm text-stone-500 dark:text-stone-400">
                  이 폴더에 등록된 파일이 없습니다.
                </p>
                <button
                  type="button"
                  disabled={!profile?.id}
                  onClick={() => {
                    setFolderCreateOpen(true)
                    setFolderCreateError(null)
                  }}
                  className="mt-3 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                >
                  + 하위 폴더 만들기
                </button>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-stone-200/90 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:border-stone-700 dark:bg-stone-950/50 dark:text-stone-400">
                    <tr>
                      <th className="w-10 px-3 py-2">선택</th>
                      <th className="px-3 py-2">파일명</th>
                      <th className="hidden px-3 py-2 md:table-cell">열람 부서</th>
                      <th className="hidden px-3 py-2 sm:table-cell">등록일</th>
                      <th className="px-3 py-2 text-right">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-stone-800">
                    {node.files.map((row) => {
                      const key = kbSel(row.id)
                      const checked = selectedIds.has(key)
                      return (
                        <tr
                          key={row.id}
                          className={
                            checked
                              ? 'bg-orange-50/80 dark:bg-orange-950/25'
                              : 'hover:bg-stone-50/80 dark:hover:bg-stone-800/40'
                          }
                        >
                          <td className="px-3 py-2 align-middle">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleSelect(key)}
                              className="h-4 w-4 rounded border-stone-400 text-orange-800 focus:ring-orange-700"
                              aria-label={`${row.file_name} 선택`}
                            />
                          </td>
                          <td className="max-w-[1px] px-3 py-2 align-middle">
                            <p className="truncate font-medium text-stone-900 dark:text-stone-50">
                              📄 {row.file_name}
                            </p>
                            <p className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                              {row.file_url}
                            </p>
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2 align-middle text-xs text-stone-600 md:table-cell dark:text-stone-300">
                            {knowledgeDepartmentLabel(row.target_department ?? '공통')}
                          </td>
                          <td className="hidden whitespace-nowrap px-3 py-2 align-middle text-xs text-stone-500 sm:table-cell">
                            {new Date(row.created_at).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 align-middle text-right">
                            <div className="flex flex-wrap justify-end gap-1">
                              <a
                                href={row.file_url}
                                target="_blank"
                                rel="noreferrer"
                                className={rowBtn}
                              >
                                열기
                              </a>
                              <button
                                type="button"
                                className={`${rowBtn} border-orange-700/50 bg-orange-800 text-white hover:bg-orange-900 dark:bg-orange-900`}
                                onClick={() =>
                                  openChatWithItems([
                                    {
                                      id: row.id,
                                      file_name: row.file_name,
                                      file_url: row.file_url,
                                    },
                                  ])
                                }
                              >
                                대화
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#FAF9F6] dark:bg-stone-950">
      <header className="shrink-0 border-b border-stone-200/90 bg-[#FAF9F6]/95 px-4 py-4 backdrop-blur-md dark:border-stone-800 dark:bg-stone-950/95 md:px-8 md:py-5">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-900/90 dark:text-orange-300">
              Knowledge base
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-stone-900 dark:text-stone-50 md:text-2xl">
              사내 자료실
            </h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              왼쪽은 폴더 트리, 오른쪽은 파일 목록입니다. 내 Google Drive 탭에서는 동일한 레이아웃으로 연동 계정 폴더를 탐색합니다.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="flex rounded-xl border border-stone-300/90 bg-white p-0.5 shadow-sm dark:border-stone-600 dark:bg-stone-900">
              <button
                type="button"
                onClick={() => {
                  setSourceTab('registry')
                  clearSelection()
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  sourceTab === 'registry'
                    ? 'bg-orange-800 text-white shadow-sm dark:bg-orange-900'
                    : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800'
                }`}
              >
                사내 등록 자료
              </button>
              <button
                type="button"
                onClick={() => {
                  setSourceTab('gdrive')
                  clearSelection()
                }}
                className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  sourceTab === 'gdrive'
                    ? 'bg-orange-800 text-white shadow-sm dark:bg-orange-900'
                    : 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-stone-800'
                }`}
              >
                내 Google Drive
              </button>
            </div>
            <button
              type="button"
              disabled={selectedIds.size === 0}
              onClick={() => collectSelectionForChat()}
              className="shrink-0 rounded-xl bg-orange-800 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-orange-900 dark:hover:bg-orange-950"
            >
              선택한 자료로 대화하기 ({selectedIds.size})
            </button>
            <Link
              to="/"
              className="inline-flex shrink-0 items-center justify-center rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-semibold text-stone-800 shadow-sm hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
            >
              ← 대화로 돌아가기
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col px-4 py-4 md:px-8 md:py-6">
        {showMockBanner ? (
          <div
            className={`mb-4 shrink-0 rounded-2xl border px-4 py-3 text-sm ${
              error
                ? 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/35 dark:text-amber-100'
                : 'border-stone-200 bg-white text-stone-600 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400'
            }`}
          >
            {error ? (
              <>
                <span className="font-semibold">목록을 불러오지 못했습니다.</span> {error}{' '}
                · 아래는 UI 확인용 표시입니다.
              </>
            ) : (
              <>
                <span className="font-semibold">등록된 자료가 없습니다.</span>{' '}
                왼쪽 <span className="font-medium">+ 새 폴더</span>로 폴더를 만들거나, 문서
                업로드 시 <span className="font-medium">정책/규정</span>처럼 아래와 같이{' '}
                <code className="rounded bg-stone-100 px-1 py-0.5 text-xs dark:bg-stone-800">
                  /
                </code>
                ) 경로를 지정하세요. 아래는 UI 확인용 미리보기입니다.
              </>
            )}
          </div>
        ) : null}

        {loading && sourceTab === 'registry' ? (
          <div className="flex flex-1 flex-col gap-2 md:flex-row">
            <div className="h-40 animate-pulse rounded-xl bg-stone-200/80 dark:bg-stone-800/80 md:h-auto md:w-56" />
            <div className="min-h-[12rem] flex-1 animate-pulse rounded-xl bg-stone-200/70 dark:bg-stone-800/70" />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-sm dark:border-stone-700 dark:bg-stone-900 md:flex-row">
            {sourceTab === 'registry' ? (
              <>
                {renderRegistrySidebar()}
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <div className="shrink-0 border-b border-stone-200/90 bg-[#FAF9F6]/95 px-4 py-3 dark:border-stone-700 dark:bg-stone-950/90">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                      문서 업로드
                    </p>
                    <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
                      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-stone-700 dark:text-stone-200">
                        문서 열람 권한(부서)
                        <select
                          value={uploadDepartment}
                          onChange={(e) => setUploadDepartment(e.target.value)}
                          disabled={uploadBusy}
                          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-60 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                        >
                          {KNOWLEDGE_DEPARTMENT_OPTIONS.map((dept) => (
                            <option key={dept} value={dept}>
                              {knowledgeDepartmentLabel(dept)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs font-medium text-stone-700 dark:text-stone-200">
                        폴더(카테고리)
                        <input
                          type="text"
                          value={uploadCategory}
                          onChange={(e) => setUploadCategory(e.target.value)}
                          disabled={uploadBusy}
                          placeholder="예: 안전/가이드"
                          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 shadow-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-60 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100"
                        />
                      </label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={uploadFileRef}
                          type="file"
                          accept=".pdf,.hwp,.hwpx,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) void handleKnowledgeUpload(file)
                            e.target.value = ''
                          }}
                        />
                        <button
                          type="button"
                          disabled={uploadBusy || !profile?.id}
                          onClick={() => uploadFileRef.current?.click()}
                          className="rounded-xl bg-orange-800 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-orange-900 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-orange-900"
                        >
                          {uploadBusy ? '업로드 중…' : '+ 문서 업로드'}
                        </button>
                      </div>
                    </div>
                    {uploadError ? (
                      <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
                        {uploadError}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">
                      PDF·HWP·Excel 등을 Storage에 저장하고, 선택한 부서만 RAG 검색·열람할
                      수 있습니다. 기본값은 로그인 직원의 소속 부서입니다.
                    </p>
                  </div>
                  {renderRegistryMain()}
                </div>
              </>
            ) : (
              <GoogleDriveWidget variant="full" className="min-h-[20rem] flex-1" />
            )}
          </div>
        )}
      </div>

      {deleteConfirm ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-folder-title"
          onClick={() => {
            if (!deleteBusy) setDeleteConfirm(null)
          }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="delete-folder-title"
              className="text-base font-semibold text-stone-900 dark:text-stone-50"
            >
              폴더 삭제
            </h2>
            <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
              <span className="font-semibold">{deleteConfirm.displayPath}</span> 폴더를
              삭제할까요?
            </p>
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              이 폴더 아래에 파일 {deleteConfirm.fileCount}개, 하위 폴더{' '}
              {deleteConfirm.subfolderCount}개가 연결되어 있습니다.
            </p>
            <p className="mt-3 rounded-lg border border-amber-200/90 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
              폴더 레코드만 삭제됩니다. 등록된 문서 파일과 Storage 객체는 삭제되지 않으며,
              다른 폴더에 남아 있을 수 있습니다.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              >
                취소
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void handleConfirmDeleteFolder()}
                className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50 dark:bg-red-900"
              >
                {deleteBusy ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {renameOpen ? (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="rename-folder-title"
          onClick={() => {
            if (!renameBusy) {
              setRenameOpen(false)
              setRenameError(null)
            }
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 shadow-xl dark:border-stone-600 dark:bg-stone-900"
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="rename-folder-title"
              className="text-base font-semibold text-stone-900 dark:text-stone-50"
            >
              폴더 이름 바꾸기
            </h2>
            <p className="mt-1 truncate text-xs text-stone-500 dark:text-stone-400">
              {renameTargetPath}
            </p>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleRenameFolder()
                if (e.key === 'Escape' && !renameBusy) {
                  setRenameOpen(false)
                  setRenameError(null)
                }
              }}
              disabled={renameBusy}
              autoFocus
              className="mt-3 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 disabled:opacity-60 dark:border-stone-600 dark:bg-stone-950 dark:text-stone-100"
            />
            {renameError ? (
              <p className="mt-2 text-xs text-red-700 dark:text-red-300">{renameError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                disabled={renameBusy}
                onClick={() => {
                  setRenameOpen(false)
                  setRenameError(null)
                }}
                className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100"
              >
                취소
              </button>
              <button
                type="button"
                disabled={renameBusy || !renameValue.trim()}
                onClick={() => void handleRenameFolder()}
                className="rounded-lg bg-orange-800 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-900 disabled:opacity-50 dark:bg-orange-900"
              >
                {renameBusy ? '저장 중…' : '저장'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
