import { zipSync, strToU8 } from "fflate";

import type { MissionDetail } from "@/lib/missions/detail-data";

export type InstallBundleInput = {
  detail: MissionDetail;
  generatedAtIso: string;
};

type FileMap = Record<string, Uint8Array>;

function missionReadme(detail: MissionDetail, generatedAtIso: string): string {
  const { mission, project, site } = detail;
  return [
    `# Mission install bundle — ${mission.name}`,
    ``,
    `_Generated ${generatedAtIso}_`,
    ``,
    `## Context`,
    ``,
    `- **Project:** ${project?.name ?? "Unknown project"}`,
    `- **Site:** ${site?.name ?? "Unknown site"}`,
    `- **Mission type:** ${mission.mission_type}`,
    `- **Status:** ${mission.status}`,
    `- **Objective:** ${mission.objective ?? "Not recorded"}`,
    ``,
    `## Files`,
    ``,
    `- \`manifest.json\` — machine-readable mission metadata snapshot.`,
    `- \`planning.geojson\` — current planning geometry (mission AOI).`,
    `- \`site.geojson\` — site boundary geometry when available.`,
    ``,
    `## Usage`,
    ``,
    `Import these files into your field tool of choice (DJI Fly, Pix4D Capture, DroneDeploy, QGIS).`,
    `The manifest contains the Aerial Operations OS mission identifier so field outcomes can be linked`,
    `back to the originating mission on ingest.`,
    ``,
  ].join("\n");
}

function missionManifest(detail: MissionDetail, generatedAtIso: string) {
  const { mission, project, site } = detail;
  return {
    schemaVersion: "aerial-intel.install-bundle.v1",
    generatedAtUtc: generatedAtIso,
    mission: {
      id: mission.id,
      name: mission.name,
      slug: mission.slug,
      type: mission.mission_type,
      status: mission.status,
      objective: mission.objective,
      createdAt: mission.created_at,
      updatedAt: mission.updated_at,
    },
    project: project
      ? {
          id: project.id,
          name: project.name,
          slug: project.slug,
          status: project.status,
        }
      : null,
    site: site
      ? {
          id: site.id,
          name: site.name,
          slug: site.slug,
        }
      : null,
    hasPlanningGeometry: Boolean(mission.planning_geometry),
    hasSiteBoundary: Boolean(site?.boundary),
  };
}

export function buildInstallBundle(input: InstallBundleInput): Uint8Array {
  const { detail, generatedAtIso } = input;
  const files: FileMap = {
    "README.md": strToU8(missionReadme(detail, generatedAtIso)),
    "manifest.json": strToU8(JSON.stringify(missionManifest(detail, generatedAtIso), null, 2)),
  };

  if (detail.mission.planning_geometry) {
    files["planning.geojson"] = strToU8(
      JSON.stringify(
        {
          type: "Feature",
          properties: { mission_id: detail.mission.id, label: "Mission AOI" },
          geometry: detail.mission.planning_geometry,
        },
        null,
        2,
      ),
    );
  }

  if (detail.site?.boundary) {
    files["site.geojson"] = strToU8(
      JSON.stringify(
        {
          type: "Feature",
          properties: { site_id: detail.site.id, label: detail.site.name },
          geometry: detail.site.boundary,
        },
        null,
        2,
      ),
    );
  }

  return zipSync(files);
}

export function installBundleFilename(detail: MissionDetail, generatedAtIso: string): string {
  const slug = detail.mission.slug || detail.mission.id.slice(0, 8);
  const stamp = generatedAtIso.replace(/[-:.TZ]/g, "").slice(0, 14);
  return `mission-${slug}-install-${stamp}.zip`;
}
