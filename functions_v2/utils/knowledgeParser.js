/**
 * NH AI Hub — 마크다운 컨텍스트 보존 청킹 및 임베딩 자동화 유틸
 *
 * 역할
 *  1. splitMarkdownContext  : 마크다운 구조(표·코드 블록·헤딩)를 인지하며 청크를 분할합니다.
 *  2. embedChunks           : text-embedding-3-small 모델로 벡터를 생성합니다.
 *  3. parseAndEmbed         : 위 두 단계를 하나의 파이프라인으로 연결한 진입점입니다.
 *
 * 의존성
 *  - Node.js 18+ (fetch 내장)
 *  - 환경변수 OPENAI_API_KEY
 *
 * 경로  functions_v2/utils/knowledgeParser.js
 */

'use strict';

/* ─────────────────────────────────────────────────────────────────────────────
   상수 정의
───────────────────────────────────────────────────────────────────────────── */

const EMBEDDING_MODEL           = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS      = 1536;
const OPENAI_EMBED_ENDPOINT     = 'https://api.openai.com/v1/embeddings';

const DEFAULT_MAX_CHARS         = 1800;   // 1개 청크의 최대 글자 수 (토큰 과금 완충)
const DEFAULT_OVERLAP_CHARS     = 150;    // 인접 청크 간 중첩 글자 수 (문맥 연속성 보장)
const MIN_EMBED_CHARS           = 10;     // 이 값 미만의 텍스트는 임베딩 요청에서 제외
const EMBED_BATCH_SIZE          = 96;     // 1회 API 호출에 담을 최대 텍스트 수
const RETRY_MAX                 = 3;      // API 실패 시 최대 재시도 횟수
const RETRY_BASE_DELAY_MS       = 600;    // 재시도 초기 대기 시간 (지수 백오프 기준)


/* ─────────────────────────────────────────────────────────────────────────────
   내부 유틸리티
───────────────────────────────────────────────────────────────────────────── */

/**
 * 줄 단위로 현재 줄이 마크다운 표의 일부인지 판별합니다.
 * 표 구분선(| --- |)과 일반 셀 행 모두 true를 반환합니다.
 *
 * @param {string} line - 검사할 단일 줄 문자열
 * @returns {boolean}
 */
function isTableRow(line) {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|');
}

/**
 * 줄 단위로 펜스 코드 블록 시작/종료 마커(```` ``` ````)인지 판별합니다.
 * 3개 이상의 백틱으로 시작하면 마커로 간주합니다.
 *
 * @param {string} line - 검사할 단일 줄 문자열
 * @returns {boolean}
 */
