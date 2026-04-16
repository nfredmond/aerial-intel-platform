alter table public.drone_processing_outputs
  add constraint uq_drone_processing_outputs_org_id_id unique (org_id, id);

create table if not exists public.drone_artifact_share_links (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  artifact_id uuid not null,
  token text not null unique,
  note text,
  max_uses integer,
  use_count integer not null default 0,
  expires_at timestamptz,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint drone_artifact_share_links_org_artifact_fkey
    foreign key (org_id, artifact_id)
    references public.drone_processing_outputs (org_id, id)
    on delete cascade,
  constraint drone_artifact_share_links_use_count_nonneg
    check (use_count >= 0),
  constraint drone_artifact_share_links_max_uses_positive
    check (max_uses is null or max_uses > 0)
);

create index if not exists idx_drone_artifact_share_links_org_id
  on public.drone_artifact_share_links (org_id);
create index if not exists idx_drone_artifact_share_links_artifact_id
  on public.drone_artifact_share_links (artifact_id);
create index if not exists idx_drone_artifact_share_links_token
  on public.drone_artifact_share_links (token);
create index if not exists idx_drone_artifact_share_links_created_at
  on public.drone_artifact_share_links (created_at desc);

alter table public.drone_artifact_share_links enable row level security;

create policy "members_can_read_share_links"
on public.drone_artifact_share_links
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

drop trigger if exists trg_drone_artifact_share_links_updated_at on public.drone_artifact_share_links;
create trigger trg_drone_artifact_share_links_updated_at
before update on public.drone_artifact_share_links
for each row execute function public.set_drone_updated_at();
