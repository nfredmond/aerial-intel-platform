import { getCopilotConfig, type CopilotConfig } from "./config";

type QuotaRow = {
  id: string;
  org_id: string;
  period_month: string;
  spend_tenth_cents: number;
  cap_tenth_cents: number;
  last_call_at: string | null;
};

/**
 * ISO first-of-month (UTC) for the current date. `period_month` is stored as a
 * DATE in Postgres with a CHECK that it equals `date_trunc('month', ...)`, so
 * every client must send the first-of-month for the lookup to hit the unique
 * index and for the RLS policy to evaluate.
 */
export function currentPeriodMonthIso(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

function getAdminEnv() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Missing SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL for copilot quota.");
  if (!key) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY for copilot quota.");
  return { url, key };
}

async function restRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = getAdminEnv();
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(init.headers ?? {}),
    },
  });
  const payload = (await res.json().catch(() => null)) as T | { message?: string } | null;
  if (!res.ok) {
    const msg =
      payload && typeof payload === "object" && "message" in payload && payload.message
        ? payload.message
        : `Copilot quota request failed (${res.status})`;
    throw new Error(msg);
  }
  return payload as T;
}

export type QuotaReserveResult =
  | {
      allowed: true;
      quotaRowId: string;
      reservedTenthCents: number;
      capTenthCents: number;
      spendTenthCents: number;
      remainingTenthCents: number;
    }
  | {
      allowed: false;
      reason: "cap-exceeded";
      capTenthCents: number;
      spendTenthCents: number;
      remainingTenthCents: number;
    };

type ReserveRpcRow = {
  quota_row_id: string;
  cap_tenth_cents: number;
  spend_tenth_cents: number;
  allowed: boolean;
};

/**
 * Atomically reserves `budgetTenthCents` against the org's current-month quota
 * via the `reserve_copilot_budget` RPC: the budget is added to `spend` in a
 * single guarded UPDATE that only succeeds if it still fits under the cap. This
 * is a real reservation — concurrent requests cannot both pass and overspend.
 *
 * Callers must pass a conservative upper bound for the model call (including max
 * output tokens) and then reconcile the actual spend with `reconcileCopilotSpend`
 * once the call completes (or refund via the same call with `actualTenthCents: 0`
 * when it never runs).
 */
export async function checkQuotaAndReserve(
  input: { orgId: string; budgetTenthCents: number },
  config: CopilotConfig = getCopilotConfig(),
): Promise<QuotaReserveResult> {
  const rows = await restRequest<ReserveRpcRow[]>("rpc/reserve_copilot_budget", {
    method: "POST",
    body: JSON.stringify({
      p_org_id: input.orgId,
      p_period: currentPeriodMonthIso(),
      p_default_cap: config.defaultCapTenthCents,
      p_budget: input.budgetTenthCents,
    }),
  });
  const row = rows[0];
  if (!row) throw new Error("reserve_copilot_budget returned no row.");

  const cap = Number(row.cap_tenth_cents);
  const spendNow = Number(row.spend_tenth_cents);
  if (row.allowed) {
    // `spendNow` is post-reservation; report the pre-call spend to the caller.
    const spendBefore = spendNow - input.budgetTenthCents;
    return {
      allowed: true,
      quotaRowId: row.quota_row_id,
      reservedTenthCents: input.budgetTenthCents,
      capTenthCents: cap,
      spendTenthCents: spendBefore,
      remainingTenthCents: Math.max(cap - spendBefore, 0),
    };
  }
  return {
    allowed: false,
    reason: "cap-exceeded",
    capTenthCents: cap,
    spendTenthCents: spendNow,
    remainingTenthCents: Math.max(cap - spendNow, 0),
  };
}

/** Applies a signed spend delta atomically via the `adjust_copilot_spend` RPC. */
async function adjustCopilotSpend(quotaRowId: string, deltaTenthCents: number): Promise<QuotaRow> {
  const rows = await restRequest<QuotaRow[]>("rpc/adjust_copilot_spend", {
    method: "POST",
    body: JSON.stringify({ p_quota_row_id: quotaRowId, p_delta: deltaTenthCents }),
  });
  if (!rows[0]) throw new Error(`Copilot quota row not found: ${quotaRowId}`);
  return rows[0];
}

/**
 * Reconciles a reservation once the call is done: applies `actual - reserved` to
 * spend atomically. On success this refunds the unused portion of the
 * conservative budget; passing `actualTenthCents: 0` fully refunds a reservation
 * whose model call never produced billable spend (e.g. it threw).
 */
export async function reconcileCopilotSpend(input: {
  quotaRowId: string;
  reservedTenthCents: number;
  actualTenthCents: number;
}): Promise<void> {
  await adjustCopilotSpend(input.quotaRowId, input.actualTenthCents - input.reservedTenthCents);
}

export async function readOrgCopilotEnabled(orgId: string): Promise<boolean> {
  const rows = await restRequest<Array<{ copilot_enabled: boolean }>>(
    `drone_org_settings?org_id=eq.${encodeURIComponent(orgId)}&select=copilot_enabled`,
    { method: "GET" },
  );
  return rows[0]?.copilot_enabled ?? false;
}
