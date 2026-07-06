CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS supabase_functions;

GRANT USAGE ON SCHEMA supabase_functions TO postgres;
GRANT USAGE ON SCHEMA supabase_functions TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION supabase_functions.http_request()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
    DECLARE
      request_id bigint;
      payload jsonb;
      url text := TG_ARGV[0]::text;
      method text := TG_ARGV[1]::text;
      headers jsonb := DEFAULT;
      params jsonb := DEFAULT;
      timeout_ms integer := DEFAULT;
    BEGIN
      IF url IS NULL OR url = 'null' THEN
        RAISE EXCEPTION 'url argument is missing';
      END IF;

      IF method IS NULL OR method = 'null' THEN
        RAISE EXCEPTION 'method argument is missing';
      END IF;

      IF TG_ARGV[2] IS NULL OR TG_ARGV[2] = 'null' THEN
        headers := '{"Content-Type": "application/json"}'::jsonb;
      ELSE
        headers := TG_ARGV[2]::jsonb;
      END IF;

      IF TG_ARGV[3] IS NULL OR TG_ARGV[3] = 'null' THEN
        params := '{}'::jsonb;
      ELSE
        params := TG_ARGV[3]::jsonb;
      END IF;

      IF TG_ARGV[4] IS NULL OR TG_ARGV[4] = 'null' THEN
        timeout_ms := 1000;
      ELSE
        timeout_ms := TG_ARGV[4]::integer;
      END IF;

      CASE TG_OP
        WHEN 'INSERT' THEN
          payload := jsonb_build_object(
            'old_record', null,
            'record', row_to_json(NEW),
            'type', 'INSERT',
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA
          );
        WHEN 'UPDATE' THEN
          payload := jsonb_build_object(
            'old_record', row_to_json(OLD),
            'record', row_to_json(NEW),
            'type', 'UPDATE',
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA
          );
        WHEN 'DELETE' THEN
          payload := jsonb_build_object(
            'old_record', row_to_json(OLD),
            'record', null,
            'type', 'DELETE',
            'table', TG_TABLE_NAME,
            'schema', TG_TABLE_SCHEMA
          );
        ELSE
          RAISE EXCEPTION 'Unknown TG_OP: %', TG_OP;
      END CASE;

      SELECT
        net.http_post(
          url:=url,
          body:=payload,
          headers:=headers,
          timeout_milliseconds:=timeout_ms
        )
      INTO request_id;

      RETURN NEW;
    END;
$function$;

-- Create Webhook Trigger directly
DROP TRIGGER IF EXISTS company_documents_dify_sync ON public.company_documents;

CREATE TRIGGER company_documents_dify_sync
  AFTER INSERT
  ON public.company_documents
  FOR EACH ROW
  EXECUTE FUNCTION supabase_functions.http_request(
    'https://wndnjrcljdvbnezfpisb.supabase.co/functions/v1/dify-sync-webhook',
    'POST',
    '{"Content-Type": "application/json"}',
    '{}',
    '5000'
  );
