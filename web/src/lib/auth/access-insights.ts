import type { DroneMembershipRole } from "@/lib/supabase/types";
import {
  DRONE_OPS_SUPPORT_EMAIL,
  buildBlockedAccessSupportSubject,
  createSupportGmailComposeUrl,
  createSupportMailto,
} from "@/lib/support";

export type BlockedAccessSupportField = {
  label: string;
  value: string;
};

export function formatEntitlementTier(tierId: string | null | undefined) {
  if (!tierId) return "Unknown tier";
  return tierId
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMembershipRole(role: DroneMembershipRole | null) {
  if (!role) return "Unknown";
  return role[0].toUpperCase() + role.slice(1);
}

export function getDashboardNextActions(options: {
  role: DroneMembershipRole | null;
  tierId: string | null | undefined;
}) {
  const tierLabel = formatEntitlementTier(options.tierId);
  const role = options.role;

  if (role === "owner" || role === "admin") {
    return [
      "Confirm team roles so pilots and analysts have the right access level.",
      `Review what is included in your ${tierLabel} entitlement for upcoming deliverables.`,
      `Share ${DRONE_OPS_SUPPORT_EMAIL} with your team for urgent access issues.`,
    ];
  }

  return [
    "Validate that your organization and role details match your assignment.",
    `Coordinate with your org owner for ${tierLabel} plan changes or seat updates.`,
    `Report entitlement or data-access blockers to ${DRONE_OPS_SUPPORT_EMAIL}.`,
  ];
}

export function getBlockedAccessDetails(options: {
  hasMembership: boolean;
  hasActiveEntitlement: boolean;
}) {
  if (!options.hasMembership) {
    return {
      title: "No DroneOps organization membership found",
      explanation:
        "Your account is authenticated, but it is not linked to a DroneOps organization in our membership table.",
      nextSteps: [
        "Confirm you signed in with the same email used during purchase or provisioning.",
        "Ask your organization owner to add you to the DroneOps membership roster.",
        "Contact support with your organization name and purchase details if this is unexpected.",
      ],
    };
  }

  if (!options.hasActiveEntitlement) {
    return {
      title: "Organization entitlement is inactive",
      explanation:
        "We found your organization membership, but there is no active entitlement record for product_id=\"drone-ops\".",
      nextSteps: [
        "Verify that billing is current and your DroneOps entitlement status is active.",
        "If your purchase was recent, allow a short provisioning window and try again.",
        "Contact support to restore or validate the entitlement record.",
      ],
    };
  }

  return {
    title: "Access check complete",
    explanation: "Your membership and entitlement are both active.",
    nextSteps: [],
  };
}

export function getBlockedAccessSupportFields(options: {
  userId: string | null | undefined;
  email: string | null | undefined;
  orgId: string | null | undefined;
  orgName: string | null | undefined;
  orgSlug: string | null | undefined;
  role: DroneMembershipRole | null;
  hasMembership: boolean;
  hasActiveEntitlement: boolean;
  tierId: string | null | undefined;
}): BlockedAccessSupportField[] {
  return [
    { label: "User ID", value: options.userId ?? "Unknown" },
    { label: "Signed-in email", value: options.email ?? "Unknown" },
    { label: "Organization ID", value: options.orgId ?? "Unknown" },
    { label: "Organization", value: options.orgName ?? "Unknown" },
    { label: "Organization slug", value: options.orgSlug ?? "Unknown" },
    { label: "Role", value: formatMembershipRole(options.role) },
    { label: "Membership linked", value: options.hasMembership ? "Yes" : "No" },
    { label: "Entitlement active", value: options.hasActiveEntitlement ? "Yes" : "No" },
    {
      label: "Entitlement tier",
      value: options.hasActiveEntitlement ? formatEntitlementTier(options.tierId) : "Not active",
    },
  ];
}

export type SupportPacketInput = {
  fields: BlockedAccessSupportField[];
  blockedReason: string | null | undefined;
  generatedAtIso?: string;
};

type BaseSupportBlock = {
  reference: string;
  generatedAtIso: string;
  blockedReason: string;
};

function normalizeBlock(input: SupportPacketInput): BaseSupportBlock {
  const generatedAtIso = input.generatedAtIso ?? new Date().toISOString();
  const compactTimestamp = generatedAtIso.replace(/\D/g, "").slice(0, 14);
  const reference = compactTimestamp.length === 14 ? `AIR-${compactTimestamp}` : "AIR-UNKNOWN";
  const blockedReason = input.blockedReason ?? "not provided";
  return { reference, generatedAtIso, blockedReason };
}

export function buildSupportSummary(input: SupportPacketInput) {
  const { reference, generatedAtIso, blockedReason } = normalizeBlock(input);
  const text = [
    `Support reference: ${reference}`,
    `Snapshot generated (UTC): ${generatedAtIso}`,
    ...input.fields.map((field) => `${field.label}: ${field.value}`),
    `Observed reason: ${blockedReason}`,
  ].join("\n");

  return { reference, generatedAtIso, text };
}

export function buildSupportJson(input: SupportPacketInput) {
  const { reference, generatedAtIso, blockedReason } = normalizeBlock(input);
  const diagnostics = Object.fromEntries(input.fields.map((f) => [f.label, f.value]));
  const text = JSON.stringify(
    {
      supportReference: reference,
      snapshotGeneratedUtc: generatedAtIso,
      observedReason: blockedReason,
      diagnostics,
    },
    null,
    2
  );
  return { reference, generatedAtIso, text };
}

export function buildSupportMarkdown(input: SupportPacketInput) {
  const { reference, generatedAtIso, blockedReason } = normalizeBlock(input);
  const text = [
    `## Support reference ${reference}`,
    `Snapshot generated (UTC): ${generatedAtIso}`,
    "",
    ...input.fields.map((field) => `- **${field.label}:** ${field.value}`),
    "",
    `**Observed reason:** ${blockedReason}`,
  ].join("\n");
  return { reference, generatedAtIso, text };
}

export function buildSupportEmailDraft(input: SupportPacketInput) {
  const summary = buildSupportSummary(input);
  const subject = buildBlockedAccessSupportSubject(summary.reference);
  const body = [
    "Hello support team,",
    "",
    "My DroneOps access is currently blocked.",
    "",
    summary.text,
    "",
    "Please help me restore access.",
  ].join("\n");

  return {
    reference: summary.reference,
    generatedAtIso: summary.generatedAtIso,
    subject,
    body,
    text: `Subject: ${subject}\n\n${body}`,
    mailtoHref: createSupportMailto({ subject, body }),
    gmailHref: createSupportGmailComposeUrl({ subject, body }),
  };
}

export type SupportDiagnosticsPacket = {
  reference: string;
  generatedAtIso: string;
  supportEmail: string;
  emailSubject: string;
  mailtoHref: string;
  gmailHref: string;
  summary: string;
  emailDraft: string;
  json: string;
  markdown: string;
};

export function buildSupportDiagnosticsPacket(input: SupportPacketInput): SupportDiagnosticsPacket {
  const summary = buildSupportSummary(input);
  const email = buildSupportEmailDraft(input);
  const json = buildSupportJson(input);
  const markdown = buildSupportMarkdown(input);

  return {
    reference: summary.reference,
    generatedAtIso: summary.generatedAtIso,
    supportEmail: DRONE_OPS_SUPPORT_EMAIL,
    emailSubject: email.subject,
    mailtoHref: email.mailtoHref,
    gmailHref: email.gmailHref,
    summary: summary.text,
    emailDraft: email.text,
    json: json.text,
    markdown: markdown.text,
  };
}
