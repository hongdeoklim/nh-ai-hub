/**
 * 로그인 사용자의 Google 연동 리프레시 토큰 → 액세스 토큰
 */
import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { decryptCredential } from "./integration-auth.ts"

export async function loadUserGoogleRefreshToken(
  userId: string,
): Promise<string | undefined> {
  const secret = Deno.env.get("INTEGRATION_CREDENTIALS_SECRET")
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  const url = Deno.env.get("SUPABASE_URL")
  if (!secret || !svcKey || !url) return undefined

  const admin = createClient(url, svcKey)
  const { data } = await admin
    .from("user_integration_credentials")
    .select("iv, ciphertext")
    .eq("user_id", userId)
    .eq("provider", "google")
    .maybeSingle()

  if (!data?.iv || !data?.ciphertext) return undefined
  try {
    return await decryptCredential(data.iv, data.ciphertext, secret)
  } catch (err) {
    console.error("[google-user-access-token] 복호화 실패", err)
    return undefined
  }
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const clientId =
    Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? Deno.env.get("GDRIVE_CLIENT_ID")
  const clientSecret =
    Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? Deno.env.get("GDRIVE_CLIENT_SECRET")
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth 클라이언트 ID/시크릿이 필요합니다.")
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
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Google 액세스 토큰 갱신 실패 (${res.status}): ${t}`)
  }
  const j = (await res.json()) as { access_token?: string }
  if (!j.access_token) throw new Error("access_token 없음")
  return j.access_token
}

export async function getGoogleAccessTokenForUser(userId: string): Promise<string | null> {
  const rt = await loadUserGoogleRefreshToken(userId)
  if (!rt) return null
  try {
    return await refreshGoogleAccessToken(rt)
  } catch (e) {
    console.error("[google-user-access-token]", e)
    return null
  }
}
