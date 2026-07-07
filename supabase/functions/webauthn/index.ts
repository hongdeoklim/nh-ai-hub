import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "npm:@simplewebauthn/server@13.3.0"
import { isoBase64URL } from "npm:@simplewebauthn/server@13.3.0/helpers"

/**
 * WebAuthn(패스키) 로그인 엣지함수 — 지문/FaceID/Windows Hello.
 *
 * action:
 *   register-begin  (인증 필요): 등록 옵션 발급
 *   register-finish (인증 필요): 등록 응답 검증 → user_passkeys 저장
 *   auth-begin      : usernameless 인증 옵션 발급
 *   auth-finish     : 인증 응답 검증 → Supabase 세션 발급(access/refresh 반환)
 *
 * verify_jwt=false (config.toml). register-* 는 내부에서 Authorization 사용자 JWT 를 검증한다.
 */

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  })
}

const RP_NAME = "NH-AX-HUB"
const ALLOWED_ORIGINS = [
  "https://nhax.nhnetworks.co.kr",
  "https://nh-ai-hub-90829.web.app",
  "https://nh-ai-hub-90829.firebaseapp.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:4188",
  "http://localhost:4189",
]

const url = Deno.env.get("SUPABASE_URL") ?? ""
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? ""
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""

function admin() {
  return createClient(url, serviceKey, { auth: { persistSession: false } })
}

