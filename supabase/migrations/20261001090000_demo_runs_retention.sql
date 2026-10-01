-- Demo runs hold third-party contact details lifted from public pages.
-- Keep them 24 hours (long enough to finish a run and read it), then purge.
-- pg_cron is installed on this project (see release-stale-scrape-locks).

create or replace function public.purge_demo_runs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  delete from public.demo_runs where created_at < now() - interval '24 hours';
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.purge_demo_runs() from public, anon, authenticated;

comment on table public.demo_runs is
  'Landing-page demo runs. Public results incl. contact details scraped from public pages; purged after 24 h by cron job purge-demo-runs (public.purge_demo_runs).';

-- Hourly, idempotent: drop any earlier copy of the job before scheduling.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'purge-demo-runs';
  perform cron.schedule('purge-demo-runs', '23 * * * *', 'select public.purge_demo_runs()');
end;
$$;
