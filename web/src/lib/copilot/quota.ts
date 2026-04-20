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

async function selectCurrentQuotaRow(orgId: string, period: string): Promise<QuotaRow | null> {
  const rows = await restRequest<QuotaRow[]>(
    `drone_org_ai_quota?org_id=eq.${encodeURIComponent(orgId)}` +
      `&period_month=eq.${encodeURIComponent(period)}&select=*`,
    { method: "GET" },
  );
  return rows[0] ?? null;
}

async function insertQuotaRow(
  orgId: string,
  period: string,
  capTenthCents: number,
): Promise<QuotaRow> {
  const rows = await restRequest<QuotaRow[]>("drone_org_ai_quota?select=*", {
    method: "POST",
    body: JSON.stringify({ org_id: orgId, period_month: period, cap_tenth_cents: capTenthCents }),
  });
  if (!rows[0]) throw new Error("Copilot quota insert returned no row.");
  return rows[0];
}

export async function ensureCurrentQuotaRow(
  orgId: string,
  config: CopilotConfig = getCopilotConfig(),
): Promise<QuotaRow> {
  const period = currentPeriodMonthIso();
  const existing = await selectCurrentQuotaRow(orgId, period);
  if (existing) return existing;
  return insertQuotaRow(orgId, period, config.defaultCapTenthCents);
}

export type QuotaReserveResult =
  | {
      allowed: true;
      quotaRowId: string;
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

/**
 * Reads the current-month row (creating it if missing) and decides whether
 * `budgetTenthCents` fits under the cap. Callers must pass a conservative
 * upper bound for the model call, including max output tokens, so actual spend
 * cannot exceed the pre-call gate for a single request. This is still a check,
 * not an atomic reservation; concurrent calls can race within a single month.
 */
export async function checkQuotaAndReserve(input: {
  orgId: string;
  budgetTenthCents: number;
}): Promise<QuotaReserveResult> {
  const row = await ensureCurrentQuotaRow(input.orgId);
  const projected = row.spend_tenth_cents + input.budgetTenthCents;
  const remaining = row.cap_tenth_cents - row.spend_tenth_cents;
  if (projected > row.cap_tenth_cents) {
    return {
      allowed: false,
      reason: "cap-exceeded",
      capTenthCents: row.cap_tenth_cents,
      spendTenthCents: row.spend_tenth_cents,
      remainingTenthCents: Math.max(remaining, 0),
    };
  }
  return {
    allowed: true,
    quotaRowId: row.id,
    capTenthCents: row.cap_tenth_cents,
    spendTenthCents: row.spend_tenth_cents,
    remainingTenthCents: Math.max(remaining, 0),
  };
}

/**
 * Commits a completed call's actual spend. Read-modify-write because Supabase
 * REST PATCH can't express `spend = spend + $1` as an atomic expression; the
 * race is documented in `checkQuotaAndReserve` above.
 */
export async function recordSpend(input: {
  quotaRowId: string;
  deltaTenthCents: number;
}): Promise<QuotaRow> {
  if (input.deltaTenthCents < 0) {
    throw new Error("recordSpend delta must be non-negative.");
  }
  const current = await restRequest<QuotaRow[]>(
    `drone_org_ai_quota?id=eq.${encodeURIComponent(input.quotaRowId)}&select=*`,
    { method: "GET" },
  );
  const row = current[0];
  if (!row) throw new Error(`Copilot quota row not found: ${input.quotaRowId}`);
  const patched = await restRequest<QuotaRow[]>(
    `drone_org_ai_quota?id=eq.${encodeURIComponent(input.quotaRowId)}&select=*`,
    {
      method: "PATCH",
      body: JSON.stringify({
        spend_tenth_cents: row.spend_tenth_cents + input.deltaTenthCents,
        last_call_at: new Date().toISOString(),
      }),
    },
  );
  if (!patched[0]) throw new Error("Copilot quota patch returned no row.");
  return patched[0];
}

export async function readOrgCopilotEnabled(orgId: string): Promise<boolean> {
  const rows = await restRequest<Array<{ copilot_enabled: boolean }>>(
    `drone_org_settings?org_id=eq.${encodeURIComponent(orgId)}&select=copilot_enabled`,
    { method: "GET" },
  );
  return rows[0]?.copilot_enabled ?? false;
}
