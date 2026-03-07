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
  createSupportGmailComposeUrl,
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

function escapeCsvCell(value: string) {
  const escaped = value.replaceAll('"', '""');

  if (/[",\n]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
}

function escapeTsvCell(value: string) {
  const escaped = value.replaceAll('"', '""');

  if (/["\t\n]/.test(escaped)) {
    return `"${escaped}"`;
  }

  return escaped;
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
  const supportGmailHref = createSupportGmailComposeUrl({
    subject: supportSubject,
    body: supportEmailBody,
  });

  const supportEmailDraftText = [`Subject: ${supportSubject}`, "", supportEmailBody].join("\n");
  const supportSnapshotTimestampUtc = supportContext.generatedAtIso;
  const signedInUserId = access.user?.id ?? "Unknown";
  const signedInAccountEmail = access.user?.email ?? "Unknown";
  const organizationId = access.org?.id ?? "Unknown";
  const organizationSlug = access.org?.slug ?? "Unknown";
  const organizationName = access.org?.name ?? "Unknown";
  const supportContextJson = buildBlockedAccessSupportContextJson({
    reference: supportContext.reference,
    generatedAtIso: supportContext.generatedAtIso,
    blockedReason: access.blockedReason,
    fields: supportFields,
  });
  const supportTicketTitle = [
    "DroneOps blocked access",
    signedInAccountEmail,
    `${organizationName} (${organizationSlug})`,
    supportContext.reference,
  ].join(" | ");
  const supportTicketHeaderLine = `### DroneOps blocked access · ${supportContext.reference} · ${signedInAccountEmail} · ${organizationName} (${organizationSlug})`;
  const observedBlockedReason = access.blockedReason ?? "not provided";
  const supportTriageSummary = [
    `Support reference: ${supportContext.reference}`,
    `Signed-in account: ${signedInAccountEmail}`,
    `Organization: ${access.org?.name ?? "Unknown"} (${access.org?.slug ?? "Unknown"})`,
    `Observed reason: ${observedBlockedReason}`,
  ].join("\n");
  const supportFollowUpLine = [
    `Ref ${supportContext.reference}`,
    `Acct ${signedInAccountEmail}`,
    `Org ${organizationName} (${organizationSlug})`,
    `Reason ${observedBlockedReason}`,
  ].join(" | ");
  const supportCallBrief = [
    "Hello support team — I’m calling about blocked DroneOps access.",
    `Support reference: ${supportContext.reference}.`,
    `Signed-in account: ${signedInAccountEmail}.`,
    `Organization: ${organizationName} (${organizationSlug}).`,
    `Observed reason: ${observedBlockedReason}.`,
    `Snapshot UTC: ${supportSnapshotTimestampUtc}.`,
  ].join(" ");
  const supportReferenceSnapshotLine = [
    `Ref ${supportContext.reference}`,
    `Snapshot ${supportSnapshotTimestampUtc}`,
  ].join(" | ");
  const supportDiagnosticsCsvBlock = [
    "support_reference,snapshot_utc,signed_in_account_email,organization_slug,organization_name,blocked_reason",
    [
      supportContext.reference,
      supportSnapshotTimestampUtc,
      signedInAccountEmail,
      organizationSlug,
      organizationName,
      observedBlockedReason,
    ]
      .map((value) => escapeCsvCell(value))
      .join(","),
  ].join("\n");
  const supportDiagnosticsTsvBlock = [
    "support_reference\tsnapshot_utc\tsigned_in_account_email\torganization_slug\torganization_name\tblocked_reason",
    [
      supportContext.reference,
      supportSnapshotTimestampUtc,
      signedInAccountEmail,
      organizationSlug,
      organizationName,
      observedBlockedReason,
    ]
      .map((value) => escapeTsvCell(value))
      .join("\t"),
  ].join("\n");
  const supportDiagnosticsKeyValueBlock = [
    `support_reference: ${supportContext.reference}`,
    `snapshot_utc: ${supportSnapshotTimestampUtc}`,
    `signed_in_account_email: ${signedInAccountEmail}`,
    `organization_slug: ${organizationSlug}`,
    `organization_name: ${organizationName}`,
    `blocked_reason: ${observedBlockedReason}`,
  ].join("\n");
  const supportDiagnosticsMarkdownBlock = [
    `- support_reference: ${supportContext.reference}`,
    `- snapshot_utc: ${supportSnapshotTimestampUtc}`,
    `- signed_in_account_email: ${signedInAccountEmail}`,
    `- organization_slug: ${organizationSlug}`,
    `- organization_name: ${organizationName}`,
    `- blocked_reason: ${observedBlockedReason}`,
  ].join("\n");
  const supportTicketBody = [
    supportTicketHeaderLine,
    "",
    `Support reference: ${supportContext.reference}`,
    `Snapshot UTC: ${supportSnapshotTimestampUtc}`,
    "",
    "Support triage summary:",
    supportTriageSummary,
    "",
    "Support diagnostics (markdown):",
    supportDiagnosticsMarkdownBlock,
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
  const operatorEscalationPacket = [
    `Support reference: ${supportContext.reference}`,
    `Snapshot UTC: ${supportSnapshotTimestampUtc}`,
    `Support inbox: ${DRONE_OPS_SUPPORT_EMAIL}`,
    `Support email link: ${supportHref}`,
    `Support Gmail compose link: ${supportGmailHref}`,
    "",
    "Support call brief:",
    supportCallBrief,
    "",
    "Support triage summary:",
    supportTriageSummary,
    "",
    "Operator handoff checklist:",
    operatorHandoffChecklist,
    "",
    "Support email draft:",
    supportEmailDraftText,
    "",
    "Support context JSON:",
    supportContextJson,
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
            text={signedInUserId}
            buttonLabel="Copy signed-in user ID"
            successMessage="Signed-in user ID copied. Paste it into support forms or ticket fields."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the signed-in user ID below."
            fallbackAriaLabel="Signed-in user ID text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this user ID into support chat, forms, or tickets."
          />
          <SupportContextCopyButton
            text={signedInAccountEmail}
            buttonLabel="Copy signed-in account email"
            successMessage="Signed-in account email copied. Paste it into support forms."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the signed-in account email below."
            fallbackAriaLabel="Signed-in account email text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this email into support chat, forms, or tickets."
          />
          <SupportContextCopyButton
            text={organizationId}
            buttonLabel="Copy organization ID"
            successMessage="Organization ID copied. Paste it into support forms or admin lookups."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the organization ID below."
            fallbackAriaLabel="Organization ID text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this ID into support chat, forms, or admin tools."
          />
          <SupportContextCopyButton
            text={organizationSlug}
            buttonLabel="Copy organization slug"
            successMessage="Organization slug copied. Paste it into support forms or org lookups."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the organization slug below."
            fallbackAriaLabel="Organization slug text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this slug into support chat, forms, or admin tools."
          />
          <SupportContextCopyButton
            text={organizationName}
            buttonLabel="Copy organization name"
            successMessage="Organization name copied. Paste it into support forms or ticket notes."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the organization name below."
            fallbackAriaLabel="Organization name text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this name into support chat, forms, or tickets."
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
            text={supportGmailHref}
            buttonLabel="Copy support Gmail compose link"
            successMessage="Support Gmail compose link copied. Paste it where webmail compose URLs are accepted."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support Gmail compose link below."
            fallbackAriaLabel="Support Gmail compose link text"
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
            text={supportFollowUpLine}
            buttonLabel="Copy support follow-up line"
            successMessage="Support follow-up line copied. Paste it into ticket comments or escalation chats."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support follow-up line below."
            fallbackAriaLabel="Support follow-up line text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this line into support ticket comments or chat."
          />
          <SupportContextCopyButton
            text={supportCallBrief}
            buttonLabel="Copy support call brief"
            successMessage="Support call brief copied. Use it as a phone-ready opener with support."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support call brief below."
            fallbackAriaLabel="Support call brief text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then use this brief in phone support handoffs or call notes."
          />
          <SupportContextCopyButton
            text={supportReferenceSnapshotLine}
            buttonLabel="Copy support reference + snapshot line"
            successMessage="Support reference + snapshot line copied. Paste it into ticket comments for traceability."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support reference + snapshot line below."
            fallbackAriaLabel="Support reference + snapshot line text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this line into support ticket comments or handoff notes."
          />
          <SupportContextCopyButton
            text={supportDiagnosticsCsvBlock}
            buttonLabel="Copy support diagnostics CSV block"
            successMessage="Support diagnostics CSV block copied. Paste it into spreadsheets or CSV-friendly ticket fields."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support diagnostics CSV block below."
            fallbackAriaLabel="Support diagnostics CSV block text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this CSV block into spreadsheets, docs, or support forms."
          />
          <SupportContextCopyButton
            text={supportDiagnosticsTsvBlock}
            buttonLabel="Copy support diagnostics TSV block"
            successMessage="Support diagnostics TSV block copied. Paste it into spreadsheet columns or tab-friendly ticket fields."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support diagnostics TSV block below."
            fallbackAriaLabel="Support diagnostics TSV block text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this TSV block into spreadsheets, docs, or support forms."
          />
          <SupportContextCopyButton
            text={supportDiagnosticsKeyValueBlock}
            buttonLabel="Copy support diagnostics key-value block"
            successMessage="Support diagnostics key-value block copied. Paste it into plain-text ticket fields or chat threads."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support diagnostics key-value block below."
            fallbackAriaLabel="Support diagnostics key-value block text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this key-value block into docs, chat, or support forms."
          />
          <SupportContextCopyButton
            text={supportDiagnosticsMarkdownBlock}
            buttonLabel="Copy support diagnostics markdown block"
            successMessage="Support diagnostics markdown block copied. Paste it into markdown-ready docs, tickets, or chat threads."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support diagnostics markdown block below."
            fallbackAriaLabel="Support diagnostics markdown block text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this markdown block into docs, tickets, or chat."
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
            text={operatorEscalationPacket}
            buttonLabel="Copy operator escalation packet"
            successMessage="Operator escalation packet copied. Paste it into ticket threads or support handoff docs."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy operator escalation packet below."
            fallbackAriaLabel="Operator escalation packet text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this packet into support ticket threads or handoff docs."
          />
          <SupportContextCopyButton
            text={supportTicketTitle}
            buttonLabel="Copy support ticket title"
            successMessage="Support ticket title copied. Paste it into ticket systems or escalation threads."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support ticket title below."
            fallbackAriaLabel="Support ticket title text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this title into support ticket fields or escalation chat subjects."
          />
          <SupportContextCopyButton
            text={supportTicketHeaderLine}
            buttonLabel="Copy support ticket header line"
            successMessage="Support ticket header line copied. Paste it into markdown tickets, notes, or escalation docs."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support ticket header line below."
            fallbackAriaLabel="Support ticket header line text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this markdown header line into support ticket notes or docs."
          />
          <SupportContextCopyButton
            text={supportTicketBody}
            buttonLabel="Copy support ticket body"
            successMessage="Support ticket body copied. Paste it into support ticket bodies or escalation docs."
            fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy support ticket body below."
            fallbackAriaLabel="Support ticket body text"
            fallbackHintMessage="Press Ctrl/Cmd+C, then paste this ticket body into support ticket systems or escalation notes."
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
          <a
            className="button button-secondary"
            href={supportGmailHref}
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
