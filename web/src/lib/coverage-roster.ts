import type { Json } from "@/lib/supabase/types";

import { getCoverageComparisonInsight } from "@/lib/geometry-insights";

export type CoverageRosterItem = {
  id: string;
  name: string;
  status: string;
  comparable: boolean;
  coveragePercent: number | null;
  overlapAreaAcres: number | null;
  summary: string;
};

export function getCoverageRoster(input: {
  missionGeometry: Json | null;
  datasets: Array<{
    id: string;
    name: string;
    status: string;
    spatialFootprint: Json | null;
  }>;
}) {
  return input.datasets
    .map((dataset) => {
      const comparison = getCoverageComparisonInsight({
        missionGeometry: input.missionGeometry,
        datasetGeometry: dataset.spatialFootprint,
      });

      return {
        id: dataset.id,
        name: dataset.name,
        status: dataset.status,
        comparable: comparison.comparable,
        coveragePercent: comparison.coveragePercent,
        overlapAreaAcres: comparison.overlapAreaAcres,
        summary: comparison.summary,
      } satisfies CoverageRosterItem;
    })
    .sort((left, right) => {
      if (left.comparable !== right.comparable) {
        return left.comparable ? -1 : 1;
      }

      return (right.coveragePercent ?? -1) - (left.coveragePercent ?? -1);
    });
}

export function buildCoverageRosterSummary(input: {
  missionName: string;
  items: CoverageRosterItem[];
}) {
  return [
    `Dataset Coverage Roster — ${input.missionName}`,
    ...input.items.map((item) => {
      const coverage = item.coveragePercent !== null ? `${item.coveragePercent}%` : "coverage unavailable";
      const overlap = item.overlapAreaAcres !== null ? `${item.overlapAreaAcres} acres overlap` : "overlap unavailable";
      return `- ${item.name} (${item.status}): ${coverage}, ${overlap}. ${item.summary}`;
    }),
  ].join("\n");
}
