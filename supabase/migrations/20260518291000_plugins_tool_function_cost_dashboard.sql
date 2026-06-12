-- -----------------------------------------------------------------------------
-- [10-2] plugins: tool_function_name · updated_at · endpoint_url 선택 입력 호환
-- -----------------------------------------------------------------------------

ALTER TABLE public.plugins
  ADD COLUMN IF NOT EXISTS tool_function_name text NOT NULL DEFAULT '';

ALTER TABLE public.plugins
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.plugins.tool_function_name IS
  'AI/Edge 에서 참조하는 도구 함수 식별자(예: get_weather).';

COMMENT ON COLUMN public.plugins.updated_at IS '마지막 수정 시각.';

ALTER TABLE public.plugins
  DROP CONSTRAINT IF EXISTS plugins_endpoint_nonempty;

ALTER TABLE public.plugins
  ALTER COLUMN endpoint_url DROP NOT NULL;

ALTER TABLE public.plugins
  ALTER COLUMN endpoint_url SET DEFAULT '';

UPDATE public.plugins
SET endpoint_url = ''
WHERE endpoint_url IS NULL;

CREATE OR REPLACE FUNCTION public.touch_plugins_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plugins_set_updated_at ON public.plugins;
CREATE TRIGGER plugins_set_updated_at
  BEFORE UPDATE ON public.plugins
  FOR EACH ROW
  EXECUTE PROCEDURE public.touch_plugins_updated_at();

UPDATE public.plugins
SET tool_function_name = CASE
  WHEN char_length(trim(tool_function_name)) > 0 THEN tool_function_name
  ELSE 'plugin_' || replace(id::text, '-', '')
END
WHERE char_length(trim(tool_function_name)) = 0;

INSERT INTO public.plugins (
  id,
  name,
  description,
  tool_function_name,
  endpoint_url,
  is_active
)
VALUES
  (
    'a1000000-0000-4000-8000-000000000001'::uuid,
    '날씨 조회',
    '도시/좌표 기반 날씨 조회(테스트용, 비활성 기본)',
    'get_weather',
    '',
    false
  ),
  (
    'a1000000-0000-4000-8000-000000000002'::uuid,
    '환율 조회',
    '통화 쌍 기준 환율 조회(테스트용, 비활성 기본)',
    'get_exchange_rate',
    '',
    false
  )
ON CONFLICT (id) DO NOTHING;
