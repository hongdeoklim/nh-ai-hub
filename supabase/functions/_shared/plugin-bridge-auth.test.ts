// deno test supabase/functions/_shared/plugin-bridge-auth.test.ts --allow-env
import {
  internalBridgeHeaders,
  isHealthCheckRequest,
  isInternalFunctionUrl,
} from "./plugin-bridge-auth.ts"

function assertEquals(actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) throw new Error(`expected ${e} but got ${a}`)
}

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(env)) {
    previous[key] = Deno.env.get(key)
    if (value === undefined) Deno.env.delete(key)
    else Deno.env.set(key, value)
  }
  try {
    fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
}

Deno.test("우리 프로젝트의 Edge Function 주소에만 내부 시크릿을 붙인다", () => {
  withEnv(
    {
      SUPABASE_URL: "https://abcd.supabase.co",
      PLUGIN_BRIDGE_INTERNAL_SECRET: "s3cret",
      PLUGIN_BRIDGE_INTERNAL_HOSTS: undefined,
    },
    () => {
      assertEquals(
        internalBridgeHeaders("https://abcd.supabase.co/functions/v1/plugin-slack-bridge"),
        { "X-NH-Internal-Secret": "s3cret" },
      )
      // 제3자 주소, 다른 프로젝트, 함수 경로가 아닌 주소에는 붙이지 않는다
      assertEquals(internalBridgeHeaders("https://evil.example.com/functions/v1/x"), {})
      assertEquals(internalBridgeHeaders("https://other.supabase.co/functions/v1/plugin-slack-bridge"), {})
      assertEquals(internalBridgeHeaders("https://abcd.supabase.co/rest/v1/profiles"), {})
      assertEquals(internalBridgeHeaders("not a url"), {})
    },
  )
})

Deno.test("로컬 개발 호스트는 PLUGIN_BRIDGE_INTERNAL_HOSTS 로 허용한다", () => {
  withEnv(
    {
      SUPABASE_URL: "http://kong:8000",
      PLUGIN_BRIDGE_INTERNAL_HOSTS: "127.0.0.1:54321, localhost:54321",
    },
    () => {
      assertEquals(isInternalFunctionUrl("http://127.0.0.1:54321/functions/v1/plugin-jira-bridge"), true)
      assertEquals(isInternalFunctionUrl("http://127.0.0.1:9999/functions/v1/plugin-jira-bridge"), false)
    },
  )
})

Deno.test("시크릿이 설정되지 않으면 헤더를 만들지 않는다", () => {
  withEnv({ SUPABASE_URL: "https://abcd.supabase.co", PLUGIN_BRIDGE_INTERNAL_SECRET: undefined }, () => {
    assertEquals(internalBridgeHeaders("https://abcd.supabase.co/functions/v1/plugin-slack-bridge"), {})
  })
})

Deno.test("연결 테스트 요청을 구분한다", () => {
  assertEquals(isHealthCheckRequest({ health_check: true }), true)
  assertEquals(isHealthCheckRequest({ health_check: "true" }), false)
  assertEquals(isHealthCheckRequest({ arguments: {} }), false)
  assertEquals(isHealthCheckRequest(null), false)
})
