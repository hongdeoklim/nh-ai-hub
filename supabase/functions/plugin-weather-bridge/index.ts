import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { verifyInternalBridgeSecret } from "../_shared/plugin-bridge-auth.ts"

/**
 * 기상청(KMA) 단기예보 브릿지 — `nh.public-data.weather-forecast` 플러그인의
 * endpoint_url. 사용자별 자격증명이 필요 없음(auth_type='none') — 이미 이 앱이
 * data.go.kr 공공데이터포털에 등록해 둔 서버 공용 서비스키(search_public_data
 * 도구가 쓰는 것과 동일 키)를 그대로 재사용한다.
 */

// 주요 도시 → 기상청 격자 좌표(nx, ny). 공개적으로 널리 쓰이는 KMA 격자 변환표 기준.
const CITY_GRID: Record<string, { nx: number; ny: number }> = {
  "서울": { nx: 60, ny: 127 },
  "인천": { nx: 55, ny: 124 },
  "수원": { nx: 60, ny: 121 },
  "성남": { nx: 63, ny: 124 },
  "부산": { nx: 98, ny: 76 },
  "대구": { nx: 89, ny: 90 },
  "광주": { nx: 58, ny: 74 },
  "대전": { nx: 67, ny: 100 },
  "울산": { nx: 102, ny: 84 },
  "세종": { nx: 66, ny: 103 },
  "제주": { nx: 52, ny: 38 },
  "강릉": { nx: 92, ny: 131 },
  "전주": { nx: 63, ny: 89 },
  "청주": { nx: 69, ny: 106 },
  "창원": { nx: 91, ny: 77 },
  "천안": { nx: 65, ny: 110 },
}

const SKY_LABEL: Record<string, string> = { "1": "맑음", "3": "구름 많음", "4": "흐림" }
const PTY_LABEL: Record<string, string> = { "0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기" }

/** KST 기준 가장 최근에 발표된 단기예보 base_date/base_time (발표 10분 후부터 조회 가능해 20분 버퍼) */
function latestBaseDateTime(): { base_date: string; base_time: string } {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" }))
  const slots = [2, 5, 8, 11, 14, 17, 20, 23]
  const minutesNow = now.getHours() * 60 + now.getMinutes()
  let chosenHour = 23
  let dayOffset = -1
  for (let i = slots.length - 1; i >= 0; i--) {
    const slotMinutes = slots[i]! * 60 + 20
    if (minutesNow >= slotMinutes) {
      chosenHour = slots[i]!
      dayOffset = 0
      break
    }
  }
  const base = new Date(now)
  base.setDate(base.getDate() + dayOffset)
  const yyyy = base.getFullYear()
  const mm = String(base.getMonth() + 1).padStart(2, "0")
  const dd = String(base.getDate()).padStart(2, "0")
  return { base_date: `${yyyy}${mm}${dd}`, base_time: `${String(chosenHour).padStart(2, "0")}00` }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type, x-nh-internal-secret",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    })
  }

  const unauthorized = verifyInternalBridgeSecret(req)
  if (unauthorized) return unauthorized

  let body: { arguments?: { city?: string } }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400)
  }

  const serviceKey =
    Deno.env.get("CORP_DATA_PORTAL_API_KEY")?.trim() || Deno.env.get("DATA_PORTAL_API_KEY")?.trim()
  if (!serviceKey) return json({ ok: false, error: "공공데이터포털 서비스키가 서버에 설정되지 않았습니다." }, 500)

  const cityRaw = body.arguments?.city?.trim()
  if (!cityRaw) return json({ ok: false, error: "city 인자가 필요합니다 (예: 서울, 부산)." }, 400)
  const grid = CITY_GRID[cityRaw] ?? Object.entries(CITY_GRID).find(([name]) => cityRaw.includes(name))?.[1]
  if (!grid) {
    return json({
      ok: false,
      error: `지원하는 도시가 아닙니다. 지원 목록: ${Object.keys(CITY_GRID).join(", ")}`,
    }, 400)
  }

  const { base_date, base_time } = latestBaseDateTime()
  const params = new URLSearchParams({
    serviceKey,
    pageNo: "1",
    numOfRows: "300",
    dataType: "JSON",
    base_date,
    base_time,
    nx: String(grid.nx),
    ny: String(grid.ny),
  })
  const endpoint = `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst?${params.toString()}`

  try {
    const res = await fetch(endpoint, { signal: AbortSignal.timeout(15_000) })
    const text = await res.text()
    if (!res.ok) {
      return json({ ok: false, status: res.status, error: text.slice(0, 500) || `기상청 API 오류 (${res.status})` }, 502)
    }
    const payload = JSON.parse(text) as {
      response?: {
        header?: { resultCode?: string; resultMsg?: string }
        body?: { items?: { item?: Array<{ category: string; fcstDate: string; fcstTime: string; fcstValue: string }> } }
      }
    }
    const resultCode = payload.response?.header?.resultCode
    if (resultCode && resultCode !== "00") {
      return json({ ok: false, error: `기상청 API 오류: ${payload.response?.header?.resultMsg ?? resultCode}` }, 502)
    }

    const items = payload.response?.body?.items?.item ?? []
    // fcstDate+fcstTime 별로 그룹화해 가장 가까운 3개 시간대만 요약
    const byTime = new Map<string, Record<string, string>>()
    for (const item of items) {
      const key = `${item.fcstDate} ${item.fcstTime}`
      if (!byTime.has(key)) byTime.set(key, {})
      byTime.get(key)![item.category] = item.fcstValue
    }
    const sortedKeys = Array.from(byTime.keys()).sort().slice(0, 4)
    const forecast = sortedKeys.map((key) => {
      const v = byTime.get(key)!
      return {
        datetime: key,
        temperature_c: v.TMP ?? v.T3H ?? null,
        sky: SKY_LABEL[v.SKY ?? ""] ?? v.SKY ?? null,
        precipitation: PTY_LABEL[v.PTY ?? ""] ?? v.PTY ?? null,
        precipitation_probability_pct: v.POP ?? null,
      }
    })

    return json({ ok: true, city: cityRaw, base_date, base_time, forecast })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return json({ ok: false, error: msg }, 502)
  }
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  })
}
