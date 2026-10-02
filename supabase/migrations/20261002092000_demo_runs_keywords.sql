-- A landing-page demo now searches up to three keywords at once.
alter table public.demo_runs add column if not exists keywords text[];
update public.demo_runs set keywords = array[keyword] where keywords is null;
