export interface WorkflowBootstrapData {
  workflowId: string
  title: string
  systemPrompt: string
}

export function writeWorkflowBootstrap(
  threadId: string,
  data: WorkflowBootstrapData,
) {
  try {
    sessionStorage.setItem(`workflow_bootstrap_${threadId}`, JSON.stringify(data))
  } catch (err) {
    console.error('Failed to write workflow bootstrap data', err)
  }
}

export function clearWorkflowBootstrap(threadId: string) {
  try {
    sessionStorage.removeItem(`workflow_bootstrap_${threadId}`)
  } catch {}
}

export function readWorkflowBootstrap(threadId: string): WorkflowBootstrapData | null {
  try {
    const key = `workflow_bootstrap_${threadId}`
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    sessionStorage.removeItem(key)
    return JSON.parse(raw) as WorkflowBootstrapData
  } catch {
    return null
  }
}
