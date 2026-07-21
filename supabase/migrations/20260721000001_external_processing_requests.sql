-- External processing requests (natford-aerial-processing.v1).
--
-- A consumer platform (e.g. OpenPlan) POSTs a ProcessingRequest to
-- /api/v1/processing-requests. This table is the idempotency ledger for that
-- endpoint and the callback outbox for the lifecycle callbacks the platform
-- POSTs back to the consumer's callbackUrl. The row is created BEFORE the
-- mission/dataset/job entities so a crash mid-creation is repairable: a retry
-- with the same request_id finds the claimed row and finishes the linkage.
--
-- Service-role only: external requests carry signed consumer URLs and are
-- platform plumbing, not member-visible data. RLS is enabled with no
-- policies, so anon/authenticated clients can neither read nor write.

create table if not exists public.drone_external_processing_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  request_id text not null,
  consumer_system text not null,
  consumer_workspace_id text not null,
  consumer_mission_id text not null,
  consumer_project_id text,
  callback_url text not null,
  imagery_url text not null,
  imagery_image_count integer,
  imagery_size_bytes bigint,
  preset_id text not null default 'balanced'
    check (preset_id in ('fast-preview', 'balanced', 'high-quality')),
  notes text,
  mission_id uuid references public.drone_missions(id) on delete set null,
  dataset_id uuid references public.drone_datasets(id) on delete set null,
  ingest_session_id uuid references public.drone_ingest_sessions(id) on delete set null,
  job_id uuid references public.drone_processing_jobs(id) on delete set null,
  status text not null default 'received'
    check (status in ('received', 'ingesting', 'processing', 'completed', 'failed', 'canceled')),
  ingest_attempts integer not null default 0,
  ingest_error text,
  last_callback_status text
    check (last_callback_status in ('accepted', 'running', 'succeeded', 'failed', 'canceled')),
  last_callback_progress numeric(5,2)
    check (last_callback_progress is null or (last_callback_progress >= 0 and last_callback_progress <= 100)),
  last_callback_at timestamptz,
  callback_attempts integer not null default 0,
  last_callback_error text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (org_id, request_id)
);

create index if not exists idx_drone_external_processing_requests_status
  on public.drone_external_processing_requests (status);
create index if not exists idx_drone_external_processing_requests_job_id
  on public.drone_external_processing_requests (job_id);

alter table public.drone_external_processing_requests enable row level security;

drop trigger if exists trg_drone_external_processing_requests_updated_at
  on public.drone_external_processing_requests;
create trigger trg_drone_external_processing_requests_updated_at
before update on public.drone_external_processing_requests
for each row execute function public.set_drone_updated_at();
