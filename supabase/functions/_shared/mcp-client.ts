import { jsonSchema, tool, zodSchema, type Tool } from 'npm:ai@6.0.184'
import { z } from 'npm:zod@4.4.3'

type McpToolInfo = { name: string; description?: string; inputSchema?: Record<string, unknown> }

function authHeaders(authType: string, headerName: string, credential?: string) {
  if (!credential || authType === 'none') return {}
  if (authType === 'bearer') return { Authorization: `Bearer ${credential}` }
  return { [headerName || 'X-API-Key']: credential }
}

async function mcpRpc(endpoint: string, method: string, params: Record<string, unknown>, authType: string, headerName: string, credential?: string): Promise<unknown> {
  if (!endpoint.startsWith('https://')) throw new Error('MCP endpoint는 HTTPS여야 합니다.')
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...authHeaders(authType, headerName, credential) },
    body: JSON.stringify({ jsonrpc: '2.0', id: crypto.randomUUID(), method, params }),
    signal: AbortSignal.timeout(20_000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`MCP ${method} 실패 (${response.status})`)
  const jsonText = text.includes('data:') ? text.split(/\r?\n/).find((line) => line.startsWith('data:'))?.slice(5).trim() ?? '' : text
  const payload = JSON.parse(jsonText) as { result?: unknown; error?: { message?: string } }
  if (payload.error) throw new Error(payload.error.message || `MCP ${method} 오류`)
  return payload.result
}

/**
 * `tools/list` 결과 캐시 (Deno 인스턴스 warm-reuse 기준 메모리 캐시).
 * 이 캐시가 없으면 채팅 메시지 하나마다 활성 MCP 서버 전부에 실시간 HTTP 왕복이
 * 발생해, 느리거나 다운된 MCP 서버가 있으면 모든 사용자의 모든 응답이 지연된다.
 */
const TOOLS_LIST_TTL_MS = 5 * 60_000
const toolsListCache = new Map<string, { expiresAt: number; tools: McpToolInfo[] }>()

function cacheKey(endpoint: string, authType: string, credential?: string): string {
  return `${endpoint}::${authType}::${credential ?? ''}`
}

export async function listMcpTools(input: { endpoint: string; authType: string; headerName: string; credential?: string }): Promise<McpToolInfo[]> {
  const key = cacheKey(input.endpoint, input.authType, input.credential)
  const cached = toolsListCache.get(key)
  if (cached && cached.expiresAt > Date.now()) return cached.tools

  const result = await mcpRpc(input.endpoint, 'tools/list', {}, input.authType, input.headerName, input.credential)
  const rawTools = (result as { tools?: unknown[] } | null)?.tools
  const tools = Array.isArray(rawTools)
    ? rawTools.filter((item): item is McpToolInfo => Boolean(item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'))
    : []
  toolsListCache.set(key, { expiresAt: Date.now() + TOOLS_LIST_TTL_MS, tools })
  return tools
}

export async function testMcpConnection(input: { endpoint: string; authType: string; headerName: string; credential?: string }): Promise<{ toolCount: number }> {
  // 연결 테스트는 최신 상태를 반영해야 하므로 캐시를 우회한다.
  toolsListCache.delete(cacheKey(input.endpoint, input.authType, input.credential))
  return { toolCount: (await listMcpTools(input)).length }
}

const FALLBACK_INPUT_SCHEMA = zodSchema(z.record(z.string(), z.unknown()).default({}))

export async function createMcpAiTools(input: { prefix: string; endpoint: string; authType: string; headerName: string; credential?: string }): Promise<Record<string, Tool<any, any>>> {
  const definitions = await listMcpTools(input)
  const tools: Record<string, Tool<any, any>> = {}
  for (const definition of definitions) {
    const safeRemoteName = definition.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
    const name = `${input.prefix}__${safeRemoteName}`.slice(0, 64)
    // MCP 서버가 준 실제 JSON Schema를 그대로 전달 — 없으면 범용 객체로 폴백.
    const schema = definition.inputSchema && typeof definition.inputSchema === 'object'
      ? jsonSchema(definition.inputSchema as Record<string, unknown>)
      : FALLBACK_INPUT_SCHEMA
    tools[name] = tool({
      description: definition.description?.trim() || `MCP tool ${definition.name}`,
      inputSchema: schema,
      execute: async (argumentsValue: Record<string, unknown>) => mcpRpc(input.endpoint, 'tools/call', { name: definition.name, arguments: argumentsValue }, input.authType, input.headerName, input.credential),
    })
  }
  return tools
}
