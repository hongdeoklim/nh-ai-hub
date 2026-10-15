# Dify 연동 · MCP 도구 계층 점검 (2026-10-15)

코드와 마이그레이션만 읽은 정적 점검이다. 운영 DB·Dify 서버·시크릿에는 접근하지 않았으므로
"DB 확인 필요"로 표시한 항목은 운영 환경에서 한 번 더 확인해야 한다.

---

## 1. Dify 연동

### 1.1 현재 구조

| 경로 | 흐름 | 임베딩 |
|---|---|---|
| 채팅 | 모델 선택에서 "Dify Chat (RAG)"를 고를 때만 `difyBridge.js` → `dify-chat-proxy` → Dify `/v1/chat-messages` | Dify 데이터셋 |
| 자료실 업로드 → Dify | `knowledge-document-upload` → `knowledge_base` → 트리거 `queue_knowledge_sync` → `knowledge_sync_jobs` → `dify-sync-webhook` → Dify `create_by_file` | Dify 쪽 모델 (설정 미확인) |
| Google Drive | `drive-sync-cron`(매일)·`DriveSyncWidget` → `rag-ingest` → `company_documents` | Gemini 768차원 · **Dify 로는 안 감** |
| Dify → 우리 DB | `dify-knowledge-bridge` → `match_documents` / `match_work_cases` | 자체 규격 (Dify 외부 지식 API 와 불일치) |

기본 AI 채팅(`ai-chat`)은 Dify 를 조회하지 않고 자체 pgvector RAG 를 쓴다.
즉 **사내 자료가 세 군데로 나뉘어 있다**: 자료실 본문은 Dify 에만, Drive 문서는 pgvector 에만,
지식 그래프 노드는 Dify 에서 접근할 수 없다.

### 1.2 문제점 (우선순위순)

1. **[치명 · DB 확인 필요] 동기화 예약 작업이 존재하지 않는 형태의 함수를 호출한다**
   - `supabase/migrations/20260724000000_dify_sync_queue_cron.sql:32`,
     `20260624210000_drive_auto_sync_cron.sql:26`, `20260724010000_rag_ingest_cost_savings.sql:34`
   - `extensions.http_post(url:=…, body:=…, headers:=ARRAY[http_header])` 는 pg_net(`net.http_post`)·pgsql-http(`uri`/`content`) 어느 쪽 시그니처와도 맞지 않는다.
   - 맞다면 5분 큐 처리와 Drive 야간 동기화가 매번 실패하고, 시크릿이 설정된 경우 트리거 예외로 `rag-ingest` 저장까지 실패할 수 있다.
   - 수정: `net.http_post(url, body jsonb, headers jsonb)` 로 바꾸고 시크릿은 Vault 에서 읽는다. 먼저 `cron.job_run_details` 에서 실패 기록을 확인한다.
2. **[높음] 회사 문서 상당수가 어디에도 임베딩되지 않는다**
   - 앱이 부르는 `process-document` 함수가 저장소에 없다 (`src/services/notebook/processDocumentClient.ts:17`). 그런데도 성공처럼 처리되어 파일명 노드만 생긴다.
   - HWP/HWPX 원본을 Dify 로 그대로 보내지만 Dify 기본 설정은 HWP 를 읽지 못한다. Drive 동기화는 PDF·DOCX·HWP 를 건너뛴다.
   - 수정: 미사용 상태인 `_shared/notebook-document-parser.ts`(PDF·HWPX 텍스트 추출)로 본문을 뽑아 `create_by_text` 로 보낸다.
