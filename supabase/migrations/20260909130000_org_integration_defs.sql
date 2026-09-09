-- ============================================================================
-- Custom integration definitions (2026-09-09): org admins can UPLOAD a YAML
-- block to add an integration at runtime — no deploy needed. The repo's
-- lib/integrations/catalog.yaml remains the built-in set; rows here extend
-- it per-org. definition = parsed+validated JSON; raw_yaml kept verbatim so
-- the admin can re-download exactly what they uploaded.
--
-- RLS enabled with NO policies: like org_integrations, all access flows
-- through service-role server actions (definitions may embed header
-- templates etc. — treat like config, not public data).
-- ============================================================================
create table if not exists public.org_integration_defs (
  org_id      uuid not null references public.organizations(id) on delete cascade,
  key         text not null,
  definition  jsonb not null,
  raw_yaml    text not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  updated_at  timestamptz not null default now(),
  primary key (org_id, key)
);
alter table public.org_integration_defs enable row level security;

notify pgrst, 'reload schema';
