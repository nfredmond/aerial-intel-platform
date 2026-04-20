-- W2 foundations: per-org copilot settings + monthly AI spend cap
--
-- `drone_org_settings` holds per-tenant feature flags the org admin controls
-- directly; the copilot is the first one and ships default-off per ADR-002.
--
-- `drone_org_ai_quota` tracks copilot spend at month granularity with a
-- per-org ceiling. Every copilot call reserves tokens against the current
-- month's row; the middleware refuses a call once the cap is hit. Spend is
-- recorded in integer tenths-of-a-cent to avoid floating-point drift on
-- per-call deltas (example: $0.005 = 50).

create table if not exists public.drone_org_settings (
  org_id uuid primary key references public.drone_orgs(id) on delete cascade,
  copilot_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.drone_org_settings enable row level security;

create policy "members_can_read_org_settings"
on public.drone_org_settings
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

drop trigger if exists trg_drone_org_settings_updated_at on public.drone_org_settings;
create trigger trg_drone_org_settings_updated_at
before update on public.drone_org_settings
for each row execute function public.set_drone_updated_at();

create table if not exists public.drone_org_ai_quota (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  period_month date not null,
  spend_tenth_cents bigint not null default 0,
  cap_tenth_cents bigint not null default 50000,
  last_call_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint drone_org_ai_quota_period_first_of_month
    check (date_trunc('month', period_month) = period_month),
  constraint drone_org_ai_quota_spend_non_negative
    check (spend_tenth_cents >= 0),
  constraint drone_org_ai_quota_cap_non_negative
    check (cap_tenth_cents >= 0)
);

create unique index if not exists uq_drone_org_ai_quota_org_period
  on public.drone_org_ai_quota (org_id, period_month);
create index if not exists idx_drone_org_ai_quota_org_id
  on public.drone_org_ai_quota (org_id);

alter table public.drone_org_ai_quota enable row level security;

create policy "members_can_read_org_ai_quota"
on public.drone_org_ai_quota
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

drop trigger if exists trg_drone_org_ai_quota_updated_at on public.drone_org_ai_quota;
create trigger trg_drone_org_ai_quota_updated_at
before update on public.drone_org_ai_quota
for each row execute function public.set_drone_updated_at();
