"use server";

import { revalidatePath } from "next/cache";

import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { parseCapDollars } from "@/lib/copilot/cap";
import { currentPeriodMonthIso } from "@/lib/copilot/quota";
import {
  insertOrgEvent,
  upsertCopilotCap,
  upsertCopilotOrgEnabled,
} from "@/lib/supabase/admin";

export type CopilotSettingsActionResult =
  | { status: "idle" }
  | { status: "ok"; message: string }
  | { status: "error"; message: string };

export async function setCopilotEnabledAction(
  _prev: CopilotSettingsActionResult,
  formData: FormData,
): Promise<CopilotSettingsActionResult> {
  const access = await getDroneOpsAccess();
  if (!access.user) return { status: "error", message: "Not authenticated." };
  if (!canPerformDroneOpsAction(access, "admin.support")) {
    return { status: "error", message: "Not authorized to change copilot settings." };
  }
  const orgId = access.org?.id;
  if (!orgId) return { status: "error", message: "No org context." };

  const raw = formData.get("enabled");
  if (raw !== "true" && raw !== "false") {
    return { status: "error", message: "Invalid enablement value." };
  }
  const enabled = raw === "true";

  const row = await upsertCopilotOrgEnabled(orgId, enabled).catch(() => null);
  if (!row) {
    return { status: "error", message: "Could not update copilot enablement." };
  }

  await insertOrgEvent({
    org_id: orgId,
    actor_user_id: access.user.id,
    event_type: enabled ? "copilot.settings.enabled" : "copilot.settings.disabled",
    payload: { copilot_enabled: enabled },
  }).catch(() => undefined);

  revalidatePath("/admin/copilot");

  return {
    status: "ok",
    message: enabled
      ? "Aerial Copilot enabled for this organization."
      : "Aerial Copilot disabled for this organization.",
  };
}

export async function setCopilotCapAction(
  _prev: CopilotSettingsActionResult,
  formData: FormData,
): Promise<CopilotSettingsActionResult> {
  const access = await getDroneOpsAccess();
  if (!access.user) return { status: "error", message: "Not authenticated." };
  if (!canPerformDroneOpsAction(access, "admin.support")) {
    return { status: "error", message: "Not authorized to change copilot settings." };
  }
  const orgId = access.org?.id;
  if (!orgId) return { status: "error", message: "No org context." };

  const parsed = parseCapDollars(formData.get("capDollars"));
  if (!parsed.ok) {
    return { status: "error", message: parsed.error };
  }

  const period = currentPeriodMonthIso();
  const row = await upsertCopilotCap(orgId, period, parsed.capTenthCents).catch(() => null);
  if (!row) {
    return { status: "error", message: "Could not update the monthly cap." };
  }

  await insertOrgEvent({
    org_id: orgId,
    actor_user_id: access.user.id,
    event_type: "copilot.settings.cap_changed",
    payload: { cap_tenth_cents: parsed.capTenthCents, period_month: period },
  }).catch(() => undefined);

  revalidatePath("/admin/copilot");

  return {
    status: "ok",
    message: `Monthly cap set to $${(parsed.capTenthCents / 1000).toFixed(2)} for ${period.slice(0, 7)}.`,
  };
}
