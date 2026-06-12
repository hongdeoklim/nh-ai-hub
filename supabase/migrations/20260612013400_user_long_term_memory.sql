CREATE TABLE IF NOT EXISTS public.user_long_term_memory (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    memory_type varchar(50) NOT NULL DEFAULT 'preference', -- e.g. preference, fact, style
    content text NOT NULL,
    embedding vector(768) NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT user_long_term_memory_pkey PRIMARY KEY (id)
);

COMMENT ON TABLE public.user_long_term_memory IS '헤르메스 에이전트 장기 기억소 (사용자 취향 및 팩트 저장)';

CREATE INDEX IF NOT EXISTS user_long_term_memory_user_id_idx ON public.user_long_term_memory (user_id);

-- RLS (Row Level Security)
ALTER TABLE public.user_long_term_memory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS long_term_memory_select_own ON public.user_long_term_memory;
CREATE POLICY long_term_memory_select_own
    ON public.user_long_term_memory
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS long_term_memory_delete_own ON public.user_long_term_memory;
CREATE POLICY long_term_memory_delete_own
    ON public.user_long_term_memory
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);
