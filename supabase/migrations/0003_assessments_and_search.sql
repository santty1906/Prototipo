-- =============================================================================
-- Assessments, derived traits, and accent-insensitive search
-- =============================================================================
-- Adds:
--   * accent-insensitive name search AND profile identity matching, both served
--     by one generated column
--   * profile_assessments — the numeric results and prose of one PDF report
--   * source_document_id on the trait tables, so re-processing a document can
--     replace its own derived traits without touching hand-entered ones
--   * apply_document_analysis() — the whole write in a single transaction
-- =============================================================================

create extension if not exists "unaccent";

-- -----------------------------------------------------------------------------
-- immutable_unaccent
-- -----------------------------------------------------------------------------
-- unaccent() is only STABLE, because it depends on a dictionary that could in
-- principle be changed. Generated columns and expression indexes both require
-- IMMUTABLE, so we pin the dictionary explicitly and promise immutability. This
-- is the standard recipe; it is safe as long as nobody redefines the dictionary.
create or replace function public.immutable_unaccent(text)
returns text
language sql
immutable
strict
parallel safe
as $$ select public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- -----------------------------------------------------------------------------
-- profiles.full_name_normalized
-- -----------------------------------------------------------------------------
-- Lower-cased and accent-stripped. Does double duty:
--   1. name search — "Ramirez" has to find "Ramírez"
--   2. identity    — the key used to match a PDF to an existing profile
--
-- LIMITATION (MVP, deliberate): two different people with the same name collapse
-- into one profile. The report carries no email, phone or document number, so
-- there is nothing else to match on. Anything better needs either a second
-- identifier in the source PDF or a human confirmation step.
alter table public.profiles
  add column if not exists full_name_normalized text
  generated always as (public.immutable_unaccent(lower(full_name))) stored;

create index if not exists profiles_full_name_normalized_trgm_idx
  on public.profiles using gin (full_name_normalized gin_trgm_ops);

-- Speeds up the exact-match identity lookup, which is a different access path
-- from the trigram "contains" search above.
create index if not exists profiles_full_name_normalized_idx
  on public.profiles (full_name_normalized);

-- -----------------------------------------------------------------------------
-- profile_assessments
-- -----------------------------------------------------------------------------
-- One row per processed document. `unique (document_id)` is what makes
-- processing idempotent: re-running a document updates its row instead of
-- adding a second one.
create table if not exists public.profile_assessments (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid not null references public.profiles(id)  on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  report_date date,

  -- The four measurement factors. See FACTOR_SOURCE_GRAPH in the TypeScript
  -- layer for which graph these are taken from.
  dominance   integer check (dominance   is null or dominance   between 0 and 100),
  influence   integer check (influence   is null or influence   between 0 and 100),
  steadiness  integer check (steadiness  is null or steadiness  between 0 and 100),
  control     integer check (control     is null or control     between 0 and 100),

  -- Per-graph summary values.
  --   Grafica 1 = ADAPTACION LABORAL
  --   Grafica 2 = CONDUCTA BAJO PRESION
  --   Grafica 3 = IMAGEN PROPIA
  adaptacion_laboral    integer check (adaptacion_laboral    is null or adaptacion_laboral    between 0 and 100),
  conducta_bajo_presion integer check (conducta_bajo_presion is null or conducta_bajo_presion between 0 and 100),
  imagen_propia         integer check (imagen_propia         is null or imagen_propia         between 0 and 100),

  -- The report has 3 graphs x 4 factors = 12 numbers, but the columns above hold
  -- 7. The full matrix is kept here so no measurement is lost and the columns
  -- above can be re-derived if the mapping is ever corrected.
  raw_scores jsonb,

  -- Prose sections, kept so the original analysis survives.
  conductas_observables_1 text,
  conductas_observables_2 text,
  conductas_observables_3 text,
  motivadores             text,
  entorno_laboral_ideal   text,
  otros_comentarios       text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint profile_assessments_document_key unique (document_id)
);

drop trigger if exists profile_assessments_set_updated_at on public.profile_assessments;
create trigger profile_assessments_set_updated_at
  before update on public.profile_assessments
  for each row execute function public.set_updated_at();

create index if not exists profile_assessments_profile_id_idx
  on public.profile_assessments (profile_id, created_at desc);

alter table public.profile_assessments enable row level security;

-- -----------------------------------------------------------------------------
-- Trait provenance
-- -----------------------------------------------------------------------------
-- Without this, "replace the traits for this profile" would also delete traits a
-- person typed in by hand. With it, a re-run deletes only what this document
-- previously produced.
alter table public.profile_capabilities
  add column if not exists source_document_id uuid references public.documents(id) on delete set null;

alter table public.profile_attitudes
  add column if not exists source_document_id uuid references public.documents(id) on delete set null;

create index if not exists profile_capabilities_source_document_idx
  on public.profile_capabilities (source_document_id);

create index if not exists profile_attitudes_source_document_idx
  on public.profile_attitudes (source_document_id);

