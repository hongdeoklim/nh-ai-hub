-- The 4 seeded "skill" extensions were disabled in 20260707000000 alongside
-- the other non-functional marketplace seeds, because dynamic-plugin-tools.ts
-- treated every extension_type the same way (HTTP proxy to endpoint_url,
-- which for skills was the placeholder 'builtin://skill'). A proper skill
-- execution path has now been implemented: skill tools no longer use
-- endpoint_url at all — they inject manifest.prompt as a system prompt for a
-- dedicated low-cost model call. Re-enabling them now that they actually work.
update public.plugins
set is_active = true
where plugin_id in (
  'nh.skill.weekly-summary',
  'nh.skill.email-draft',
  'nh.skill.code-review',
  'nh.skill.meeting-minutes'
);
