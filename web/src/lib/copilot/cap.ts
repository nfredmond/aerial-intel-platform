// Pure parsing/formatting for the per-org copilot monthly spend cap.
//
// Money is stored as integer tenth-cents (bigint) to avoid float drift:
// $1.00 = 1000 tenth-cents, 1 cent = 10 tenth-cents (see quota.ts / the
// drone_org_ai_quota migration). Admins enter and read the cap in dollars.

/** Upper bound on a settable monthly cap: $100,000 (a sanity ceiling). */
export const MAX_CAP_TENTH_CENTS = 100_000_000;

export type CapParseResult =
  | { ok: true; capTenthCents: number }
  | { ok: false; error: string };

/** Parse a user-entered USD cap string into tenth-cents. */
export function parseCapDollars(raw: unknown): CapParseResult {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: "Enter a dollar amount for the cap." };
  }
  const dollars = Number(raw);
  if (!Number.isFinite(dollars)) {
    return { ok: false, error: "Enter a valid dollar amount." };
  }
  if (dollars < 0) {
    return { ok: false, error: "The cap cannot be negative." };
  }
  const capTenthCents = Math.round(dollars * 1000);
  if (capTenthCents > MAX_CAP_TENTH_CENTS) {
    return { ok: false, error: "The cap cannot exceed the $100,000 monthly ceiling." };
  }
  return { ok: true, capTenthCents };
}

/** Format tenth-cents as a plain dollar amount for an input's default value. */
export function capTenthCentsToDollars(tenthCents: number): string {
  return (tenthCents / 1000).toFixed(2);
}
