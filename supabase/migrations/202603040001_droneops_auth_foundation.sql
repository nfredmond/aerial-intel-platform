create extension if not exists pgcrypto;

create table if not exists public.drone_orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.drone_memberships (
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'analyst', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (org_id, user_id)
);

create table if not exists public.drone_entitlements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  product_id text not null default 'drone-ops',
  tier_id text not null,
  status text not null default 'pending' check (status in ('active', 'past_due', 'canceled', 'refunded', 'pending')),
  source text not null default 'website_webhook',
  external_reference text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (org_id, product_id)
);

create or replace function public.set_drone_entitlements_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_drone_entitlements_updated_at on public.drone_entitlements;
create trigger trg_drone_entitlements_updated_at
before update on public.drone_entitlements
for each row execute function public.set_drone_entitlements_updated_at();

alter table public.drone_orgs enable row level security;
alter table public.drone_memberships enable row level security;
alter table public.drone_entitlements enable row level security;

create policy "members_can_read_orgs"
on public.drone_orgs
for select
using (
  id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_memberships"
on public.drone_memberships
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

create policy "members_can_read_entitlements"
on public.drone_entitlements
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

-- Service-role writes org/membership/entitlement state during provisioning flows.
