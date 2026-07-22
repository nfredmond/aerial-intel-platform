-- Atomic copilot quota reservation + reconciliation.
--
-- checkQuotaAndReserve previously read the current-month row and decided whether
-- the budget fit, then recorded actual spend with a read-modify-write. Two races
-- followed: concurrent requests could both pass the cap check and overspend
-- (check-then-act), and concurrent spend commits could lost-update each other
-- and silently under-count spend, defeating the cap over time.
--
-- These functions make both steps atomic:
--   reserve_copilot_budget  — ensures the period row exists, then adds a
--     conservative budget to spend in a single guarded UPDATE. A request that
--     would exceed the cap updates no row and is refused; the row lock serializes
--     concurrent reservations, so the cap is a hard ceiling.
--   adjust_copilot_spend    — applies a signed delta atomically, so a caller can
--     reconcile actual-vs-reserved spend after the call (or refund a reservation
--     whose model call failed). Floored at zero to respect the spend CHECK.

create or replace function public.reserve_copilot_budget(
  p_org_id uuid,
  p_period date,
  p_default_cap bigint,
  p_budget bigint
)
returns table (
  quota_row_id uuid,
  cap_tenth_cents bigint,
  spend_tenth_cents bigint,
  allowed boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.drone_org_ai_quota;
begin
  if p_budget < 0 then
    raise exception 'reserve_copilot_budget: budget must be non-negative (got %)', p_budget;
  end if;

  -- Ensure the current-period row exists (no-op if a concurrent caller made it).
  insert into public.drone_org_ai_quota (org_id, period_month, cap_tenth_cents)
  values (p_org_id, p_period, p_default_cap)
  on conflict (org_id, period_month) do nothing;

  -- Reserve the budget only if it still fits under the cap. The WHERE guard plus
  -- the row lock serialize concurrent reservations under READ COMMITTED: a second
  -- transaction re-evaluates the guard against the first's committed spend.
  update public.drone_org_ai_quota q
     set spend_tenth_cents = q.spend_tenth_cents + p_budget,
         last_call_at = timezone('utc', now())
   where q.org_id = p_org_id
     and q.period_month = p_period
     and q.spend_tenth_cents + p_budget <= q.cap_tenth_cents
  returning q.* into v_row;

  if found then
    return query select v_row.id, v_row.cap_tenth_cents, v_row.spend_tenth_cents, true;
    return;
  end if;

  -- Reservation refused: return the current (unchanged) row for the audit trail.
  select * into v_row
    from public.drone_org_ai_quota
   where org_id = p_org_id and period_month = p_period;
  return query select v_row.id, v_row.cap_tenth_cents, v_row.spend_tenth_cents, false;
end;
$$;

create or replace function public.adjust_copilot_spend(
  p_quota_row_id uuid,
  p_delta bigint
)
returns setof public.drone_org_ai_quota
language sql
security definer
set search_path = public
as $$
  update public.drone_org_ai_quota
     set spend_tenth_cents = greatest(0, spend_tenth_cents + p_delta),
         last_call_at = timezone('utc', now())
   where id = p_quota_row_id
  returning *;
$$;

-- Quota mutation is a service-role-only operation; RLS-scoped clients must not be
-- able to reserve, refund, or probe another org's spend.
revoke all on function public.reserve_copilot_budget(uuid, date, bigint, bigint) from public;
revoke all on function public.reserve_copilot_budget(uuid, date, bigint, bigint) from anon;
revoke all on function public.reserve_copilot_budget(uuid, date, bigint, bigint) from authenticated;
grant execute on function public.reserve_copilot_budget(uuid, date, bigint, bigint) to service_role;

revoke all on function public.adjust_copilot_spend(uuid, bigint) from public;
revoke all on function public.adjust_copilot_spend(uuid, bigint) from anon;
revoke all on function public.adjust_copilot_spend(uuid, bigint) from authenticated;
grant execute on function public.adjust_copilot_spend(uuid, bigint) to service_role;
