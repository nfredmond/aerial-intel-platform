create table if not exists public.drone_ingest_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  mission_id uuid not null references public.drone_missions(id) on delete cascade,
  dataset_id uuid references public.drone_datasets(id) on delete set null,
  session_label text not null,
  source_type text not null default 'local_zip' check (source_type in ('browser_zip', 'local_zip', 'external_zip')),
  status text not null default 'recorded' check (status in ('recorded', 'zip_received', 'extracted', 'benchmark_complete', 'review_bundle_ready', 'blocked', 'archived')),
  source_filename text,
  source_zip_path text,
  extracted_dataset_path text,
  benchmark_summary_path text,
  run_log_path text,
  review_bundle_zip_path text,
  image_count integer,
  file_size_bytes bigint,
  review_bundle_ready boolean not null default false,
  truthful_pass boolean,
  metadata jsonb not null default '{}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_drone_ingest_sessions_org_id on public.drone_ingest_sessions (org_id);
create index if not exists idx_drone_ingest_sessions_mission_id on public.drone_ingest_sessions (mission_id);
create index if not exists idx_drone_ingest_sessions_dataset_id on public.drone_ingest_sessions (dataset_id);
create index if not exists idx_drone_ingest_sessions_updated_at on public.drone_ingest_sessions (updated_at desc);

alter table public.drone_ingest_sessions
  add constraint uq_drone_ingest_sessions_org_id_id unique (org_id, id);

alter table public.drone_ingest_sessions
  drop constraint if exists drone_ingest_sessions_mission_id_fkey,
  drop constraint if exists drone_ingest_sessions_dataset_id_fkey,
  add constraint drone_ingest_sessions_org_mission_fkey
    foreign key (org_id, mission_id)
    references public.drone_missions (org_id, id)
    on delete cascade,
  add constraint drone_ingest_sessions_org_dataset_fkey
    foreign key (org_id, dataset_id)
    references public.drone_datasets (org_id, id)
    on delete set null;

alter table public.drone_ingest_sessions enable row level security;

create policy "members_can_read_ingest_sessions"
on public.drone_ingest_sessions
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

drop trigger if exists trg_drone_ingest_sessions_updated_at on public.drone_ingest_sessions;
create trigger trg_drone_ingest_sessions_updated_at
before update on public.drone_ingest_sessions
for each row execute function public.set_drone_updated_at();
