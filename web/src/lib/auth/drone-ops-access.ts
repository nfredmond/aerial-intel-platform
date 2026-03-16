import { isAuthSessionMissingError, type User } from "@supabase/supabase-js";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, DroneMembershipRole } from "@/lib/supabase/types";

type MembershipRow = Database["public"]["Tables"]["drone_memberships"]["Row"];
type EntitlementRow = Database["public"]["Tables"]["drone_entitlements"]["Row"];
type OrgRow = Database["public"]["Tables"]["drone_orgs"]["Row"];

export type DroneOpsAccessResult = {
  user: User | null;
  isAuthenticated: boolean;
  hasMembership: boolean;
  hasActiveEntitlement: boolean;
  role: DroneMembershipRole | null;
  org: OrgRow | null;
  entitlement: EntitlementRow | null;
  blockedReason: string | null;
};

function buildSignedOutAccess(): DroneOpsAccessResult {
  return {
    user: null,
    isAuthenticated: false,
    hasMembership: false,
    hasActiveEntitlement: false,
    role: null,
    org: null,
    entitlement: null,
    blockedReason: "You must sign in to access DroneOps.",
  };
}

export async function getDroneOpsAccess(): Promise<DroneOpsAccessResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    if (isAuthSessionMissingError(userError)) {
      return buildSignedOutAccess();
    }

    throw userError;
  }

  if (!user) {
    return buildSignedOutAccess();
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("drone_memberships")
    .select("org_id, user_id, role, created_at")
    .eq("user_id", user.id);

  if (membershipError) {
    throw membershipError;
  }

  const typedMemberships = (memberships ?? []) as MembershipRow[];

  if (typedMemberships.length === 0) {
    return {
      user,
      isAuthenticated: true,
      hasMembership: false,
      hasActiveEntitlement: false,
      role: null,
      org: null,
      entitlement: null,
      blockedReason:
        "No organization membership was found for your account. Please contact support.",
    };
  }

  const orgIds = typedMemberships.map((membership) => membership.org_id);
  const primaryMembership = typedMemberships[0] ?? null;

  const { data: orgs, error: orgError } = await supabase
    .from("drone_orgs")
    .select("id, name, slug, created_at")
    .in("id", orgIds);

  if (orgError) {
    throw orgError;
  }

  const typedOrgs = (orgs ?? []) as OrgRow[];
  const orgById = new Map(typedOrgs.map((org) => [org.id, org]));
  const fallbackOrg = primaryMembership
    ? (orgById.get(primaryMembership.org_id) ?? null)
    : null;

  const { data: entitlements, error: entitlementError } = await supabase
    .from("drone_entitlements")
    .select(
      "id, org_id, product_id, tier_id, status, source, external_reference, created_at, updated_at",
    )
    .eq("product_id", "drone-ops")
    .eq("status", "active")
    .in("org_id", orgIds);

  if (entitlementError) {
    throw entitlementError;
  }

  const typedEntitlements = (entitlements ?? []) as EntitlementRow[];

  const entitlementByOrgId = new Map(
    typedEntitlements.map((entitlement) => [entitlement.org_id, entitlement]),
  );

  const entitledMembership = typedMemberships.find((membership) =>
    entitlementByOrgId.has(membership.org_id),
  );

  if (!entitledMembership) {
    return {
      user,
      isAuthenticated: true,
      hasMembership: true,
      hasActiveEntitlement: false,
      role: primaryMembership?.role ?? null,
      org: fallbackOrg,
      entitlement: null,
      blockedReason:
        "Your organization does not currently have an active DroneOps entitlement.",
    };
  }

  const entitlement = entitlementByOrgId.get(entitledMembership.org_id) ?? null;
  const entitledOrg = orgById.get(entitledMembership.org_id) ?? null;

  return {
    user,
    isAuthenticated: true,
    hasMembership: true,
    hasActiveEntitlement: true,
    role: entitledMembership.role,
    org: entitledOrg,
    entitlement,
    blockedReason: null,
  };
}
