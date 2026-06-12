/**
 * 사용자 연동 자격 증명 암호화 및 OAuth state 서명
 */

const enc = new TextEncoder()

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function deriveAesKey(masterSecret: string): Promise<CryptoKey> {
  const keyRaw = await crypto.subtle.digest("SHA-256", enc.encode(masterSecret))
  return crypto.subtle.importKey(
    "raw",
    keyRaw,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  )
}

export async function encryptCredential(
  plaintext: string,
  masterSecret: string,
): Promise<{ iv: string; ciphertext: string }> {
  const key = await deriveAesKey(masterSecret)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherBuf = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  )
  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(cipherBuf)),
  }
}

export async function decryptCredential(
  ivB64: string,
  ciphertextB64: string,
  masterSecret: string,
): Promise<string> {
  const key = await deriveAesKey(masterSecret)
  const iv = base64ToBytes(ivB64)
  const ciphertext = base64ToBytes(ciphertextB64)
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext,
  )
  return new TextDecoder().decode(plainBuf)
}

async function deriveHmacKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest("SHA-256", enc.encode(secret))
  return crypto.subtle.importKey(
    "raw",
    raw,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  )
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

/** OAuth state: payloadBase64.signatureHex */
export async function signOAuthState(
  uid: string,
  ttlMs: number,
  stateSecret: string,
): Promise<string> {
  const payload = JSON.stringify({
    uid,
    exp: Date.now() + ttlMs,
  })
  const payloadB64 = bytesToBase64(enc.encode(payload))
  const hmacKey = await deriveHmacKey(stateSecret)
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    enc.encode(payloadB64),
  )
  const sigHex = [...new Uint8Array(sigBuf)].map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("")
  return `${payloadB64}.${sigHex}`
}

export async function verifyOAuthState(
  state: string,
  stateSecret: string,
): Promise<{ uid: string } | null> {
  const dot = state.lastIndexOf(".")
  if (dot <= 0) return null
  const payloadB64 = state.slice(0, dot)
  const sigHex = state.slice(dot + 1)
  if (!/^[0-9a-f]+$/i.test(sigHex) || sigHex.length % 2 !== 0) return null

  const hmacKey = await deriveHmacKey(stateSecret)
  const sigBuf = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    enc.encode(payloadB64),
  )
  const expectedHex = [...new Uint8Array(sigBuf)].map((b) =>
    b.toString(16).padStart(2, "0")
  ).join("")
  if (!timingSafeEqual(sigHex.toLowerCase(), expectedHex.toLowerCase())) {
    return null
  }

  let payload: { uid?: string; exp?: number }
  try {
    payload = JSON.parse(new TextDecoder().decode(base64ToBytes(payloadB64)))
  } catch {
    return null
  }
  if (
    typeof payload.uid !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return null
  }
  if (payload.exp < Date.now()) return null
  return { uid: payload.uid }
}
