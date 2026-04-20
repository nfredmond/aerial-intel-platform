import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildDispatchLaunchRequest,
  buildDispatchRequestId,
  getDispatchAdapterConfigSummary,
  launchDispatchViaAdapter,
} from "./dispatch-adapter";

const detail = {
  job: {
    id: "job-123",
    org_id: "org-1",
    project_id: "project-1",
    site_id: "site-1",
    mission_id: "mission-1",
    dataset_id: "dataset-1",
    engine: "odm",
    preset_id: "managed-processing-v1",
    status: "running",
    stage: "intake_review",
    progress: 15,
    queue_position: null,
    input_summary: {},
    output_summary: {},
    external_job_reference: null,
    created_by: null,
    created_at: "2026-04-06T17:00:00.000Z",
    updated_at: "2026-04-06T17:00:00.000Z",
    started_at: "2026-04-06T17:00:00.000Z",
    completed_at: null,
  },
  mission: {
    id: "mission-1",
    org_id: "org-1",
    project_id: "project-1",
    site_id: "site-1",
    name: "Downtown capture",
    slug: "downtown-capture",
    mission_type: "mapping",
    status: "active",
    objective: null,
    planning_geometry: null,
    summary: {},
    created_by: null,
    created_at: "2026-04-06T17:00:00.000Z",
    updated_at: "2026-04-06T17:00:00.000Z",
    archived_at: null,
  },
  project: {
    id: "project-1",
    org_id: "org-1",
    name: "GV Project",
    slug: "gv-project",
    status: "active",
    description: null,
    created_by: null,
    created_at: "2026-04-06T17:00:00.000Z",
    updated_at: "2026-04-06T17:00:00.000Z",
    archived_at: null,
  },
  site: null,
  dataset: {
    id: "dataset-1",
    org_id: "org-1",
    project_id: "project-1",
    site_id: "site-1",
    mission_id: "mission-1",
    name: "Block A imagery",
    slug: "block-a-imagery",
    kind: "imagery_zip",
    status: "ready",
    captured_at: null,
    spatial_footprint: null,
    metadata: {},
    created_by: null,
    created_at: "2026-04-06T17:00:00.000Z",
    updated_at: "2026-04-06T17:00:00.000Z",
    archived_at: null,
  },
  outputs: [],
  events: [],
  inputSummary: {},
  outputSummary: {},
} as const;

afterEach(() => {
  delete process.env.AERIAL_DISPATCH_ADAPTER_URL;
  delete process.env.AERIAL_DISPATCH_ADAPTER_LABEL;
  delete process.env.AERIAL_DISPATCH_ADAPTER_TOKEN;
  vi.restoreAllMocks();
});

describe("dispatch-adapter", () => {
  it("builds a deterministic request id", () => {
    expect(buildDispatchRequestId("job-123", { hostLabel: "ODM Host 01", workerLabel: "Worker A" }))
      .toBe("dispatch-job-123-odm-host-01-worker-a");
  });

  it("surfaces unconfigured adapter state when no endpoint exists", () => {
    expect(getDispatchAdapterConfigSummary()).toEqual({
      mode: "unconfigured",
      configured: false,
      adapterLabel: "Configured dispatch adapter",
      endpoint: null,
    });
  });

  it("builds the v1 launch contract payload", () => {
    const request = buildDispatchLaunchRequest({
      orgId: "org-1",
      detail: detail as never,
      source: "job-detail",
      handoff: {
        hostLabel: "single-host-odm-01",
        workerLabel: "docker-worker-2",
        dispatchNotes: "Use the downtown preset.",
      },
    });

    expect(request.contractVersion).toBe("aerial-dispatch-adapter.v1");
    expect(request.job.id).toBe("job-123");
    expect(request.dispatch.hostLabel).toBe("single-host-odm-01");
    expect(request.dataset.name).toBe("Block A imagery");
  });

  it("returns unconfigured when launch is requested without an adapter endpoint", async () => {
    const result = await launchDispatchViaAdapter({
      orgId: "org-1",
      detail: detail as never,
      source: "job-detail",
      handoff: {
        hostLabel: "single-host-odm-01",
        workerLabel: null,
        dispatchNotes: null,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.mode).toBe("unconfigured");
    if (result.ok) throw new Error("expected failure result");
    expect(result.error).toContain("No dispatch adapter endpoint");
  });

  it("accepts a webhook launch when an external run reference comes back", async () => {
    process.env.AERIAL_DISPATCH_ADAPTER_URL = "https://dispatch.example.com/launch";
    process.env.AERIAL_DISPATCH_ADAPTER_LABEL = "NodeODM dispatch webhook";

    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ external_run_reference: "run-42" }), {
        status: 202,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await launchDispatchViaAdapter({
      orgId: "org-1",
      detail: detail as never,
      source: "job-detail",
      handoff: {
        hostLabel: "single-host-odm-01",
        workerLabel: null,
        dispatchNotes: "Use standard args",
      },
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.externalRunReference).toBe("run-42");
      expect(result.adapterLabel).toBe("NodeODM dispatch webhook");
    }
  });
});
