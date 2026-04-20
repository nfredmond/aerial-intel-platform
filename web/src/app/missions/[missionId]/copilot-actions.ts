"use server";

import {
  runMissionBriefForMission,
  type MissionBriefServerResult,
} from "@/lib/copilot/mission-brief-server";

export type MissionBriefFormState = MissionBriefServerResult | { status: "idle" };

export async function generateMissionBriefAction(
  _prev: MissionBriefFormState,
  formData: FormData,
): Promise<MissionBriefFormState> {
  const missionId = formData.get("missionId");
  if (typeof missionId !== "string" || !missionId) {
    return { status: "error", message: "Missing missionId" };
  }
  return runMissionBriefForMission(missionId);
}