3. **[높음] `dify-knowledge-bridge` 가 Dify 외부 지식 API 규격과 다르다**
   - Dify 는 `POST /retrieval` 에 `{knowledge_id, query, retrieval_setting:{top_k, score_threshold}}` 를 보내고 `{records:[{content, score, title, metadata}]}` 를 기대한다. 현재 브릿지는 `{query, limit, type}` → `{success, results}` 이다.
   - 유사도 임계값이 0.7 로 고정이라 앱 내부 검색(0.25 + 하이브리드)보다 결과가 훨씬 적게 나올 가능성이 크다.
   - 수정: `/retrieval` 어댑터를 추가하고 `top_k`·`score_threshold` 를 반영하며 `match_documents_hybrid` 를 쓴다.
4. **[중상] 동기화 큐 동시 처리·중복**: 작업 선점 결과를 확인하지 않아 중복 업로드·고아 문서가 생길 수 있고, `processing` 에 멈춘 작업을 되돌리지 않는다. `FOR UPDATE SKIP LOCKED` 선점과 회수 작업이 필요하다.
5. **[중] 실패가 화면에 드러나지 않는다**: 업로드 접수 즉시 "synced" 로 표시하고 인덱싱 상태를 확인하지 않는다. 동기화 상태를 보여주는 화면이 없다.
   - ✅ 0e4fa6c: AX 대시보드가 `knowledge_base` 건수를 "Dify 동기화됨"으로 표시하던 문구와, 없는 테이블(`knowledge_base_chunks`)로 청크 수를 세던 문제를 고침.
6. **[중] Dify 채팅 클라이언트** — ✅ 0e4fa6c 에서 수정 (배포 불필요, 화면 배포만)
   - 대화 ID 를 넘기지 않아 매 메시지가 새 Dify 대화였음 → 대화별 conversation_id 유지(새로고침 후에도).
   - 스트림 중 오류를 삼켜 빈 답이 성공으로 반환, 토큰 한도 안내 누락, 중단 시 Promise 미종료, 인용 출처 폐기 → 모두 수정.
7. **[중] 보안**: Dify 기본 URL 이 평문 `http` 이고, `dify-dataset-sync` 는 로그인만 하면 누구나 데이터셋에 쓸 수 있다.
8. **[중] Drive 동기화**: 일부 청크 임베딩이 실패해도 해시가 저장돼 이후 영구히 건너뛴다. cron 은 루트 폴더만 최대 100건 보고, 삭제를 반영하지 않는다.

### 1.3 권장 방향

"사내 자료를 임베딩해서 Dify 와 함께 쓴다"는 목표라면 두 방식 중 하나로 **단일화**하는 것이 좋다.

- **A. Dify 가 우리 pgvector 를 조회 (권장)**: 임베딩·권한·부서 필터를 우리 쪽에서 한 번만 관리한다. `dify-knowledge-bridge` 를 외부 지식 API 규격으로 맞추고, 자료실·Drive·노트북 문서를 모두 `rag-ingest` 경로(텍스트 추출 → 청크 → 임베딩)로 모은다.
- **B. 모든 문서를 Dify 데이터셋으로 푸시**: Dify 의 검색·리랭크를 그대로 쓰지만, 앱 내부 RAG 와 이중 관리가 된다.

---

## 2. MCP 도구 계층

### 2.1 현황

| 구성요소 | 상태 |
|---|---|
| `ai-chat/mcp-tools.ts` 코어 12종 (웹 검색, 사내 RAG, 사례, Sheets, Drive, DB 뷰, 웹 페이지 읽기, Univer) | 실제 연동 · 채팅에 도구로 노출 (최대 12단계) |
| 플러그인 브릿지 (Jira·Slack·GitHub·Higgsfield·날씨·AutoCAD) | 실제 연동 · 연결 상태가 `connected` 일 때만 노출 |
| 어시스턴트 01 Gmail · 02 Calendar | 실제 연동 · 라우터 플래그가 켜져 있을 때만 사전 호출 |
| 어시스턴트 03~20 | 외부 호출 없는 스텁 · 노출 안 됨 |
| 외부 MCP 서버 (`_shared/mcp-client.ts`) | 등록된 12종 모두 엔드포인트가 비어 있어 실제 도구 0개 |

