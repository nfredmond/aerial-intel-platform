import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";

import { getArtifactHandoff } from "@/lib/artifact-handoff";

import {
  buildMissionDeliveryPacketZip,
  deliveryPacketFilename,
  summarizeDeliveryPacketEligibility,
  type DeliveryPacketArtifact,
} from "./delivery-packet";

function createArtifact(overrides: Partial<DeliveryPacketArtifact> = {}): DeliveryPacketArtifact {
  const metadata = {
    name: "Toledo orthomosaic",
    format: "COG GeoTIFF",
    delivery: "Client-ready orthomosaic link",
    handoff: {
      reviewedAt: "2026-04-23T10:00:00.000Z",
      reviewedByEmail: "reviewer@example.com",
      sharedAt: "2026-04-23T11:00:00.000Z",
      sharedByEmail: "reviewer@example.com",
      note: "Checked before packet creation.",
    },
    copilotReportSummary: {
      summary: "This orthomosaic is ready for client review based on the recorded approval.",
      modelId: "anthropic/claude-haiku-4.5",
      generatedAt: "2026-04-23T12:00:00.000Z",
      keptSentences: 1,
      totalSentences: 1,
    },
  };

  return {
    id: "artifact-1",
    name: "Toledo orthomosaic",
    kind: "orthomosaic",
    status: "ready",
    format: "COG GeoTIFF",
    deliveryNote: "Client-ready orthomosaic link",
    storageBucket: "drone-ops",
    storagePath: "nat-ford/jobs/job-1/orthomosaic.tif",
    handoff: getArtifactHandoff(metadata),
    latestApproval: {
      id: "approval-1",
      org_id: "org-1",
      artifact_id: "artifact-1",
      reviewer_user_id: "user-1",
      reviewer_email: "reviewer@example.com",
      decision: "approved",
      note: "Looks ready.",
      decided_at: "2026-04-23T13:00:00.000Z",
      created_at: "2026-04-23T13:00:00.000Z",
      updated_at: "2026-04-23T13:00:00.000Z",
    },
    comments: [
      {
        id: "comment-1",
        org_id: "org-1",
        artifact_id: "artifact-1",
        parent_id: null,
        author_user_id: "user-2",
        author_email: "analyst@example.com",
        body: "Confirm CRS before client use.",
        resolved_at: null,
        created_at: "2026-04-23T09:00:00.000Z",
        updated_at: "2026-04-23T09:00:00.000Z",
      },
    ],
    shareLink: {
      id: "share-1",
      org_id: "org-1",
      artifact_id: "artifact-1",
      token: "token-1",
      note: "Delivery packet",
      max_uses: 10,
      use_count: 0,
      expires_at: "2026-05-01T00:00:00.000Z",
      revoked_at: null,
      last_used_at: null,
      created_by: "user-1",
      created_at: "2026-04-23T14:00:00.000Z",
      updated_at: "2026-04-23T14:00:00.000Z",
    },
    shareUrl: "https://app.example/s/token-1",
    metadata,
    ...overrides,
  };
}

describe("buildMissionDeliveryPacketZip", () => {
  it("creates review docs and governed links without embedding artifact binaries", () => {
    const zip = buildMissionDeliveryPacketZip({
      packetId: "packet-1",
      title: "Toledo client packet",
      mission: {
        id: "mission-1",
        name: "Toledo 20",
        objective: "Map corridor conditions.",
        status: "validated",
      },
      projectName: "Toledo project",
      siteName: "Southwest site",
      generatedAtIso: "2026-04-24T12:00:00.000Z",
      generatedByEmail: "nathaniel@example.com",
      note: "Client delivery",
      artifacts: [createArtifact()],
    });

    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual([
      "README.md",
      "artifact-links.csv",
      "artifacts/01-toledo-orthomosaic.md",
      "manifest.json",
      "review-summary.md",
    ]);
    expect(Object.keys(files).some((name) => name.endsWith(".tif"))).toBe(false);

    const readme = strFromU8(files["README.md"]);
    expect(readme).toContain("Large artifact files are not embedded");
    expect(readme).toContain("governed `/s/` links");

    const links = strFromU8(files["artifact-links.csv"]);
    expect(links).toContain("https://app.example/s/token-1");

    const artifactSheet = strFromU8(files["artifacts/01-toledo-orthomosaic.md"]);
    expect(artifactSheet).toContain("This orthomosaic is ready for client review");
    expect(artifactSheet).toContain("Unresolved comments: 1");

    const manifest = JSON.parse(strFromU8(files["manifest.json"])) as Record<string, unknown>;
    expect(manifest.schemaVersion).toBe("aerial-intel.delivery-packet.v1");
    expect(manifest.packetId).toBe("packet-1");
  });
});

describe("deliveryPacketFilename", () => {
  it("normalizes titles and appends a compact UTC timestamp", () => {
    expect(deliveryPacketFilename("Toledo Client Packet!", "2026-04-24T12:34:56.000Z")).toBe(
      "toledo-client-packet-20260424123456.zip",
    );
  });
});

describe("summarizeDeliveryPacketEligibility", () => {
  it("counts packet-ready, approved, and blocked artifacts", () => {
    expect(
      summarizeDeliveryPacketEligibility({
        readyArtifactCount: 3,
        approvedArtifactCount: 2,
        totalArtifactCount: 5,
      }),
    ).toEqual({
      readyArtifactCount: 3,
      approvedArtifactCount: 2,
      ineligibleCount: 3,
    });
  });
});
