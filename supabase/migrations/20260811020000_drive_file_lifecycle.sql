-- Phase 2-5: Drive 파일 수명주기 (기획안 E2)
--
-- Drive 동기화 문서의 식별자가 file_name 뿐이라 파일을 삭제하면 벡터가 영구
-- 고아로 남고, 이름을 바꾸면 구/신 두 벌이 동시에 검색되던 문제의 기반 작업.
-- drive_file_id 를 저장해 이름 변경에도 동일 문서로 upsert 되게 하고,
-- 동기화 회차에 없던 file_id 의 청크는 drive-sync-cron 이 정리(tombstone)한다.

ALTER TABLE public.company_documents
  ADD COLUMN IF NOT EXISTS drive_file_id text;

CREATE INDEX IF NOT EXISTS company_documents_drive_file_id_idx
  ON public.company_documents (drive_file_id)
  WHERE drive_file_id IS NOT NULL;

COMMENT ON COLUMN public.company_documents.drive_file_id IS
  'Google Drive fileId — Drive 동기화 문서만 값 존재. 수동 업로드/채팅 지식은 NULL(정리 대상 아님)';
