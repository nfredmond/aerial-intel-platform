import { describe, expect, it } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { buildMissionVersionSnapshot, nextVersionNumber } from "./versions";

type MissionRow = Database["public"]["Tables"]["drone_missions"]["Row"];

function makeMission(overrides: Partial<MissionRow> = {}): MissionRow {
  return {
    id: "mission-1",
    org_id: "org-1",
    project_id: "project-1",
    site_id: "site-1",
    name: "Riverside AOI",
    slug: "riverside-aoi",
    mission_type: "mapping",
    status: "draft",
    objective: "Baseline orthomosaic",
    planning_geometry: { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] },
    summary: { lanes: 3 },
    created_by: null,
    created_at: "2026-04-16T00:00:00Z",
    updated_at: "2026-04-16T00:00:00Z",
    archived_at: null,
    ...overrides,
  };
}

describe("nextVersionNumber", () => {
  it("returns 1 when no versions exist", () => {
    expect(nextVersionNumber([])).toBe(1);
  });

  it("returns max + 1", () => {
    expect(nextVersionNumber([{ version_number: 1 }, { version_number: 4 }, { version_number: 2 }])).toBe(5);
  });
});

describe("buildMissionVersionSnapshot", () => {
  it("captures mission + geometry + summary into plan_payload", () => {
    const mission = makeMission();
    const insert = buildMissionVersionSnapshot({ mission, userId: "user-1", nextVersionNumber: 2 });

    expect(insert.mission_id).toBe("mission-1");
    expect(insert.org_id).toBe("org-1");
    expect(insert.version_number).toBe(2);
    expect(insert.created_by).toBe("user-1");
    expect(insert.status).toBe("draft");

    const payload = insert.plan_payload as Record<string, unknown>;
    expect((payload.mission as Record<string, unknown>).slug).toBe("riverside-aoi");
    expect(payload.planningGeometry).toBeTruthy();
    expect(payload.capturedAt).toBeTruthy();
    expect((payload.summary as Record<string, unknown>).lanes).toBe(3);
    expect(payload.note).toBe(null);
  });

  it("trims and preserves a snapshot note when provided", () => {
    const insert = buildMissionVersionSnapshot({
      mission: makeMission(),
      userId: null,
      nextVersionNumber: 1,
      note: "   Pre-fieldwork baseline   ",
    });
    const payload = insert.plan_payload as Record<string, unknown>;
    expect(payload.note).toBe("Pre-fieldwork baseline");
  });

  it("drops blank-only notes to null", () => {
    const insert = buildMissionVersionSnapshot({
      mission: makeMission(),
      userId: null,
      nextVersionNumber: 1,
      note: "   ",
    });
    const payload = insert.plan_payload as Record<string, unknown>;
    expect(payload.note).toBe(null);
  });

  it("handles null planning_geometry without crashing", () => {
    const insert = buildMissionVersionSnapshot({
      mission: makeMission({ planning_geometry: null }),
      userId: null,
      nextVersionNumber: 1,
    });
    const payload = insert.plan_payload as Record<string, unknown>;
    expect(payload.planningGeometry).toBe(null);
  });
});
