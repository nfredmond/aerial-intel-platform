import type { DroneMembershipRole } from "@/lib/supabase/types";

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
