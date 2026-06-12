-- =============================================================================
-- NH AI Hub – Knowledge Graph Schema Migration
-- File: 20260605000000_nh_knowledge_graph.sql
-- Description: Full schema for nh_knowledge_nodes, nh_knowledge_edges,
--              synonyms, tags, history, RLS policies, RPC functions, and views.
-- Idempotent: All CREATE statements use IF NOT EXISTS or DO $$ guards.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ---------------------------------------------------------------------------
-- 1. ENUM Types (IF NOT EXISTS pattern via DO $$ block)
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nh_node_type') THEN
    CREATE TYPE nh_node_type AS ENUM (
      'document',
      'raw_chunk',
      'concept',
      'regulation',
      'faq',
      'product',
      'person',
      'organization',
      'process',
      'glossary'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nh_edge_type') THEN
    CREATE TYPE nh_edge_type AS ENUM (
      'backlink',
      'parent_child',
      'sibling',
      'related',
      'derived_from',
      'contradicts',
      'supports',
      'supersedes'
    );
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'nh_visibility') THEN
    CREATE TYPE nh_visibility AS ENUM (
      'public',
      'department',
      'private'
    );
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 2. Core Tables
-- ---------------------------------------------------------------------------

-- 2-1. nh_knowledge_nodes
CREATE TABLE IF NOT EXISTS nh_knowledge_nodes (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT         NOT NULL,
  slug                TEXT         NOT NULL,
  node_type           nh_node_type NOT NULL DEFAULT 'document',
  visibility          nh_visibility NOT NULL DEFAULT 'public',
  content             TEXT         NOT NULL DEFAULT '',
  embedding           VECTOR(1536),
  source_url          TEXT,
  source_drive_id     TEXT,
  source_chunk_index  INTEGER,
  source_file_name    TEXT,
  metadata            JSONB        NOT NULL DEFAULT '{}',
  department          TEXT,
  owner_id            UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  embedding_model     TEXT,
  embedded_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

COMMENT ON TABLE nh_knowledge_nodes IS
  'NH AI Hub 지식 그래프의 노드(문서, 청크, 개념 등)를 저장하는 테이블';

-- 2-2. nh_knowledge_edges
CREATE TABLE IF NOT EXISTS nh_knowledge_edges (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id  UUID          NOT NULL REFERENCES nh_knowledge_nodes(id) ON DELETE CASCADE,
  target_node_id  UUID          NOT NULL REFERENCES nh_knowledge_nodes(id) ON DELETE CASCADE,
  edge_type       nh_edge_type  NOT NULL DEFAULT 'backlink',
  weight          REAL          NOT NULL DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 1),
  anchor_text     TEXT,
  context_snippet TEXT,
  is_auto         BOOLEAN       NOT NULL DEFAULT FALSE,
  owner_id        UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata        JSONB         NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  -- 자기 참조 방지
  CONSTRAINT nh_edges_no_self_loop CHECK (source_node_id <> target_node_id)
);

COMMENT ON TABLE nh_knowledge_edges IS
  'nh_knowledge_nodes 간의 방향성 엣지(관계)를 저장하는 테이블';

