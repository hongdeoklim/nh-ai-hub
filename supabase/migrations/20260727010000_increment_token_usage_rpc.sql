-- 원자적 토큰 사용량 증가 RPC (기획안 Phase 1-1)
-- ai-chat 은 read-modify-write 로 동시 요청 시 갱신 유실이 있었고,
-- dify-chat-proxy 는 이 RPC 를 호출하지만 실제로는 존재하지 않아 항상 폴백만 타고 있었다.

CREATE OR REPLACE FUNCTION public.increment_token_usage(
  target_user_id uuid,
  amount numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.users
  SET current_token_usage = COALESCE(current_token_usage, 0) + GREATEST(amount, 0)
  WHERE id = target_user_id;
$$;

REVOKE ALL ON FUNCTION public.increment_token_usage(uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_token_usage(uuid, numeric) TO service_role;
