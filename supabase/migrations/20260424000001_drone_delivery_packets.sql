-- Mission-scoped delivery packets for client handoff.
-- Packets store a generated ZIP plus the approved artifacts and governed
-- share links included in that ZIP. Large artifact binaries remain in
-- protected storage and are exposed through /s/:token links, not embedded.

create table if not exists public.drone_delivery_packets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  mission_id uuid not null,
  title text not null,
  status text not null default 'ready',
  storage_bucket text,
  storage_path text,
  artifact_ids uuid[] not null default '{}'::uuid[],
  share_link_ids uuid[] not null default '{}'::uuid[],
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint drone_delivery_packets_title_nonempty
    check (char_length(trim(title)) > 0),
  constraint drone_delivery_packets_status_values
    check (status in ('ready', 'archived')),
  constraint drone_delivery_packets_storage_pair
    check ((storage_bucket is null and storage_path is null) or (storage_bucket is not null and storage_path is not null)),
  constraint drone_delivery_packets_org_mission_fkey
    foreign key (org_id, mission_id)
    references public.drone_missions (org_id, id)
    on delete cascade
);

create index if not exists idx_drone_delivery_packets_org_id
  on public.drone_delivery_packets (org_id);
create index if not exists idx_drone_delivery_packets_mission_id
  on public.drone_delivery_packets (mission_id);
create index if not exists idx_drone_delivery_packets_created_at
  on public.drone_delivery_packets (created_at desc);

alter table public.drone_delivery_packets enable row level security;

create policy "members_can_read_delivery_packets"
on public.drone_delivery_packets
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop trigger if exists trg_drone_delivery_packets_updated_at on public.drone_delivery_packets;
create trigger trg_drone_delivery_packets_updated_at
before update on public.drone_delivery_packets
for each row execute function public.set_drone_updated_at();
