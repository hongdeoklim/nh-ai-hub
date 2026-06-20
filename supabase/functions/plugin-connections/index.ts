import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.107.0"
import {
  credentialHint,
  decryptPluginCredential,
  encryptPluginCredential,
  pluginAuthHeaders,
} from "../_shared/plugin-credentials.ts"

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, PUT, POST, DELETE, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
  const url = Deno.env.get("SUPABASE_URL")
  const anon = Deno.env.get("SUPABASE_ANON_KEY")
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const authorization = req.headers.get("Authorization")
  if (!url || !anon || !service) return json({ error: "Not configured" }, 500)
  if (!authorization) return json({ error: "Unauthorized" }, 401)

  const userClient = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } })
  const admin = createClient(url, service, { auth: { persistSession: false } })
  const { data: auth, error: authError } = await userClient.auth.getUser()
  if (authError || !auth.user) return json({ error: "Unauthorized" }, 401)

  if (req.method === "GET") {
    const [{ data: plugins, error: pluginError }, { data: connections, error: connectionError }] = await Promise.all([
      admin.from("plugins").select("id,name,description,endpoint_url,tool_function_name,auth_type,auth_header_name,connection_mode,setup_url,docs_url,is_active").eq("is_active", true).order("name"),
      admin.from("plugin_connections").select("plugin_id,credential_hint,status,last_tested_at,last_error,updated_at").eq("user_id", auth.user.id),
    ])
    if (pluginError || connectionError) return json({ error: pluginError?.message ?? connectionError?.message }, 500)
    const byPlugin = new Map((connections ?? []).map((row) => [row.plugin_id, row]))
    return json({ plugins: (plugins ?? []).map((plugin) => ({ ...plugin, connection: byPlugin.get(plugin.id) ?? null })) })
  }

  let body: { plugin_id?: string; credential?: string }
  try { body = await req.json() } catch { return json({ error: "Invalid JSON" }, 400) }
  if (!body.plugin_id) return json({ error: "plugin_id is required" }, 400)

  const { data: plugin } = await admin.from("plugins").select("*").eq("id", body.plugin_id).eq("is_active", true).single()
  if (!plugin) return json({ error: "Plugin not found" }, 404)

  if (req.method === "PUT") {
    const credential = body.credential?.trim() ?? ""
    if (plugin.auth_type !== "none" && credential.length < 4) return json({ error: "Credential is required" }, 400)
    const ciphertext = plugin.auth_type === "none" ? "none" : await encryptPluginCredential(credential)
    const { error } = await admin.from("plugin_connections").upsert({
      plugin_id: plugin.id, user_id: auth.user.id, credential_ciphertext: ciphertext,
      credential_hint: plugin.auth_type === "none" ? null : credentialHint(credential),
      status: "untested", last_error: null, updated_at: new Date().toISOString(),
    }, { onConflict: "plugin_id,user_id" })
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  if (req.method === "DELETE") {
    const { error } = await admin.from("plugin_connections").delete().eq("plugin_id", plugin.id).eq("user_id", auth.user.id)
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  if (req.method === "POST") {
    const { data: connection } = await admin.from("plugin_connections").select("credential_ciphertext").eq("plugin_id", plugin.id).eq("user_id", auth.user.id).maybeSingle()
    if (plugin.auth_type !== "none" && !connection) return json({ error: "Connect the plugin first" }, 409)
    let credential: string | undefined
    if (plugin.auth_type !== "none") {
      if (!connection) return json({ error: "Connect the plugin first" }, 409)
      credential = await decryptPluginCredential(connection.credential_ciphertext)
    }
    const started = Date.now()
    let ok = false
    let errorMessage: string | null = null
    let statusCode: number | null = null
    try {
      if (!plugin.endpoint_url) throw new Error("Plugin endpoint is missing")
      const response = await fetch(plugin.endpoint_url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...pluginAuthHeaders(plugin, credential) },
        body: JSON.stringify({ health_check: true, plugin_id: plugin.id, user_id: auth.user.id }),
        signal: AbortSignal.timeout(15_000),
      })
      statusCode = response.status
      ok = response.ok
      if (!ok) errorMessage = (await response.text()).slice(0, 500) || `HTTP ${response.status}`
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error)
    }
    await admin.from("plugin_connections").update({ status: ok ? "connected" : "failed", last_tested_at: new Date().toISOString(), last_error: errorMessage, updated_at: new Date().toISOString() }).eq("plugin_id", plugin.id).eq("user_id", auth.user.id)
    await admin.from("api_health_logs").insert({ plugin_id: plugin.id, ok, status_code: statusCode, latency_ms: Date.now() - started, detail: errorMessage ?? "User connection test passed" })
    return json({ ok, status_code: statusCode, error: errorMessage }, ok ? 200 : 502)
  }

  return json({ error: "Method not allowed" }, 405)
})
