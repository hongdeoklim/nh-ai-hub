-- -----------------------------------------------------------------------------
-- ai_models 관리자 upsert RPC + RLS/GRANT 재적용 (403 Forbidden 대응)
-- -----------------------------------------------------------------------------

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users u
    WHERE u.id = auth.uid()
      AND (
        COALESCE(u.is_admin, false) = true
        OR lower(trim(coalesce(u.role, ''))) = 'admin'
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO authenticated;

ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_models_select_active ON public.ai_models;
CREATE POLICY ai_models_select_active
  ON public.ai_models
  FOR SELECT
  TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS ai_models_select_admin ON public.ai_models;
CREATE POLICY ai_models_select_admin
  ON public.ai_models
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS ai_models_insert_admin ON public.ai_models;
CREATE POLICY ai_models_insert_admin
  ON public.ai_models
  FOR INSERT
  TO authenticated
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS ai_models_update_admin ON public.ai_models;
CREATE POLICY ai_models_update_admin
  ON public.ai_models
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS ai_models_delete_admin ON public.ai_models;
CREATE POLICY ai_models_delete_admin
  ON public.ai_models
  FOR DELETE
  TO authenticated
  USING (public.current_user_is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_models TO authenticated;

ALTER TABLE public.ai_models
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS api_id text,
  ADD COLUMN IF NOT EXISTS model_type text DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS hint text,
  ADD COLUMN IF NOT EXISTS cost_info text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_models_api_id_unique'
  ) THEN
    ALTER TABLE public.ai_models
      ADD CONSTRAINT ai_models_api_id_unique UNIQUE (api_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.admin_upsert_ai_models(p_models jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row jsonb;
  v_count integer := 0;
  v_api_id text;
  v_display_name text;
  v_has_model_name boolean;
  v_has_model_id boolean;
  v_has_cost_info boolean;
  v_has_description boolean;
BEGIN
  IF auth.uid() IS NULL OR NOT public.current_user_is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  IF p_models IS NULL OR jsonb_typeof(p_models) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_payload');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_name'
  ) INTO v_has_model_name;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'model_id'
  ) INTO v_has_model_id;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'cost_info'
  ) INTO v_has_cost_info;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ai_models' AND column_name = 'description'
  ) INTO v_has_description;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_models) AS t(value)
  LOOP
    v_api_id := nullif(trim(v_row->>'api_id'), '');
    v_display_name := nullif(trim(v_row->>'display_name'), '');

    IF v_api_id IS NULL OR v_display_name IS NULL THEN
      CONTINUE;
    END IF;

    IF v_has_model_name AND v_has_model_id THEN
      INSERT INTO public.ai_models AS m (
        provider,
        display_name,
        api_id,
        model_type,
        hint,
        is_active,
        sort_order,
        model_name,
        model_id,
        cost_info,
        description
      )
      VALUES (
        coalesce(nullif(trim(v_row->>'provider'), ''), 'google'),
        v_display_name,
        v_api_id,
        coalesce(nullif(trim(v_row->>'model_type'), ''), 'text'),
        nullif(trim(v_row->>'hint'), ''),
        coalesce((v_row->>'is_active')::boolean, true),
        coalesce((v_row->>'sort_order')::integer, 500),
        coalesce(nullif(trim(v_row->>'model_name'), ''), v_display_name),
        coalesce(nullif(trim(v_row->>'model_id'), ''), v_api_id),
        CASE WHEN v_has_cost_info THEN coalesce(nullif(trim(v_row->>'cost_info'), ''), '보통') ELSE NULL END,
        CASE WHEN v_has_description THEN nullif(trim(v_row->>'description'), '') ELSE NULL END
      )
      ON CONFLICT (api_id) DO UPDATE SET
        provider = EXCLUDED.provider,
        display_name = EXCLUDED.display_name,
        model_type = EXCLUDED.model_type,
        hint = EXCLUDED.hint,
        is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order,
        model_name = EXCLUDED.model_name,
        model_id = EXCLUDED.model_id,
        cost_info = CASE WHEN v_has_cost_info THEN EXCLUDED.cost_info ELSE m.cost_info END,
        description = CASE WHEN v_has_description THEN EXCLUDED.description ELSE m.description END,
        updated_at = now();
    ELSE
      INSERT INTO public.ai_models AS m (
        provider,
        display_name,
        api_id,
        model_type,
        hint,
        is_active,
        sort_order,
        cost_info,
        description
      )
      VALUES (
        coalesce(nullif(trim(v_row->>'provider'), ''), 'google'),
        v_display_name,
        v_api_id,
        coalesce(nullif(trim(v_row->>'model_type'), ''), 'text'),
        nullif(trim(v_row->>'hint'), ''),
        coalesce((v_row->>'is_active')::boolean, true),
        coalesce((v_row->>'sort_order')::integer, 500),
        CASE WHEN v_has_cost_info THEN coalesce(nullif(trim(v_row->>'cost_info'), ''), '보통') ELSE NULL END,
        CASE WHEN v_has_description THEN nullif(trim(v_row->>'description'), '') ELSE NULL END
      )
      ON CONFLICT (api_id) DO UPDATE SET
        provider = EXCLUDED.provider,
        display_name = EXCLUDED.display_name,
        model_type = EXCLUDED.model_type,
        hint = EXCLUDED.hint,
        is_active = EXCLUDED.is_active,
        sort_order = EXCLUDED.sort_order,
        cost_info = CASE WHEN v_has_cost_info THEN EXCLUDED.cost_info ELSE m.cost_info END,
        description = CASE WHEN v_has_description THEN EXCLUDED.description ELSE m.description END,
        updated_at = now();
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'upserted', v_count);
END;
$$;

COMMENT ON FUNCTION public.admin_upsert_ai_models(jsonb) IS
  '관리자 AI 모델 카탈로그 일괄 upsert (api_id 기준). RLS 우회 SECURITY DEFINER.';

GRANT EXECUTE ON FUNCTION public.admin_upsert_ai_models(jsonb) TO authenticated;