function isFenceMarker(line) {
  return /^```/.test(line.trim());
}

/**
 * 줄 단위로 ATX 헤딩(`# ~ ######`) 여부를 판별합니다.
 *
 * @param {string} line - 검사할 단일 줄 문자열
 * @returns {boolean}
 */
function isHeading(line) {
  return /^#{1,6}\s/.test(line.trim());
}

/**
 * 재시도 가능한 지수 백오프 대기를 수행합니다.
 *
 * @param {number} attempt - 현재 재시도 횟수 (0-indexed)
 * @returns {Promise<void>}
 */
async function backoff(attempt) {
  const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
  await new Promise((resolve) => setTimeout(resolve, delay));
}

/**
 * 청크 텍스트를 정규화합니다.
 * 앞뒤 공백·줄바꿈을 제거하고 연속 빈 줄(3개 이상)을 2개로 축약합니다.
 *
 * @param {string} text - 원본 텍스트
 * @returns {string}
 */
function normalizeChunk(text) {
  return text.trim().replace(/\n{3,}/g, '\n\n');
}


/* ─────────────────────────────────────────────────────────────────────────────
   마크다운 블록 단위 분리 (1단계)
   — 표·코드 블록·빈 줄 경계를 기준으로 원자적 블록 배열을 만듭니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * 마크다운 텍스트를 "원자적 블록(atomic block)" 배열로 분해합니다.
 *
 * 원자적 블록이란:
 *  - 펜스 코드 블록 전체 (``` 시작부터 ``` 끝까지)
 *  - 연속된 표 행 전체 (| ... | 행이 이어지는 구간)
 *  - 헤딩 단독 줄
 *  - 그 외 연속된 일반 텍스트 단락 (빈 줄로 구분)
 *
 * 한 블록은 절대 중간에 잘리지 않으며, 이후 청크 조합 단계에서 통째로 처리됩니다.
 *
 * @param {string} markdown - 분해할 원본 마크다운 문자열
 * @returns {string[]} 원자적 블록 배열
 */
function splitIntoAtomicBlocks(markdown) {
  const lines       = markdown.split('\n');
  const blocks      = [];
  let buffer        = [];
  let insideFence   = false;
  let insideTable   = false;

  const flushBuffer = () => {
    const text = normalizeChunk(buffer.join('\n'));
    if (text.length > 0) {
      blocks.push(text);
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isFenceMarker(line)) {
      if (!insideFence) {
        if (insideTable) {
          flushBuffer();
          insideTable = false;
        } else if (buffer.length > 0 && !buffer.every((l) => l.trim() === '')) {
          flushBuffer();
        } else {
          buffer = [];
        }
        insideFence = true;
      } else {
        buffer.push(line);
        flushBuffer();
        insideFence = false;
      }
      if (insideFence) {
        buffer.push(line);
      }
      continue;
    }

    if (insideFence) {
      buffer.push(line);
      continue;
    }

    const currentIsTableRow = isTableRow(line);

    if (currentIsTableRow) {
      if (!insideTable) {
        if (buffer.length > 0 && !buffer.every((l) => l.trim() === '')) {
          flushBuffer();
        } else {
          buffer = [];
        }
        insideTable = true;
      }
      buffer.push(line);
      continue;
    }

    if (insideTable && !currentIsTableRow) {
      flushBuffer();
      insideTable = false;
    }

    const isBlankLine = line.trim() === '';

    if (isHeading(line)) {
      if (buffer.length > 0 && !buffer.every((l) => l.trim() === '')) {
        flushBuffer();
      } else {
        buffer = [];
      }
      buffer.push(line);
      flushBuffer();
      continue;
    }

    if (isBlankLine) {
      if (buffer.length > 0 && !buffer.every((l) => l.trim() === '')) {
        flushBuffer();
      } else {
        buffer = [];
      }
      continue;
    }

    buffer.push(line);
  }

  if (buffer.length > 0) {
    flushBuffer();
  }

  return blocks.filter((b) => b.length > 0);
}


/* ─────────────────────────────────────────────────────────────────────────────
   청크 조합 (2단계)
   — 원자적 블록을 MAX_CHARS 이내에서 최대한 병합하여 청크 배열을 생성합니다.
   — 코드 블록이나 표가 MAX_CHARS를 단독으로 초과할 경우 강제 단순 분할합니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * 단일 원자적 블록이 maxChars를 초과할 때 강제로 단순 분할합니다.
 * 코드 블록 내부라도 줄 단위로 분할하되 최대한 코드 블록 경계를 유지합니다.
 *
 * @param {string} block     - 분할할 단일 블록
 * @param {number} maxChars  - 청크 최대 글자 수
 * @returns {string[]}
 */
function splitOversizedBlock(block, maxChars) {
  const parts = [];
  let cursor   = 0;

  while (cursor < block.length) {
    let end = Math.min(cursor + maxChars, block.length);

    if (end < block.length) {
      const newlinePos = block.lastIndexOf('\n', end);
      if (newlinePos > cursor) {
        end = newlinePos;
      }
    }

    const part = normalizeChunk(block.slice(cursor, end));
    if (part.length > 0) {
      parts.push(part);
    }
    cursor = end + 1;
  }

  return parts;
}

/**
 * 원자적 블록 배열을 병합하여 최종 청크 배열을 생성합니다.
 *
 * 병합 규칙:
 *  1. 현재 청크 버퍼에 다음 블록을 추가해도 maxChars 이하이면 병합합니다.
 *  2. 초과하면 현재 버퍼를 청크로 확정하고, 다음 블록부터 새 버퍼를 시작합니다.
 *  3. 단일 블록이 maxChars를 초과하면 splitOversizedBlock으로 강제 분할합니다.
 *  4. 인접 청크 간 overlapChars만큼 이전 청크의 꼬리를 다음 청크 앞에 접두합니다.
 *
 * @param {string[]} atomicBlocks  - splitIntoAtomicBlocks 결과 배열
 * @param {number}   maxChars      - 청크 최대 글자 수
 * @param {number}   overlapChars  - 청크 간 중첩 글자 수
 * @returns {string[]}
 */
function mergeBlocksIntoChunks(atomicBlocks, maxChars, overlapChars) {
  const chunks         = [];
  let currentBuffer    = '';

  const commitBuffer = () => {
    const text = normalizeChunk(currentBuffer);
    if (text.length >= MIN_EMBED_CHARS) {
      chunks.push(text);
    }
    currentBuffer = '';
  };

  const applyOverlap = () => {
    if (overlapChars <= 0 || chunks.length === 0) {
      return '';
    }
    const lastChunk = chunks[chunks.length - 1];
    return lastChunk.slice(-overlapChars);
  };

  for (const block of atomicBlocks) {
    if (block.length > maxChars) {
      if (currentBuffer.length > 0) {
        commitBuffer();
      }
      const oversizedParts = splitOversizedBlock(block, maxChars);
      for (let p = 0; p < oversizedParts.length; p++) {
        const overlap = applyOverlap();
        const part    = p === 0 ? oversizedParts[p] : `${overlap}\n\n${oversizedParts[p]}`;
        chunks.push(normalizeChunk(part));
      }
      continue;
    }

    const separator  = currentBuffer.length > 0 ? '\n\n' : '';
    const candidate  = `${currentBuffer}${separator}${block}`;

    if (candidate.length <= maxChars) {
      currentBuffer = candidate;
    } else {
      if (currentBuffer.length > 0) {
        commitBuffer();
        const overlap = applyOverlap();
        currentBuffer = overlap.length > 0 ? `${overlap}\n\n${block}` : block;
      } else {
        currentBuffer = block;
      }
    }
  }

  if (currentBuffer.length > 0) {
    commitBuffer();
  }

  return chunks;
}


/* ─────────────────────────────────────────────────────────────────────────────
   공개 API — splitMarkdownContext
───────────────────────────────────────────────────────────────────────────── */

/**
 * 마크다운 텍스트를 문맥이 보존된 청크 배열로 분할합니다.
 *
 * 특징:
 *  - 코드 블록(```)과 마크다운 표(|)는 절대 중간에 잘리지 않습니다.
 *  - 헤딩은 독립 블록으로 분리된 뒤 다음 단락과 자연스럽게 병합됩니다.
 *  - overlapChars로 청크 경계의 문맥 단절을 최소화합니다.
 *  - MIN_EMBED_CHARS 미만 청크는 결과 배열에서 자동 제거됩니다.
 *
 * @param {string} markdown                   - 파싱할 마크다운 원문
 * @param {object} [options]
 * @param {number} [options.maxChars=1800]    - 청크 최대 글자 수
 * @param {number} [options.overlapChars=150] - 청크 간 중첩 글자 수
 * @returns {string[]} 청크 텍스트 배열
 */
function splitMarkdownContext(markdown, options = {}) {
  if (typeof markdown !== 'string' || markdown.trim().length === 0) {
    return [];
  }

  const maxChars     = typeof options.maxChars     === 'number' ? Math.max(options.maxChars,     100) : DEFAULT_MAX_CHARS;
  const overlapChars = typeof options.overlapChars === 'number' ? Math.max(options.overlapChars, 0)   : DEFAULT_OVERLAP_CHARS;

  const atomicBlocks = splitIntoAtomicBlocks(markdown);
  const chunks       = mergeBlocksIntoChunks(atomicBlocks, maxChars, overlapChars);

  return chunks;
}


/* ─────────────────────────────────────────────────────────────────────────────
   공개 API — embedChunks
   — text-embedding-3-small 모델로 청크 배열을 벡터 배열로 변환합니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * OpenAI Embeddings API를 호출하여 텍스트 배열을 벡터 배열로 변환합니다.
 *
 * 과금 방어 규칙:
 *  - MIN_EMBED_CHARS(10자) 미만 텍스트는 API 호출 없이 원천 스킵합니다.
 *  - EMBED_BATCH_SIZE(96개) 단위로 배치 분할하여 단일 요청 용량 초과를 방지합니다.
 *
 * 안정성 규칙:
 *  - RETRY_MAX(3회) 재시도 + 지수 백오프로 일시적 API 오류를 자가 복구합니다.
 *  - 배치 내 일부 실패 시 해당 배치 전체를 null 벡터로 채워 파이프라인 중단을 막습니다.
 *
 * @param {string[]} chunks        - 임베딩할 텍스트 청크 배열
 * @param {string}   apiKey        - OpenAI API 키
 * @param {object}   [options]
 * @param {Function} [options.onBatchProgress] - 배치 완료 콜백 (batchIndex, totalBatches) => void
 * @returns {Promise<Array<number[]|null>>} 각 청크에 대응하는 벡터 배열 (실패 항목은 null)
 */
async function embedChunks(chunks, apiKey, options = {}) {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return [];
  }
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('[knowledgeParser] OPENAI_API_KEY 가 제공되지 않았습니다.');
  }

  const key              = apiKey.trim();
  const onBatchProgress  = typeof options.onBatchProgress === 'function' ? options.onBatchProgress : null;

  const filteredIndices  = [];
  const textsToEmbed     = [];

  for (let i = 0; i < chunks.length; i++) {
    const text = typeof chunks[i] === 'string' ? chunks[i].trim() : '';
    if (text.length >= MIN_EMBED_CHARS) {
      filteredIndices.push(i);
      textsToEmbed.push(text);
    }
  }

  const resultVectors = new Array(chunks.length).fill(null);

  if (textsToEmbed.length === 0) {
    return resultVectors;
  }

  const totalBatches = Math.ceil(textsToEmbed.length / EMBED_BATCH_SIZE);

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const batchStart  = batchIndex * EMBED_BATCH_SIZE;
    const batchEnd    = Math.min(batchStart + EMBED_BATCH_SIZE, textsToEmbed.length);
    const batchTexts  = textsToEmbed.slice(batchStart, batchEnd);
    const batchOriginalIndices = filteredIndices.slice(batchStart, batchEnd);

    let succeeded = false;

    for (let attempt = 0; attempt < RETRY_MAX; attempt++) {
      try {
        const response = await fetch(OPENAI_EMBED_ENDPOINT, {
          method  : 'POST',
          headers : {
            'Authorization' : `Bearer ${key}`,
            'Content-Type'  : 'application/json',
          },
          body: JSON.stringify({
            model      : EMBEDDING_MODEL,
            input      : batchTexts,
            dimensions : EMBEDDING_DIMENSIONS,
          }),
        });

        if (!response.ok) {
          const errorBody = await response.text();
          if (response.status === 429 && attempt < RETRY_MAX - 1) {
            await backoff(attempt);
            continue;
          }
          throw new Error(
            `[knowledgeParser] OpenAI Embeddings API 오류 (HTTP ${response.status}): ${errorBody}`
          );
        }

        const json = await response.json();

        if (!Array.isArray(json.data) || json.data.length !== batchTexts.length) {
          throw new Error(
            `[knowledgeParser] 응답 벡터 수(${json.data?.length ?? 0})가 요청 수(${batchTexts.length})와 일치하지 않습니다.`
          );
        }

        for (let j = 0; j < json.data.length; j++) {
          const originalIndex          = batchOriginalIndices[j];
          resultVectors[originalIndex] = json.data[j].embedding;
        }

        succeeded = true;
        break;

      } catch (error) {
        if (attempt < RETRY_MAX - 1) {
          await backoff(attempt);
        } else {
          console.error(
            `[knowledgeParser] 배치 ${batchIndex + 1}/${totalBatches} 최종 실패:`,
            error.message
          );
        }
      }
    }

    if (!succeeded) {
      for (const originalIndex of batchOriginalIndices) {
        resultVectors[originalIndex] = null;
      }
    }

    if (onBatchProgress) {
      onBatchProgress(batchIndex + 1, totalBatches);
    }
  }

  return resultVectors;
}


