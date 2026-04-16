import type { DroneMembershipRole } from "@/lib/supabase/types";

export const DRONE_OPS_ROLES: readonly DroneMembershipRole[] = [
  "owner",
  "admin",
  "analyst",
  "viewer",
] as const;

export const DRONE_OPS_ACTIONS = [
  "missions.read",
  "missions.write",
  "missions.delete",
  "datasets.read",
  "datasets.write",
  "datasets.delete",
  "ingest.read",
  "ingest.write",
  "jobs.read",
  "jobs.create",
  "jobs.launch",
  "jobs.retry",
  "jobs.cancel",
  "jobs.import-outputs",
  "artifacts.read",
  "artifacts.write",
  "artifacts.share",
  "artifacts.export",
  "handoffs.read",
  "handoffs.write",
  "versions.read",
  "versions.write",
  "versions.promote",
  "admin.memberships",
  "admin.entitlements",
  "admin.support",
] as const;

export type DroneOpsAction = (typeof DRONE_OPS_ACTIONS)[number];

const READ_ACTIONS: DroneOpsAction[] = [
  "missions.read",
  "datasets.read",
  "ingest.read",
  "jobs.read",
  "artifacts.read",
  "handoffs.read",
  "versions.read",
];

const ANALYST_WRITE_ACTIONS: DroneOpsAction[] = [
  "missions.write",
  "datasets.write",
  "ingest.write",
  "jobs.create",
  "jobs.launch",
  "jobs.retry",
  "jobs.import-outputs",
  "artifacts.write",
  "artifacts.share",
  "artifacts.export",
  "handoffs.write",
  "versions.write",
  "versions.promote",
];

const ADMIN_DESTRUCTIVE_ACTIONS: DroneOpsAction[] = [
  "missions.delete",
  "datasets.delete",
  "jobs.cancel",
  "admin.memberships",
  "admin.entitlements",
  "admin.support",
];

export const DRONE_OPS_ROLE_ACTION_MATRIX: Record<DroneMembershipRole, readonly DroneOpsAction[]> = {
  viewer: [...READ_ACTIONS],
  analyst: [...READ_ACTIONS, ...ANALYST_WRITE_ACTIONS],
  admin: [...READ_ACTIONS, ...ANALYST_WRITE_ACTIONS, ...ADMIN_DESTRUCTIVE_ACTIONS],
  owner: [...READ_ACTIONS, ...ANALYST_WRITE_ACTIONS, ...ADMIN_DESTRUCTIVE_ACTIONS],
};

export function normalizeDroneOpsRole(
  role: string | null | undefined
): DroneMembershipRole | null {
  const normalized = role?.trim().toLowerCase();
  if (!normalized) return null;
  if ((DRONE_OPS_ROLES as readonly string[]).includes(normalized)) {
    return normalized as DroneMembershipRole;
  }
  return null;
}

export function computeDroneOpsActions(
  role: string | null | undefined
): DroneOpsAction[] {
  const normalized = normalizeDroneOpsRole(role);
  if (!normalized) return [];
  return [...DRONE_OPS_ROLE_ACTION_MATRIX[normalized]];
}

export function roleCanPerformDroneOpsAction(
  role: string | null | undefined,
  action: DroneOpsAction
): boolean {
  const normalized = normalizeDroneOpsRole(role);
  if (!normalized) return false;
  return DRONE_OPS_ROLE_ACTION_MATRIX[normalized].includes(action);
}

export type DroneOpsActionContext = {
  role: DroneMembershipRole | null;
  hasActiveEntitlement: boolean;
  actions: readonly DroneOpsAction[];
};

export function canPerformDroneOpsAction(
  context: DroneOpsActionContext | null | undefined,
  action: DroneOpsAction
): boolean {
  if (!context) return false;
  if (!context.hasActiveEntitlement) return false;
  return context.actions.includes(action);
}

export function assertDroneOpsAction(
  context: DroneOpsActionContext | null | undefined,
  action: DroneOpsAction
): void {
  if (!canPerformDroneOpsAction(context, action)) {
    throw new Error(`Forbidden: missing action "${action}" for current role.`);
  }
}
