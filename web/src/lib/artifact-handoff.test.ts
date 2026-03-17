import { describe, expect, it } from "vitest";

import {
  buildArtifactExportPacket,
  buildArtifactShareSummary,
  getArtifactHandoff,
  summarizeArtifactHandoffs,
  updateArtifactHandoffMetadata,
} from "./artifact-handoff";

describe("artifact handoff helpers", () => {
  it("defaults to pending review when no handoff metadata exists", () => {
    const handoff = getArtifactHandoff({});

    expect(handoff.stage).toBe("pending_review");
    expect(handoff.stageLabel).toBe("Pending review");
    expect(handoff.nextAction).toContain("Review artifact quality");
  });

  it("progresses through reviewed, shared, and exported states", () => {
    const reviewed = updateArtifactHandoffMetadata(
      {
        format: "COG",
      },
      {
        reviewedAt: "2026-03-17T19:35:00.000Z",
        reviewedByEmail: "reviewer@example.com",
      },
    );

    const reviewedSummary = getArtifactHandoff(reviewed);
    expect(reviewedSummary.stage).toBe("reviewed");
    expect(reviewedSummary.reviewedByEmail).toBe("reviewer@example.com");

    const shared = updateArtifactHandoffMetadata(reviewed, {
      sharedAt: "2026-03-17T19:45:00.000Z",
      sharedByEmail: "ops@example.com",
    });

    const sharedSummary = getArtifactHandoff(shared);
    expect(sharedSummary.stage).toBe("shared");
    expect(sharedSummary.sharedByEmail).toBe("ops@example.com");
    expect(sharedSummary.nextAction).toContain("Export/package");

    const exported = updateArtifactHandoffMetadata(shared, {
      exportedAt: "2026-03-17T20:00:00.000Z",
      exportedByEmail: "ops@example.com",
      note: "Final PDF packet delivered to project folder.",
    });

    const exportedSummary = getArtifactHandoff(exported);
    expect(exportedSummary.stage).toBe("exported");
    expect(exportedSummary.exportedByEmail).toBe("ops@example.com");
    expect(exportedSummary.note).toContain("Final PDF packet");
    expect((exported.handoff as Record<string, unknown>).stage).toBe("exported");
  });

  it("summarizes handoff counts across multiple artifacts", () => {
    const counts = summarizeArtifactHandoffs([
      {},
      updateArtifactHandoffMetadata({}, {
        reviewedAt: "2026-03-17T19:35:00.000Z",
        reviewedByEmail: "reviewer@example.com",
      }),
      updateArtifactHandoffMetadata({}, {
        reviewedAt: "2026-03-17T19:35:00.000Z",
        reviewedByEmail: "reviewer@example.com",
        sharedAt: "2026-03-17T19:45:00.000Z",
        sharedByEmail: "ops@example.com",
      }),
      updateArtifactHandoffMetadata({}, {
        reviewedAt: "2026-03-17T19:35:00.000Z",
        reviewedByEmail: "reviewer@example.com",
        sharedAt: "2026-03-17T19:45:00.000Z",
        sharedByEmail: "ops@example.com",
        exportedAt: "2026-03-17T20:00:00.000Z",
        exportedByEmail: "ops@example.com",
      }),
    ]);

    expect(counts).toEqual({
      pendingReviewCount: 1,
      reviewedCount: 1,
      sharedCount: 1,
      exportedCount: 1,
    });
  });

  it("persists custom handoff note and next action overrides", () => {
    const updated = updateArtifactHandoffMetadata({}, {
      note: "Client requested extra QA note about seam lines.",
      nextAction: "Share revised export packet with the field lead.",
    });

    const summary = getArtifactHandoff(updated);
    expect(summary.note).toContain("extra QA note");
    expect(summary.nextAction).toContain("field lead");
  });

  it("builds share and export packet strings with handoff context", () => {
    const handoff = getArtifactHandoff(
      updateArtifactHandoffMetadata({}, {
        reviewedAt: "2026-03-17T19:35:00.000Z",
        reviewedByEmail: "reviewer@example.com",
      }),
    );

    const shareSummary = buildArtifactShareSummary({
      artifactName: "South slope orthomosaic",
      missionName: "Colgate south slope baseline",
      projectName: "Colgate yard",
      status: "ready",
      storagePath: "acme/missions/123/ortho.tif",
      handoffStageLabel: handoff.stageLabel,
    });

    expect(shareSummary).toContain("Handoff: Reviewed");
    expect(shareSummary).toContain("Path: acme/missions/123/ortho.tif");

    const packet = buildArtifactExportPacket({
      artifactName: "South slope orthomosaic",
      artifactKind: "orthomosaic",
      artifactStatus: "ready",
      artifactFormat: "COG",
      missionName: "Colgate south slope baseline",
      projectName: "Colgate yard",
      datasetName: "South slope image batch",
      storagePath: "acme/missions/123/ortho.tif",
      deliveryNote: "Ready for review",
      handoff,
    });

    expect(packet).toContain("Handoff stage: Reviewed");
    expect(packet).toContain("Next action:");
  });
});
