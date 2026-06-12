import type { KnowledgeBaseRow } from '../services/reference-room/knowledge-base'

export type KnowledgeFolderNode = {
  name: string
  pathKey: string
  folders: Map<string, KnowledgeFolderNode>
  files: KnowledgeBaseRow[]
}

/** `category` 또는 `folder_path`를 `/` 로 나눠 폴더 깊이 반영 */
export function knowledgeRowSegments(row: KnowledgeBaseRow): string[] {
  const raw = (
    row.folder_path?.trim() ||
    row.category?.trim() ||
    '미분류'
  ).trim()
  if (!raw) return ['미분류']
  return raw.split('/').map((s) => s.trim()).filter(Boolean)
}

/** 문서 category 외에 등록된 빈 폴더 경로를 트리에 반영 */
export function ensureKnowledgeFolderPath(
  root: KnowledgeFolderNode,
  pathKey: string,
): void {
  const segments = pathKey.split('/').filter(Boolean)
  if (segments.length === 0) return

  let node = root
  for (let i = 0; i < segments.length; i++) {
    const head = segments[i]!
    const pathSoFar = segments.slice(0, i + 1).join('/')
    let child = node.folders.get(head)
    if (!child) {
      child = {
        name: head,
        pathKey: pathSoFar,
        folders: new Map(),
        files: [],
      }
      node.folders.set(head, child)
    }
    node = child
  }
}

export function buildKnowledgeFolderTree(
  rows: KnowledgeBaseRow[],
  extraFolderPaths: string[] = [],
): KnowledgeFolderNode {
  const root: KnowledgeFolderNode = {
    name: '',
    pathKey: '',
    folders: new Map(),
    files: [],
  }

  for (const row of rows) {
    insertKnowledgeRow(root, knowledgeRowSegments(row), row)
  }
  for (const path of extraFolderPaths) {
    const normalized = path.trim()
    if (normalized.length > 0) {
      ensureKnowledgeFolderPath(root, normalized)
    }
  }
  return root
}

function insertKnowledgeRow(
  node: KnowledgeFolderNode,
  segments: string[],
  row: KnowledgeBaseRow,
) {
  if (segments.length === 0) {
    node.files.push(row)
    return
  }
  const [head, ...rest] = segments
  const pathSoFar = node.pathKey === '' ? head : `${node.pathKey}/${head}`
  let child = node.folders.get(head)
  if (!child) {
    child = {
      name: head,
      pathKey: pathSoFar,
      folders: new Map(),
      files: [],
    }
    node.folders.set(head, child)
  }
  if (rest.length === 0) {
    child.files.push(row)
  } else {
    insertKnowledgeRow(child, rest, row)
  }
}

/** pathKey 가 '' 이면 루트 */
export function getKnowledgeFolderNode(
  root: KnowledgeFolderNode,
  pathKey: string,
): KnowledgeFolderNode | null {
  if (pathKey === '') return root
  const parts = pathKey.split('/').filter(Boolean)
  let cur = root
  for (const p of parts) {
    const next = cur.folders.get(p)
    if (!next) return null
    cur = next
  }
  return cur
}

/** DFS 로 폴더 버튼 렌더용 순서 목록 */
export function flattenKnowledgeFolders(
  node: KnowledgeFolderNode,
  depth = 0,
): { pathKey: string; name: string; depth: number }[] {
  const sorted = [...node.folders.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  )
  const out: { pathKey: string; name: string; depth: number }[] = []
  for (const child of sorted) {
    out.push({ pathKey: child.pathKey, name: child.name, depth })
    out.push(...flattenKnowledgeFolders(child, depth + 1))
  }
  return out
}
