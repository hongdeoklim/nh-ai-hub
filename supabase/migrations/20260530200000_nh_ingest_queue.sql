-- =============================================================================
-- nh_ingest_queue: 자료실 업로드 시 지식 그래프 자동 적재 큐
-- knowledge_base INSERT → 트리거 → 큐 → ingest-worker 엣지 함수 처리
-- =============================================================================

CREATE TABLE IF NOT EXISTS nh_ingest_queue (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_document_id   UUID        NOT NULL REFERENCES knowledge_base(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending',
  retry_count      INTEGER     NOT NULL DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at     TIMESTAMPTZ,
  CONSTRAINT nh_ingest_queue_status_check
    CHECK (status IN ('pending', 'processing', 'done', 'failed'))
);

COMMENT ON TABLE nh_ingest_queue IS
  'knowledge_base 신규 문서를 지식 그래프(nh_knowledge_nodes)에 자동 적재하기 위한 작업 큐';

-- pending 항목 빠른 조회용 인덱스
CREATE INDEX IF NOT EXISTS nh_ingest_queue_pending_idx
  ON nh_ingest_queue (status, created_at)
  WHERE status = 'pending';

-- 문서당 큐 항목 중복 방지
CREATE UNIQUE INDEX IF NOT EXISTS nh_ingest_queue_kb_doc_uidx
  ON nh_ingest_queue (kb_document_id);

-- RLS
ALTER TABLE nh_ingest_queue ENABLE ROW LEVEL SECURITY;

GRANT ALL    ON nh_ingest_queue TO service_role;
GRANT SELECT ON nh_ingest_queue TO authenticated;

DROP POLICY IF EXISTS nh_ingest_queue_service_all  ON nh_ingest_queue;
DROP POLICY IF EXISTS nh_ingest_queue_auth_read    ON nh_ingest_queue;

CREATE POLICY nh_ingest_queue_service_all
  ON nh_ingest_queue TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY nh_ingest_queue_auth_read
  ON nh_ingest_queue FOR SELECT TO authenticated
  USING (true);

-- =============================================================================
-- DB 트리거: knowledge_base INSERT → 큐 자동 추가
-- (soft-delete 복원이 아닌 신규 INSERT 만 처리)
-- =============================================================================

CREATE OR REPLACE FUNCTION nh_auto_enqueue_ingest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.deleted_at IS NULL THEN
    INSERT INTO nh_ingest_queue (kb_document_id)
    VALUES (NEW.id)
    ON CONFLICT (kb_document_id) DO UPDATE
      SET status        = 'pending',
          retry_count   = 0,
          error_message = NULL,
          processed_at  = NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nh_knowledge_base_auto_ingest ON knowledge_base;
CREATE TRIGGER nh_knowledge_base_auto_ingest
  AFTER INSERT ON knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION nh_auto_enqueue_ingest();

-- 기존 knowledge_base 문서도 큐에 추가 (처음 배포 시 backfill)
INSERT INTO nh_ingest_queue (kb_document_id)
SELECT id FROM knowledge_base WHERE deleted_at IS NULL
ON CONFLICT (kb_document_id) DO NOTHING;
