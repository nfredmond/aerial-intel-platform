import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import {
  buildBlockedAccessSupportContext,
  getBlockedAccessDetails,
  getBlockedAccessSupportFields,
} from "@/lib/auth/access-insights";
import { buildBlockedAccessSupportSubject, createSupportMailto } from "@/lib/support";

import { SignOutForm } from "./sign-out-form";
import { SupportContextCopyButton } from "./support-context-copy-button";

type BlockedAccessViewProps = {
  access: DroneOpsAccessResult;
};

function formatSupportSnapshotTimestamp(value: string) {
  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unavailable";
  }

  return `${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(timestamp)} UTC`;
}

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

  const supportContext = buildBlockedAccessSupportContext({
    fields: supportFields,
    blockedReason: access.blockedReason,
  });

  const supportSubject = buildBlockedAccessSupportSubject(supportContext.reference);
  const supportEmailBody = [
    "Hello support team,",
    "",
    "My DroneOps access is currently blocked.",
    "",
    supportContext.text,
    "",
    "Please help me restore access.",
  ].join("\n");

  const supportHref = createSupportMailto({
    subject: supportSubject,
    body: supportEmailBody,
  });

  const supportEmailDraftText = [`Subject: ${supportSubject}`, "", supportEmailBody].join("\n");

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
          <p className="muted helper-copy">
            Reference <strong>{supportContext.reference}</strong> · Snapshot{" "}
            {formatSupportSnapshotTimestamp(supportContext.generatedAtIso)}
          </p>
          <ul className="stack-xs action-list">
            {supportFields.map((field) => (
              <li key={field.label}>
                <strong>{field.label}:</strong> {field.value}
              </li>
            ))}
          </ul>
          <SupportContextCopyButton
            text={supportContext.reference}
            buttonLabel="Copy support reference"
            successMessage="Support reference copied. Share it with support."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the support reference below."
            fallbackAriaLabel="Support reference text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then share this reference with support."
          />
          <SupportContextCopyButton
            text={supportSubject}
            buttonLabel="Copy support email subject"
            successMessage="Support email subject copied. Paste it into your email client."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy email subject below."
            fallbackAriaLabel="Support email subject text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste into your email subject line."
          />
          <SupportContextCopyButton text={supportContext.text} />
          <SupportContextCopyButton
            text={supportEmailDraftText}
            buttonLabel="Copy support email draft"
            successMessage="Support email draft copied. Paste it into your email client."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy email draft below."
            fallbackAriaLabel="Support email draft text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste into your email client."
          />
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
