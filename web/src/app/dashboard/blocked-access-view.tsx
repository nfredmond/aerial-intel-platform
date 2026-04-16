import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import {
  buildSupportDiagnosticsPacket,
  getBlockedAccessDetails,
  getBlockedAccessSupportFields,
} from "@/lib/auth/access-insights";
import { formatDateTime } from "@/lib/ui/datetime";

import { SignOutForm } from "./sign-out-form";
import { SupportDiagnosticsPanel } from "./support-diagnostics-panel";

type BlockedAccessViewProps = {
  access: DroneOpsAccessResult;
};

export function BlockedAccessView({ access }: BlockedAccessViewProps) {
  const details = getBlockedAccessDetails({
    hasMembership: access.hasMembership,
    hasActiveEntitlement: access.hasActiveEntitlement,
  });

  const supportFields = getBlockedAccessSupportFields({
    userId: access.user?.id,
    email: access.user?.email,
    orgId: access.org?.id,
    orgName: access.org?.name,
    orgSlug: access.org?.slug,
    role: access.role,
    hasMembership: access.hasMembership,
    hasActiveEntitlement: access.hasActiveEntitlement,
    tierId: access.entitlement?.tier_id,
  });

  const packet = buildSupportDiagnosticsPacket({
    fields: supportFields,
    blockedReason: access.blockedReason,
  });

  return (
    <main className="app-shell center-screen">
      <section className="surface blocked-card stack-sm">
        <p className="eyebrow">DroneOps Access</p>
        <h1>Signed in, but access is currently blocked</h1>
        <p className="muted">{details.explanation}</p>

        {access.blockedReason && (
          <p className="callout callout-warning" role="status">
            {access.blockedReason}
          </p>
        )}

        <section className="stack-xs">
          <h2>{details.title}</h2>
          <ul className="stack-xs action-list">
            {details.nextSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </section>

        <section className="stack-xs">
          <h2>Support context</h2>
          <p className="muted helper-copy">
            Reference <strong>{packet.reference}</strong> · Snapshot{" "}
            {formatDateTime(packet.generatedAtIso, "Unavailable")}
          </p>
          <ul className="stack-xs action-list">
            {supportFields.map((field) => (
              <li key={field.label}>
                <strong>{field.label}:</strong> {field.value}
              </li>
            ))}
          </ul>
        </section>

        <section className="stack-xs">
          <h2>Copy for support</h2>
          <p className="muted helper-copy">
            Pick the format your channel wants, then copy in one click. Your support reference stays
            the same across every tab.
          </p>
          <SupportDiagnosticsPanel packet={packet} />
        </section>

        <div className="support-actions">
          <a className="button button-primary" href={packet.mailtoHref}>
            Contact support
          </a>
          <a
            className="button button-secondary"
            href={packet.gmailHref}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open in Gmail
          </a>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>
    </main>
  );
}
