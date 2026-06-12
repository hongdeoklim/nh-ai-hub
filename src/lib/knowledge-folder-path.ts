export type KnowledgeFolderVisibility = 'public' | 'personal'

/** DB·문서 category 에 저장되는 개인 폴더 접두 */
export const KNOWLEDGE_PERSONAL_FOLDER_PREFIX = '__private/'

export function personalFolderStoragePrefix(userId: string): string {
  return `${KNOWLEDGE_PERSONAL_FOLDER_PREFIX}${userId}/`
}

export function isPersonalStorageFolderPath(path: string): boolean {
  return path.startsWith(KNOWLEDGE_PERSONAL_FOLDER_PREFIX)
}

/** DB path → UI 표시 경로 (본인 개인 폴더만) */
export function displayPathFromStorage(
  storagePath: string,
  userId: string | null | undefined,
): string {
  const trimmed = storagePath.trim()
  if (!userId || !isPersonalStorageFolderPath(trimmed)) return trimmed
  const prefix = personalFolderStoragePrefix(userId)
  if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length)
  return trimmed
}

/** UI 경로 → DB 저장 path */
export function storagePathFromDisplay(
  displayPath: string,
  visibility: KnowledgeFolderVisibility,
  userId: string,
): string | null {
  const normalized = normalizeKnowledgeFolderPath(displayPath)
  if (!normalized) return null
  if (visibility === 'personal') {
    return normalizeKnowledgeFolderPath(
      `${personalFolderStoragePrefix(userId)}${normalized}`,
    )
  }
  if (isPersonalStorageFolderPath(normalized)) return null
  return normalized
}

/** 자료실 폴더 경로 정규화 (슬래시 구분, 빈 세그먼트 제거) */
export function normalizeKnowledgeFolderPath(raw: string): string | null {
  const trimmed = raw.trim().replace(/\\/g, '/')
  if (!trimmed.length) return null
  const segments = trimmed
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean)
  if (segments.length === 0) return null
  if (segments.length > 12) return null
  for (const seg of segments) {
    if (seg.length > 120) return null
    if (seg === '.' || seg === '..') return null
  }
  return segments.join('/')
}

/** 현재 위치 아래에 단일 이름으로 하위 폴더 경로 생성 */
export function joinKnowledgeFolderPath(
  parentPathKey: string,
  folderName: string,
): string | null {
  const name = folderName.trim()
  if (!name.length || name.includes('/')) return null
  const parent = normalizeKnowledgeFolderPath(parentPathKey)
  if (!parent) return normalizeKnowledgeFolderPath(name)
  return normalizeKnowledgeFolderPath(`${parent}/${name}`)
}

/** storage path 기준 직·하위 폴더 경로 수집 */
export function collectDescendantStoragePaths(
  allPaths: string[],
  parentStoragePath: string,
): string[] {
  const parent = parentStoragePath.trim()
  if (!parent) return []
  const prefix = `${parent}/`
  return allPaths.filter((p) => p === parent || p.startsWith(prefix))
}

/** 폴더·문서 경로 일괄 치환 (이름 변경·이동) */
export function remapStoragePathPrefix(
  oldPrefix: string,
  newPrefix: string,
  path: string,
): string | null {
  const oldP = oldPrefix.trim()
  const newP = newPrefix.trim()
  const p = path.trim()
  if (!oldP || !newP || !p) return null
  if (p === oldP) return newP
  if (p.startsWith(`${oldP}/`)) {
    return normalizeKnowledgeFolderPath(`${newP}${p.slice(oldP.length)}`)
  }
  return null
}
