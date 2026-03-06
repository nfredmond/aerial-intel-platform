import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import { getBlockedAccessDetails } from "@/lib/auth/access-insights";
import { createSupportMailto } from "@/lib/support";

import { SignOutForm } from "./sign-out-form";

type BlockedAccessViewProps = {
  access: DroneOpsAccessResult;
};

export function BlockedAccessView({ access }: BlockedAccessViewProps) {
  const details = getBlockedAccessDetails({
    hasMembership: access.hasMembership,
    hasActiveEntitlement: access.hasActiveEntitlement,
  });

  const supportHref = createSupportMailto({
    subject: "DroneOps access blocked",
    body: [
      "Hello support team,",
      "",
      "My DroneOps access is currently blocked.",
      `Signed-in email: ${access.user?.email ?? "unknown"}`,
      `Observed reason: ${access.blockedReason ?? "not provided"}`,
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
