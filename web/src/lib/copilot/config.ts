export type CopilotConfig = {
  /** Env kill-switch: when false, every skill short-circuits regardless of org. */
  globalEnabled: boolean;
  /** Default monthly cap (tenth-of-cent units) to seed a new `drone_org_ai_quota` row. */
  defaultCapTenthCents: number;
  /**
   * AI Gateway credential presence flag. We never return the key itself.
   * True if either `AI_GATEWAY_API_KEY` is set, or the runtime is Vercel
   * with OIDC enabled (indicated by `VERCEL_OIDC_TOKEN`).
   */
  hasApiKey: boolean;
};

function normalizeEnvString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(
  value: unknown,
  fallback: number,
): number {
  const raw = normalizeEnvString(value);
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function getCopilotConfig(): CopilotConfig {
  const flag = normalizeEnvString(process.env.AERIAL_COPILOT_ENABLED)?.toLowerCase();
  const globalEnabled = flag === "1" || flag === "true" || flag === "yes";
  const defaultCapTenthCents = parsePositiveInt(
    process.env.AERIAL_COPILOT_DEFAULT_CAP_TENTH_CENTS,
    50000,
  );
  const hasApiKey = Boolean(
    normalizeEnvString(process.env.AI_GATEWAY_API_KEY) ??
      normalizeEnvString(process.env.VERCEL_OIDC_TOKEN),
  );
  return { globalEnabled, defaultCapTenthCents, hasApiKey };
}

export type CopilotCallContext = {
  /** Org-level opt-in (from `drone_org_settings.copilot_enabled`). */
  orgEnabled: boolean;
};

export type CopilotCallGate =
  | { allowed: true }
  | { allowed: false; reason: "global-disabled" | "missing-api-key" | "org-disabled" };

/**
 * Pure guard: checks env + org flag + API key presence. Does not check quota;
 * quota is a separate call because it hits the database and reserves spend.
 */
export function checkCopilotCallGate(
  ctx: CopilotCallContext,
  config: CopilotConfig = getCopilotConfig(),
): CopilotCallGate {
  if (!config.globalEnabled) return { allowed: false, reason: "global-disabled" };
  if (!config.hasApiKey) return { allowed: false, reason: "missing-api-key" };
  if (!ctx.orgEnabled) return { allowed: false, reason: "org-disabled" };
  return { allowed: true };
}
