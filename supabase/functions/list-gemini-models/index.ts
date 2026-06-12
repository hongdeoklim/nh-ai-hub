import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import { handleCorsPreflight, jsonResponse } from '../_shared/cors.ts'

function readGeminiKey(): string | undefined {
  return (
    Deno.env.get('GEMINI_API_KEY') ??
    Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY') ??
    undefined
  )
}

function normalizeModelId(name: string): string {
  return name.replace(/^models\//, '').trim()
}

async function requireAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return { error: jsonResponse({ ok: false, error: 'unauthorized' }, 401) }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    return {
      error: jsonResponse({ ok: false, error: 'server_misconfigured' }, 500),
    }
  }

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const {
    data: { user },
    error,
  } = await supabaseUser.auth.getUser()

  if (error || !user) {
    return { error: jsonResponse({ ok: false, error: 'unauthorized' }, 401) }
  }

  return { user }
}

Deno.serve(async (req) => {
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  if (req.method !== 'GET' && req.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'method_not_allowed' }, 405)
  }

  const authResult = await requireAuthenticatedUser(req)
  if ('error' in authResult && authResult.error) {
    return authResult.error
  }

  const apiKey = readGeminiKey()
  if (!apiKey) {
    return jsonResponse(
      { ok: false, error: 'missing_gemini_api_key', models: [] },
      503,
    )
  }

  try {
    const url = new URL('https://generativelanguage.googleapis.com/v1beta/models')
    url.searchParams.set('key', apiKey)
    url.searchParams.set('pageSize', '200')

    const models: string[] = []
    let nextPageToken: string | undefined

    do {
      if (nextPageToken) {
        url.searchParams.set('pageToken', nextPageToken)
      } else {
        url.searchParams.delete('pageToken')
      }

      const res = await fetch(url.toString())
      if (!res.ok) {
        const text = await res.text()
        return jsonResponse(
          {
            ok: false,
            error: `google_models_list_${res.status}`,
            detail: text.slice(0, 400),
            models: [],
          },
          502,
        )
      }

      const payload = (await res.json()) as {
        models?: { name?: string; supportedGenerationMethods?: string[] }[]
        nextPageToken?: string
      }

      for (const model of payload.models ?? []) {
        const id = normalizeModelId(model.name ?? '')
        if (!id) continue
        const methods = model.supportedGenerationMethods ?? []
        if (
          methods.length === 0 ||
          methods.includes('generateContent') ||
          methods.includes('generateImages') ||
          methods.includes('predict')
        ) {
          models.push(id)
        }
      }

      nextPageToken = payload.nextPageToken
    } while (nextPageToken && models.length < 500)

    return jsonResponse({ ok: true, models })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_error'
    return jsonResponse({ ok: false, error: message, models: [] }, 500)
  }
})