### 2.2 문제점 (우선순위순)

1. **[높음] 내부 시크릿 유출**: `dynamic-plugin-tools.ts` 가 `X-NH-Internal-Secret` 을 관리자가 등록한 제3자 URL 에도 보낸다. 이 시크릿 하나로 모든 브릿지와 CAD 게이트웨이를 통과할 수 있다. 우리 함수 URL 일 때만 붙여야 한다.
2. **[높음] Jira·Slack·GitHub·Higgsfield 가 채팅에서 쓰이지 않는다**: 연결 테스트가 내부 시크릿을 보내지 않아 브릿지가 401 → 상태가 `failed` 로 남고, 도구 로딩은 `connected` 만 허용한다.
3. **[높음] 프롬프트 인젝션·무승인 쓰기**: 웹 페이지 원문·메일 제목이 그대로 모델에 들어가고, 사례 덮어쓰기·캘린더·Slack 전송 같은 쓰기 도구에 확인 절차가 없다. AI SDK v6 `needsApproval`, 도구 출력 격리, URL 허용 목록·크기 상한이 필요하다.
4. **[중] `mcp-client.ts` 가 MCP 규격을 따르지 않는다**: `initialize` 핸드셰이크·세션 헤더·페이지네이션·`isError` 처리가 없고, 서버가 다운되면 요청마다 최대 20초씩 기다린다.
5. **[중] 마켓플레이스 MCP 설치 흐름이 동작할 수 없다**: 화면은 `server_url`(대부분 localhost)을 받지만 코드는 `endpoint_url`·HTTPS 만 쓴다.
6. **[중] `read_my_email` 은 항상 실패**: 토큰을 다른 테이블에서 갱신 없이 읽는다.
7. **[중] `providerMetadata` 는 무시된다**: AI SDK v6 입력 옵션은 `providerOptions` 이다. 이름만 바꾸면 o3-mini 출력이 1,000~4,000 토큰으로 잘리고 Gemini 캐시 옵션 형식도 틀려 있으므로, `reasoningEffort` 만 남기고 정리해야 한다.
8. **[중] 권한 검사가 실패 시 열림**: 권한 조회 오류 시 필터를 건너뛰고, DB 조회 도구가 service-role 로 다른 사용자의 토큰 사용량까지 볼 수 있다.
9. **[낮음]** 도구 오류가 스트림에 안 나옴, `allMcpMocks` 플래그 무효, 연동 토큰 평문 저장, 마이그레이션에 프로젝트 ref 하드코딩.

---

## 3. 운영 환경에서 확인할 것

- `cron.job_run_details` 에서 `dify-sync-queue-drain`·Drive 동기화 실패 여부, `extensions.http_post` 존재 여부
- Dify 서버 버전·데이터셋 임베딩 모델·업로드 한도, 채팅 앱에 데이터셋 또는 브릿지가 연결돼 있는지
- `rag_retrieval_logs` 에서 Dify 브릿지 유사도 분포
- 플러그인 연결 테스트가 401 로 끝나는지, 라우터 플래그(`ASSISTANT_ROUTER_ENABLED`, `ASSISTANT_ROUTER_SHADOW_MODE`) 값

필요한 환경 변수(이름만): `DIFY_API_URL` `DIFY_API_KEY` `DIFY_DATASET_API_KEY` `DIFY_DATASET_ID`
`DIFY_DATASET_API_URL` `DIFY_SYNC_WEBHOOK_SECRET` `DIFY_BRIDGE_API_KEY` `DIFY_HUB_SECRET`
`PLUGIN_BRIDGE_INTERNAL_SECRET` `PLUGIN_CREDENTIAL_ENCRYPTION_KEY` `INTEGRATION_CREDENTIALS_SECRET`.
`DIFY_*` 는 README·배포 가이드에 문서화되어 있지 않다.
