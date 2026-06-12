import "jsr:@supabase/functions-js/edge-runtime.d.ts"

import { createClient } from "npm:@supabase/supabase-js@2.49.8"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
}

const BUCKET = "user-uploads"
const MAX_BYTES = 50 * 1024 * 1024

function readEnv(name: string): string | undefined {
  const v = Deno.env.get(name)
  return v && v.length > 0 ? v : undefined
}

function extKind(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "")
  const map: Record<string, string> = {
    hwpx: "hwpx",
    hwp: "hwp",
    xlsx: "xlsx",
    xls: "xls",
    pptx: "pptx",
    ppt: "ppt",
    pdf: "pdf",
    csv: "csv",
  }
  return map[e] ?? "other"
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST 만 허용됩니다." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "인증이 필요합니다." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const supabaseUrl = readEnv("SUPABASE_URL")
  const anonKey = readEnv("SUPABASE_ANON_KEY")
  const serviceKey = readEnv("SUPABASE_SERVICE_ROLE_KEY")
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return new Response(JSON.stringify({ error: "서버 설정 오류" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const jwt = authHeader.replace(/^Bearer\s+/i, "")
  const supabaseUser = createClient(supabaseUrl, anonKey)
  const { data: userData, error: userErr } = await supabaseUser.auth.getUser(jwt)
  if (userErr || !userData.user) {
    return new Response(JSON.stringify({ error: "세션이 유효하지 않습니다." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const uid = userData.user.id
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return new Response(JSON.stringify({ error: "multipart/form-data 필요" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const file = form.get("file")
  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: '필드 "file" 에 파일이 필요합니다.' }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  if (file.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: "파일은 최대 50MB 까지입니다." }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const originalName = file.name.trim() || "upload.bin"
  const dot = originalName.lastIndexOf(".")
  const ext = dot >= 0 ? originalName.slice(dot) : ""
  const kind = extKind(ext)

  const objectPath = `${uid}/${crypto.randomUUID()}${ext || ".bin"}`
  const bytes = new Uint8Array(await file.arrayBuffer())

  const admin = createClient(supabaseUrl, serviceKey)
  let gcsUrl = ""
  try {
    const { uploadToGCS } = await import("../_shared/gcs.ts")
    gcsUrl = await uploadToGCS(objectPath, bytes, file.type || "application/octet-stream")
  } catch (upErr: any) {
    console.error("[user-document-upload] storage", upErr)
    return new Response(
      JSON.stringify({
        error: "구글 클라우드 스토리지 업로드 실패: " + upErr.message,
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    )
  }

  const noteRaw = form.get("category")
  const category = typeof noteRaw === "string" ? noteRaw.slice(0, 500) : "미분류"
  const targetDepartmentRaw = form.get("targetDepartment")
  const targetDepartment = typeof targetDepartmentRaw === "string" ? targetDepartmentRaw : "공통"

  const { data: row, error: insErr } = await admin
    .from("knowledge_base")
    .insert({
      uploader_id: uid,
      file_name: originalName,
      file_url: gcsUrl,
      category,
      target_department: targetDepartment,
      deleted_at: null,
    })
    .select("id, file_url")
    .single()


  if (insErr || !row) {
    console.error("[user-document-upload] db", insErr)
    try {
      const { deleteFromGCS } = await import("../_shared/gcs.ts")
      await deleteFromGCS(objectPath)
    } catch {}
    return new Response(JSON.stringify({ error: "메타데이터 저장 실패" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  return new Response(JSON.stringify({ ok: true, document: row }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
})
