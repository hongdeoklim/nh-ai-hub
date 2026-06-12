/**
 * NH AI Hub — Gen 2 시맨틱 지식 그래프 게이트웨이
 *
 * 엔드포인트 구성
 *  1. POST /nodes              — 노드 단건 생성 (임베딩 포함)
 *  2. POST /nodes/search       — pgvector 코사인 유사도 검색
 *  3. POST /edges              — 백링크 간선 생성
 *  4. POST /webhook/knowledge  — 마크다운 대량 인입 + 멱등성 보장 청크 적재 (knowledgeWebhookGateway)
 *
 * 환경변수 (Secrets)
 *  - SUPABASE_URL              Supabase 프로젝트 REST 기본 URL
 *  - SUPABASE_SERVICE_KEY      service_role 키 (RLS 우회)
 *  - OPENAI_API_KEY            OpenAI API 키 (임베딩 전용)
 *  - GATEWAY_SECRET            웹훅 호출 인증 시크릿 (Bearer 토큰)
 *  - PORT                      수신 포트 (기본 3100)
 *
 * 경로  functions_v2/index.js
 */

'use strict';

const http    = require('http');
const https   = require('https');
const { splitMarkdownContext, embedChunks } = require('./utils/knowledgeParser');


/* ─────────────────────────────────────────────────────────────────────────────
   환경변수 로드 및 필수 항목 검증
───────────────────────────────────────────────────────────────────────────── */

const SUPABASE_URL         = (process.env.SUPABASE_URL          ?? '').trim();
const SUPABASE_SERVICE_KEY = (process.env.SUPABASE_SERVICE_KEY  ?? '').trim();
const OPENAI_API_KEY       = (process.env.OPENAI_API_KEY        ?? '').trim();
const GATEWAY_SECRET       = (process.env.GATEWAY_SECRET        ?? '').trim();
const PORT                 = parseInt(process.env.PORT ?? '3100', 10);

const REQUIRED_SECRETS = ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'OPENAI_API_KEY', 'GATEWAY_SECRET'];
const missingSecrets   = REQUIRED_SECRETS.filter((name) => !(process.env[name] ?? '').trim());

if (missingSecrets.length > 0) {
  console.error('[gateway] 필수 환경변수 누락:', missingSecrets.join(', '));
  process.exit(1);
}


/* ─────────────────────────────────────────────────────────────────────────────
   상수
───────────────────────────────────────────────────────────────────────────── */

const WEBHOOK_MIN_TEXT_CHARS     = 20;    // 이 미만의 텍스트는 임베딩 파이프라인 진입 차단
const CHUNK_MAX_CHARS            = 1800;  // splitMarkdownContext 청크 최대 글자 수
const CHUNK_OVERLAP_CHARS        = 150;   // 인접 청크 간 중첩 글자 수
const SUPABASE_REST              = `${SUPABASE_URL}/rest/v1`;
const SUPABASE_RPC               = `${SUPABASE_URL}/rest/v1/rpc`;
const NODES_TABLE                = 'nh_knowledge_nodes';
const EDGES_TABLE                = 'nh_knowledge_edges';
const EMBEDDING_DIMENSIONS       = 1536;


/* ─────────────────────────────────────────────────────────────────────────────
   Supabase REST 헬퍼
───────────────────────────────────────────────────────────────────────────── */

/**
 * Supabase REST API 에 인증된 요청을 전송합니다.
 *
 * @param {string} path              - REST 경로 (예: '/nh_knowledge_nodes')
 * @param {object} options
 * @param {string} [options.method]  - HTTP 메서드 (기본 'GET')
 * @param {object} [options.body]    - 요청 본문 (JSON 직렬화)
 * @param {object} [options.headers] - 추가 헤더
 * @returns {Promise<{ status: number, data: unknown }>}
 */
