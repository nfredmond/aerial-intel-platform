export type RealOdmOutputSlot = { path: string; sizeBytes: number };

export type RealOdmBundleInventory = {
  hasBenchmarkSummary: boolean;
  orthophoto: RealOdmOutputSlot | null;
  dsm: RealOdmOutputSlot | null;
  dtm: RealOdmOutputSlot | null;
  pointCloud: RealOdmOutputSlot | null;
  mesh: RealOdmOutputSlot | null;
  entryCount: number;
};

const ORTHOPHOTO_PATHS = ["odm_orthophoto/odm_orthophoto.tif"];
const DSM_PATHS = ["odm_dem/dsm.tif"];
const DTM_PATHS = ["odm_dem/dtm.tif"];
const POINT_CLOUD_PATHS = [
  "odm_georeferencing/odm_georeferenced_model.laz",
  "entwine_pointcloud/ept.json",
];
const MESH_PATHS = [
  "odm_texturing/odm_textured_model_geo.obj",
  "odm_texturing/odm_textured_model.obj",
];

function firstMatch(
  entries: Record<string, Uint8Array>,
  candidates: readonly string[],
): RealOdmOutputSlot | null {
  for (const path of candidates) {
    const bytes = entries[path];
    if (bytes) {
      return { path, sizeBytes: bytes.length };
    }
  }
  return null;
}

export function inventoryNodeOdmBundle(
  entries: Record<string, Uint8Array>,
): RealOdmBundleInventory {
  return {
    hasBenchmarkSummary: Boolean(entries["benchmark_summary.json"]),
    orthophoto: firstMatch(entries, ORTHOPHOTO_PATHS),
    dsm: firstMatch(entries, DSM_PATHS),
    dtm: firstMatch(entries, DTM_PATHS),
    pointCloud: firstMatch(entries, POINT_CLOUD_PATHS),
    mesh: firstMatch(entries, MESH_PATHS),
    entryCount: Object.keys(entries).length,
  };
}

function slot(
  defaultPath: string,
  inventory: RealOdmOutputSlot | null,
): { path: string; exists: boolean; non_zero_size: boolean; size_bytes: number } {
  if (!inventory) {
    return { path: defaultPath, exists: false, non_zero_size: false, size_bytes: 0 };
  }
  return {
    path: inventory.path,
    exists: true,
    non_zero_size: inventory.sizeBytes > 0,
    size_bytes: inventory.sizeBytes,
  };
}

export function synthesizeBenchmarkSummary(
  inventory: RealOdmBundleInventory,
  context: { taskUuid: string; importedAt: string },
): Record<string, unknown> {
  const orthophotoPresent = Boolean(inventory.orthophoto && inventory.orthophoto.sizeBytes > 0);
  const dsmPresent = Boolean(inventory.dsm && inventory.dsm.sizeBytes > 0);
  const requiredOutputsPresent = orthophotoPresent && dsmPresent;

  const missingRequiredOutputs: string[] = [];
  if (!orthophotoPresent) missingRequiredOutputs.push("orthophoto");
  if (!dsmPresent) missingRequiredOutputs.push("dem");

  return {
    timestamp_utc: context.importedAt,
    end_timestamp_utc: context.importedAt,
    project_name: `nodeodm-${context.taskUuid.slice(0, 8)}`,
    dataset_root: "managed-by-nodeodm",
    image_count: 0,
    duration_seconds: 0,
    odm_image: "managed-by-nodeodm",
    odm_args: "",
    docker_version: "managed-by-nodeodm",
    host: "managed-by-nodeodm",
    run_log: "",
    status: requiredOutputsPresent ? "success" : "partial",
    run_exit_code: 0,
    outputs: {
      orthophoto: slot("odm_orthophoto/odm_orthophoto.tif", inventory.orthophoto),
      dem: slot("odm_dem/dsm.tif", inventory.dsm),
      point_cloud: slot(
        "odm_georeferencing/odm_georeferenced_model.laz",
        inventory.pointCloud,
      ),
      mesh: slot("odm_texturing/odm_textured_model_geo.obj", inventory.mesh),
    },
    qa_gate: {
      required_outputs_present: requiredOutputsPresent,
      minimum_pass: requiredOutputsPresent,
      missing_required_outputs: missingRequiredOutputs,
    },
    source: "nodeodm-real-bundle",
    task_uuid: context.taskUuid,
  };
}
