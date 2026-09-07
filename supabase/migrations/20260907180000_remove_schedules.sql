-- ============================================================================
-- Remove the recurring-schedules feature (SaaS line).
--
-- Vercel's Hobby plan only allows daily crons, so the every-minute tick that
-- fired scheduled_keyword_sets can't run — and the feature is Phase 2 at
-- best (no workers exist to run the spawned scrapes). The /schedules UI and
-- the tick's set-firing block are removed in the same commit.
--
-- scrape_queue.scheduled_run_id COLUMN stays (historical rows may reference
-- it); its FK to scheduled_keyword_sets goes with the cascade. One-off
-- scheduling via scrape_queue.scheduled_at is untouched — claim_scrape_job
-- honours it without any cron.
-- ============================================================================

drop function if exists public.toggle_scheduled_item(p_item_id uuid);
drop table if exists public.scheduled_keyword_items cascade;
drop table if exists public.scheduled_keyword_sets cascade;

notify pgrst, 'reload schema';
