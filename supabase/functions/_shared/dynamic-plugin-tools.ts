import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"
import { tool, zodSchema, type Tool } from "npm:ai@6.0.184"
import { z } from "npm:zod@4.4.3"

import { resolveBuiltinPluginTool } from "./builtin-plugin-tools.ts"
import {
  createSearchWebNewsTool,
  WEB_SEARCH_TOOL_NAME,
} from "./web-search-tool.ts"
import { decryptPluginCredential, pluginAuthHeaders } from "./plugin-credentials.ts"

export type ActivePluginRow = {
  id: string
  name: string
  description: string | null
  endpoint_url: string | null
  tool_function_name: string
  auth_type: "none" | "bearer" | "api_key"
  auth_header_name: string
  connection_mode: string
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

async function logToolExecution(
  admin: SupabaseClient,
  row: {
    userId: string
    department?: string | null
    pluginId: string
    toolName: string
    status: "succeeded" | "failed"
    latencyMs: number
    errorCode?: string
  },
): Promise<void> {
  const { error } = await admin.from("tool_execution_logs").insert({
    user_id: row.userId,
    department: row.department ?? null,
    extension_id: row.pluginId,
    tool_name: row.toolName,
    status: row.status,
    latency_ms: row.latencyMs,
    error_code: row.errorCode ?? null,
  })
  if (error && error.code !== "42P01") {
    console.error("[dynamic-plugin-tools] tool execution log failed", error.message)
  }
}

function createHttpProxyTool(
  row: ActivePluginRow,
  endpointUrl: string,
  admin: SupabaseClient,
  userId: string,
  department: string | null | undefined,
  credential?: string,
): Tool<any, any> {
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
            ...pluginAuthHeaders(row, credential),
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
        await logToolExecution(admin, {
          userId,
          department,
          pluginId: row.id,
          toolName: row.tool_function_name,
          status: res.ok ? "succeeded" : "failed",
          latencyMs: latency,
          errorCode: res.ok ? undefined : `http_${res.status}`,
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
        await logToolExecution(admin, {
          userId,
          department,
          pluginId: row.id,
          toolName: row.tool_function_name,
          status: "failed",
          latencyMs: latency,
          errorCode: e instanceof Error && e.name === "AbortError" ? "timeout" : "request_failed",
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
  department?: string | null
}): Promise<Record<string, Tool<any, any>>> {
  const { admin, userId, department } = deps

  const { data, error } = await admin
    .from("plugins")
    .select(
      "id, name, description, endpoint_url, tool_function_name, auth_type, auth_header_name, connection_mode",
    )
    .eq("is_active", true)
    .eq("approval_status", "approved")

  if (error) {
    console.error("[dynamic-plugin-tools] plugins 조회 실패", error)
    return {}
  }

  let rows = (data ?? []) as ActivePluginRow[]
  const pluginIds = rows.map((row) => row.id)
  if (pluginIds.length > 0) {
    const [{ data: installations, error: installationError }, { data: permissions, error: permissionError }] =
      await Promise.all([
        admin
          .from("extension_installations")
          .select("extension_id, scope_type, scope_id, enabled")
          .in("extension_id", pluginIds),
        admin
          .from("extension_permissions")
          .select("extension_id, subject_type, subject_id, can_use")
          .in("extension_id", pluginIds),
      ])

    if (!installationError && !permissionError) {
      rows = rows.filter((row) => {
        const pluginInstallations = (installations ?? []).filter((item) => item.extension_id === row.id)
        const installed = pluginInstallations.length === 0 || pluginInstallations.some((item) =>
          item.enabled === true && (
            item.scope_type === "workspace" ||
            (item.scope_type === "user" && item.scope_id === userId) ||
            (item.scope_type === "department" && department && item.scope_id === department)
          )
        )
        if (!installed) return false

        const matchingPermissions = (permissions ?? []).filter((item) =>
          item.extension_id === row.id && (
            (item.subject_type === "user" && item.subject_id === userId) ||
            (item.subject_type === "department" && department && item.subject_id === department)
          )
        )
        return !matchingPermissions.some((item) => item.can_use === false)
      })
    }
  }
  const out: Record<string, Tool<any, any>> = {}
  const exaApiKey = Deno.env.get("EXA_API_KEY")?.trim() || undefined
  const authPluginIds = rows.filter((row) => row.auth_type !== "none").map((row) => row.id)
  const { data: connections, error: connectionError } = authPluginIds.length
    ? await admin
      .from("plugin_connections")
      .select("plugin_id, credential_ciphertext, status")
      .eq("user_id", userId)
      .eq("status", "connected")
      .in("plugin_id", authPluginIds)
    : { data: [], error: null }
  if (connectionError) {
    console.error("[dynamic-plugin-tools] 사용자 플러그인 연결 조회 실패", connectionError)
  }
  const connectionByPlugin = new Map(
    (connections ?? []).map((connection) => [connection.plugin_id, connection]),
  )

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
      let credential: string | undefined
      if (row.auth_type !== "none") {
        const connection = connectionByPlugin.get(row.id)
        if (!connection) continue
        try {
          credential = await decryptPluginCredential(connection.credential_ciphertext)
        } catch (error) {
          console.error("[dynamic-plugin-tools] 플러그인 credential 복호화 실패", row.id, error)
          continue
        }
      }
      out[fnName] = createHttpProxyTool(row, endpoint, admin, userId, department, credential)
    }
  }

  return out
}
