export type NodeOdmPreset = {
  id: "fast-ortho" | "balanced" | "high-quality-3d";
  label: string;
  description: string;
  options: Array<{ name: string; value: unknown }>;
};

export const NODEODM_PRESETS: NodeOdmPreset[] = [
  {
    id: "fast-ortho",
    label: "Fast orthomosaic",
    description: "Quick ortho suitable for rapid site review. Lower quality, faster runtime.",
    options: [
      { name: "orthophoto-resolution", value: 5 },
      { name: "feature-quality", value: "medium" },
      { name: "min-num-features", value: 8000 },
      { name: "fast-orthophoto", value: true },
    ],
  },
  {
    id: "balanced",
    label: "Balanced deliverables",
    description: "Default ortho + DSM for client-ready mapping. Good accuracy with reasonable runtime.",
    options: [
      { name: "orthophoto-resolution", value: 3 },
      { name: "dsm", value: true },
      { name: "feature-quality", value: "high" },
      { name: "min-num-features", value: 12000 },
    ],
  },
  {
    id: "high-quality-3d",
    label: "High-quality 3D",
    description: "Full ortho + DSM + dense point cloud + mesh. Longer runtime; recommended for survey-grade work.",
    options: [
      { name: "orthophoto-resolution", value: 2 },
      { name: "dsm", value: true },
      { name: "dtm", value: true },
      { name: "feature-quality", value: "ultra" },
      { name: "min-num-features", value: 16000 },
      { name: "pc-quality", value: "high" },
      { name: "mesh-octree-depth", value: 12 },
    ],
  },
];

export function getPreset(id: NodeOdmPreset["id"]): NodeOdmPreset | undefined {
  return NODEODM_PRESETS.find((preset) => preset.id === id);
}
