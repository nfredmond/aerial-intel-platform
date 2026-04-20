import { describe, expect, it } from "vitest";

import type { MissionDetail } from "@/lib/missions/detail-data";

import { buildMissionBriefFacts } from "./mission-brief-facts";

function stubDetail(overrides: Partial<MissionDetail> = {}): MissionDetail {
  const now = "2026-04-15T00:00:00Z";
  const base: MissionDetail = {
    mission: {
      id: "m-1",
      org_id: "org-1",
      project_id: "p-1",
      site_id: "s-1",
      name: "Toledo-20 stormwater",
      slug: "toledo-20",
      mission_type: "mapping",
      status: "delivered",
      objective: "Stormwater basin capture plan",
      planning_geometry: null,
      summary: { area_ha: 18.42, planned_capture_date: "2026-04-15" },
      created_by: null,
      created_at: now,
      updated_at: now,
      archived_at: null,
    },
    project: {
      id: "p-1",
      org_id: "org-1",
      name: "Toledo Stormwater Program",
      slug: "toledo-sw",
      status: "active",
      description: null,
      created_by: null,
      created_at: now,
      updated_at: now,
      archived_at: null,
    },
    site: {
      id: "s-1",
      org_id: "org-1",
      project_id: "p-1",
      name: "Parcel 42",
      slug: "parcel-42",
      description: null,
      boundary: null,
      center: null,
      site_notes: {},
      created_by: null,
      created_at: now,
      updated_at: now,
      archived_at: null,
    } as unknown as MissionDetail["site"],
    versions: [],
    datasets: [
      {
        id: "d-1",
        org_id: "org-1",
        project_id: "p-1",
        site_id: "s-1",
        mission_id: "m-1",
        name: "Toledo-20 RGB",
        slug: "toledo-20-rgb",
        kind: "images",
        status: "ready",
        captured_at: "2026-04-15",
        spatial_footprint: null,
        metadata: { image_count: 312, median_altitude_m: 120 },
        created_by: null,
        created_at: now,
        updated_at: now,
        archived_at: null,
      } as unknown as MissionDetail["datasets"][number],
    ],
    ingestSessions: [],
    jobs: [
      {
        id: "job-xyz-12345678",
        org_id: "org-1",
        project_id: "p-1",
        site_id: "s-1",
        mission_id: "m-1",
        dataset_id: "d-1",
        engine: "nodeodm",
        preset_id: "default-high",
        status: "completed",
        stage: "complete",
        progress: 100,
        queue_position: null,
        input_summary: {},
        output_summary: {
          qa_gate: { minimum_pass: true, verdict: "green" },
        },
        external_job_reference: null,
        created_by: null,
        started_at: now,
        completed_at: now,
        created_at: now,
        updated_at: now,
      } as unknown as MissionDetail["jobs"][number],
    ],
    outputs: [
      { kind: "orthomosaic" },
      { kind: "orthomosaic" },
      { kind: "dsm" },
    ] as unknown as MissionDetail["outputs"],
    events: [],
    summary: {},
  };
  return { ...base, ...overrides };
}

describe("buildMissionBriefFacts", () => {
  it("captures mission, project, site, dataset, job, QA, and output-kind facts with stable ids", () => {
    const facts = buildMissionBriefFacts(stubDetail());
    const ids = facts.map((f) => f.id);

    expect(ids).toContain("mission:m-1:name");
    expect(ids).toContain("mission:m-1:type");
    expect(ids).toContain("mission:m-1:objective");
    expect(ids).toContain("mission:m-1:area_ha");
    expect(ids).toContain("project:p-1:name");
    expect(ids).toContain("site:s-1:name");
    expect(ids).toContain("dataset:d-1:image_count");
    expect(ids).toContain("dataset:d-1:altitude_m");
    expect(ids).toContain("dataset:d-1:captured_at");
    expect(ids).toContain("job:job-xyz-12345678:engine");
    expect(ids).toContain("job:job-xyz-12345678:preset");
    expect(ids).toContain("qa:job-xyz-12345678:minimum_pass");
    expect(ids).toContain("qa:job-xyz-12345678:verdict");
    expect(ids).toContain("outputs:m-1:orthomosaic");
    expect(ids).toContain("outputs:m-1:dsm");
  });

  it("aggregates output counts by kind, not per artifact", () => {
    const facts = buildMissionBriefFacts(stubDetail());
    const orthoFact = facts.find((f) => f.id === "outputs:m-1:orthomosaic");
    const dsmFact = facts.find((f) => f.id === "outputs:m-1:dsm");
    expect(orthoFact?.value).toBe("2 artifacts");
    expect(dsmFact?.value).toBe("1 artifact");
  });

  it("skips missing/empty values rather than emitting empty facts", () => {
    const bare = stubDetail({
      project: null,
      site: null,
      datasets: [],
      jobs: [],
      outputs: [],
    });
    const ids = buildMissionBriefFacts(bare).map((f) => f.id);
    expect(ids).not.toContain("project:p-1:name");
    expect(ids).not.toContain("site:s-1:name");
    expect(ids.some((id) => id.startsWith("dataset:"))).toBe(false);
    expect(ids.some((id) => id.startsWith("job:"))).toBe(false);
    expect(ids.some((id) => id.startsWith("outputs:"))).toBe(false);
  });
});