-- =============================================================================
-- apply_document_analysis
-- =============================================================================
-- Everything the parser produced, written in ONE transaction. A function body is
-- a single transaction in Postgres, so either every table below is updated or
-- none is — there is no partially-processed state to clean up. Doing this from
-- TypeScript would mean five separate round trips with no way to roll back.
--
-- PDF reading and trait extraction stay in TypeScript; this function only
-- writes what it is handed.
create or replace function public.apply_document_analysis(
  p_document_id  uuid,
  p_full_name    text,
  p_report_date  date,
  p_scores       jsonb,   -- { dominance, influence, steadiness, control, adaptacion_laboral, ..., raw }
  p_sections     jsonb,   -- { conductas_observables_1, ..., otros_comentarios }
  p_capabilities jsonb,   -- [ { code, label }, ... ]
  p_attitudes    jsonb    -- [ { code, label }, ... ]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_normalized  text;
  v_profile_id  uuid;
  v_created     boolean := false;
begin
  if p_document_id is null then
    raise exception 'document_id is required';
  end if;
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'full_name is required to identify a profile';
  end if;

  v_normalized := public.immutable_unaccent(lower(btrim(p_full_name)));

  -- Find-or-create. Oldest match wins so repeated processing is stable.
  select id into v_profile_id
  from public.profiles
  where full_name_normalized = v_normalized
  order by created_at asc
  limit 1;

  if v_profile_id is null then
    insert into public.profiles (full_name)
    values (btrim(p_full_name))
    returning id into v_profile_id;
    v_created := true;
  end if;

  -- Upsert keyed on document_id: re-processing updates, never duplicates.
  insert into public.profile_assessments (
    profile_id, document_id, report_date,
    dominance, influence, steadiness, control,
    adaptacion_laboral, conducta_bajo_presion, imagen_propia,
    raw_scores,
    conductas_observables_1, conductas_observables_2, conductas_observables_3,
    motivadores, entorno_laboral_ideal, otros_comentarios
  )
  values (
    v_profile_id, p_document_id, p_report_date,
    nullif(p_scores->>'dominance','')::integer,
    nullif(p_scores->>'influence','')::integer,
    nullif(p_scores->>'steadiness','')::integer,
    nullif(p_scores->>'control','')::integer,
    nullif(p_scores->>'adaptacion_laboral','')::integer,
    nullif(p_scores->>'conducta_bajo_presion','')::integer,
    nullif(p_scores->>'imagen_propia','')::integer,
    p_scores->'raw',
    p_sections->>'conductas_observables_1',
    p_sections->>'conductas_observables_2',
    p_sections->>'conductas_observables_3',
    p_sections->>'motivadores',
    p_sections->>'entorno_laboral_ideal',
    p_sections->>'otros_comentarios'
  )
  on conflict (document_id) do update set
    profile_id              = excluded.profile_id,
    report_date             = excluded.report_date,
    dominance               = excluded.dominance,
    influence               = excluded.influence,
    steadiness              = excluded.steadiness,
    control                 = excluded.control,
    adaptacion_laboral      = excluded.adaptacion_laboral,
    conducta_bajo_presion   = excluded.conducta_bajo_presion,
    imagen_propia           = excluded.imagen_propia,
    raw_scores              = excluded.raw_scores,
    conductas_observables_1 = excluded.conductas_observables_1,
    conductas_observables_2 = excluded.conductas_observables_2,
    conductas_observables_3 = excluded.conductas_observables_3,
    motivadores             = excluded.motivadores,
    entorno_laboral_ideal   = excluded.entorno_laboral_ideal,
    otros_comentarios       = excluded.otros_comentarios;

  -- Replace only the traits this document produced last time. Hand-entered rows
  -- (source_document_id is null) and rows from other documents are untouched.
  delete from public.profile_capabilities
  where profile_id = v_profile_id and source_document_id = p_document_id;

  delete from public.profile_attitudes
  where profile_id = v_profile_id and source_document_id = p_document_id;

  insert into public.profile_capabilities (profile_id, code, label, source_document_id)
  select v_profile_id, item->>'code', item->>'label', p_document_id
  from jsonb_array_elements(coalesce(p_capabilities, '[]'::jsonb)) as item
  where coalesce(item->>'code','') <> ''
  on conflict (profile_id, code) do nothing;

  insert into public.profile_attitudes (profile_id, code, label, source_document_id)
  select v_profile_id, item->>'code', item->>'label', p_document_id
  from jsonb_array_elements(coalesce(p_attitudes, '[]'::jsonb)) as item
  where coalesce(item->>'code','') <> ''
  on conflict (profile_id, code) do nothing;

  update public.documents
  set profile_id        = v_profile_id,
      processing_status = 'COMPLETED',
      processing_error  = null
  where id = p_document_id;

  return jsonb_build_object(
    'profile_id', v_profile_id,
    'profile_created', v_created
  );
end;
$$;
