import Link from "next/link";
import { redirect } from "next/navigation";

import { BlockedAccessView } from "@/app/dashboard/blocked-access-view";
import { SignOutForm } from "@/app/dashboard/sign-out-form";
import { SupportAssistantPanel } from "@/components/copilot/support-assistant-panel";
import { canPerformDroneOpsAction } from "@/lib/auth/actions";
import { getDroneOpsAccess } from "@/lib/auth/drone-ops-access";
import { getCopilotConfig } from "@/lib/copilot/config";
import { currentPeriodMonthIso } from "@/lib/copilot/quota";
import {
  selectCopilotOrgSettings,
  selectCopilotQuotaRowsForOrg,
  type CopilotOrgSettingsRow,
  type CopilotQuotaRow,
} from "@/lib/supabase/admin";
import { formatDateTime, formatRelativeTime } from "@/lib/ui/datetime";
import { statusPillClassName, type Tone } from "@/lib/ui/tones";

export const dynamic = "force-dynamic";

function formatTenthCents(tenthCents: number): string {
  const cents = tenthCents / 10;
  return `$${(cents / 100).toFixed(cents < 100 ? 3 : 2)}`;
}

function spendTone(spend: number, cap: number): Tone {
  if (cap <= 0) return "neutral";
  const ratio = spend / cap;
  if (ratio >= 1) return "danger";
  if (ratio >= 0.8) return "warning";
  if (ratio > 0) return "info";
  return "success";
}

function enabledTone(enabled: boolean): Tone {
  return enabled ? "success" : "neutral";
}

