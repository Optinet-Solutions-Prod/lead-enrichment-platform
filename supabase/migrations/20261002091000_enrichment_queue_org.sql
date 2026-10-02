-- Enrichment jobs carry the org of the lead they enrich, so the dashboard's
-- workspace filter applies to queue counts the same way as to jobs and results.
alter table public.enrichment_fetch_queue
  add column if not exists org_id uuid references public.organizations(id) on delete cascade;
create index if not exists enrichment_fetch_queue_org_idx on public.enrichment_fetch_queue (org_id, status);

update public.enrichment_fetch_queue e
   set org_id = l.org_id
  from public.google_lead_gen_table l
 where l.id = e.lead_id and e.org_id is null;

create or replace function public.enrichment_fill_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is null and new.lead_id is not null then
    select org_id into new.org_id from public.google_lead_gen_table where id = new.lead_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enrichment_fill_org on public.enrichment_fetch_queue;
create trigger trg_enrichment_fill_org
  before insert on public.enrichment_fetch_queue
  for each row execute function public.enrichment_fill_org();
