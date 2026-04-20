-- Track C: admin write actions for membership management.
--
-- Two additions:
--   1. `status` column on `drone_memberships` so an org admin can suspend a
--      seat without deleting the user record. Default `active` preserves the
--      existing membership behavior. Access gates elsewhere filter on
--      `status = 'active'` so suspended users lose access on next request.
--   2. `drone_invitations` table for pending invites. An owner/admin inserts
--      a row and shares the returned URL (no SMTP in this slice). Accepting
--      an invitation consumes the row and creates a membership.

alter table public.drone_memberships
  add column if not exists status text not null default 'active'
    check (status in ('active', 'suspended'));

create index if not exists idx_drone_memberships_status
  on public.drone_memberships (org_id, status);

create table if not exists public.drone_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'analyst', 'viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked', 'expired')),
  token text not null unique,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default timezone('utc', now()) + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references auth.users(id) on delete set null
);

create unique index if not exists uq_drone_invitations_org_email_pending
  on public.drone_invitations (org_id, lower(email))
  where status = 'pending';

create index if not exists idx_drone_invitations_org_id
  on public.drone_invitations (org_id);

alter table public.drone_invitations enable row level security;

create policy "members_can_read_invitations"
on public.drone_invitations
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

-- Service-role handles writes. Admins invoke via server actions that use the
-- service-role Supabase client after passing `canPerformDroneOpsAction` gates.

-- Org-scoped event log. Job events live on `drone_processing_job_events`; this
-- mirror table captures org-level actions like invites and suspensions so the
-- audit trail survives beyond the membership row itself.
create table if not exists public.drone_org_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_drone_org_events_org_id_created
  on public.drone_org_events (org_id, created_at desc);

alter table public.drone_org_events enable row level security;

create policy "members_can_read_org_events"
on public.drone_org_events
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);
