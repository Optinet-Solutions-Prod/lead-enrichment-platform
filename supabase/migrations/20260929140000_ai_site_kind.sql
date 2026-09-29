-- ============================================================================
-- AI analysis goes multi-vertical (2026-09-29): the judges infer the market
-- from the keyword instead of assuming online casino, and the audit now says
-- WHAT a site is — an affiliate, the brand's own site (operator), a
-- publisher, or something else — next to the affiliate boolean.
-- ============================================================================
alter table public.website_profiles
  add column if not exists ai_site_kind text
    check (ai_site_kind in ('affiliate', 'operator', 'publisher', 'other')),
  add column if not exists ai_market text;

-- The owner added OPENAI_API_KEY to the deployment: switch the stage on.
insert into public.system_settings (key, value) values ('ai_analysis_enabled', 'true'::jsonb)
on conflict (key) do update set value = 'true'::jsonb, updated_at = now();

-- Never keep an API key here — every signed-in user can read this table.
delete from public.system_settings where key = 'openai_api_key';

notify pgrst, 'reload schema';
