import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.107.0"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const ACTION_FUNCTIONS: Record<string, string> = {
  gmail_unread_summary: "assistant-01-gmail",
  calendar_upcoming_summary: "assistant-02-calendar",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405)

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const authorization = req.headers.get("Authorization")
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization) {
    return json({ error: "Workflow executor is not configured" }, 500)
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: "Unauthorized" }, 401)

  let payload: { workflow_id?: string; input?: Record<string, unknown> }
  try {
    payload = await req.json()
  } catch {
    return json({ error: "Invalid JSON body" }, 400)
  }
  if (!payload.workflow_id) return json({ error: "workflow_id is required" }, 400)

  const { data: workflow, error: workflowError } = await userClient
    .from("user_workflows")
    .select("id, action_key, action_config, is_active")
    .eq("id", payload.workflow_id)
    .eq("user_id", authData.user.id)
    .single()

  if (workflowError || !workflow) return json({ error: "Workflow not found" }, 404)
  if (!workflow.is_active) return json({ error: "Workflow is inactive" }, 409)

  const actionKey = typeof workflow.action_key === "string" ? workflow.action_key : ""
  const functionName = ACTION_FUNCTIONS[actionKey]
  if (!functionName) return json({ error: "Workflow action is not executable" }, 422)

  const input = {
    ...((workflow.action_config as Record<string, unknown> | null) ?? {}),
    ...(payload.input ?? {}),
  }
  const { data: run, error: runError } = await admin
    .from("workflow_runs")
    .insert({
      workflow_id: workflow.id,
      user_id: authData.user.id,
      action_key: actionKey,
      status: "running",
      input,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single()

  if (runError || !run) return json({ error: "Could not create workflow run" }, 500)

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...input, user_id: authData.user.id }),
    })
    const result = await response.json().catch(() => ({ success: false, error: "Invalid action response" }))
    const succeeded = response.ok && result?.success !== false

    await admin.from("workflow_runs").update({
      status: succeeded ? "succeeded" : "failed",
      output: succeeded ? result : null,
      error_message: succeeded ? null : String(result?.error ?? `Action failed (${response.status})`),
      finished_at: new Date().toISOString(),
    }).eq("id", run.id)

    return json({ run_id: run.id, status: succeeded ? "succeeded" : "failed", result }, succeeded ? 200 : 502)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await admin.from("workflow_runs").update({
      status: "failed",
      error_message: message,
      finished_at: new Date().toISOString(),
    }).eq("id", run.id)
    return json({ run_id: run.id, status: "failed", error: message }, 502)
  }
})
