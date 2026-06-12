-- -----------------------------------------------------------------------------
-- admin_upsert_ai_models: model_id/api_id 충돌(409) 대응 — UPDATE 우선 upsert
-- -----------------------------------------------------------------------------

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
  v_existing_id uuid;
  v_has_model_name boolean;
  v_has_model_id boolean;
  v_has_cost_info boolean;
  v_has_description boolean;
  v_provider text;
  v_model_type text;
  v_hint text;
  v_cost_info text;
  v_description text;
  v_is_active boolean;
  v_sort_order integer;
  v_model_name text;
  v_model_id text;
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

    v_provider := coalesce(nullif(trim(v_row->>'provider'), ''), 'google');
    v_model_type := coalesce(nullif(trim(v_row->>'model_type'), ''), 'text');
    v_hint := nullif(trim(v_row->>'hint'), '');
    v_is_active := coalesce((v_row->>'is_active')::boolean, true);
    v_sort_order := coalesce((v_row->>'sort_order')::integer, 500);
    v_model_name := coalesce(nullif(trim(v_row->>'model_name'), ''), v_display_name);
    v_model_id := coalesce(nullif(trim(v_row->>'model_id'), ''), v_api_id);
    v_cost_info := coalesce(nullif(trim(v_row->>'cost_info'), ''), '보통');
    v_description := nullif(trim(v_row->>'description'), '');

    SELECT m.id
    INTO v_existing_id
    FROM public.ai_models AS m
    WHERE (
        m.api_id IS NOT NULL
        AND trim(m.api_id) = v_api_id
      )
      OR (
        v_has_model_id
        AND m.model_id IS NOT NULL
        AND trim(m.model_id) = v_model_id
      )
    ORDER BY m.created_at NULLS LAST
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF v_has_model_name AND v_has_model_id THEN
        UPDATE public.ai_models AS m
        SET
          provider = v_provider,
          display_name = v_display_name,
          api_id = v_api_id,
          model_type = v_model_type,
          hint = v_hint,
          is_active = v_is_active,
          sort_order = v_sort_order,
          model_name = v_model_name,
          model_id = v_model_id,
          cost_info = CASE WHEN v_has_cost_info THEN v_cost_info ELSE m.cost_info END,
          description = CASE WHEN v_has_description THEN v_description ELSE m.description END,
          updated_at = now()
        WHERE m.id = v_existing_id;
      ELSE
        UPDATE public.ai_models AS m
        SET
          provider = v_provider,
          display_name = v_display_name,
          api_id = v_api_id,
          model_type = v_model_type,
          hint = v_hint,
          is_active = v_is_active,
          sort_order = v_sort_order,
          cost_info = CASE WHEN v_has_cost_info THEN v_cost_info ELSE m.cost_info END,
          description = CASE WHEN v_has_description THEN v_description ELSE m.description END,
          updated_at = now()
        WHERE m.id = v_existing_id;
      END IF;
    ELSE
      BEGIN
        IF v_has_model_name AND v_has_model_id THEN
          INSERT INTO public.ai_models (
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
            v_provider,
            v_display_name,
            v_api_id,
            v_model_type,
            v_hint,
            v_is_active,
            v_sort_order,
            v_model_name,
            v_model_id,
            CASE WHEN v_has_cost_info THEN v_cost_info ELSE NULL END,
            CASE WHEN v_has_description THEN v_description ELSE NULL END
          );
        ELSE
          INSERT INTO public.ai_models (
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
            v_provider,
            v_display_name,
            v_api_id,
            v_model_type,
            v_hint,
            v_is_active,
            v_sort_order,
            CASE WHEN v_has_cost_info THEN v_cost_info ELSE NULL END,
            CASE WHEN v_has_description THEN v_description ELSE NULL END
          );
        END IF;
      EXCEPTION
        WHEN unique_violation THEN
          SELECT m.id
          INTO v_existing_id
          FROM public.ai_models AS m
          WHERE (
              m.api_id IS NOT NULL
              AND trim(m.api_id) = v_api_id
            )
            OR (
              v_has_model_id
              AND m.model_id IS NOT NULL
              AND trim(m.model_id) = v_model_id
            )
          LIMIT 1;

          IF v_existing_id IS NULL THEN
            RAISE;
          END IF;

          IF v_has_model_name AND v_has_model_id THEN
            UPDATE public.ai_models AS m
            SET
              provider = v_provider,
              display_name = v_display_name,
              api_id = v_api_id,
              model_type = v_model_type,
              hint = v_hint,
              is_active = v_is_active,
              sort_order = v_sort_order,
              model_name = v_model_name,
              model_id = v_model_id,
              cost_info = CASE WHEN v_has_cost_info THEN v_cost_info ELSE m.cost_info END,
              description = CASE WHEN v_has_description THEN v_description ELSE m.description END,
              updated_at = now()
            WHERE m.id = v_existing_id;
          ELSE
            UPDATE public.ai_models AS m
            SET
              provider = v_provider,
              display_name = v_display_name,
              api_id = v_api_id,
              model_type = v_model_type,
              hint = v_hint,
              is_active = v_is_active,
              sort_order = v_sort_order,
              cost_info = CASE WHEN v_has_cost_info THEN v_cost_info ELSE m.cost_info END,
              description = CASE WHEN v_has_description THEN v_description ELSE m.description END,
              updated_at = now()
            WHERE m.id = v_existing_id;
          END IF;
      END;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'upserted', v_count);
EXCEPTION
  WHEN check_violation THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      'model_type_check_violation: 20260531900000 마이그레이션(video 타입) 적용을 확인하세요.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'ok',
      false,
      'error',
      SQLERRM
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_upsert_ai_models(jsonb) TO authenticated;
