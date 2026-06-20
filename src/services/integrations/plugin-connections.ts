import { supabase } from '../../lib/supabase'

export type PluginConnectionStatus = 'untested' | 'connected' | 'failed'

export interface ConnectablePlugin {
  id: string
  name: string
  description: string
  endpoint_url: string | null
  tool_function_name: string
  auth_type: 'none' | 'bearer' | 'api_key'
  auth_header_name: string
  connection_mode: 'per_user' | 'workspace_install' | 'admin_shared' | 'hybrid'
  setup_url: string | null
  docs_url: string | null
  is_active: boolean
  connection: {
    plugin_id: string
    credential_hint: string | null
    status: PluginConnectionStatus
    last_tested_at: string | null
    last_error: string | null
    updated_at: string
  } | null
}

async function invoke<T>(method: 'GET' | 'PUT' | 'POST' | 'DELETE', body?: object): Promise<T> {
  const { data: session } = await supabase.auth.getSession()
  if (!session.session) throw new Error('로그인이 필요합니다.')
  const base = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, '')
  if (!base) throw new Error('Supabase URL이 설정되지 않았습니다.')
  const response = await fetch(`${base}/functions/v1/plugin-connections`, {
    method,
    headers: {
      Authorization: `Bearer ${session.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const payload = await response.json().catch(() => ({})) as T & { error?: string }
  if (!response.ok) throw new Error(payload.error || `요청 실패 (${response.status})`)
  return payload
}

export async function fetchConnectablePlugins(): Promise<ConnectablePlugin[]> {
  const result = await invoke<{ plugins: ConnectablePlugin[] }>('GET')
  return result.plugins
}

export async function savePluginConnection(pluginId: string, credential: string): Promise<void> {
  await invoke('PUT', { plugin_id: pluginId, credential })
}

export async function testPluginConnection(pluginId: string): Promise<void> {
  await invoke('POST', { plugin_id: pluginId })
}

export async function deletePluginConnection(pluginId: string): Promise<void> {
  await invoke('DELETE', { plugin_id: pluginId })
}