async function getUserFromBearer(req: Request): Promise<{ id: string; email: string } | null> {
  const bearer = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!bearer) return null
  const { data } = await createClient(url, anonKey).auth.getUser(bearer)
  if (!data.user) return null
  return { id: data.user.id, email: data.user.email ?? "" }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors })
  if (req.method !== "POST") return json({ error: "POST required" }, 405)

  const origin = req.headers.get("Origin") ?? ""
  if (!ALLOWED_ORIGINS.includes(origin)) {
    return json({ error: `origin not allowed: ${origin}` }, 403)
  }
  const rpID = new URL(origin).hostname

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: "invalid json" }, 400)
  }
  const action = String(body.action ?? "")
  const db = admin()

  // 만료된 challenge 정리 (best-effort)
  db.from("webauthn_challenges").delete().lt("expires_at", new Date().toISOString()).then(() => {})

  try {
    // ──────────────────────────────────────────── 등록
    if (action === "register-begin") {
      const user = await getUserFromBearer(req)
      if (!user) return json({ error: "unauthorized" }, 401)

      const { data: existing } = await db
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", user.id)

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID,
        userName: user.email || user.id,
        userID: new TextEncoder().encode(user.id),
        attestationType: "none",
        excludeCredentials: (existing ?? []).map((c) => ({
          id: c.credential_id as string,
          transports: (c.transports ?? []) as unknown as undefined,
        })),
        authenticatorSelection: {
          residentKey: "preferred",
          userVerification: "preferred",
        },
      })

      const { data: ch } = await db
        .from("webauthn_challenges")
        .insert({ user_id: user.id, challenge: options.challenge, purpose: "register" })
        .select("id")
        .single()

      return json({ options, challengeId: ch?.id })
    }

    if (action === "register-finish") {
      const user = await getUserFromBearer(req)
      if (!user) return json({ error: "unauthorized" }, 401)

      const challengeId = String(body.challengeId ?? "")
      const { data: ch } = await db
        .from("webauthn_challenges")
        .select("challenge, user_id, purpose, expires_at")
        .eq("id", challengeId)
        .maybeSingle()
      if (!ch || ch.purpose !== "register" || ch.user_id !== user.id) {
        return json({ error: "challenge 없음/불일치" }, 400)
      }
      if (new Date(ch.expires_at as string) < new Date()) {
        return json({ error: "challenge 만료" }, 400)
      }

      const verification = await verifyRegistrationResponse({
        response: body.response as never,
        expectedChallenge: ch.challenge as string,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: false,
      })
      await db.from("webauthn_challenges").delete().eq("id", challengeId)

      if (!verification.verified || !verification.registrationInfo) {
        return json({ error: "등록 검증 실패" }, 400)
      }
      const cred = verification.registrationInfo.credential
      const { error: insErr } = await db.from("user_passkeys").insert({
        user_id: user.id,
        credential_id: cred.id,
        public_key: isoBase64URL.fromBuffer(cred.publicKey),
        counter: cred.counter,
        transports: cred.transports ?? [],
        device_label: (body.device_label as string | undefined)?.slice(0, 80) ?? null,
      })
      if (insErr) return json({ error: insErr.message }, 500)
      return json({ verified: true })
    }

    // ──────────────────────────────────────────── 인증
    if (action === "auth-begin") {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: "preferred",
        allowCredentials: [], // usernameless — 기기의 discoverable 패스키 사용
      })
      const { data: ch } = await db
        .from("webauthn_challenges")
        .insert({ challenge: options.challenge, purpose: "authenticate" })
        .select("id")
        .single()
      return json({ options, challengeId: ch?.id })
    }

    if (action === "auth-finish") {
      const challengeId = String(body.challengeId ?? "")
      const response = body.response as { id?: string }
      const credentialId = String(response?.id ?? "")

      const { data: ch } = await db
        .from("webauthn_challenges")
        .select("challenge, purpose, expires_at")
        .eq("id", challengeId)
        .maybeSingle()
      if (!ch || ch.purpose !== "authenticate") return json({ error: "challenge 없음" }, 400)
      if (new Date(ch.expires_at as string) < new Date()) return json({ error: "challenge 만료" }, 400)

      const { data: passkey } = await db
        .from("user_passkeys")
        .select("id, user_id, credential_id, public_key, counter, transports")
        .eq("credential_id", credentialId)
        .maybeSingle()
      if (!passkey) return json({ error: "등록되지 않은 패스키" }, 400)

      const verification = await verifyAuthenticationResponse({
        response: body.response as never,
        expectedChallenge: ch.challenge as string,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credential_id as string,
          publicKey: isoBase64URL.toBuffer(passkey.public_key as string),
          counter: Number(passkey.counter),
          transports: (passkey.transports ?? []) as never,
        },
        requireUserVerification: false,
      })
      await db.from("webauthn_challenges").delete().eq("id", challengeId)

      if (!verification.verified) return json({ error: "인증 검증 실패" }, 400)

      // counter 갱신 + last_used
      await db
        .from("user_passkeys")
        .update({
          counter: verification.authenticationInfo.newCounter,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", passkey.id)

      // 세션 발급: 사용자 이메일로 magiclink OTP 생성 후 즉시 검증 → access/refresh 반환
      const { data: userRow } = await db
        .from("users")
        .select("email")
        .eq("id", passkey.user_id)
        .maybeSingle()
      const email = userRow?.email as string | undefined
      if (!email) return json({ error: "사용자 이메일을 찾을 수 없습니다." }, 500)

      const { data: linkData, error: linkErr } = await db.auth.admin.generateLink({
        type: "magiclink",
        email,
      })
      if (linkErr || !linkData?.properties?.email_otp) {
        return json({ error: linkErr?.message ?? "세션 발급 실패" }, 500)
      }
      const anon = createClient(url, anonKey, { auth: { persistSession: false } })
      const { data: verifyData, error: otpErr } = await anon.auth.verifyOtp({
        email,
        token: linkData.properties.email_otp,
        type: "email",
      })
      if (otpErr || !verifyData.session) {
        return json({ error: otpErr?.message ?? "세션 발급 실패(OTP)" }, 500)
      }
      return json({
        verified: true,
        access_token: verifyData.session.access_token,
        refresh_token: verifyData.session.refresh_token,
      })
    }

    return json({ error: `알 수 없는 action: ${action}` }, 400)
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500)
  }
})