async function sbFetch(path, options = {}) {
  const method  = options.method ?? 'GET';
  const headers = {
    'apikey'        : SUPABASE_SERVICE_KEY,
    'Authorization' : `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type'  : 'application/json',
    'Prefer'        : 'return=representation',
    ...(options.headers ?? {}),
  };

  const url     = `${SUPABASE_REST}${path}`;
  const body    = options.body !== undefined ? JSON.stringify(options.body) : undefined;
  const res     = await fetch(url, { method, headers, body });
  const text    = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

/**
 * Supabase RPC(함수) 를 호출합니다.
 *
 * @param {string} funcName  - DB 함수명
 * @param {object} params    - 함수 인수 객체
 * @returns {Promise<{ status: number, data: unknown }>}
 */
async function sbRpc(funcName, params = {}) {
  const url     = `${SUPABASE_RPC}/${funcName}`;
  const headers = {
    'apikey'        : SUPABASE_SERVICE_KEY,
    'Authorization' : `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type'  : 'application/json',
  };
  const res  = await fetch(url, { method: 'POST', headers, body: JSON.stringify(params) });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}


/* ─────────────────────────────────────────────────────────────────────────────
   HTTP 유틸리티
───────────────────────────────────────────────────────────────────────────── */

/**
 * 수신된 HTTP 요청 본문을 JSON 으로 파싱합니다.
 *
 * @param {http.IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end',  ()      => {
      const raw = Buffer.concat(chunks).toString('utf-8');
      try {
        resolve(raw.trim().length > 0 ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('요청 본문이 유효한 JSON 이 아닙니다.'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * JSON 응답을 전송합니다.
 *
 * @param {http.ServerResponse} res
 * @param {number}              status
 * @param {unknown}             body
 */
function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type'   : 'application/json; charset=utf-8',
    'Content-Length' : Buffer.byteLength(payload),
  });
  res.end(payload);
}

