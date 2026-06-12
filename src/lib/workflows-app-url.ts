/** 외부 Workflows(Nuxt) 앱 URL. 설정 시 /workflows 에 iframe으로 표시합니다. */
export function getWorkflowsAppUrl(): string | null {
  const raw = import.meta.env.VITE_WORKFLOWS_APP_URL?.trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.toString().replace(/\/$/, '')
  } catch {
    return null
  }
}
