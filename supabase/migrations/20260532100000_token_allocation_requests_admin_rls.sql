-- token_allocation_requests 관리자 RLS — role=admin 포함 (current_user_is_admin)

DROP POLICY IF EXISTS token_allocation_requests_select_admin ON public.token_allocation_requests;
CREATE POLICY token_allocation_requests_select_admin
  ON public.token_allocation_requests
  FOR SELECT
  TO authenticated
  USING (public.current_user_is_admin());

DROP POLICY IF EXISTS token_allocation_requests_update_admin ON public.token_allocation_requests;
CREATE POLICY token_allocation_requests_update_admin
  ON public.token_allocation_requests
  FOR UPDATE
  TO authenticated
  USING (public.current_user_is_admin())
  WITH CHECK (public.current_user_is_admin());
