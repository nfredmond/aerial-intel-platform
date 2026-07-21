create extension if not exists postgis;

create table if not exists public.drone_projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  name text not null,
  slug text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  unique (org_id, slug)
);

create table if not exists public.drone_sites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  project_id uuid not null references public.drone_projects(id) on delete cascade,
  name text not null,
  slug text not null,
  description text,
  boundary geometry(MultiPolygon, 4326),
  center geometry(Point, 4326),
  site_notes jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  unique (project_id, slug)
);

create table if not exists public.drone_missions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  project_id uuid not null references public.drone_projects(id) on delete cascade,
  site_id uuid not null references public.drone_sites(id) on delete cascade,
  name text not null,
  slug text not null,
  mission_type text not null,
  status text not null default 'draft' check (status in ('draft', 'planned', 'validated', 'queued', 'flying', 'uploaded', 'processing', 'ready_for_review', 'delivered', 'archived')),
  objective text,
  planning_geometry geometry(MultiPolygon, 4326),
  summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  unique (site_id, slug)
);

create table if not exists public.drone_mission_versions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  mission_id uuid not null references public.drone_missions(id) on delete cascade,
  version_number integer not null,
  source_format text not null default 'native',
  status text not null default 'draft' check (status in ('draft', 'validated', 'approved', 'installed', 'archived')),
  plan_payload jsonb not null default '{}'::jsonb,
  validation_summary jsonb not null default '{}'::jsonb,
  export_summary jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (mission_id, version_number)
);

create table if not exists public.drone_datasets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  project_id uuid not null references public.drone_projects(id) on delete cascade,
  site_id uuid references public.drone_sites(id) on delete set null,
  mission_id uuid references public.drone_missions(id) on delete set null,
  name text not null,
  slug text not null,
  kind text not null check (kind in ('image', 'video', 'thermal', 'multispectral', 'lidar', 'external', 'mission_template')),
  status text not null default 'draft' check (status in ('draft', 'uploading', 'uploaded', 'preflight_flagged', 'ready', 'processing', 'archived')),
  captured_at timestamptz,
  spatial_footprint geometry(Geometry, 4326),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  archived_at timestamptz,
  unique (project_id, slug)
);

create table if not exists public.drone_processing_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  project_id uuid not null references public.drone_projects(id) on delete cascade,
  site_id uuid references public.drone_sites(id) on delete set null,
  mission_id uuid references public.drone_missions(id) on delete set null,
  dataset_id uuid references public.drone_datasets(id) on delete set null,
  engine text not null default 'odm',
  preset_id text,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed', 'canceled', 'needs_review')),
  stage text not null default 'queued',
  progress numeric(5,2) not null default 0 check (progress >= 0 and progress <= 100),
  queue_position integer,
  input_summary jsonb not null default '{}'::jsonb,
  output_summary jsonb not null default '{}'::jsonb,
  external_job_reference text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  started_at timestamptz,
  completed_at timestamptz,
  unique (org_id, external_job_reference)
);

