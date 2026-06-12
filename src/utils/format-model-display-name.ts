import { normalizePreferredAiToResolvedModel } from '../lib/normalize-preferred-ai-model'

export function formatModelDisplayName(preferredOrModelId: string): string {
  const raw = preferredOrModelId.trim()
  if (!raw || raw.toLowerCase() === 'auto') return '자동'

  const { modelId } = normalizePreferredAiToResolvedModel(raw)
  const id = modelId.toLowerCase()

  if (id.includes('gemini-3.1-pro')) return '3.1 Pro'
  if (id.includes('gemini-3-flash')) return '3 Flash'
  if (id.includes('gemini-3.1-flash-lite')) return '3.1 Flash Lite'
  if (id.includes('gemini-2.5-pro')) return '2.5 Pro'
  if (id.includes('gemini-2.5-flash-lite')) return '2.5 Flash Lite'
  if (id.includes('gemini-2.5-flash')) return '2.5 Flash'
  if (id.includes('claude-opus-4-7')) return 'Claude Opus 4.7'
  if (id.includes('claude-sonnet-4-6')) return 'Claude Sonnet 4.6'
  if (id.includes('gpt-5.5')) return 'GPT-5.5'

  return modelId
    .replace(/^gemini-/i, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
