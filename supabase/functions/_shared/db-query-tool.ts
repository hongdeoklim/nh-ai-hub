/**
 * NH AI Hub — 사내 Supabase DB 직접 조회 MCP 도구
 *
 * AI가 사전에 정의된 안전한 뷰(View) 목록에 대해 SELECT 조회를 수행합니다.
 * 쓰기(INSERT/UPDATE/DELETE) 및 DDL은 일절 허용하지 않으며,
 * 허용된 뷰/테이블 화이트리스트 기반으로만 동작합니다.
 */
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.49.8"

// ---------------------------------------------------------------------------
// 허용된 뷰 / 테이블 화이트리스트 (DBA 또는 관리자가 관리)
// ---------------------------------------------------------------------------

/**
 * AI가 조회할 수 있는 테이블·뷰 이름 목록.
 * Supabase 대시보드에서 Row Level Security를 추가로 설정하는 것을 강력 권장합니다.
 * 환경변수 NH_DB_ALLOWED_VIEWS 에 콤마로 구분된 이름을 넣어도 동작합니다.
 */
function getAllowedViews(): Set<string> {
  const envRaw = Deno.env.get("NH_DB_ALLOWED_VIEWS")?.trim()
  if (envRaw && envRaw.length > 0) {
    return new Set(
      envRaw.split(",").map((v) => v.trim().toLowerCase()).filter(Boolean),
    )
  }
  // 기본 허용 목록 (회사 실정에 맞게 수정하세요)
  return new Set([
    "ai_db_view_sales",       // 매출·실적 뷰
    "ai_db_view_members",     // 부서·인원 현황 뷰
    "ai_db_view_projects",    // 프로젝트 현황 뷰
    "ai_db_view_inventory",   // 재고 현황 뷰
    "ai_db_view_budget",      // 예산·비용 뷰
    "token_logs",             // AI 토큰 사용 로그 (읽기 전용)
  ])
}

export type DbQueryResult = {
  ok: boolean
  viewName?: string
  rowCount?: number
  columns?: string[]
  rows?: Record<string, unknown>[]
  markdownTable?: string
  message?: string
  error?: string
}

/** SQL 인젝션 방지: 허용 뷰 이름 외의 문자를 제거하고 화이트리스트 검증 */
function validateViewName(name: string): {
  ok: boolean
  sanitized?: string
  error?: string
} {
  const sanitized = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
  if (!sanitized) return { ok: false, error: "뷰/테이블 이름이 비어 있습니다." }

  const allowed = getAllowedViews()
  if (!allowed.has(sanitized)) {
    return {
      ok: false,
      error:
        `'${sanitized}'은(는) AI 조회 허용 목록에 없습니다. 허용 목록: [${[...allowed].join(", ")}]`,
    }
  }
  return { ok: true, sanitized }
}

function buildMarkdownTable(
  columns: string[],
  rows: Record<string, unknown>[],
  maxRows = 50,
): string {
  if (columns.length === 0 || rows.length === 0) return "(결과 없음)"

  const displayRows = rows.slice(0, maxRows)
  const header = `| ${columns.join(" | ")} |`
  const separator = `| ${columns.map(() => "---").join(" | ")} |`
  const body = displayRows.map((row) =>
    `| ${
      columns
        .map((col) => {
          const val = row[col]
          const str = val === null || val === undefined ? "" : String(val)
          return str.replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 120)
        })
        .join(" | ")
    } |`
  )

  const extra = rows.length > maxRows
    ? `\n*(${rows.length - maxRows}행 추가 생략, 조건을 좁혀 재조회하세요.)*`
    : ""

  return [header, separator, ...body].join("\n") + extra
}

/** AI가 호출할 DB 조회 함수 */
export async function executeDbQuery(
  admin: SupabaseClient,
  input: {
    view_name: string
    filter_column?: string
    filter_value?: string
    limit?: number
  },
): Promise<DbQueryResult> {
  const check = validateViewName(input.view_name)
  if (!check.ok || !check.sanitized) {
    return { ok: false, error: check.error }
  }

  const viewName = check.sanitized
  const limit = Math.min(Math.max(1, input.limit ?? 30), 100)

  try {
    let query = admin
      .from(viewName)
      .select("*")
      .limit(limit)

    // 단순 등가 필터 (컬럼명도 영문+숫자+언더바만 허용)
    if (input.filter_column && input.filter_value !== undefined) {
      const safeCol = input.filter_column.replace(/[^a-z0-9_]/gi, "")
      if (safeCol.length > 0) {
        query = query.eq(safeCol, input.filter_value) as typeof query
      }
    }

    const { data, error } = await query

    if (error) {
      return {
        ok: false,
        viewName,
        error: `DB 조회 오류: ${error.message}`,
      }
    }

    const rows = (data ?? []) as Record<string, unknown>[]
    const columns = rows.length > 0 ? Object.keys(rows[0]) : []
    const markdownTable = buildMarkdownTable(columns, rows)

    return {
      ok: true,
      viewName,
      rowCount: rows.length,
      columns,
      rows,
      markdownTable,
      message:
        `'${viewName}' 에서 ${rows.length}건 조회 완료. rows(JSON) 및 markdownTable 을 근거로 답변하세요.`,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, viewName, error: msg }
  }
}

/** 현재 허용된 뷰 목록을 AI 가이던스 문자열로 반환 */
export function getAllowedViewsDescription(): string {
  const views = [...getAllowedViews()]
  if (views.length === 0) return "(허용된 뷰 없음)"
  return views.map((v) => `\`${v}\``).join(", ")
}
