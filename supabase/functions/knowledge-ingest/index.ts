/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import { handleCorsPreflight, jsonResponse } from "../_shared/cors.ts";

// ---------------------------------------------------------------------------
// 상수
// ---------------------------------------------------------------------------
// 임베딩 일원화: 전사 표준 Gemini gemini-embedding-2 (KG 노드는 1536차원)
// nh_knowledge_nodes.embedding_model 태그는 "gemini-embedding-2@1536"
const EMBEDDING_MODEL = "gemini-embedding-2";
const EMBEDDING_DIMENSIONS = 1536;
const EMBEDDING_MODEL_TAG = `${EMBEDDING_MODEL}@${EMBEDDING_DIMENSIONS}`;
const EMBEDDING_BATCH_SIZE = 96;
const CHUNK_MAX_CHARS = 1800;
const CHUNK_OVERLAP_CHARS = 150;
const INSERT_BATCH_SIZE = 50;
const MIN_CONTENT_LENGTH = 20;
const MIN_CHUNK_LENGTH = 10;
const OPENAI_RETRY_MAX = 3;
const OPENAI_RETRY_BASE_DELAY_MS = 1000;

// ---------------------------------------------------------------------------
// 타입 정의
// ---------------------------------------------------------------------------
type NodeType = "raw_chunk";
type VisibilityType = "public" | "department" | "private";
type RequestType = "INSERT" | "UPDATE";

interface IngestRequestBody {
  type: RequestType;
  title: string;
  content: string;
  source_url?: string;
  source_drive_id?: string;
  source_file_name?: string;
  visibility: VisibilityType;
  department?: string;
  metadata?: Record<string, unknown>;
}

interface KnowledgeNodeInsert {
  title: string;
  slug: string;
  node_type: NodeType;
  visibility: VisibilityType;
  content: string;
  embedding: string; // PostgreSQL vector 형식 문자열 "[x1,x2,...]"
  source_url?: string;
  source_drive_id?: string;
  source_file_name?: string;
  source_chunk_index: number;
  department?: string;
  owner_id: string;
  metadata: Record<string, unknown>;
  embedding_model: string;
  embedded_at: string;
  doc_id: string;    // FK → nh_knowledge_documents.id (NOT NULL)
  chunk_index: number; // NOT NULL
}

