-- 1. Add is_liked and is_extracted to chat_messages
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_liked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.chat_messages ADD COLUMN IF NOT EXISTS is_extracted BOOLEAN NOT NULL DEFAULT false;

-- 2. Create function to extract liked messages to company_documents
CREATE OR REPLACE FUNCTION public.cron_extract_liked_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.company_documents (file_name, content, uploaded_by)
    SELECT 
        '지식_추출_' || to_char(now(), 'YYYYMMDD_HH24MISS') || '_' || substr(id::text, 1, 8),
        content,
        author_user_id
    FROM public.chat_messages
    WHERE is_liked = true AND is_extracted = false AND role = 'assistant';

    UPDATE public.chat_messages
    SET is_extracted = true
    WHERE is_liked = true AND is_extracted = false AND role = 'assistant';
END;
$$;

-- 3. Create function to cleanup old chat messages
CREATE OR REPLACE FUNCTION public.cron_cleanup_chat_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.chat_messages
    WHERE created_at < now() - interval '30 days'
      AND is_liked = false;
END;
$$;

-- 4. Enable pg_cron (if not already enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- 5. Schedule cron jobs
-- Runs at 02:00 AM every day
SELECT cron.schedule('extract-liked-messages', '0 2 * * *', 'SELECT public.cron_extract_liked_messages()');
-- Runs at 02:30 AM every day
SELECT cron.schedule('cleanup-chat-messages', '30 2 * * *', 'SELECT public.cron_cleanup_chat_messages()');
