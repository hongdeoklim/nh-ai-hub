/**
 * Google Agent — 액세스 토큰 조회·갱신
 *
 * 환경 변수 (Supabase Edge Secrets):
 *   GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET
 *     — 미설정 시 GDRIVE_CLIENT_ID / GDRIVE_CLIENT_SECRET 폴백
 *   INTEGRATION_CREDENTIALS_SECRET — user_integration_credentials 복호화
 *   SUPABASE_SERVICE_ROLE_KEY — user_oauth_tokens upsert
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

import {
  loadUserGoogleRefreshToken,
  refreshGoogleAccessToken,
} from "./google-user-access-token.ts"

const PROVIDER = "google"
const EXPIRY_BUFFER_MS = 120_000

type OAuthTokenRow = {
  id: string
  provider: string
  access_token: string
  refresh_token: string
  expires_at: string
}

export type GoogleAgentTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; error: string }

async function loadCachedTokenRow(
  admin: SupabaseClient,
  userId: string,
): Promise<OAuthTokenRow | null> {
  const { data, error } = await admin
    .from("user_oauth_tokens")
    .select("id, provider, access_token, refresh_token, expires_at")
    .eq("id", userId)
    .eq("provider", PROVIDER)
    .maybeSingle()

  if (error) {
    console.error("[google-agent-token] cache read failed", error)
    return null
  }
  return (data as OAuthTokenRow | null) ?? null
}

async function resolveRefreshToken(
  admin: SupabaseClient,
  userId: string,
  cached: OAuthTokenRow | null,
): Promise<string | null> {
  const fromCache = cached?.refresh_token?.trim()
  if (fromCache) return fromCache
  const fromIntegration = await loadUserGoogleRefreshToken(userId)
  return fromIntegration?.trim() ?? null
}

async function upsertTokenCache(
  admin: SupabaseClient,
  userId: string,
  accessToken: string,
  refreshToken: string,
  expiresInSec: number,
): Promise<void> {
  const expiresAt = new Date(Date.now() + Math.max(60, expiresInSec) * 1000)
  const { error } = await admin.from("user_oauth_tokens").upsert(
    {
      id: userId,
      provider: PROVIDER,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expiresAt.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id,provider" },
  )
  if (error) {
    console.error("[google-agent-token] cache upsert failed", error)
  }
}

async function refreshAndPersist(
  admin: SupabaseClient,
  userId: string,
  refreshToken: string,
): Promise<GoogleAgentTokenResult> {
  const clientId =
    Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? Deno.env.get("GDRIVE_CLIENT_ID")
  const clientSecret =
    Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ??
    Deno.env.get("GDRIVE_CLIENT_SECRET")
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      error: "Google OAuth 클라이언트 ID/시크릿이 설정되지 않았습니다.",
    }
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })

  const text = await res.text()
  let parsed: { access_token?: string; expires_in?: number; error?: string } = {}
  try {
    parsed = text.length ? JSON.parse(text) : {}
  } catch {
    /* raw */
  }

  if (!res.ok || !parsed.access_token) {
    return {
      ok: false,
      error: `Google 토큰 갱신 실패 (${res.status}): ${parsed.error ?? text}`,
    }
  }

  const expiresIn = Number(parsed.expires_in ?? 3600)
  await upsertTokenCache(
    admin,
    userId,
    parsed.access_token,
    refreshToken,
    expiresIn,
  )

  return { ok: true, accessToken: parsed.access_token }
}

/**
 * 유효한 Google access_token 반환.
 * user_oauth_tokens 캐시 → 만료 시 refresh_token으로 갱신 후 DB upsert.
 */
export async function getValidGoogleAgentAccessToken(
  admin: SupabaseClient,
  userId: string,
): Promise<GoogleAgentTokenResult> {
  const cached = await loadCachedTokenRow(admin, userId)
  const now = Date.now()

  if (cached?.access_token?.trim() && cached.expires_at) {
    const expiresMs = new Date(cached.expires_at).getTime()
    if (expiresMs - now > EXPIRY_BUFFER_MS) {
      return { ok: true, accessToken: cached.access_token.trim() }
    }
  }

  const refreshToken = await resolveRefreshToken(admin, userId, cached)
  if (!refreshToken) {
    return {
      ok: false,
      error:
        "Google 계정이 연동되어 있지 않습니다. 설정 → 연동에서 Google Workspace를 연결하세요.",
    }
  }

  try {
    return await refreshAndPersist(admin, userId, refreshToken)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      const accessToken = await refreshGoogleAccessToken(refreshToken)
      await upsertTokenCache(admin, userId, accessToken, refreshToken, 3600)
      return { ok: true, accessToken }
    } catch {
      return { ok: false, error: msg }
    }
  }
}