/* ─────────────────────────────────────────────────────────────────────────────
   공개 API — parseAndEmbed
   — 마크다운 텍스트를 받아 청킹과 임베딩을 순차 실행한 뒤
     { chunk, embedding, chunkIndex } 객체 배열을 반환합니다.
───────────────────────────────────────────────────────────────────────────── */

/**
 * 마크다운 원문을 청킹 → 임베딩까지 한 번에 처리하는 통합 진입점입니다.
 *
 * 반환 객체 구조:
 * ```
 * [
 *   {
 *     chunkIndex : number,       -- 0-indexed 청크 순서
 *     chunk      : string,       -- 청크 원문 텍스트
 *     embedding  : number[]|null -- 1536차원 벡터 (임베딩 실패 시 null)
 *   },
 *   ...
 * ]
 * ```
 *
 * @param {string} markdown                    - 파싱할 마크다운 원문
 * @param {string} apiKey                      - OpenAI API 키
 * @param {object} [options]
 * @param {number} [options.maxChars=1800]     - 청크 최대 글자 수
 * @param {number} [options.overlapChars=150]  - 청크 간 중첩 글자 수
 * @param {Function} [options.onBatchProgress] - 임베딩 배치 진행 콜백
 * @returns {Promise<Array<{ chunkIndex: number, chunk: string, embedding: number[]|null }>>}
 */
async function parseAndEmbed(markdown, apiKey, options = {}) {
  const chunks    = splitMarkdownContext(markdown, options);
  const vectors   = await embedChunks(chunks, apiKey, options);

  return chunks.map((chunk, index) => ({
    chunkIndex : index,
    chunk,
    embedding  : vectors[index] ?? null,
  }));
}


/* ─────────────────────────────────────────────────────────────────────────────
   모듈 익스포트
───────────────────────────────────────────────────────────────────────────── */

module.exports = {
  splitMarkdownContext,
  embedChunks,
  parseAndEmbed,
  EMBEDDING_MODEL,
  EMBEDDING_DIMENSIONS,
  MIN_EMBED_CHARS,
  DEFAULT_MAX_CHARS,
  DEFAULT_OVERLAP_CHARS,
  EMBED_BATCH_SIZE,
};
