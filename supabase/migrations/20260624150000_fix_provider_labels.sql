-- Fix misleading "NH Internal" provider label.
-- Skills are prompt templates executed by the AI model — no internal server needed.
-- Plugins that call internal systems are relabeled by connection type.

-- ── Skill: provider → 'AI 프롬프트' ─────────────────────────────────────────
-- Skills are pure prompt templates. No external API, no internal server required.
update public.plugins
set provider = 'AI 프롬프트'
where extension_type = 'skill'
  and provider = 'NH Internal';

-- ── Plugin: 사내 시스템 연동형 → '사내 시스템 연동 필요' ────────────────────
-- These plugins call internal ERP/CRM/etc that the company needs to set up.
update public.plugins
set provider = '사내 시스템 연동'
where extension_type = 'plugin'
  and provider = 'NH Internal';
