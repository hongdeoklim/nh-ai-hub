function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

async function encryptionKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("PLUGIN_CREDENTIAL_ENCRYPTION_KEY")?.trim()
  if (!secret) throw new Error("PLUGIN_CREDENTIAL_ENCRYPTION_KEY is not configured")
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))
  return await crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"])
}

export async function encryptPluginCredential(value: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(),
    new TextEncoder().encode(value),
  )
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`
}

export async function decryptPluginCredential(value: string): Promise<string> {
  const [ivText, encryptedText] = value.split(".")
  if (!ivText || !encryptedText) throw new Error("Invalid encrypted credential")
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivText) },
    await encryptionKey(),
    base64ToBytes(encryptedText),
  )
  return new TextDecoder().decode(decrypted)
}

export function credentialHint(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 6) return "••••••"
  return `${trimmed.slice(0, 3)}••••${trimmed.slice(-3)}`
}

export function pluginAuthHeaders(
  plugin: { auth_type: string; auth_header_name: string },
  credential?: string,
): Record<string, string> {
  if (!credential || plugin.auth_type === "none") return {}
  const header = plugin.auth_header_name?.trim() || "Authorization"
  return {
    [header]: plugin.auth_type === "bearer" ? `Bearer ${credential}` : credential,
  }
}