// ---------------------------------------------------------------------------
// 유틸리티: 슬러그 생성
// ---------------------------------------------------------------------------
function toSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // 한글·영문·숫자·공백·하이픈만 남기기
    .replace(/[^가-힣a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// 마크다운 청킹 함수
// ---------------------------------------------------------------------------
/**
 * 마크다운 텍스트를 의미 단위로 청킹한다.
 *
 * 규칙:
 * 1. 펜스 코드블록(```)은 절대 중간에 자르지 않는다.
 * 2. 마크다운 표(|로 시작하는 연속된 행)는 절대 중간에 자르지 않는다.
 * 3. 빈 줄(\n\n)을 단락 경계로 사용한다.
 * 4. maxChars 초과 시 가장 가까운 \n 위치에서 분리한다.
 * 5. 10자 미만 청크는 결과에서 제외한다.
 * 6. 인접 청크 간 overlapChars 만큼 앞 청크의 끝을 다음 청크 앞에 붙인다.
 *
 * @param text          원본 마크다운 문자열
 * @param maxChars      청크당 최대 문자 수 (기본값: 1800)
 * @param overlapChars  인접 청크 간 오버랩 문자 수 (기본값: 150)
 * @returns             청크 문자열 배열
 */
function splitMarkdownContext(
  text: string,
  maxChars: number = CHUNK_MAX_CHARS,
  overlapChars: number = CHUNK_OVERLAP_CHARS,
): string[] {
  // 1단계: 텍스트를 "보호 단위"(protected blocks)와 "일반 단락"으로 분리한다.
  //         보호 단위: 펜스 코드블록, 마크다운 표 연속 행
  const protectedBlocks: Array<{ placeholder: string; content: string }> = [];
  let placeholderIndex = 0;

  // 펜스 코드블록 보호 (``` 또는 ~~~)
  let processedText = text.replace(
    /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g,
    (match) => {
      const placeholder = `\x00BLOCK${placeholderIndex++}\x00`;
      protectedBlocks.push({ placeholder, content: match });
      return placeholder;
    },
  );

  // 마크다운 표 보호: | 로 시작하는 연속된 행 블록
  processedText = processedText.replace(
    /((?:^|\n)([ \t]*\|[^\n]*\n?)+)/g,
    (match) => {
      const trimmed = match.trim();
      if (!trimmed) return match;
      const placeholder = `\x00BLOCK${placeholderIndex++}\x00`;
      protectedBlocks.push({ placeholder, content: trimmed });
      return `\n${placeholder}\n`;
    },
  );

  // 2단계: 이중 개행(\n\n)으로 단락 분할
  const rawParagraphs = processedText.split(/\n\n+/);

  // 3단계: 단락을 청크로 조합
  const rawChunks: string[] = [];
  let currentChunk = "";

  for (const paragraph of rawParagraphs) {
    const para = paragraph.trim();
    if (!para) continue;

    // 보호 블록을 포함하는 단락은 무조건 단독 청크로 처리
    const containsProtectedBlock = protectedBlocks.some((b) =>
      para.includes(b.placeholder)
    );

    if (containsProtectedBlock) {
      // 현재 누적된 청크를 먼저 저장
      if (currentChunk.trim().length >= MIN_CHUNK_LENGTH) {
        rawChunks.push(currentChunk.trim());
      }
      currentChunk = "";
      // 보호 블록 단락은 maxChars를 초과해도 분리하지 않음
      rawChunks.push(para);
      continue;
    }

    // 단락 자체가 maxChars를 초과하는 경우: 가장 가까운 \n 위치에서 분리
    if (para.length > maxChars) {
      if (currentChunk.trim().length >= MIN_CHUNK_LENGTH) {
        rawChunks.push(currentChunk.trim());
        currentChunk = "";
      }
      // 긴 단락을 줄 단위로 다시 분리
      const lines = para.split("\n");
      let lineBuf = "";
      for (const line of lines) {
        if ((lineBuf + "\n" + line).length > maxChars && lineBuf.length > 0) {
          if (lineBuf.trim().length >= MIN_CHUNK_LENGTH) {
            rawChunks.push(lineBuf.trim());
          }
          lineBuf = line;
        } else {
          lineBuf = lineBuf ? lineBuf + "\n" + line : line;
        }
      }
      if (lineBuf.trim().length >= MIN_CHUNK_LENGTH) {
        rawChunks.push(lineBuf.trim());
      }
      continue;
    }

    // 현재 청크에 단락을 추가했을 때 maxChars를 초과하는지 확인
    const candidate = currentChunk
      ? currentChunk + "\n\n" + para
      : para;

    if (candidate.length > maxChars && currentChunk.length > 0) {
      // 현재 청크 저장 후 새 청크 시작
      if (currentChunk.trim().length >= MIN_CHUNK_LENGTH) {
        rawChunks.push(currentChunk.trim());
      }
      currentChunk = para;
    } else {
      currentChunk = candidate;
    }
  }

  // 마지막 청크 저장
  if (currentChunk.trim().length >= MIN_CHUNK_LENGTH) {
    rawChunks.push(currentChunk.trim());
  }

  // 4단계: 보호 블록 플레이스홀더를 원본 내용으로 복원
  const restoredChunks = rawChunks.map((chunk) => {
    let restored = chunk;
    for (const block of protectedBlocks) {
      restored = restored.split(block.placeholder).join(block.content);
    }
    return restored;
  });

  // 5단계: 오버랩 적용
  if (overlapChars <= 0 || restoredChunks.length <= 1) {
    return restoredChunks.filter((c) => c.trim().length >= MIN_CHUNK_LENGTH);
  }

  const overlappedChunks: string[] = [restoredChunks[0]];
  for (let i = 1; i < restoredChunks.length; i++) {
    const prev = restoredChunks[i - 1];
    const current = restoredChunks[i];
    // 앞 청크의 마지막 overlapChars 문자를 현재 청크 앞에 붙임
    const overlapText = prev.slice(-overlapChars);
    overlappedChunks.push(overlapText + "\n\n" + current);
  }

  return overlappedChunks.filter((c) => c.trim().length >= MIN_CHUNK_LENGTH);
}

// ---------------------------------------------------------------------------
// Gemini batchEmbedContents 호출 (배치 + 지수 백오프 재시도)
// ---------------------------------------------------------------------------
async function fetchEmbeddings(
  texts: string[],
  apiKey: string,
): Promise<number[][]> {
  const allEmbeddings: number[][] = [];
  const endpoint =
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:batchEmbedContents?key=${
      encodeURIComponent(apiKey)
    }`;

  for (let batchStart = 0; batchStart < texts.length; batchStart += EMBEDDING_BATCH_SIZE) {
    const batchTexts = texts.slice(batchStart, batchStart + EMBEDDING_BATCH_SIZE);

    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt < OPENAI_RETRY_MAX) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: batchTexts.map((text) => ({
            model: `models/${EMBEDDING_MODEL}`,
            content: { parts: [{ text: text.slice(0, 8000) }] },
            outputDimensionality: EMBEDDING_DIMENSIONS,
          })),
        }),
      });

      // 429 Too Many Requests: 지수 백오프 재시도
      if (response.status === 429) {
        const retryAfterHeader = response.headers.get("retry-after");
        const delayMs = retryAfterHeader
          ? parseInt(retryAfterHeader, 10) * 1000
          : OPENAI_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);

        attempt++;
        lastError = new Error(
          `Gemini embed rate limit (429). Retry ${attempt}/${OPENAI_RETRY_MAX} after ${delayMs}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(
          `Gemini Embeddings API error: HTTP ${response.status} - ${errorBody}`,
        );
      }

      const json = await response.json() as {
        embeddings?: Array<{ values?: number[] }>;
      };
      const batchEmbeddings = (json.embeddings ?? []).map((e) => e.values ?? []);
      if (
        batchEmbeddings.length !== batchTexts.length ||
        batchEmbeddings.some((v) => v.length !== EMBEDDING_DIMENSIONS)
      ) {
        throw new Error(
          `Gemini embed 응답 불일치: ${batchEmbeddings.length}/${batchTexts.length}건, 차원 검증 실패`,
        );
      }
      allEmbeddings.push(...batchEmbeddings);
      lastError = null;
      break;
    }

    if (lastError) {
      throw lastError;
    }
  }

  return allEmbeddings;
}