-- 2-3. nh_knowledge_synonyms
CREATE TABLE IF NOT EXISTS nh_knowledge_synonyms (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id    UUID        NOT NULL REFERENCES nh_knowledge_nodes(id) ON DELETE CASCADE,
  synonym    TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE nh_knowledge_synonyms IS
  '노드의 동의어/별칭 슬러그를 저장하는 테이블';

-- 2-4. nh_knowledge_node_history
CREATE TABLE IF NOT EXISTS nh_knowledge_node_history (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id        UUID        NOT NULL REFERENCES nh_knowledge_nodes(id) ON DELETE CASCADE,
  changed_by     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  title_before   TEXT,
  content_before TEXT,
  reason         TEXT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE nh_knowledge_node_history IS
  '노드 변경 이력(제목, 내용 변경 전 스냅샷)을 저장하는 테이블';

-- 2-5. nh_knowledge_tags
CREATE TABLE IF NOT EXISTS nh_knowledge_tags (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  color      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE nh_knowledge_tags IS
  '노드에 부착 가능한 태그 마스터 테이블';

-- ---------------------------------------------------------------------------
-- 2-6. 기존 테이블에 누락 컬럼 보완 (멱등성 보장)
--      IF NOT EXISTS 로 테이블이 이미 생성된 경우 누락 컬럼을 추가합니다.
-- ---------------------------------------------------------------------------

ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS title              TEXT NOT NULL DEFAULT '';
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS slug               TEXT;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS node_type          nh_node_type NOT NULL DEFAULT 'document';
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS visibility         nh_visibility NOT NULL DEFAULT 'public';
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS content            TEXT NOT NULL DEFAULT '';
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS embedding          VECTOR(1536);
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS source_url         TEXT;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS source_drive_id    TEXT;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS source_chunk_index INTEGER;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS source_file_name   TEXT;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS metadata           JSONB NOT NULL DEFAULT '{}';
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS department         TEXT;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS owner_id           UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS embedding_model    TEXT;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS embedded_at        TIMESTAMPTZ;
ALTER TABLE nh_knowledge_nodes ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ NOT NULL DEFAULT now();

-- slug 가 NULL 인 기존 행에 기본값 채우기 (신규 테이블이면 행이 없으므로 무해)
UPDATE nh_knowledge_nodes
SET slug = 'node-' || id::text
WHERE slug IS NULL;

-- slug NOT NULL 제약 추가 (이미 있으면 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'nh_knowledge_nodes'
      AND column_name  = 'slug'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE nh_knowledge_nodes ALTER COLUMN slug SET NOT NULL;
  END IF;
END $$;

ALTER TABLE nh_knowledge_edges ADD COLUMN IF NOT EXISTS anchor_text     TEXT;
ALTER TABLE nh_knowledge_edges ADD COLUMN IF NOT EXISTS context_snippet TEXT;
ALTER TABLE nh_knowledge_edges ADD COLUMN IF NOT EXISTS is_auto         BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE nh_knowledge_edges ADD COLUMN IF NOT EXISTS owner_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE nh_knowledge_edges ADD COLUMN IF NOT EXISTS metadata        JSONB NOT NULL DEFAULT '{}';
ALTER TABLE nh_knowledge_edges ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------


-- 3-1. nh_knowledge_nodes 인덱스

-- UNIQUE: (slug, node_type) 조합 유니크
CREATE UNIQUE INDEX IF NOT EXISTS nh_knowledge_nodes_slug_type_uidx
  ON nh_knowledge_nodes (slug, node_type);

-- HNSW 벡터 유사도 인덱스
CREATE INDEX IF NOT EXISTS nh_knowledge_nodes_embedding_hnsw_idx
  ON nh_knowledge_nodes
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);

-- GIN 전문 검색 인덱스
CREATE INDEX IF NOT EXISTS nh_knowledge_nodes_fts_gin_idx
  ON nh_knowledge_nodes
  USING gin (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(content, ''))
  );

-- B-Tree: node_type
CREATE INDEX IF NOT EXISTS nh_knowledge_nodes_node_type_idx
  ON nh_knowledge_nodes (node_type);

-- B-Tree: owner_id
CREATE INDEX IF NOT EXISTS nh_knowledge_nodes_owner_id_idx
  ON nh_knowledge_nodes (owner_id);

-- B-Tree: department
CREATE INDEX IF NOT EXISTS nh_knowledge_nodes_department_idx
  ON nh_knowledge_nodes (department);

-- B-Tree: embedded_at
CREATE INDEX IF NOT EXISTS nh_knowledge_nodes_embedded_at_idx
  ON nh_knowledge_nodes (embedded_at);

-- B-Tree: source_drive_id (NULL 제외)
CREATE INDEX IF NOT EXISTS nh_knowledge_nodes_source_drive_id_idx
  ON nh_knowledge_nodes (source_drive_id)
  WHERE source_drive_id IS NOT NULL;

-- 3-2. nh_knowledge_edges 인덱스

-- UNIQUE: (source_node_id, target_node_id, edge_type)
CREATE UNIQUE INDEX IF NOT EXISTS nh_knowledge_edges_src_tgt_type_uidx
  ON nh_knowledge_edges (source_node_id, target_node_id, edge_type);

-- B-Tree: source_node_id
CREATE INDEX IF NOT EXISTS nh_knowledge_edges_source_node_id_idx
  ON nh_knowledge_edges (source_node_id);

-- B-Tree: target_node_id
CREATE INDEX IF NOT EXISTS nh_knowledge_edges_target_node_id_idx
  ON nh_knowledge_edges (target_node_id);

-- B-Tree: edge_type
CREATE INDEX IF NOT EXISTS nh_knowledge_edges_edge_type_idx
  ON nh_knowledge_edges (edge_type);

-- ---------------------------------------------------------------------------
-- 4. Trigger Functions
-- ---------------------------------------------------------------------------

-- 4-1. updated_at 자동 갱신 함수
CREATE OR REPLACE FUNCTION nh_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 4-2. 노드 변경 이력 자동 기록 함수
CREATE OR REPLACE FUNCTION nh_record_node_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- title 또는 content가 변경된 경우에만 이력 기록
  IF (OLD.title IS DISTINCT FROM NEW.title) OR (OLD.content IS DISTINCT FROM NEW.content) THEN
    INSERT INTO nh_knowledge_node_history (
      node_id,
      changed_by,
      title_before,
      content_before,
      reason
    ) VALUES (
      OLD.id,
      auth.uid(),
      OLD.title,
      OLD.content,
      NULL  -- reason은 애플리케이션 레벨에서 별도 업데이트 가능
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. Triggers
-- ---------------------------------------------------------------------------

-- 5-1. nh_knowledge_nodes updated_at 트리거
DROP TRIGGER IF EXISTS nh_knowledge_nodes_set_updated_at ON nh_knowledge_nodes;
CREATE TRIGGER nh_knowledge_nodes_set_updated_at
  BEFORE UPDATE ON nh_knowledge_nodes
  FOR EACH ROW
  EXECUTE FUNCTION nh_set_updated_at();

-- 5-2. nh_knowledge_edges updated_at 트리거
DROP TRIGGER IF EXISTS nh_knowledge_edges_set_updated_at ON nh_knowledge_edges;
CREATE TRIGGER nh_knowledge_edges_set_updated_at
  BEFORE UPDATE ON nh_knowledge_edges
  FOR EACH ROW
  EXECUTE FUNCTION nh_set_updated_at();

-- 5-3. nh_knowledge_nodes 변경 이력 트리거
DROP TRIGGER IF EXISTS nh_knowledge_nodes_record_history ON nh_knowledge_nodes;
CREATE TRIGGER nh_knowledge_nodes_record_history
  BEFORE UPDATE ON nh_knowledge_nodes
  FOR EACH ROW
  EXECUTE FUNCTION nh_record_node_history();

-- ---------------------------------------------------------------------------
-- 6. Views
-- ---------------------------------------------------------------------------

-- 임베딩 대기 노드 뷰 (embedding이 NULL이거나 embedded_at이 updated_at보다 오래된 경우)
CREATE OR REPLACE VIEW nh_nodes_pending_embedding AS
SELECT
  id,
  title,
  slug,
  node_type,
  content,
  source_url,
  source_drive_id,
  source_file_name,
  department,
  owner_id,
  embedding_model,
  embedded_at,
  updated_at,
  created_at
FROM nh_knowledge_nodes
WHERE
  embedding IS NULL
  OR embedded_at IS NULL
  OR embedded_at < updated_at;

COMMENT ON VIEW nh_nodes_pending_embedding IS
  '임베딩이 아직 생성되지 않았거나 내용 변경 후 재임베딩이 필요한 노드 목록';

-- ---------------------------------------------------------------------------
-- 7. RPC Functions
-- ---------------------------------------------------------------------------

-- 7-1. 벡터 유사도 검색
CREATE OR REPLACE FUNCTION nh_search_similar_nodes(
  query_embedding  VECTOR(1536),
  match_threshold  REAL    DEFAULT 0.7,
  match_count      INTEGER DEFAULT 10,
  filter_node_type nh_node_type DEFAULT NULL,
  filter_dept      TEXT    DEFAULT NULL
)
RETURNS TABLE (
  id              UUID,
  title           TEXT,
  slug            TEXT,
  node_type       nh_node_type,
  visibility      nh_visibility,
  content         TEXT,
  source_url      TEXT,
  source_drive_id TEXT,
  department      TEXT,
  metadata        JSONB,
  similarity      REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    n.id,
    n.title,
    n.slug,
    n.node_type,
    n.visibility,
    n.content,
    n.source_url,
    n.source_drive_id,
    n.department,
    n.metadata,
    (1 - (n.embedding <=> query_embedding))::REAL AS similarity
  FROM nh_knowledge_nodes n
  WHERE
    n.embedding IS NOT NULL
    AND (1 - (n.embedding <=> query_embedding)) >= match_threshold
    AND (filter_node_type IS NULL OR n.node_type = filter_node_type)
    AND (filter_dept IS NULL OR n.department = filter_dept)
    -- RLS 가시성 필터 (함수 호출자의 권한에 따라 추가 필터링은 RLS에 위임)
  ORDER BY n.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION nh_search_similar_nodes IS
  '쿼리 임베딩 벡터와 코사인 유사도를 기준으로 유사한 노드를 검색하는 RPC 함수';

-- 7-2. 백링크 조회 (특정 노드를 가리키는 엣지 목록)
CREATE OR REPLACE FUNCTION nh_get_backlinks(
  p_node_id UUID,
  p_edge_types nh_edge_type[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  edge_id         UUID,
  edge_type       nh_edge_type,
  weight          REAL,
  anchor_text     TEXT,
  context_snippet TEXT,
  is_auto         BOOLEAN,
  source_node_id  UUID,
  source_title    TEXT,
  source_slug     TEXT,
  source_node_type nh_node_type,
  created_at      TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id               AS edge_id,
    e.edge_type,
    e.weight,
    e.anchor_text,
    e.context_snippet,
    e.is_auto,
    sn.id              AS source_node_id,
    sn.title           AS source_title,
    sn.slug            AS source_slug,
    sn.node_type       AS source_node_type,
    e.created_at
  FROM nh_knowledge_edges e
  JOIN nh_knowledge_nodes sn ON sn.id = e.source_node_id
  WHERE
    e.target_node_id = p_node_id
    AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
  ORDER BY e.weight DESC, e.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION nh_get_backlinks IS
  '특정 노드를 target으로 가리키는 백링크(엣지) 목록을 반환하는 RPC 함수';

-- 7-3. 아웃링크 조회 (특정 노드에서 출발하는 엣지 목록)
CREATE OR REPLACE FUNCTION nh_get_outlinks(
  p_node_id UUID,
  p_edge_types nh_edge_type[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  edge_id          UUID,
  edge_type        nh_edge_type,
  weight           REAL,
  anchor_text      TEXT,
  context_snippet  TEXT,
  is_auto          BOOLEAN,
  target_node_id   UUID,
  target_title     TEXT,
  target_slug      TEXT,
  target_node_type nh_node_type,
  created_at       TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id               AS edge_id,
    e.edge_type,
    e.weight,
    e.anchor_text,
    e.context_snippet,
    e.is_auto,
    tn.id              AS target_node_id,
    tn.title           AS target_title,
    tn.slug            AS target_slug,
    tn.node_type       AS target_node_type,
    e.created_at
  FROM nh_knowledge_edges e
  JOIN nh_knowledge_nodes tn ON tn.id = e.target_node_id
  WHERE
    e.source_node_id = p_node_id
    AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
  ORDER BY e.weight DESC, e.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION nh_get_outlinks IS
  '특정 노드에서 출발하는 아웃링크(엣지) 목록을 반환하는 RPC 함수';

-- 7-4. 슬러그 → UUID 해석 (백링크 생성 시 사용)
CREATE OR REPLACE FUNCTION nh_resolve_backlink(
  p_slug TEXT,
  p_node_type nh_node_type DEFAULT NULL
)
RETURNS TABLE (
  node_id   UUID,
  title     TEXT,
  slug      TEXT,
  node_type nh_node_type,
  resolved_via TEXT  -- 'direct' | 'synonym'
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- 1순위: 노드 테이블에서 직접 슬러그 조회
  RETURN QUERY
  SELECT
    n.id        AS node_id,
    n.title,
    n.slug,
    n.node_type,
    'direct'::TEXT AS resolved_via
  FROM nh_knowledge_nodes n
  WHERE
    n.slug = p_slug
    AND (p_node_type IS NULL OR n.node_type = p_node_type)
  LIMIT 1;

  -- 직접 조회 결과가 있으면 반환
  IF FOUND THEN
    RETURN;
  END IF;

  -- 2순위: 동의어 테이블에서 슬러그 조회
  RETURN QUERY
  SELECT
    n.id        AS node_id,
    n.title,
    n.slug,
    n.node_type,
    'synonym'::TEXT AS resolved_via
  FROM nh_knowledge_synonyms s
  JOIN nh_knowledge_nodes n ON n.id = s.node_id
  WHERE
    s.slug = p_slug
    AND (p_node_type IS NULL OR n.node_type = p_node_type)
  LIMIT 1;
END;
$$;

COMMENT ON FUNCTION nh_resolve_backlink IS
  '슬러그 문자열을 노드 UUID로 해석하는 RPC 함수 (직접 슬러그 → 동의어 슬러그 순서로 탐색)';

-- ---------------------------------------------------------------------------
-- 8. Row Level Security
-- ---------------------------------------------------------------------------

-- 8-1. nh_knowledge_nodes RLS
ALTER TABLE nh_knowledge_nodes ENABLE ROW LEVEL SECURITY;

-- public 가시성 노드는 누구나 읽기 가능
DROP POLICY IF EXISTS nh_nodes_public_read ON nh_knowledge_nodes;
CREATE POLICY nh_nodes_public_read
  ON nh_knowledge_nodes
  FOR SELECT
  USING (visibility = 'public');

-- department 가시성 노드는 같은 부서 사용자만 읽기 가능
DROP POLICY IF EXISTS nh_nodes_dept_read ON nh_knowledge_nodes;
CREATE POLICY nh_nodes_dept_read
  ON nh_knowledge_nodes
  FOR SELECT
  USING (
    visibility = 'department'
    AND department IS NOT NULL
    AND department = (
      SELECT raw_user_meta_data->>'department'
      FROM auth.users
      WHERE id = auth.uid()
    )
  );

-- private 가시성 노드는 소유자 본인만 읽기 가능
DROP POLICY IF EXISTS nh_nodes_private_read ON nh_knowledge_nodes;
CREATE POLICY nh_nodes_private_read
  ON nh_knowledge_nodes
  FOR SELECT
  USING (
    visibility = 'private'
    AND owner_id = auth.uid()
  );

-- 소유자는 자신의 노드에 INSERT/UPDATE/DELETE 가능
DROP POLICY IF EXISTS nh_nodes_owner_write ON nh_knowledge_nodes;
CREATE POLICY nh_nodes_owner_write
  ON nh_knowledge_nodes
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 8-2. nh_knowledge_edges RLS
ALTER TABLE nh_knowledge_edges ENABLE ROW LEVEL SECURITY;

-- 엣지 SELECT: 연결된 노드를 볼 수 있는 사용자는 엣지도 볼 수 있음
DROP POLICY IF EXISTS nh_edges_select ON nh_knowledge_edges;
CREATE POLICY nh_edges_select
  ON nh_knowledge_edges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nh_knowledge_nodes n
      WHERE n.id = source_node_id
        AND (
          n.visibility = 'public'
          OR (n.visibility = 'private' AND n.owner_id = auth.uid())
          OR (
            n.visibility = 'department'
            AND n.department = (
              SELECT raw_user_meta_data->>'department'
              FROM auth.users
              WHERE id = auth.uid()
            )
          )
        )
    )
  );

-- 소유자는 자신의 엣지에 INSERT/UPDATE/DELETE 가능
DROP POLICY IF EXISTS nh_edges_owner_write ON nh_knowledge_edges;
CREATE POLICY nh_edges_owner_write
  ON nh_knowledge_edges
  FOR ALL
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- 8-3. nh_knowledge_tags RLS
ALTER TABLE nh_knowledge_tags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nh_tags_public_read ON nh_knowledge_tags;
CREATE POLICY nh_tags_public_read
  ON nh_knowledge_tags
  FOR SELECT
  USING (true);

-- 8-4. nh_knowledge_synonyms RLS
ALTER TABLE nh_knowledge_synonyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nh_synonyms_public_read ON nh_knowledge_synonyms;
CREATE POLICY nh_synonyms_public_read
  ON nh_knowledge_synonyms
  FOR SELECT
  USING (true);

-- 8-5. nh_knowledge_node_history RLS
ALTER TABLE nh_knowledge_node_history ENABLE ROW LEVEL SECURITY;

-- 이력은 소유자 또는 관리자만 조회 가능 (service_role은 RLS 우회)
DROP POLICY IF EXISTS nh_history_owner_read ON nh_knowledge_node_history;
CREATE POLICY nh_history_owner_read
  ON nh_knowledge_node_history
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM nh_knowledge_nodes n
      WHERE n.id = node_id
        AND n.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 9. GRANT Permissions
-- ---------------------------------------------------------------------------

-- service_role: 모든 테이블 및 함수에 전체 권한
GRANT ALL ON TABLE nh_knowledge_nodes        TO service_role;
GRANT ALL ON TABLE nh_knowledge_edges        TO service_role;
GRANT ALL ON TABLE nh_knowledge_synonyms     TO service_role;
GRANT ALL ON TABLE nh_knowledge_node_history TO service_role;
GRANT ALL ON TABLE nh_knowledge_tags         TO service_role;
GRANT ALL ON TABLE nh_nodes_pending_embedding TO service_role;

GRANT EXECUTE ON FUNCTION nh_search_similar_nodes  TO service_role;
GRANT EXECUTE ON FUNCTION nh_get_backlinks         TO service_role;
GRANT EXECUTE ON FUNCTION nh_get_outlinks          TO service_role;
GRANT EXECUTE ON FUNCTION nh_resolve_backlink      TO service_role;

-- authenticated: RLS 정책을 통한 선택적 접근
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE nh_knowledge_nodes        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE nh_knowledge_edges        TO authenticated;
GRANT SELECT                         ON TABLE nh_knowledge_synonyms     TO authenticated;
GRANT SELECT                         ON TABLE nh_knowledge_tags         TO authenticated;
GRANT SELECT                         ON TABLE nh_knowledge_node_history TO authenticated;
GRANT SELECT                         ON TABLE nh_nodes_pending_embedding TO authenticated;

GRANT EXECUTE ON FUNCTION nh_search_similar_nodes  TO authenticated;
GRANT EXECUTE ON FUNCTION nh_get_backlinks         TO authenticated;
GRANT EXECUTE ON FUNCTION nh_get_outlinks          TO authenticated;
GRANT EXECUTE ON FUNCTION nh_resolve_backlink      TO authenticated;

-- anon: public 가시성 데이터 읽기 (RLS 정책에 따라 제한)
GRANT SELECT ON TABLE nh_knowledge_nodes    TO anon;
GRANT SELECT ON TABLE nh_knowledge_edges    TO anon;
GRANT SELECT ON TABLE nh_knowledge_synonyms TO anon;
GRANT SELECT ON TABLE nh_knowledge_tags     TO anon;

GRANT EXECUTE ON FUNCTION nh_search_similar_nodes TO anon;
GRANT EXECUTE ON FUNCTION nh_get_backlinks        TO anon;
GRANT EXECUTE ON FUNCTION nh_get_outlinks         TO anon;
GRANT EXECUTE ON FUNCTION nh_resolve_backlink     TO anon;

-- =============================================================================
-- Migration End
-- =============================================================================