create table if not exists public.drone_processing_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  job_id uuid not null references public.drone_processing_jobs(id) on delete cascade,
  mission_id uuid references public.drone_missions(id) on delete set null,
  dataset_id uuid references public.drone_datasets(id) on delete set null,
  kind text not null check (kind in ('orthomosaic', 'dsm', 'dtm', 'dem', 'point_cloud', 'mesh', 'tiles_3d', 'report', 'install_bundle', 'preview')),
  status text not null default 'pending' check (status in ('pending', 'ready', 'failed', 'archived')),
  storage_bucket text,
  storage_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.drone_processing_job_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  job_id uuid not null references public.drone_processing_jobs(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create or replace function public.set_drone_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_drone_projects_updated_at on public.drone_projects;
create trigger trg_drone_projects_updated_at
before update on public.drone_projects
for each row execute function public.set_drone_updated_at();

drop trigger if exists trg_drone_sites_updated_at on public.drone_sites;
create trigger trg_drone_sites_updated_at
before update on public.drone_sites
for each row execute function public.set_drone_updated_at();

drop trigger if exists trg_drone_missions_updated_at on public.drone_missions;
create trigger trg_drone_missions_updated_at
before update on public.drone_missions
for each row execute function public.set_drone_updated_at();

drop trigger if exists trg_drone_datasets_updated_at on public.drone_datasets;
create trigger trg_drone_datasets_updated_at
before update on public.drone_datasets
for each row execute function public.set_drone_updated_at();

drop trigger if exists trg_drone_processing_jobs_updated_at on public.drone_processing_jobs;
create trigger trg_drone_processing_jobs_updated_at
before update on public.drone_processing_jobs
for each row execute function public.set_drone_updated_at();

drop trigger if exists trg_drone_processing_outputs_updated_at on public.drone_processing_outputs;
create trigger trg_drone_processing_outputs_updated_at
before update on public.drone_processing_outputs
for each row execute function public.set_drone_updated_at();

create index if not exists idx_drone_projects_org_id on public.drone_projects (org_id);
create index if not exists idx_drone_sites_org_id on public.drone_sites (org_id);
create index if not exists idx_drone_sites_project_id on public.drone_sites (project_id);
create index if not exists idx_drone_missions_org_id on public.drone_missions (org_id);
create index if not exists idx_drone_missions_project_id on public.drone_missions (project_id);
create index if not exists idx_drone_missions_site_id on public.drone_missions (site_id);
create index if not exists idx_drone_mission_versions_org_id on public.drone_mission_versions (org_id);
create index if not exists idx_drone_mission_versions_mission_id on public.drone_mission_versions (mission_id);
create index if not exists idx_drone_datasets_org_id on public.drone_datasets (org_id);
create index if not exists idx_drone_datasets_project_id on public.drone_datasets (project_id);
create index if not exists idx_drone_datasets_mission_id on public.drone_datasets (mission_id);
create index if not exists idx_drone_processing_jobs_org_id on public.drone_processing_jobs (org_id);
create index if not exists idx_drone_processing_jobs_dataset_id on public.drone_processing_jobs (dataset_id);
create index if not exists idx_drone_processing_jobs_mission_id on public.drone_processing_jobs (mission_id);
create index if not exists idx_drone_processing_outputs_org_id on public.drone_processing_outputs (org_id);
create index if not exists idx_drone_processing_outputs_job_id on public.drone_processing_outputs (job_id);
create index if not exists idx_drone_processing_outputs_mission_id on public.drone_processing_outputs (mission_id);
create index if not exists idx_drone_processing_job_events_org_id on public.drone_processing_job_events (org_id);
create index if not exists idx_drone_processing_job_events_job_id on public.drone_processing_job_events (job_id);
create index if not exists idx_drone_processing_job_events_created_at on public.drone_processing_job_events (created_at desc);

create index if not exists idx_drone_sites_boundary_gist on public.drone_sites using gist (boundary);
create index if not exists idx_drone_sites_center_gist on public.drone_sites using gist (center);
create index if not exists idx_drone_missions_geometry_gist on public.drone_missions using gist (planning_geometry);
create index if not exists idx_drone_datasets_footprint_gist on public.drone_datasets using gist (spatial_footprint);

alter table public.drone_projects enable row level security;
alter table public.drone_sites enable row level security;
alter table public.drone_missions enable row level security;
alter table public.drone_mission_versions enable row level security;
alter table public.drone_datasets enable row level security;
alter table public.drone_processing_jobs enable row level security;
alter table public.drone_processing_outputs enable row level security;
alter table public.drone_processing_job_events enable row level security;

create policy "members_can_read_projects"
on public.drone_projects
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_sites"
on public.drone_sites
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_missions"
on public.drone_missions
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_mission_versions"
on public.drone_mission_versions
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_datasets"
on public.drone_datasets
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_processing_jobs"
on public.drone_processing_jobs
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_processing_outputs"
on public.drone_processing_outputs
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_processing_job_events"
on public.drone_processing_job_events
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

-- Service-role writes remain the primary path while the data model is being stabilized.
-- Productized write policies can be added once planner/job mutation flows are finalized.
