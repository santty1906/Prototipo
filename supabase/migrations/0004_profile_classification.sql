-- =============================================================================
-- Profile classification: Tipo and Empresa
-- =============================================================================
-- An HR/business classification assigned by a person, stored on the profile
-- itself. This is NOT the DISC classification: DISC is derived from a processed
-- report and lives in profile_assessments, whereas these two are typed in and
-- must work for a profile that has no assessment and no PDF at all.
--
-- Both columns are nullable with no default, so every existing profile stays
-- valid and simply reads as "unassigned" until someone fills the form in.
--
-- text + CHECK rather than a Postgres enum: the company list is a business list
-- that will grow, and widening a CHECK is a one-line migration whereas an enum
-- value cannot be removed at all. The allow-lists are mirrored in
-- src/lib/classification.ts, which is what the app validates against.
-- =============================================================================

alter table public.profiles
  add column if not exists profile_type text,
  add column if not exists company      text;

do $$ begin
  alter table public.profiles
    add constraint profiles_profile_type_check
    check (profile_type is null or profile_type in ('RECRUITMENT', 'CURRENT_EMPLOYEE'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.profiles
    add constraint profiles_company_check
    check (company is null or company in (
      'CGPAN', 'CGCR', 'CGELS', 'CGGUATE', 'CGCOL', 'CGVEN',
      'INGRLJ', 'INGBEM', 'ECAR', 'ADINAAPP',
      'CORPIT/IA', 'CORPPUBLI', 'CORPVENTA', 'CORPCOMPRA', 'CORPRRHH'
    ));
exception when duplicate_object then null; end $$;

-- The Empresa filter is an equality/IN predicate on this column, and NULL rows
-- (unassigned) are never selected by it.
create index if not exists profiles_company_idx
  on public.profiles (company) where company is not null;

create index if not exists profiles_profile_type_idx
  on public.profiles (profile_type) where profile_type is not null;
