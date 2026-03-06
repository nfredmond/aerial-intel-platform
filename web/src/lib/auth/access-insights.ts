import type { DroneMembershipRole } from "@/lib/supabase/types";

export type BlockedAccessSupportField = {
  label: string;
  value: string;
};

export function formatEntitlementTier(tierId: string | null | undefined) {
  if (!tierId) {
    return "Unknown tier";
  }

  return tierId
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function formatMembershipRole(role: DroneMembershipRole | null) {
  if (!role) {
    return "Unknown";
  }

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
      "Share support@natfordplanning.com with your team for urgent access issues.",
    ];
  }

  return [
    "Validate that your organization and role details match your assignment.",
    `Coordinate with your org owner for ${tierLabel} plan changes or seat updates.`,
    "Report entitlement or data-access blockers to support@natfordplanning.com.",
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
    {
      label: "User ID",
      value: options.userId ?? "Unknown",
    },
    {
      label: "Signed-in email",
      value: options.email ?? "Unknown",
    },
    {
      label: "Organization ID",
      value: options.orgId ?? "Unknown",
    },
    {
      label: "Organization",
      value: options.orgName ?? "Unknown",
    },
    {
      label: "Organization slug",
      value: options.orgSlug ?? "Unknown",
    },
    {
      label: "Role",
      value: formatMembershipRole(options.role),
    },
    {
      label: "Membership linked",
      value: options.hasMembership ? "Yes" : "No",
    },
    {
      label: "Entitlement active",
      value: options.hasActiveEntitlement ? "Yes" : "No",
    },
    {
      label: "Entitlement tier",
      value: options.hasActiveEntitlement
        ? formatEntitlementTier(options.tierId)
        : "Not active",
    },
  ];
}

export function buildBlockedAccessSupportContext(options: {
  fields: BlockedAccessSupportField[];
  blockedReason: string | null | undefined;
  generatedAtIso?: string;
}) {
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const compactTimestamp = generatedAtIso.replace(/\D/g, "").slice(0, 14);
  const reference = compactTimestamp.length === 14 ? `AIR-${compactTimestamp}` : "AIR-UNKNOWN";

  return {
    reference,
    generatedAtIso,
    text: [
      `Support reference: ${reference}`,
      `Snapshot generated (UTC): ${generatedAtIso}`,
      ...options.fields.map((field) => `${field.label}: ${field.value}`),
      `Observed reason: ${options.blockedReason ?? "not provided"}`,
    ].join("\n"),
  };
}

export function buildBlockedAccessSupportContextJson(options: {
  reference: string;
  generatedAtIso: string;
  blockedReason: string | null | undefined;
  fields: BlockedAccessSupportField[];
}) {
  const diagnostics = Object.fromEntries(options.fields.map((field) => [field.label, field.value]));

  return JSON.stringify(
    {
      supportReference: options.reference,
      snapshotGeneratedUtc: options.generatedAtIso,
      observedReason: options.blockedReason ?? "not provided",
      diagnostics,
    },
    null,
    2,
  );
}
