import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import {
  getBlockedAccessDetails,
  getBlockedAccessSupportFields,
} from "@/lib/auth/access-insights";
import { createSupportMailto } from "@/lib/support";

import { SignOutForm } from "./sign-out-form";
import { SupportContextCopyButton } from "./support-context-copy-button";

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
    orgName: access.org?.name,
    orgSlug: access.org?.slug,
    role: access.role,
    hasMembership: access.hasMembership,
    hasActiveEntitlement: access.hasActiveEntitlement,
    tierId: access.entitlement?.tier_id,
  });

  const supportContextText = [
    ...supportFields.map((field) => `${field.label}: ${field.value}`),
    `Observed reason: ${access.blockedReason ?? "not provided"}`,
  ].join("\n");

  const supportHref = createSupportMailto({
    subject: "DroneOps access blocked",
    body: [
      "Hello support team,",
      "",
      "My DroneOps access is currently blocked.",
      "",
      supportContextText,
      "",
      "Please help me restore access.",
    ].join("\n"),
  });

  return (
    <main className="app-shell center-screen">
      <section className="surface blocked-card stack-sm">
        <p className="eyebrow">DroneOps Access</p>
        <h1>Signed in, but access is currently blocked</h1>
        <p className="muted">{details.explanation}</p>

        {access.blockedReason ? (
          <p className="callout callout-warning" role="status">
            {access.blockedReason}
          </p>
        ) : null}

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
          <ul className="stack-xs action-list">
            {supportFields.map((field) => (
              <li key={field.label}>
                <strong>{field.label}:</strong> {field.value}
              </li>
            ))}
          </ul>
          <SupportContextCopyButton text={supportContextText} />
        </section>

        <div className="support-actions">
          <a className="button button-primary" href={supportHref}>
            Contact support
          </a>
          <SignOutForm label="Sign out" variant="secondary" />
        </div>
      </section>
    </main>
  );
}
