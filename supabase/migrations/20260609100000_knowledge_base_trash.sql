-- -----------------------------------------------------------------------------
-- 사내 자료실(knowledge_base) 안전 휴지통 (Soft Delete) 지원 스키마
-- -----------------------------------------------------------------------------
ALTER TABLE public.knowledge_base ADD COLUMN deleted_at timestamptz DEFAULT NULL;

COMMENT ON COLUMN public.knowledge_base.deleted_at IS '휴지통에 들어간 일시 (Soft Delete 용도, NULL 이면 정상 자료)';

CREATE INDEX knowledge_base_deleted_at_idx ON public.knowledge_base (deleted_at) WHERE deleted_at IS NOT NULL;
