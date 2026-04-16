import type { Database, Json } from "@/lib/supabase/types";
import type { MissionVersionInsert } from "@/lib/supabase/admin";

type MissionRow = Database["public"]["Tables"]["drone_missions"]["Row"];
type MissionVersionRow = Database["public"]["Tables"]["drone_mission_versions"]["Row"];

export function nextVersionNumber(existing: Pick<MissionVersionRow, "version_number">[]): number {
  if (existing.length === 0) return 1;
  const max = existing.reduce((acc, row) => (row.version_number > acc ? row.version_number : acc), 0);
  return max + 1;
}

export function buildMissionVersionSnapshot(input: {
  mission: MissionRow;
  userId: string | null;
  nextVersionNumber: number;
  note?: string | null;
}): MissionVersionInsert {
  const { mission, userId, note } = input;
  const capturedAt = new Date().toISOString();

  const planPayload = {
    capturedAt,
    mission: {
      id: mission.id,
      slug: mission.slug,
      name: mission.name,
      type: mission.mission_type,
      status: mission.status,
      objective: mission.objective,
    },
    planningGeometry: mission.planning_geometry ?? null,
    summary: mission.summary ?? {},
    note: note?.trim() ? note.trim() : null,
  } satisfies Record<string, unknown>;

  return {
    org_id: mission.org_id,
    mission_id: mission.id,
    version_number: input.nextVersionNumber,
    source_format: "native",
    status: "draft",
    plan_payload: planPayload as unknown as Json,
    validation_summary: {} as Json,
    export_summary: {} as Json,
    created_by: userId,
  };
}