function QuotaHistoryPanel({ rows }: { rows: CopilotQuotaRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="muted">
        No quota rows yet. A row is created on first copilot call in a given month.
      </p>
    );
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Period</th>
            <th>Spend</th>
            <th>Cap</th>
            <th>Remaining</th>
            <th>Utilization</th>
            <th>Last call</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const remaining = Math.max(row.cap_tenth_cents - row.spend_tenth_cents, 0);
            const utilization =
              row.cap_tenth_cents > 0
                ? `${Math.round((row.spend_tenth_cents / row.cap_tenth_cents) * 100)}%`
                : "—";
            return (
              <tr key={row.id}>
                <td className="admin-table__mono">{row.period_month.slice(0, 7)}</td>
                <td>{formatTenthCents(row.spend_tenth_cents)}</td>
                <td>{formatTenthCents(row.cap_tenth_cents)}</td>
                <td>{formatTenthCents(remaining)}</td>
                <td>
                  <span
                    className={statusPillClassName(
                      spendTone(row.spend_tenth_cents, row.cap_tenth_cents),
                    )}
                  >
                    {utilization}
                  </span>
                </td>
                <td>{row.last_call_at ? formatRelativeTime(row.last_call_at) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GateRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <tr>
      <td>{label}</td>
      <td>
        <span className={statusPillClassName(ok ? "success" : "danger")}>
          {ok ? "Ready" : "Blocked"}
        </span>
      </td>
      <td className="muted">{detail}</td>
    </tr>
  );
}

export default async function AdminCopilotPage() {
  const access = await getDroneOpsAccess();
  if (!access.user) redirect("/sign-in");

  if (!access.hasMembership || !access.hasActiveEntitlement) {
    return <BlockedAccessView access={access} />;
  }

  if (!canPerformDroneOpsAction(access, "admin.support")) {
    return (
      <main className="app-shell stack-md">
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Admin console</p>
            <h1>Access restricted</h1>
          </div>
          <p>
            The copilot dashboard is available to org owners and admins. Your current role is{" "}
            {access.role ?? "none"}.
          </p>
          <div className="header-actions">
            <Link href="/admin" className="button button-secondary">
              Back to admin
            </Link>
            <SignOutForm label="Sign out" variant="secondary" />
          </div>
        </section>
      </main>
    );
  }

  const orgId = access.org?.id;
  if (!orgId) {
    return (
      <main className="app-shell stack-md">
        <section className="surface stack-sm">
          <div className="stack-xs">
            <p className="eyebrow">Admin console</p>
            <h1>No org context</h1>
          </div>
          <p>This account is not linked to an org yet. Contact support to finish provisioning.</p>
        </section>
      </main>
    );
  }

  const config = getCopilotConfig();
  const currentPeriod = currentPeriodMonthIso();

  const [settings, quotaRows] = await Promise.all([
    selectCopilotOrgSettings(orgId).catch(() => null as CopilotOrgSettingsRow | null),
    selectCopilotQuotaRowsForOrg(orgId, 6).catch(() => [] as CopilotQuotaRow[]),
  ]);

  const currentRow = quotaRows.find((row) => row.period_month.startsWith(currentPeriod.slice(0, 7)));
  const orgEnabled = settings?.copilot_enabled ?? false;
  const copilotUserAllowed = canPerformDroneOpsAction(access, "copilot.generate");
  const copilotReady = config.globalEnabled && config.hasApiKey && orgEnabled;
  const supportAssistantAvailable = copilotReady && copilotUserAllowed;
  const supportAssistantHint = !config.globalEnabled
    ? "Aerial Copilot is disabled on this deployment."
    : !config.hasApiKey
      ? "Aerial Copilot is missing AI Gateway credentials."
      : !orgEnabled
        ? "Aerial Copilot is off for this organization."
        : !copilotUserAllowed
          ? "Your role does not include copilot.generate."
          : "Support assistant is ready.";

  const spendThisMonth = currentRow?.spend_tenth_cents ?? 0;
  const capThisMonth = currentRow?.cap_tenth_cents ?? config.defaultCapTenthCents;
  const remainingThisMonth = Math.max(capThisMonth - spendThisMonth, 0);

  return (
    <main className="app-shell stack-md">
      <section className="surface section-header">
        <div className="stack-sm">
          <p className="eyebrow">Admin console</p>
          <h1>Aerial Copilot — spend + enablement</h1>
          <p className="muted">
            Per-org view of copilot enablement, month-to-date spend, and the six-month history of
            quota rows. Writes (cap changes, enablement toggles) are still SQL-only for now; see
            ADR-002 open decisions.
          </p>
        </div>
        <div className="header-actions">
          <Link href="/admin" className="button button-secondary">
            Back to admin
          </Link>
          <Link href="/dashboard" className="button button-secondary">
            Dashboard
          </Link>
        </div>
      </section>

      <section className="admin-summary">
        <div className="admin-summary__card">
          <span className="muted">Overall</span>
          <strong>
            <span className={statusPillClassName(copilotReady ? "success" : "warning")}>
              {copilotReady ? "Ready" : "Blocked"}
            </span>
          </strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Spend this month</span>
          <strong>{formatTenthCents(spendThisMonth)}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Cap</span>
          <strong>{formatTenthCents(capThisMonth)}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Remaining</span>
          <strong>{formatTenthCents(remainingThisMonth)}</strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Org enabled</span>
          <strong>
            <span className={statusPillClassName(enabledTone(orgEnabled))}>
              {orgEnabled ? "Yes" : "No"}
            </span>
          </strong>
        </div>
        <div className="admin-summary__card">
          <span className="muted">Last call</span>
          <strong>
            {currentRow?.last_call_at ? formatRelativeTime(currentRow.last_call_at) : "Never"}
          </strong>
        </div>
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Enablement gates</p>
          <h2>Can copilot fire right now?</h2>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Gate</th>
                <th>Status</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              <GateRow
                label="Env kill-switch (AERIAL_COPILOT_ENABLED)"
                ok={config.globalEnabled}
                detail={
                  config.globalEnabled
                    ? "Global env flag is on."
                    : "Set AERIAL_COPILOT_ENABLED=1 on the deployment to allow any copilot traffic."
                }
              />
              <GateRow
                label="AI Gateway credentials"
                ok={config.hasApiKey}
                detail={
                  config.hasApiKey
                    ? "AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN is present."
                    : "Server has no AI Gateway credentials. On Vercel, enable OIDC; locally set AI_GATEWAY_API_KEY."
                }
              />
              <GateRow
                label="Org opt-in (drone_org_settings.copilot_enabled)"
                ok={orgEnabled}
                detail={
                  orgEnabled
                    ? `Enabled on ${formatDateTime(settings?.updated_at ?? "")}.`
                    : "Admin must UPDATE drone_org_settings SET copilot_enabled=true for this org before skills run."
                }
              />
            </tbody>
          </table>
        </div>
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Spend</p>
          <h2>Monthly quota history (last 6 months)</h2>
        </div>
        <QuotaHistoryPanel rows={quotaRows} />
        <p className="muted">
          Attempts, refusals, and sentence-drop counts are not yet emitted as events — follow-up
          slice will wire those alongside the dashboard. Spend above is derived directly from the
          `drone_org_ai_quota` row, updated by `recordSpend` after every call.
        </p>
      </section>

      <SupportAssistantPanel
        available={supportAssistantAvailable}
        availabilityHint={supportAssistantHint}
      />
    </main>
  );
}
