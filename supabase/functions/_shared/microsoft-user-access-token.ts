import { createClient } from "npm:@supabase/supabase-js@2.49.8"

import { decryptCredential } from "./integration-auth.ts"

export async function loadUserMicrosoftRefreshToken(
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
    .eq("provider", "microsoft")
    .maybeSingle()

  if (!data?.iv || !data?.ciphertext) return undefined
  try {
    return await decryptCredential(data.iv, data.ciphertext, secret)
  } catch (err) {
    console.error("[microsoft-user-access-token] 복호화 실패", err)
    return undefined
  }
}

export async function refreshMicrosoftAccessToken(refreshToken: string): Promise<string> {
  const clientId = Deno.env.get("MICROSOFT_OAUTH_CLIENT_ID")
  const clientSecret = Deno.env.get("MICROSOFT_OAUTH_CLIENT_SECRET")
  const tenant = Deno.env.get("MICROSOFT_OAUTH_TENANT") ?? "common"
  if (!clientId || !clientSecret) {
    throw new Error("MICROSOFT_OAUTH_CLIENT_ID / SECRET 미설정")
  }

  const tokenUrl =
    `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    scope:
      "offline_access openid profile User.Read Mail.Read Mail.Send Calendars.ReadWrite Files.Read.All",
  })

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Microsoft 토큰 갱신 실패 (${res.status}): ${t}`)
  }
  const j = (await res.json()) as { access_token?: string }
  if (!j.access_token) throw new Error("access_token 없음")
  return j.access_token
}

export async function getMicrosoftAccessTokenForUser(userId: string): Promise<string | null> {
  const rt = await loadUserMicrosoftRefreshToken(userId)
  if (!rt) return null
  try {
    return await refreshMicrosoftAccessToken(rt)
  } catch (e) {
    console.error("[microsoft-user-access-token]", e)
    return null
  }
}
