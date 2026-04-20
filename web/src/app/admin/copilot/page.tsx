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
  selectRecentCopilotEventsForOrg,
  type CopilotOrgSettingsRow,
  type CopilotQuotaRow,
  type OrgEventRow,
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

type CopilotEventPayload = Record<string, unknown>;

function getEventPayload(payload: OrgEventRow["payload"]): CopilotEventPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as CopilotEventPayload;
}

function payloadString(payload: CopilotEventPayload, key: string): string | null {
  const value = payload[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function payloadNumber(payload: CopilotEventPayload, key: string): number | null {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function eventTone(eventType: string, status: string | null): Tone {
  const value = status ?? eventType;
  if (value.includes("failed") || value === "error") return "danger";
  if (value.includes("refused") || value === "refused") return "warning";
  if (value.includes("blocked") || value === "blocked") return "neutral";
  if (value.includes("succeeded") || value === "ok") return "success";
  return "info";
}

function formatEventLabel(eventType: string) {
  return eventType.replace("copilot.call.", "");
}

function formatSentenceSummary(payload: CopilotEventPayload) {
  const total = payloadNumber(payload, "totalSentences");
  if (total === null) return "—";
  const kept = payloadNumber(payload, "keptSentences");
  const dropped = payloadNumber(payload, "droppedSentences") ?? 0;
  const cited = payloadNumber(payload, "citedFactCount");
  const keptLabel = kept === null ? "?" : String(kept);
  const citedLabel = cited === null ? "" : `, ${cited} facts`;
  return `${keptLabel}/${total} kept, ${dropped} dropped${citedLabel}`;
}

function CopilotEventsPanel({ rows }: { rows: OrgEventRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="muted">
        No copilot audit events yet. Attempts, refusals, and failed calls will appear here
        after the next org-scoped copilot request.
      </p>
    );
  }

  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Created</th>
            <th>Event</th>
            <th>Skill</th>
            <th>Target</th>
            <th>Spend</th>
            <th>Sentences</th>
            <th>Reason / model</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const payload = getEventPayload(row.payload);
            const status = payloadString(payload, "status");
            const skill = payloadString(payload, "skill") ?? "unknown";
            const targetType = payloadString(payload, "targetType") ?? "support";
            const targetId = payloadString(payload, "targetId");
            const reason = payloadString(payload, "reason");
            const modelId = payloadString(payload, "modelId");
            const spend = payloadNumber(payload, "spendTenthCents");
            return (
              <tr key={row.id}>
                <td>{formatRelativeTime(row.created_at)}</td>
                <td>
                  <span className={statusPillClassName(eventTone(row.event_type, status))}>
                    {formatEventLabel(row.event_type)}
                  </span>
                </td>
                <td>{skill}</td>
                <td>
                  <span>{targetType}</span>
                  {targetId ? <div className="admin-table__mono">{targetId}</div> : null}
                </td>
                <td>{spend === null ? "—" : formatTenthCents(spend)}</td>
                <td>{formatSentenceSummary(payload)}</td>
                <td>
                  {reason ?? "—"}
                  {modelId ? <div className="muted">{modelId}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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

  const [settings, quotaRows, copilotEvents] = await Promise.all([
    selectCopilotOrgSettings(orgId).catch(() => null as CopilotOrgSettingsRow | null),
    selectCopilotQuotaRowsForOrg(orgId, 6).catch(() => [] as CopilotQuotaRow[]),
    selectRecentCopilotEventsForOrg(orgId, 20).catch(() => [] as OrgEventRow[]),
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
          Spend above is derived directly from the `drone_org_ai_quota` row, updated by
          `recordSpend` after every metered call. Event rows below are org-scoped audit records in
          `drone_org_events`.
        </p>
      </section>

      <section className="surface stack-sm">
        <div className="stack-xs">
          <p className="eyebrow">Audit trail</p>
          <h2>Recent copilot events</h2>
        </div>
        <CopilotEventsPanel rows={copilotEvents} />
      </section>

      <SupportAssistantPanel
        available={supportAssistantAvailable}
        availabilityHint={supportAssistantHint}
      />
    </main>
  );
}