// ---------------------------------------------------------------------------
// 임베딩 배열 → PostgreSQL vector 문자열 변환
// ---------------------------------------------------------------------------
function embeddingToVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

// ---------------------------------------------------------------------------
// Edge Function 메인 핸들러
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request): Promise<Response> => {
  // CORS Preflight 처리
  if (req.method === "OPTIONS") {
    return handleCorsPreflight(req);
  }

  try {

  // POST 요청만 허용
  if (req.method !== "POST") {
    return jsonResponse(
      { error: "Method Not Allowed. Only POST requests are accepted." },
      400,
    );
  }

  // ---------------------------------------------------------------------------
  // 환경변수 동적 로드 (Warm Start 버그 방지)
  // ---------------------------------------------------------------------------
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") ??
    Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY");

  // 환경변수 검증
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !GEMINI_API_KEY) {
    return jsonResponse(
      {
        error:
          "Server configuration error: Missing required environment variables.",
      },
      400,
    );
  }

  // ---------------------------------------------------------------------------
  // 1. Supabase 사용자 인증
  // ---------------------------------------------------------------------------
  const authorizationHeader = req.headers.get("Authorization");
  if (!authorizationHeader) {
    return jsonResponse({ error: "Missing Authorization header." }, 400);
  }

  // 사용자 JWT 검증을 위한 클라이언트 (anon key 역할, Authorization 헤더 전달)
  const userClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    global: {
      headers: { Authorization: authorizationHeader },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data: userData, error: authError } = await userClient.auth.getUser();

  if (authError || !userData?.user) {
    return jsonResponse(
      { error: "Unauthorized: Invalid or expired JWT token." },
      400,
    );
  }

  const userId = userData.user.id;

  // ---------------------------------------------------------------------------
  // 2. 요청 본문 파싱 및 유효성 검사
  // ---------------------------------------------------------------------------
  let body: IngestRequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }

  const {
    type,
    title,
    content,
    source_url,
    source_drive_id,
    source_file_name,
    visibility,
    department,
    metadata = {},
  } = body;

  // 필수 필드 검증
  if (!type || !["INSERT", "UPDATE"].includes(type)) {
    return jsonResponse(
      { error: 'Invalid "type" field. Must be "INSERT" or "UPDATE".' },
      400,
    );
  }
  if (!title || typeof title !== "string" || !title.trim()) {
    return jsonResponse({ error: '"title" is required and must be a non-empty string.' }, 400);
  }
  if (!content || typeof content !== "string") {
    return jsonResponse({ error: '"content" is required and must be a string.' }, 400);
  }
  if (content.trim().length < MIN_CONTENT_LENGTH) {
    return jsonResponse(
      {
        error: `"content" is too short. Minimum ${MIN_CONTENT_LENGTH} characters required.`,
      },
      400,
    );
  }
  if (!visibility || !["public", "department", "private"].includes(visibility)) {
    return jsonResponse(
      {
        error:
          '"visibility" is required and must be one of "public", "department", or "private".',
      },
      400,
    );
  }

  // ---------------------------------------------------------------------------
  // 3. Service Role 클라이언트 생성 (데이터 조작용)
  // ---------------------------------------------------------------------------
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // ---------------------------------------------------------------------------
  // 4. UPDATE 타입 처리: 기존 raw_chunk 노드 삭제
  // ---------------------------------------------------------------------------
  if (type === "UPDATE") {
    // source_url 또는 source_drive_id 중 하나는 있어야 기존 노드 식별 가능
    if (!source_url && !source_drive_id) {
      return jsonResponse(
        {
          error:
            'UPDATE type requires at least one of "source_url" or "source_drive_id" to identify existing nodes.',
        },
        400,
      );
    }

    try {
      // source_url 기준으로 기존 raw_chunk 노드 삭제
      if (source_url) {
        const { error: deleteUrlError } = await serviceClient
          .from("nh_knowledge_nodes")
          .delete()
          .eq("node_type", "raw_chunk")
          .eq("source_url", source_url);

        if (deleteUrlError) {
          return jsonResponse(
            {
              error: `Failed to delete existing nodes by source_url: ${deleteUrlError.message}`,
            },
            400,
          );
        }
      }

      // source_drive_id 기준으로 기존 raw_chunk 노드 삭제
      if (source_drive_id) {
        const { error: deleteDriveError } = await serviceClient
          .from("nh_knowledge_nodes")
          .delete()
          .eq("node_type", "raw_chunk")
          .eq("source_drive_id", source_drive_id);

        if (deleteDriveError) {
          return jsonResponse(
            {
              error: `Failed to delete existing nodes by source_drive_id: ${deleteDriveError.message}`,
            },
            400,
          );
        }
      }
    } catch (err) {
      return jsonResponse(
        {
          error: `Unexpected error during node deletion: ${
            err instanceof Error ? err.message : String(err)
          }`,
        },
        400,
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 5. 마크다운 청킹
  // ---------------------------------------------------------------------------
  const chunks = splitMarkdownContext(content, CHUNK_MAX_CHARS, CHUNK_OVERLAP_CHARS);

  if (chunks.length === 0) {
    return jsonResponse(
      { error: "Content produced no valid chunks after splitting." },
      400,
    );
  }

  // ---------------------------------------------------------------------------
  // 5-b. nh_knowledge_documents 행 확보 → doc_id 취득
  // nh_knowledge_nodes.doc_id 는 NOT NULL FK 이므로, title 기준으로 먼저 조회하고
  // 없으면 INSERT 한다. title unique 제약 없음 → 조회 우선.
  // ---------------------------------------------------------------------------
  let docId: string;
  {
    const { data: existingDoc } = await serviceClient
      .from("nh_knowledge_documents")
      .select("id")
      .eq("title", title)
      .limit(1)
      .maybeSingle();

    if (existingDoc?.id) {
      docId = existingDoc.id;
    } else {
      const { data: newDoc, error: newDocErr } = await serviceClient
        .from("nh_knowledge_documents")
        .insert({ title, raw_content: content.slice(0, 10_000) })
        .select("id")
        .single();

      if (newDocErr || !newDoc) {
        return jsonResponse(
          { error: `nh_knowledge_documents insert failed: ${newDocErr?.message}` },
          400,
        );
      }
      docId = newDoc.id;
    }
  }

  // ---------------------------------------------------------------------------
  // 6. OpenAI 임베딩 생성
  // ---------------------------------------------------------------------------
  let embeddings: number[][];
  try {
    embeddings = await fetchEmbeddings(chunks, GEMINI_API_KEY);
  } catch (err) {
    return jsonResponse(
      {
        error: `Failed to generate embeddings: ${
          err instanceof Error ? err.message : String(err)
        }`,
      },
      400,
    );
  }

  if (embeddings.length !== chunks.length) {
    return jsonResponse(
      {
        error: `Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}.`,
      },
      400,
    );
  }

  // ---------------------------------------------------------------------------
  // 7. 청크 INSERT (50개 단위 배치)
  // ---------------------------------------------------------------------------
  const titleSlug = toSlug(title);
  const embeddedAt = new Date().toISOString();
  const ingestId = crypto.randomUUID().slice(0, 8);
  let chunksCreated = 0;

  for (let batchStart = 0; batchStart < chunks.length; batchStart += INSERT_BATCH_SIZE) {
    const batchChunks = chunks.slice(batchStart, batchStart + INSERT_BATCH_SIZE);
    const batchEmbeddings = embeddings.slice(
      batchStart,
      batchStart + INSERT_BATCH_SIZE,
    );

    const rows: KnowledgeNodeInsert[] = batchChunks.map((chunkContent, localIndex) => {
      const globalIndex = batchStart + localIndex;
      return {
        title: `${title} (chunk ${globalIndex + 1})`,
        slug: `${titleSlug}-${ingestId}-chunk-${globalIndex + 1}`,
        node_type: "raw_chunk",
        visibility,
        content: chunkContent,
        embedding: embeddingToVectorString(batchEmbeddings[localIndex]),
        source_url: source_url,
        source_drive_id: source_drive_id,
        source_file_name: source_file_name,
        source_chunk_index: globalIndex,
        department: department,
        owner_id: userId,
        metadata: {
          ...metadata,
          original_title: title,
          total_chunks: chunks.length,
          chunk_index: globalIndex,
        },
        embedding_model: EMBEDDING_MODEL_TAG,
        embedded_at: embeddedAt,
        doc_id: docId,
        chunk_index: globalIndex,
      };
    });

    const { error: insertError } = await serviceClient
      .from("nh_knowledge_nodes")
      .insert(rows);

    if (insertError) {
      // 이미 생성된 청크 수를 포함하여 오류 반환
      return jsonResponse(
        {
          error: `Failed to insert chunk batch starting at index ${batchStart}: ${insertError.message}`,
          chunks_created_before_error: chunksCreated,
        },
        400,
      );
    }

    chunksCreated += rows.length;
  }

  // ---------------------------------------------------------------------------
  // 8. 성공 응답
  // ---------------------------------------------------------------------------
  return jsonResponse(
    {
      ok: true,
      chunks_created: chunksCreated,
      chunks_embedded: embeddings.length,
      type,
    },
    200,
  );
  } catch (err) {
    return jsonResponse({
      error: `Global Uncaught Exception: ${err instanceof Error ? err.stack : String(err)}`
    }, 400); // 400으로 반환해서 프론트엔드가 500이 아닌 400으로 로깅하게 만듦
  }
});
