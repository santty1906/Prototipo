-- =============================================================================
-- Talent Profile System — MVP schema
-- =============================================================================
-- Four tables:
--   profiles              one candidate / employee
--   documents             PDF metadata (bytes live in Supabase Storage)
--   profile_capabilities  what a person can do   — filterable
--   profile_attitudes     how a person works     — filterable
--
-- Capabilities and attitudes are separate rows (not text[] / jsonb) so that
-- filtering is a plain indexed join instead of an array scan.
-- =============================================================================

create extension if not exists "pg_trgm";

-- Upload/processing lifecycle of one PDF.
--   UPLOADING  row created, bytes not confirmed in Storage yet
--   PENDING    bytes stored, waiting to be processed
--   PROCESSING picked up by extraction (not implemented yet)
--   COMPLETED  processed
--   FAILED     see documents.processing_error
do $$ begin
  create type processing_status as enum
    ('UPLOADING', 'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
exception when duplicate_object then null; end $$;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id               uuid primary key default gen_random_uuid(),
  full_name        text not null,
  email            text,
  phone            text,
  "position"       text,
  department       text,
  education        text,
  experience_years integer check (experience_years is null or experience_years between 0 and 70),
  summary          text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------
-- profile_id is nullable: a PDF can be uploaded before we know whose it is.
create table if not exists public.documents (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid references public.profiles(id) on delete set null,
  file_name         text not null,
  storage_path      text not null unique,
  file_size         bigint check (file_size is null or file_size >= 0),
  mime_type         text,
  processing_status processing_status not null default 'UPLOADING',
  processing_error  text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- profile_capabilities / profile_attitudes
-- -----------------------------------------------------------------------------
-- `code` is the slug filters match on; `label` is what humans read.
create table if not exists public.profile_capabilities (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code       text not null,
  label      text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, code)
);

create table if not exists public.profile_attitudes (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code       text not null,
  label      text not null,
  created_at timestamptz not null default now(),
  unique (profile_id, code)
);

-- =============================================================================
-- Indexes
-- =============================================================================
-- Name search is ILIKE '%x%', which a btree cannot serve — hence trigram.
create index if not exists profiles_full_name_trgm_idx
  on public.profiles using gin (full_name gin_trgm_ops);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

create index if not exists documents_profile_id_idx on public.documents (profile_id);
create index if not exists documents_status_idx
  on public.documents (processing_status, created_at desc);

create index if not exists profile_capabilities_code_idx on public.profile_capabilities (code);
create index if not exists profile_attitudes_code_idx    on public.profile_attitudes (code);

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- MVP posture: deny by default. Nothing is reachable with the anon key; all
-- reads and writes go through the server using the service-role key. When auth
-- is added later this becomes a policy edit, not a schema change.
alter table public.profiles             enable row level security;
alter table public.documents            enable row level security;
alter table public.profile_capabilities enable row level security;
alter table public.profile_attitudes    enable row level security;
