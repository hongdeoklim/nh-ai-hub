import {
  credentialHint,
  decryptPluginCredential,
  encryptPluginCredential,
  pluginAuthHeaders,
} from "./plugin-credentials.ts"

Deno.test("plugin credential encrypts and decrypts without plaintext storage", async () => {
  Deno.env.set("PLUGIN_CREDENTIAL_ENCRYPTION_KEY", "test-only-secret-with-sufficient-entropy")
  const original = "sk-live-example-123456"
  const encrypted = await encryptPluginCredential(original)
  if (encrypted.includes(original)) throw new Error("ciphertext contains plaintext")
  if (await decryptPluginCredential(encrypted) !== original) throw new Error("round trip failed")
})

Deno.test("plugin auth headers support bearer and custom API key", () => {
  const bearer = pluginAuthHeaders({ auth_type: "bearer", auth_header_name: "Authorization" }, "token")
  if (bearer.Authorization !== "Bearer token") throw new Error("bearer header failed")
  const apiKey = pluginAuthHeaders({ auth_type: "api_key", auth_header_name: "X-API-Key" }, "secret")
  if (apiKey["X-API-Key"] !== "secret") throw new Error("api key header failed")
})

Deno.test("credential hint does not reveal full secret", () => {
  const hint = credentialHint("abcdefghijkl")
  if (hint === "abcdefghijkl" || !hint.includes("••••")) throw new Error("unsafe hint")
})
