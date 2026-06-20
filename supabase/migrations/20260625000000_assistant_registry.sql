-- Central metadata registry for the existing Assistant Edge Functions.
-- This migration does not change the existing chat, routing, workflow, or function paths.

create table if not exists public.assistant_registry (
  id uuid primary key default gen_random_uuid(),
  assistant_id text not null unique,
  name text not null,
  description text,
  category text not null,
  function_name text not null unique,
  status text not null default 'mock'
    check (status in ('mock', 'partial', 'ready', 'deprecated')),
  enabled boolean not null default false,
  default_model text,
  fallback_model text,
  cost_level text not null default 'low'
    check (cost_level in ('low', 'medium', 'high')),
  permission_scopes text[] not null default '{}'::text[],
  task_types text[] not null default '{}'::text[],
  max_execution_ms integer not null default 20000
    check (max_execution_ms between 1000 and 120000),
  sort_order integer not null default 100,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists assistant_registry_enabled_status_idx
  on public.assistant_registry(enabled, status, sort_order);
create index if not exists assistant_registry_category_idx
  on public.assistant_registry(category, enabled);
create index if not exists assistant_registry_task_types_idx
  on public.assistant_registry using gin(task_types);

create or replace function public.set_assistant_registry_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists assistant_registry_set_updated_at on public.assistant_registry;
create trigger assistant_registry_set_updated_at
  before update on public.assistant_registry
  for each row execute function public.set_assistant_registry_updated_at();

alter table public.assistant_registry enable row level security;

drop policy if exists assistant_registry_admin_all on public.assistant_registry;
create policy assistant_registry_admin_all
  on public.assistant_registry
  for all
  to authenticated
  using (public.current_user_is_admin())
  with check (public.current_user_is_admin());

drop policy if exists assistant_registry_user_select_available on public.assistant_registry;
create policy assistant_registry_user_select_available
  on public.assistant_registry
  for select
  to authenticated
  using (enabled = true and status in ('partial', 'ready'));

grant all on public.assistant_registry to service_role;
grant select on public.assistant_registry to authenticated;

insert into public.assistant_registry (
  assistant_id,
  name,
  description,
  category,
  function_name,
  status,
  enabled,
  default_model,
  fallback_model,
  cost_level,
  permission_scopes,
  task_types,
  max_execution_ms,
  sort_order
)
values
  (
    'gmail-assistant', 'Gmail 비서', '안 읽은 메일을 조회하고 요약합니다.',
    'productivity', 'assistant-01-gmail', 'partial', true,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['gmail.readonly'], array['email_summary', 'email_search'], 20000, 10
  ),
  (
    'calendar-assistant', 'Calendar 비서', 'Google Calendar의 예정 일정을 조회합니다.',
    'productivity', 'assistant-02-calendar', 'partial', true,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['calendar.readonly'], array['calendar_lookup', 'schedule_summary'], 20000, 20
  ),
  (
    'notion-assistant', 'Notion 비서', 'Notion 페이지를 검색하고 회의록 페이지를 생성합니다.',
    'knowledge', 'assistant-03-notion', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['notion.read', 'notion.write'], array['notion_search', 'meeting_notes'], 20000, 30
  ),
  (
    'sheets-assistant', 'Sheets 비서', 'Google Sheets 데이터를 읽고 행을 추가합니다.',
    'productivity', 'assistant-04-sheets', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['sheets.read', 'sheets.write'], array['spreadsheet_read', 'spreadsheet_update'], 20000, 40
  ),
  (
    'drive-assistant', 'Drive 비서', 'Google Drive 파일을 검색하고 내용을 읽습니다.',
    'knowledge', 'assistant-05-drive', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['drive.readonly'], array['drive_search', 'document_lookup'], 20000, 50
  ),
  (
    'design-assistant', '디자인 비서', '텍스트 설명으로 배너와 그래픽 이미지를 생성합니다.',
    'creative', 'assistant-06-design', 'mock', false,
    'gemini-2.5-flash', null, 'medium',
    array['image.generate'], array['image_generation', 'design'], 60000, 60
  ),
  (
    'video-assistant', '영상 비서', '대본과 이미지를 영상 렌더링 작업으로 전달합니다.',
    'creative', 'assistant-07-video', 'mock', false,
    'gemini-2.5-flash', null, 'high',
    array['video.generate'], array['video_generation'], 120000, 70
  ),
  (
    'calendly-assistant', 'Calendly 비서', '이벤트 유형을 조회하고 예약 링크를 제공합니다.',
    'productivity', 'assistant-08-calendly', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['calendly.read'], array['meeting_booking'], 20000, 80
  ),
  (
    'research-assistant', '리서치 비서', '공개 웹 자료를 조사하고 출처 기반 보고서를 작성합니다.',
    'research', 'assistant-09-research', 'mock', false,
    'gemini-2.5-flash', 'claude-sonnet-4-6', 'medium',
    array['web.search'], array['web_research', 'report_writing'], 60000, 90
  ),
  (
    'zapier-assistant', 'Zapier 비서', '승인된 Zap 또는 Webhook 자동화를 실행합니다.',
    'automation', 'assistant-10-zapier', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'medium',
    array['zapier.execute'], array['automation'], 30000, 100
  ),
  (
    'ads-assistant', '광고 비서', '광고 계정의 성과 지표를 읽고 분석합니다.',
    'analytics', 'assistant-11-ads', 'mock', false,
    'gemini-2.5-flash', 'claude-sonnet-4-6', 'medium',
    array['ads.readonly'], array['ad_analysis'], 30000, 110
  ),
  (
    'youtube-assistant', 'YouTube 비서', '공개 영상을 검색하고 허용된 자막을 분석합니다.',
    'research', 'assistant-12-youtube', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['youtube.readonly'], array['video_search', 'transcript_analysis'], 30000, 120
  ),
  (
    'notion-ai-assistant', 'Notion AI 비서', '공유된 사내 Notion 문서를 검색해 답변합니다.',
    'knowledge', 'assistant-13-notion-ai', 'mock', false,
    'gemini-2.5-flash', 'claude-sonnet-4-6', 'medium',
    array['notion.read'], array['company_document_qa', 'rag'], 30000, 130
  ),
  (
    'forms-assistant', 'Forms 비서', 'Google Forms 설문을 생성하고 응답을 읽습니다.',
    'productivity', 'assistant-14-forms', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['forms.read', 'forms.write'], array['form_creation', 'form_analysis'], 20000, 140
  ),
  (
    'content-assistant', '콘텐츠 비서', '채널과 독자에 맞는 콘텐츠 초안을 작성합니다.',
    'creative', 'assistant-15-content', 'mock', false,
    'gemini-2.5-flash', 'claude-sonnet-4-6', 'medium',
    array['content.draft'], array['content_writing'], 30000, 150
  ),
  (
    'heygen-assistant', 'HeyGen 비서', '대본을 HeyGen 아바타 영상 작업으로 전달합니다.',
    'creative', 'assistant-16-heygen', 'mock', false,
    'gemini-2.5-flash', null, 'high',
    array['heygen.generate'], array['avatar_video_generation'], 120000, 160
  ),
  (
    'discord-assistant', 'Discord 비서', '허용된 Discord 채널의 메시지를 읽거나 전송합니다.',
    'communication', 'assistant-17-discord', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['discord.read', 'discord.write'], array['team_messaging'], 20000, 170
  ),
  (
    'figma-assistant', 'Figma 비서', 'Figma 파일 구조를 읽고 UI 피드백을 생성합니다.',
    'creative', 'assistant-18-figma', 'mock', false,
    'gemini-2.5-flash', 'claude-sonnet-4-6', 'medium',
    array['figma.readonly'], array['design_review'], 30000, 180
  ),
  (
    'clickup-assistant', 'ClickUp 비서', '허용된 Workspace의 프로젝트와 작업 상태를 조회합니다.',
    'productivity', 'assistant-19-clickup', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['clickup.readonly'], array['project_status', 'task_lookup'], 20000, 190
  ),
  (
    'slack-assistant', 'Slack 비서', '허용된 Slack 채널의 메시지를 읽거나 전송합니다.',
    'communication', 'assistant-20-slack', 'mock', false,
    'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'low',
    array['slack.read', 'slack.write'], array['team_messaging'], 20000, 200
  )
on conflict (assistant_id) do nothing;

comment on table public.assistant_registry is
  'Metadata and policy registry for existing Assistant Edge Functions.';
comment on column public.assistant_registry.function_name is
  'Allow-listed Supabase Edge Function name; never accept a client-provided function name directly.';
comment on column public.assistant_registry.status is
  'Implementation readiness, separate from administrator-controlled enabled state.';