/**
 * Bearer 토큰으로 게이트웨이 시크릿을 검증합니다.
 *
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
function verifyGatewaySecret(req) {
  const header = req.headers['authorization'] ?? '';
  const token  = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return token === GATEWAY_SECRET;
}


/* ─────────────────────────────────────────────────────────────────────────────
   엔드포인트 1: POST /nodes
   — 지식 노드 단건을 생성하고, content 를 임베딩하여 함께 저장합니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * POST /nodes 핸들러
 *
 * 요청 본문 (JSON):
 * ```json
 * {
 *   "title"       : "문서 제목",
 *   "slug"        : "문서-제목",          // 생략 시 title 에서 자동 생성
 *   "node_type"   : "document",           // nh_node_type ENUM 참조
 *   "content"     : "마크다운 본문",
 *   "source_url"  : "https://...",        // 원본 출처 URL (선택)
 *   "visibility"  : "public",             // public | department | private
 *   "department"  : "경영전략부",           // visibility=department 시 필수
 *   "metadata"    : {}
 * }
 * ```
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 */
async function handleCreateNode(req, res) {
  if (!verifyGatewaySecret(req)) {
    return sendJson(res, 401, { error: '인증에 실패했습니다. GATEWAY_SECRET 을 확인하세요.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }

  const title   = typeof body.title   === 'string' ? body.title.trim()   : '';
  const content = typeof body.content === 'string' ? body.content.trim() : '';

  if (!title) {
    return sendJson(res, 400, { error: 'title 은 필수 항목입니다.' });
  }
  if (!content) {
    return sendJson(res, 400, { error: 'content 는 필수 항목입니다.' });
  }

  const slug = typeof body.slug === 'string' && body.slug.trim().length > 0
    ? body.slug.trim()
    : title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-_]/g, '');

  let embedding = null;
  if (content.length >= WEBHOOK_MIN_TEXT_CHARS) {
    const vectors = await embedChunks([content], OPENAI_API_KEY);
    embedding = vectors[0] ?? null;
  }

  const record = {
    title,
    slug,
    node_type    : body.node_type   ?? 'document',
    content,
    embedding    : embedding ? `[${embedding.join(',')}]` : null,
    source_url   : body.source_url  ?? null,
    visibility   : body.visibility  ?? 'public',
    department   : body.department  ?? null,
    metadata     : body.metadata    ?? {},
    embedding_model : embedding ? 'text-embedding-3-small' : null,
    embedded_at     : embedding ? new Date().toISOString()  : null,
  };

  const { status, data } = await sbFetch(`/${NODES_TABLE}`, {
    method  : 'POST',
    body    : record,
    headers : { Prefer: 'return=representation,resolution=merge-duplicates' },
  });

  if (status >= 400) {
    return sendJson(res, 502, { error: 'Supabase 노드 저장 실패', detail: data });
  }

  return sendJson(res, 201, { ok: true, node: Array.isArray(data) ? data[0] : data });
}


/* ─────────────────────────────────────────────────────────────────────────────
   엔드포인트 2: POST /nodes/search
   — pgvector nh_search_similar_nodes RPC 를 통해 코사인 유사도 검색을 수행합니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * POST /nodes/search 핸들러
 *
 * 요청 본문 (JSON):
 * ```json
 * {
 *   "query"              : "검색할 자연어 질의",
 *   "match_count"        : 10,
 *   "similarity_threshold": 0.70,
 *   "filter_node_type"   : "document",   // 선택
 *   "filter_department"  : "경영전략부",  // 선택
 *   "filter_visibility"  : "public"      // 선택
 * }
 * ```
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 */
async function handleSearchNodes(req, res) {
  if (!verifyGatewaySecret(req)) {
    return sendJson(res, 401, { error: '인증에 실패했습니다. GATEWAY_SECRET 을 확인하세요.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }

  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < WEBHOOK_MIN_TEXT_CHARS) {
    return sendJson(res, 400, {
      error: `query 는 ${WEBHOOK_MIN_TEXT_CHARS}자 이상이어야 합니다.`,
    });
  }

  const vectors = await embedChunks([query], OPENAI_API_KEY);
  const queryEmbedding = vectors[0];

  if (!queryEmbedding) {
    return sendJson(res, 502, { error: '질의 임베딩 생성에 실패했습니다.' });
  }

  const rpcParams = {
    query_embedding      : queryEmbedding,
    match_count          : body.match_count           ?? 10,
    similarity_threshold : body.similarity_threshold  ?? 0.70,
    filter_node_type     : body.filter_node_type      ?? null,
    filter_department    : body.filter_department     ?? null,
    filter_visibility    : body.filter_visibility     ?? 'public',
  };

  const { status, data } = await sbRpc('nh_search_similar_nodes', rpcParams);

  if (status >= 400) {
    return sendJson(res, 502, { error: 'pgvector 검색 실패', detail: data });
  }

  return sendJson(res, 200, { ok: true, results: data ?? [] });
}


/* ─────────────────────────────────────────────────────────────────────────────
   엔드포인트 3: POST /edges
   — 두 노드 사이에 방향성 있는 백링크 간선을 생성합니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * POST /edges 핸들러
 *
 * 요청 본문 (JSON):
 * ```json
 * {
 *   "source_node_id" : "uuid",
 *   "target_node_id" : "uuid",
 *   "edge_type"      : "backlink",     // nh_edge_type ENUM 참조
 *   "anchor_text"    : "링크 텍스트",  // 선택
 *   "context_snippet": "문장 발췌",    // 선택
 *   "weight"         : 1.0,            // 0~1 (기본 1.0)
 *   "is_auto"        : false,          // AI 자동 추론 여부
 *   "metadata"       : {}
 * }
 * ```
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 */
async function handleCreateEdge(req, res) {
  if (!verifyGatewaySecret(req)) {
    return sendJson(res, 401, { error: '인증에 실패했습니다. GATEWAY_SECRET 을 확인하세요.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }

  const sourceId = typeof body.source_node_id === 'string' ? body.source_node_id.trim() : '';
  const targetId = typeof body.target_node_id === 'string' ? body.target_node_id.trim() : '';

  if (!sourceId || !targetId) {
    return sendJson(res, 400, { error: 'source_node_id 와 target_node_id 는 필수입니다.' });
  }
  if (sourceId === targetId) {
    return sendJson(res, 400, { error: '자기 참조 간선은 허용되지 않습니다.' });
  }

  const record = {
    source_node_id  : sourceId,
    target_node_id  : targetId,
    edge_type       : body.edge_type       ?? 'backlink',
    anchor_text     : body.anchor_text     ?? null,
    context_snippet : body.context_snippet ?? null,
    weight          : body.weight          ?? 1.0,
    is_auto         : body.is_auto         ?? false,
    metadata        : body.metadata        ?? {},
  };

  const { status, data } = await sbFetch(`/${EDGES_TABLE}`, {
    method  : 'POST',
    body    : record,
    headers : { Prefer: 'return=representation,resolution=merge-duplicates' },
  });

  if (status >= 400) {
    return sendJson(res, 502, { error: 'Supabase 간선 저장 실패', detail: data });
  }

  return sendJson(res, 201, { ok: true, edge: Array.isArray(data) ? data[0] : data });
}


/* ─────────────────────────────────────────────────────────────────────────────
   엔드포인트 4: POST /webhook/knowledge — knowledgeWebhookGateway
   — 마크다운 인입 → 청킹 → 임베딩 → pgvector 원장 적재를 원자적으로 처리합니다.
   — UPDATE 타입 수신 시 기존 청크를 먼저 DELETE 하여 RAG 지식 오염을 차단합니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * source_url 또는 source_drive_id 기준으로 기존 청크 노드를 삭제합니다.
 * DELETE 는 새 청크 INSERT 전에 반드시 선행 실행됩니다.
 *
 * @param {object} params
 * @param {string} [params.sourceUrl]     - 원본 파일 URL
 * @param {string} [params.sourceDriveId] - Google Drive 파일 ID
 * @returns {Promise<number>} 삭제된 행 수 (추정)
 */
async function deleteExistingChunks({ sourceUrl, sourceDriveId }) {
  const conditions = [];

  if (sourceUrl) {
    const encodedUrl = encodeURIComponent(sourceUrl);
    conditions.push(`source_url=eq.${encodedUrl}`);
  }

  if (sourceDriveId) {
    const encodedDriveId = encodeURIComponent(sourceDriveId);
    conditions.push(`source_drive_id=eq.${encodedDriveId}`);
  }

  if (conditions.length === 0) {
    return 0;
  }

  const query    = conditions.join('&');
  const { status, data } = await sbFetch(`/${NODES_TABLE}?${query}&node_type=eq.raw_chunk`, {
    method  : 'DELETE',
    headers : { Prefer: 'return=minimal' },
  });

  if (status >= 400) {
    throw new Error(`기존 청크 삭제 실패 (HTTP ${status}): ${JSON.stringify(data)}`);
  }

  return 0;
}

/**
 * 청크 배열과 임베딩 배열을 묶어 nh_knowledge_nodes 에 일괄 INSERT 합니다.
 * INSERT 는 slug 충돌 시 ON CONFLICT DO NOTHING 으로 멱등성을 보장합니다.
 *
 * @param {object} params
 * @param {string[]}          params.chunks         - 청크 텍스트 배열
 * @param {Array<number[]|null>} params.embeddings  - 대응 벡터 배열
 * @param {string}            params.sourceTitle    - 원본 문서 제목
 * @param {string}            [params.sourceUrl]    - 원본 파일 URL
 * @param {string}            [params.sourceDriveId]- Google Drive 파일 ID
 * @param {string}            [params.sourceFileName]
 * @param {string}            [params.department]
 * @param {string}            [params.visibility]
 * @param {object}            [params.extraMetadata]
 * @returns {Promise<number>} 삽입 시도한 청크 수
 */
async function insertChunkNodes({
  chunks,
  embeddings,
  sourceTitle,
  sourceUrl,
  sourceDriveId,
  sourceFileName,
  department,
  visibility,
  extraMetadata,
}) {
  const now     = new Date().toISOString();
  const records = [];

  for (let i = 0; i < chunks.length; i++) {
    const chunk     = chunks[i];
    const embedding = embeddings[i] ?? null;

    const slugBase = sourceTitle
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9가-힣ㄱ-ㅎㅏ-ㅣ\-_]/g, '')
      .slice(0, 120);

    const slug = `${slugBase}-chunk-${i}`;

    records.push({
      title               : `${sourceTitle} [청크 ${i + 1}/${chunks.length}]`,
      slug,
      node_type           : 'raw_chunk',
      content             : chunk,
      embedding           : embedding ? `[${embedding.join(',')}]` : null,
      source_url          : sourceUrl         ?? null,
      source_drive_id     : sourceDriveId     ?? null,
      source_chunk_index  : i,
      source_file_name    : sourceFileName    ?? null,
      visibility          : visibility        ?? 'public',
      department          : department        ?? null,
      embedding_model     : embedding ? 'text-embedding-3-small' : null,
      embedded_at         : embedding ? now : null,
      metadata            : {
        source_title  : sourceTitle,
        total_chunks  : chunks.length,
        chunk_index   : i,
        ...(extraMetadata ?? {}),
      },
    });
  }

  const BATCH = 50;
  for (let start = 0; start < records.length; start += BATCH) {
    const slice            = records.slice(start, start + BATCH);
    const { status, data } = await sbFetch(`/${NODES_TABLE}`, {
      method  : 'POST',
      body    : slice,
      headers : { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    });

    if (status >= 400) {
      throw new Error(`청크 노드 INSERT 실패 (HTTP ${status}): ${JSON.stringify(data)}`);
    }
  }

  return records.length;
}

/**
 * POST /webhook/knowledge — knowledgeWebhookGateway
 *
 * 요청 본문 (JSON):
 * ```json
 * {
 *   "type"           : "INSERT" | "UPDATE",    // 필수: 멱등성 제어 분기
 *   "title"          : "원본 문서 제목",         // 필수
 *   "content"        : "마크다운 전문",           // 필수 (20자 이상)
 *   "source_url"     : "https://...",            // INSERT/UPDATE 식별 기준 ①
 *   "source_drive_id": "Drive 파일 ID",          // INSERT/UPDATE 식별 기준 ②
 *   "source_file_name": "파일명.md",             // 선택
 *   "visibility"     : "public",                 // 선택 (기본 public)
 *   "department"     : "경영전략부",              // visibility=department 시 사용
 *   "metadata"       : {}                        // 선택: 추가 메타데이터
 * }
 * ```
 *
 * UPDATE 처리 흐름:
 *  1. source_url / source_drive_id 기준으로 기존 raw_chunk 노드 전체 DELETE
 *  2. 새 마크다운으로 청킹 → 임베딩 → INSERT
 *
 * INSERT 처리 흐름:
 *  1. 청킹 → 임베딩 → INSERT (slug 충돌 시 건너뜀)
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 */
async function knowledgeWebhookGateway(req, res) {
  if (!verifyGatewaySecret(req)) {
    return sendJson(res, 401, { error: '인증에 실패했습니다. GATEWAY_SECRET 을 확인하세요.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (e) {
    return sendJson(res, 400, { error: e.message });
  }

  const eventType    = typeof body.type    === 'string' ? body.type.trim().toUpperCase()   : '';
  const title        = typeof body.title   === 'string' ? body.title.trim()                : '';
  const content      = typeof body.content === 'string' ? body.content.trim()              : '';
  const sourceUrl    = typeof body.source_url      === 'string' ? body.source_url.trim()      : '';
  const sourceDriveId= typeof body.source_drive_id === 'string' ? body.source_drive_id.trim() : '';
  const sourceFileName=typeof body.source_file_name=== 'string' ? body.source_file_name.trim(): '';
  const visibility   = typeof body.visibility  === 'string' ? body.visibility.trim()   : 'public';
  const department   = typeof body.department  === 'string' ? body.department.trim()   : '';
  const extraMetadata= body.metadata && typeof body.metadata === 'object' ? body.metadata : {};

  if (!eventType || !['INSERT', 'UPDATE'].includes(eventType)) {
    return sendJson(res, 400, { error: 'type 은 "INSERT" 또는 "UPDATE" 이어야 합니다.' });
  }

  if (!title) {
    return sendJson(res, 400, { error: 'title 은 필수 항목입니다.' });
  }

  if (content.length < WEBHOOK_MIN_TEXT_CHARS) {
    return sendJson(res, 400, {
      error   : `content 가 너무 짧습니다. 최소 ${WEBHOOK_MIN_TEXT_CHARS}자 이상이어야 합니다.`,
      received: content.length,
    });
  }

  if (eventType === 'UPDATE' && !sourceUrl && !sourceDriveId) {
    return sendJson(res, 400, {
      error: 'UPDATE 타입은 source_url 또는 source_drive_id 중 하나 이상이 필요합니다.',
    });
  }

  try {
    if (eventType === 'UPDATE') {
      await deleteExistingChunks({
        sourceUrl     : sourceUrl     || undefined,
        sourceDriveId : sourceDriveId || undefined,
      });
    }

    const chunks = splitMarkdownContext(content, {
      maxChars     : CHUNK_MAX_CHARS,
      overlapChars : CHUNK_OVERLAP_CHARS,
    });

    if (chunks.length === 0) {
      return sendJson(res, 200, {
        ok            : true,
        message       : '유효한 청크가 생성되지 않았습니다. 텍스트를 확인하세요.',
        chunks_created: 0,
      });
    }

    const embeddings = await embedChunks(chunks, OPENAI_API_KEY);

    const insertedCount = await insertChunkNodes({
      chunks,
      embeddings,
      sourceTitle    : title,
      sourceUrl      : sourceUrl      || undefined,
      sourceDriveId  : sourceDriveId  || undefined,
      sourceFileName : sourceFileName || undefined,
      department     : department     || undefined,
      visibility,
      extraMetadata,
    });

    const embeddedCount = embeddings.filter((v) => v !== null).length;

    return sendJson(res, 200, {
      ok              : true,
      type            : eventType,
      chunks_created  : insertedCount,
      chunks_embedded : embeddedCount,
      chunks_skipped  : insertedCount - embeddedCount,
    });

  } catch (error) {
    console.error('[knowledgeWebhookGateway] 처리 오류:', error.message);
    return sendJson(res, 500, {
      error : '지식 그래프 적재 중 오류가 발생했습니다.',
      detail: error.message,
    });
  }
}


/* ─────────────────────────────────────────────────────────────────────────────
   라우터
───────────────────────────────────────────────────────────────────────────── */

/**
 * 수신된 요청을 URL 과 메서드 기준으로 적절한 핸들러에 라우팅합니다.
 *
 * @param {http.IncomingMessage} req
 * @param {http.ServerResponse}  res
 */
async function router(req, res) {
  const url    = req.url  ?? '/';
  const method = (req.method ?? 'GET').toUpperCase();

  const route  = `${method} ${url.split('?')[0]}`;

  if (route === 'GET /health') {
    return sendJson(res, 200, { ok: true, service: 'nh-ai-hub-knowledge-gateway', timestamp: new Date().toISOString() });
  }

  if (route === 'POST /nodes') {
    return handleCreateNode(req, res);
  }

  if (route === 'POST /nodes/search') {
    return handleSearchNodes(req, res);
  }

  if (route === 'POST /edges') {
    return handleCreateEdge(req, res);
  }

  if (route === 'POST /webhook/knowledge') {
    return knowledgeWebhookGateway(req, res);
  }

  return sendJson(res, 404, { error: `알 수 없는 엔드포인트입니다: ${route}` });
}


/* ─────────────────────────────────────────────────────────────────────────────
   서버 기동
───────────────────────────────────────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  try {
    await router(req, res);
  } catch (uncaught) {
    console.error('[gateway] 처리되지 않은 예외:', uncaught);
    if (!res.headersSent) {
      sendJson(res, 500, { error: '서버 내부 오류가 발생했습니다.' });
    }
  }
});

server.listen(PORT, () => {
  console.log(`[gateway] NH AI Hub 지식 그래프 게이트웨이 기동: http://localhost:${PORT}`);
  console.log(`[gateway] 등록된 엔드포인트:`);
  console.log(`           GET  /health`);
  console.log(`           POST /nodes`);
  console.log(`           POST /nodes/search`);
  console.log(`           POST /edges`);
  console.log(`           POST /webhook/knowledge  ← knowledgeWebhookGateway`);
});

server.on('error', (err) => {
  console.error('[gateway] 서버 오류:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('[gateway] SIGTERM 수신 — 서버를 정상 종료합니다.');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[gateway] SIGINT 수신 — 서버를 정상 종료합니다.');
  server.close(() => process.exit(0));
});


/* ─────────────────────────────────────────────────────────────────────────────
   모듈 익스포트 (테스트 환경 또는 상위 오케스트레이터 연동용)
───────────────────────────────────────────────────────────────────────────── */

module.exports = {
  handleCreateNode,
  handleSearchNodes,
  handleCreateEdge,
  knowledgeWebhookGateway,
  deleteExistingChunks,
  insertChunkNodes,
};
