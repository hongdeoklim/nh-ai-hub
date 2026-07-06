import { supabase } from '../lib/supabase'

export type ExtensionType = 'plugin' | 'mcp' | 'skill' | 'public_data'

export interface MarketplaceExtension {
  id: string
  plugin_id: string
  name: string
  description: string
  provider: string
  category: string
  extension_type: ExtensionType
  required_scopes: string[]
  config_schema: Record<string, unknown>
  manifest: Record<string, unknown>
  version: string
  installation: {
    id: string
    enabled: boolean
    installed_at: string
    config: Record<string, unknown>
  } | null
}

export async function fetchMarketplaceExtensions(): Promise<MarketplaceExtension[]> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: extensions, error } = await supabase
    .from('plugins')
    .select('id, plugin_id, name, description, provider, category, extension_type, required_scopes, config_schema, manifest, version')
    .eq('approval_status', 'approved')
    .eq('enabled', true)
    .order('extension_type')
    .order('name')
  if (error) throw new Error(error.message)

  const ids = (extensions ?? []).map((row) => row.id)
  const { data: installations, error: installationError } = ids.length
    ? await supabase
      .from('extension_installations')
      .select('id, extension_id, enabled, installed_at, config')
      .eq('scope_type', 'user')
      .eq('scope_id', user.id)
      .in('extension_id', ids)
    : { data: [], error: null }
  if (installationError) throw new Error(installationError.message)

  const byExtension = new Map((installations ?? []).map((row) => [row.extension_id, row]))
  return (extensions ?? []).map((row) => ({
    ...row,
    required_scopes: Array.isArray(row.required_scopes) ? row.required_scopes : [],
    config_schema: row.config_schema && typeof row.config_schema === 'object' ? row.config_schema : {},
    manifest: row.manifest && typeof row.manifest === 'object' ? row.manifest : {},
    installation: byExtension.get(row.id) ?? null,
  })) as MarketplaceExtension[]
}

export async function installExtension(
  extensionId: string,
  config: Record<string, unknown> = {},
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')
  const { error } = await supabase.from('extension_installations').upsert({
    extension_id: extensionId,
    scope_type: 'user',
    scope_id: user.id,
    installed_by: user.id,
    enabled: true,
    config,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'extension_id,scope_type,scope_id' })
  if (error) throw new Error(error.message)
}

export async function updateInstallationConfig(
  installationId: string,
  config: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase
    .from('extension_installations')
    .update({ config, updated_at: new Date().toISOString() })
    .eq('id', installationId)
  if (error) throw new Error(error.message)
}

export async function setExtensionEnabled(
  installationId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase
    .from('extension_installations')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', installationId)
  if (error) throw new Error(error.message)
}

export async function uninstallExtension(installationId: string): Promise<void> {
  const { error } = await supabase.from('extension_installations').delete().eq('id', installationId)
  if (error) throw new Error(error.message)
}
