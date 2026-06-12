import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import { tool, zodSchema } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

import { resolveBuiltinPluginTool } from "./builtin-plugin-tools.ts"
import {
  createSearchWebNewsTool,
  WEB_SEARCH_TOOL_NAME,
} from "./web-search-tool.ts"

export type ActivePluginRow = {
  id: string
  name: string
  description: string | null
  endpoint_url: string | null
  tool_function_name: string
}

async function logHealth(
  admin: SupabaseClient,
  row: {
    plugin_id: string | null
    ok: boolean
    status_code: number | null
    latency_ms: number
    detail: string
  },
): Promise<void> {
  try {
    await admin.from("api_health_logs").insert({
      plugin_id: row.plugin_id,
      ok: row.ok,
      status_code: row.status_code,
      latency_ms: row.latency_ms,
      detail: row.detail.slice(0, 4000),
    })
  } catch (e) {
    console.error("[dynamic-plugin-tools] api_health_logs insert 실패", e)
  }
}

function createHttpProxyTool(
  row: ActivePluginRow,
  endpointUrl: string,
  admin: SupabaseClient,
  userId: string,
): ReturnType<typeof tool> {
  const desc =
    (row.description?.trim()?.length ? row.description.trim() : row.name) +
    ` (외부 플러그인 · POST ${endpointUrl})`

  return tool({
    description: desc,
    inputSchema: zodSchema(
      z.object({
        arguments: z
          .record(z.string(), z.any())
          .optional()
          .default({})
          .describe(
            "플러그인 API 로 전달할 JSON 인자 객체(키·값). 비어 있어도 됨.",
          ),
      }),
    ),
    execute: async (payload: { arguments?: Record<string, unknown> }) => {
      const args = payload.arguments ?? {}
      const started = Date.now()
      const abortController = new AbortController()
      const timer = setTimeout(() => abortController.abort(), 25_000)
      try {
        const res = await fetch(endpointUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-NH-AI-Plugin": row.id,
            "X-NH-AI-User": userId,
          },
          body: JSON.stringify({
            plugin_id: row.id,
            plugin_name: row.name,
            tool_function_name: row.tool_function_name,
            arguments: args,
            user_id: userId,
          }),
          signal: abortController.signal,
        })
        const latency = Date.now() - started
        const text = await res.text()
        await logHealth(admin, {
          plugin_id: row.id,
          ok: res.ok,
          status_code: res.status,
          latency_ms: latency,
          detail: text.slice(0, 2000),
        })
        let parsed: unknown = text
        try {
          parsed = text.length ? JSON.parse(text) : {}
        } catch {
          /* 원문 문자열 유지 */
        }
        return {
          ok: res.ok,
          status: res.status,
          latency_ms: latency,
          body: parsed,
        }
      } catch (e) {
        const latency = Date.now() - started
        const msg = e instanceof Error ? e.message : String(e)
        await logHealth(admin, {
          plugin_id: row.id,
          ok: false,
          status_code: null,
          latency_ms: latency,
          detail: msg.slice(0, 2000),
        })
        return { ok: false, error: msg }
      } finally {
        clearTimeout(timer)
      }
    },
  })
}

/**
 * DB plugins 테이블에서 `is_active = true` 인 행만 로드합니다.
 * `tool_function_name` 과 일치하는 내장 도구 또는 endpoint_url 프록시만 tools 맵에 포함합니다.
 * 비활성(OFF) 플러그인은 조회 자체에서 제외되어 AI 에 노출되지 않습니다.
 */
export async function createDynamicPluginTools(deps: {
  admin: SupabaseClient
  userId: string
}): Promise<Record<string, ReturnType<typeof tool>>> {
  const { admin, userId } = deps

  const { data, error } = await admin
    .from("plugins")
    .select(
      "id, name, description, endpoint_url, tool_function_name",
    )
    .eq("is_active", true)

  if (error) {
    console.error("[dynamic-plugin-tools] plugins 조회 실패", error)
    return {}
  }

  const rows = (data ?? []) as ActivePluginRow[]
  const out: Record<string, ReturnType<typeof tool>> = {}
  const exaApiKey = Deno.env.get("EXA_API_KEY")?.trim() || undefined

  for (const row of rows) {
    const fnName = typeof row.tool_function_name === "string"
      ? row.tool_function_name.trim()
      : ""
    if (!fnName.length) {
      console.warn(
        "[dynamic-plugin-tools] tool_function_name 없음 — 건너뜀",
        row.id,
      )
      continue
    }

    if (out[fnName]) {
      console.warn(
        "[dynamic-plugin-tools] 중복 tool_function_name — 건너뜀",
        fnName,
      )
      continue
    }

    const builtin = resolveBuiltinPluginTool(fnName, exaApiKey)
    if (builtin) {
      out[fnName] = builtin
      continue
    }

    const endpoint = String(row.endpoint_url ?? "").trim()
    if (endpoint.length > 0) {
      out[fnName] = createHttpProxyTool(row, endpoint, admin, userId)
    }
  }

  return out
}
