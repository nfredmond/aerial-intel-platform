import { createConfiguredNodeOdmClient, getNodeOdmAdapterConfig, type NodeOdmAdapterConfig } from "@/lib/nodeodm/config";
import { getPreset, NODEODM_PRESETS, type NodeOdmPreset } from "@/lib/nodeodm/presets";
import { NodeOdmError } from "@/lib/nodeodm/errors";

export type NodeOdmDispatchLaunchResult =
  | {
      ok: true;
      taskUuid: string;
      adapterLabel: string;
      presetId: NodeOdmPreset["id"];
      acceptedAt: string;
    }
  | {
      ok: false;
      kind: "unconfigured" | "validation" | "network" | "auth" | "not_found" | "task_failed" | "unknown";
      message: string;
    };

export type NodeOdmDispatchLaunchInput = {
  jobId: string;
  presetId: NodeOdmPreset["id"] | null | undefined;
  taskName?: string;
};

export function getNodeOdmDispatchSummary(): NodeOdmAdapterConfig & { label: string } {
  const config = getNodeOdmAdapterConfig();
  return {
    ...config,
    label: "NodeODM direct (aerial-dispatch-adapter.nodeodm.v1)",
  };
}

export function listNodeOdmPresets(): NodeOdmPreset[] {
  return NODEODM_PRESETS;
}

/**
 * Creates a NodeODM task from the selected preset and returns its uuid.
 * Image upload + commit happen in a second step after the caller has uploaded the dataset.
 */
export async function launchNodeOdmTask(input: NodeOdmDispatchLaunchInput): Promise<NodeOdmDispatchLaunchResult> {
  const client = createConfiguredNodeOdmClient();
  if (!client) {
    return {
      ok: false,
      kind: "unconfigured",
      message: "NodeODM adapter is not configured. Set AERIAL_NODEODM_URL to enable direct NodeODM dispatch.",
    };
  }

  const preset = getPreset(input.presetId ?? "balanced") ?? getPreset("balanced")!;
  const taskName = input.taskName ?? `aerial-intel-${input.jobId}`;

  try {
    const taskUuid = await client.createTask({
      name: taskName,
      options: preset.options,
    });
    return {
      ok: true,
      taskUuid,
      adapterLabel: "NodeODM direct",
      presetId: preset.id,
      acceptedAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof NodeOdmError) {
      return { ok: false, kind: error.kind, message: error.message };
    }
    return {
      ok: false,
      kind: "unknown",
      message: error instanceof Error ? error.message : "NodeODM dispatch failed",
    };
  }
}

/**
 * Fetches current NodeODM task status for a known uuid. Used by the poll cron.
 */
export async function pollNodeOdmTask(taskUuid: string) {
  const client = createConfiguredNodeOdmClient();
  if (!client) {
    throw new NodeOdmError("validation", "NodeODM adapter is not configured; cannot poll.");
  }
  return client.taskInfo(taskUuid);
}
