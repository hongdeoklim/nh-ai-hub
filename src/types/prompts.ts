/** `public.saved_prompts` 행 (Supabase RLS 기준) */
export type SavedPromptRow = {
  id: string
  user_id: string
  title: string
  content: string
  is_public: boolean
  created_at: string
}
