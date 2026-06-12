-- -----------------------------------------------------------------------------
-- [27단계] 문서 연관 관계 · 핵심 개체 (지식 그래프)
-- document_id = knowledge_base.id 또는 user_uploaded_documents.id
-- Edge process-document 가 LLM 으로 자동 추출·저장 (service_role)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.document_entities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  source_kind text NOT NULL DEFAULT 'user_upload'
    CHECK (source_kind IN ('knowledge_base', 'user_upload')),
  entity_type text NOT NULL DEFAULT 'keyword',
  entity_value text NOT NULL DEFAULT '',
  confidence double precision NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_entities_pkey PRIMARY KEY (id),
  CONSTRAINT document_entities_value_nonempty CHECK (char_length(trim(entity_value)) > 0)
);

COMMENT ON TABLE public.document_entities IS
  '문서에서 추출한 핵심 개체(키워드·장소·자재 등). 지식 그래프 노드용.';
COMMENT ON COLUMN public.document_entities.entity_type IS
  'keyword, location, material, person, project, date 등';

CREATE INDEX IF NOT EXISTS document_entities_document_id_idx
  ON public.document_entities (document_id);

CREATE INDEX IF NOT EXISTS document_entities_value_idx
  ON public.document_entities (lower(entity_value));

CREATE UNIQUE INDEX IF NOT EXISTS document_entities_doc_type_value_uidx
  ON public.document_entities (document_id, entity_type, lower(entity_value));

-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.document_relations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_doc_id uuid NOT NULL,
  target_doc_id uuid NOT NULL,
  source_kind text NOT NULL DEFAULT 'user_upload'
    CHECK (source_kind IN ('knowledge_base', 'user_upload')),
  target_kind text NOT NULL DEFAULT 'user_upload'
    CHECK (target_kind IN ('knowledge_base', 'user_upload')),
  relation_type text NOT NULL DEFAULT 'related',
  description text NOT NULL DEFAULT '',
  weight double precision NOT NULL DEFAULT 0.5,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT document_relations_pkey PRIMARY KEY (id),
  CONSTRAINT document_relations_no_self CHECK (source_doc_id <> target_doc_id),
  CONSTRAINT document_relations_weight_range CHECK (weight >= 0 AND weight <= 1)
);

COMMENT ON TABLE public.document_relations IS
  '문서 간 연관 관계. process-document Edge LLM 체인이 자동 생성.';
COMMENT ON COLUMN public.document_relations.relation_type IS
  'same_location, same_material, same_project, references, semantic_similarity 등';

CREATE INDEX IF NOT EXISTS document_relations_source_idx
  ON public.document_relations (source_doc_id);

CREATE INDEX IF NOT EXISTS document_relations_target_idx
  ON public.document_relations (target_doc_id);

CREATE UNIQUE INDEX IF NOT EXISTS document_relations_pair_type_uidx
  ON public.document_relations (
    source_doc_id,
    target_doc_id,
    relation_type
  );

-- -----------------------------------------------------------------------------
ALTER TABLE public.document_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_relations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_entities_select_authenticated ON public.document_entities;
CREATE POLICY document_entities_select_authenticated
  ON public.document_entities
  FOR SELECT
  TO authenticated
  USING (
    (source_kind = 'knowledge_base' AND EXISTS (
      SELECT 1 FROM public.knowledge_base kb WHERE kb.id = document_entities.document_id
    ))
    OR (source_kind = 'user_upload' AND EXISTS (
      SELECT 1 FROM public.user_uploaded_documents u
      WHERE u.id = document_entities.document_id AND u.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS document_relations_select_authenticated ON public.document_relations;
CREATE POLICY document_relations_select_authenticated
  ON public.document_relations
  FOR SELECT
  TO authenticated
  USING (
    (source_kind = 'knowledge_base' OR EXISTS (
      SELECT 1 FROM public.user_uploaded_documents u
      WHERE u.id = document_relations.source_doc_id AND u.user_id = auth.uid()
    ))
    OR (target_kind = 'knowledge_base' OR EXISTS (
      SELECT 1 FROM public.user_uploaded_documents u
      WHERE u.id = document_relations.target_doc_id AND u.user_id = auth.uid()
    ))
  );
