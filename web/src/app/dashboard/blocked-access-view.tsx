import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";
import {
  buildBlockedAccessSupportContext,
  buildBlockedAccessSupportContextJson,
  getBlockedAccessDetails,
  getBlockedAccessSupportFields,
} from "@/lib/auth/access-insights";
import {
  DRONE_OPS_SUPPORT_EMAIL,
  buildBlockedAccessSupportSubject,
  createSupportMailto,
} from "@/lib/support";

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
  const supportSnapshotTimestampUtc = supportContext.generatedAtIso;
  const signedInAccountEmail = access.user?.email ?? "Unknown";
  const supportContextJson = buildBlockedAccessSupportContextJson({
    reference: supportContext.reference,
    generatedAtIso: supportContext.generatedAtIso,
    blockedReason: access.blockedReason,
    fields: supportFields,
  });
  const observedBlockedReason = access.blockedReason ?? "not provided";
  const supportTriageSummary = [
    `Support reference: ${supportContext.reference}`,
    `Signed-in account: ${signedInAccountEmail}`,
    `Organization: ${access.org?.name ?? "Unknown"} (${access.org?.slug ?? "Unknown"})`,
    `Observed reason: ${observedBlockedReason}`,
  ].join("\n");
  const operatorHandoffChecklist = [
    `Support reference: ${supportContext.reference}`,
    `Signed-in account: ${signedInAccountEmail}`,
    `Support inbox: ${DRONE_OPS_SUPPORT_EMAIL}`,
    `Recommended email subject: ${supportSubject}`,
    "Operator handoff checklist:",
    "1) Paste the support triage summary into the ticket or chat thread.",
    "2) Include support context JSON when the form accepts structured fields.",
    "3) Keep the support reference in every follow-up message.",
  ].join("\n");

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
            text={signedInAccountEmail}
            buttonLabel="Copy signed-in account email"
            successMessage="Signed-in account email copied. Paste it into support forms."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the signed-in account email below."
            fallbackAriaLabel="Signed-in account email text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this email into support chat, forms, or tickets."
          />
          <SupportContextCopyButton
            text={DRONE_OPS_SUPPORT_EMAIL}
            buttonLabel="Copy support email address"
            successMessage="Support email address copied. Paste it into your email client."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the support email address below."
            fallbackAriaLabel="Support email address text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste into your email client."
          />
          <SupportContextCopyButton
            text={supportHref}
            buttonLabel="Copy support email link"
            successMessage="Support email link copied. Paste it where mailto links are accepted."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support email link below."
            fallbackAriaLabel="Support email link text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this link into chat, docs, or your browser."
          />
          <SupportContextCopyButton
            text={supportContext.reference}
            buttonLabel="Copy support reference"
            successMessage="Support reference copied. Share it with support."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the support reference below."
            fallbackAriaLabel="Support reference text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then share this reference with support."
          />
          <SupportContextCopyButton
            text={supportSnapshotTimestampUtc}
            buttonLabel="Copy support snapshot timestamp"
            successMessage="Snapshot timestamp copied. Share it with support for case traceability."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the support snapshot timestamp below."
            fallbackAriaLabel="Support snapshot timestamp text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then share this UTC timestamp with support."
          />
          <SupportContextCopyButton
            text={supportTriageSummary}
            buttonLabel="Copy support triage summary"
            successMessage="Support triage summary copied. Paste it into chat, tickets, or call notes."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support triage summary below."
            fallbackAriaLabel="Support triage summary text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this summary into support channels."
          />
          <SupportContextCopyButton
            text={observedBlockedReason}
            buttonLabel="Copy blocked-access reason"
            successMessage="Blocked-access reason copied. Paste it into support forms or call notes."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy blocked-access reason below."
            fallbackAriaLabel="Blocked-access reason text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this reason into support chat, forms, or notes."
          />
          <SupportContextCopyButton
            text={operatorHandoffChecklist}
            buttonLabel="Copy operator handoff checklist"
            successMessage="Operator handoff checklist copied. Paste it into your support workflow notes."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy operator handoff checklist below."
            fallbackAriaLabel="Operator handoff checklist text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this checklist into your support handoff notes."
          />
          <SupportContextCopyButton
            text={supportSubject}
            buttonLabel="Copy support email subject"
            successMessage="Support email subject copied. Paste it into your email client."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy email subject below."
            fallbackAriaLabel="Support email subject text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste into your email subject line."
          />
          <SupportContextCopyButton
            text={supportEmailBody}
            buttonLabel="Copy support email body"
            successMessage="Support email body copied. Paste it into your email client."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy email body below."
            fallbackAriaLabel="Support email body text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste into your email body."
          />
          <SupportContextCopyButton text={supportContext.text} />
          <SupportContextCopyButton
            text={supportContextJson}
            buttonLabel="Copy support context JSON"
            successMessage="Support context JSON copied. Paste it into ticket forms that accept JSON."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy JSON support context below."
            fallbackAriaLabel="Support context JSON text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste into your support ticket form."
          />
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
