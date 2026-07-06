import { tool, zodSchema, type Tool } from 'npm:ai@6.0.184'
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

export async function listMcpTools(input: { endpoint: string; authType: string; headerName: string; credential?: string }): Promise<McpToolInfo[]> {
  const result = await mcpRpc(input.endpoint, 'tools/list', {}, input.authType, input.headerName, input.credential)
  const tools = (result as { tools?: unknown[] } | null)?.tools
  if (!Array.isArray(tools)) return []
  return tools.filter((item): item is McpToolInfo => Boolean(item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string'))
}

export async function testMcpConnection(input: { endpoint: string; authType: string; headerName: string; credential?: string }): Promise<{ toolCount: number }> {
  return { toolCount: (await listMcpTools(input)).length }
}

export async function createMcpAiTools(input: { prefix: string; endpoint: string; authType: string; headerName: string; credential?: string }): Promise<Record<string, Tool<any, any>>> {
  const definitions = await listMcpTools(input)
  const tools: Record<string, Tool<any, any>> = {}
  for (const definition of definitions) {
    const safeRemoteName = definition.name.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 48)
    const name = `${input.prefix}__${safeRemoteName}`.slice(0, 64)
    tools[name] = tool({
      description: definition.description?.trim() || `MCP tool ${definition.name}`,
      inputSchema: zodSchema(z.record(z.string(), z.unknown()).default({})),
      execute: async (argumentsValue: Record<string, unknown>) => mcpRpc(input.endpoint, 'tools/call', { name: definition.name, arguments: argumentsValue }, input.authType, input.headerName, input.credential),
    })
  }
  return tools
}
