import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.49.8"
import { handleCorsPreflight, jsonResponse, withCors } from "../_shared/cors.ts"

/**
 * NH AI Inside Hub - Dify Cross-Cloud API Bridge
 * Dify 서버가 사내 직원 데이터를 필요로 할 때 호출하는 API 엔드포인트입니다.
 */

// DIFY 연동 시 사용할 API KEY (임의로 설정)
// Dify Custom Tool 등록 시 헤더에 Authorization: Bearer <DIFY_HUB_SECRET> 형태로 전송
const REQUIRED_SECRET = Deno.env.get("DIFY_HUB_SECRET") || "nh-dify-secret-key-1234"

export default async function handler(req: Request): Promise<Response> {
  // 1. CORS 프리플라이트 처리
  const preflight = handleCorsPreflight(req)
  if (preflight) return preflight

  try {
    // 2. 인증 (Authorization Bearer 토큰 확인)
    const authHeader = req.headers.get("Authorization")
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return withCors(req, jsonResponse({ error: "Unauthorized" }, 401))
    }
    const token = authHeader.split(" ")[1]
    if (token !== REQUIRED_SECRET) {
      return withCors(req, jsonResponse({ error: "Forbidden - Invalid Token" }, 403))
    }

    // 3. 쿼리 파라미터 파싱
    const url = new URL(req.url)
    const query = url.searchParams.get("query")?.trim() || ""
    const department = url.searchParams.get("department")?.trim() || ""

    // 4. Supabase 어드민 클라이언트 생성 (RLS 우회)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? ""
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 5. DB 쿼리 생성
    let dbQuery = supabase
      .from("partners")
      .select("company_name, business_number, representative_name, contact_person, contact_phone, email, extra_data")
      .limit(50)

    // 회사명(query) 또는 부서/업종(department) 조건 적용
    if (query) {
      dbQuery = dbQuery.ilike("company_name", `%${query}%`)
    }
    if (department) {
      dbQuery = dbQuery.eq("department", department)
    }

    const { data, error } = await dbQuery

    if (error) {
      console.error("[dify-hub-api] DB Error:", error.message)
      return withCors(req, jsonResponse({ error: "Database error occurred" }, 500))
    }

    // 6. 결과 반환
    return withCors(
      req,
      jsonResponse({
        success: true,
        count: data?.length || 0,
        partners: data || [],
      })
    )
  } catch (err: any) {
    console.error("[dify-hub-api] Fatal Error:", err.message)
    return withCors(req, jsonResponse({ error: "Internal Server Error" }, 500))
  }
}

Deno.serve(handler)
