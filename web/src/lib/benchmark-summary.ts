import type { Json } from "@/lib/supabase/types";

type JsonRecord = Record<string, Json | undefined>;

export type BenchmarkOutputKey = "orthophoto" | "dem" | "point_cloud" | "mesh";

export type BenchmarkOutputSummary = {
  key: BenchmarkOutputKey;
  path: string;
  exists: boolean;
  nonZeroSize: boolean;
  sizeBytes: number;
};

export type BenchmarkSummaryView = {
  timestampUtc: string;
  endTimestampUtc: string;
  projectName: string;
  datasetRoot: string;
  imageCount: number;
  durationSeconds: number;
  odmImage: string;
  odmArgs: string;
  dockerVersion: string;
  host: string;
  runLog: string;
  status: string;
  runExitCode: number;
  requiredOutputsPresent: boolean;
  minimumPass: boolean;
  missingRequiredOutputs: string[];
  outputs: BenchmarkOutputSummary[];
};

function asRecord(value: Json | undefined): JsonRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as JsonRecord;
}

function asString(value: Json | undefined, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: Json | undefined, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: Json | undefined, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: Json | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function getOutputSummary(
  outputsRecord: JsonRecord,
  key: BenchmarkOutputKey,
): BenchmarkOutputSummary {
  const record = asRecord(outputsRecord[key]);

  return {
    key,
    path: asString(record.path, "Path unavailable"),
    exists: asBoolean(record.exists),
    nonZeroSize: asBoolean(record.non_zero_size),
    sizeBytes: asNumber(record.size_bytes),
  };
}

export function getBenchmarkSummaryView(value: Json | undefined): BenchmarkSummaryView | null {
  const root = asRecord(value);
  const benchmarkRecord = root.benchmarkSummary ? asRecord(root.benchmarkSummary) : root;

  if (!benchmarkRecord.timestamp_utc && !benchmarkRecord.project_name && !benchmarkRecord.outputs) {
    return null;
  }

  const qaGate = asRecord(benchmarkRecord.qa_gate);
  const outputsRecord = asRecord(benchmarkRecord.outputs);

  return {
    timestampUtc: asString(benchmarkRecord.timestamp_utc, "Unknown start"),
    endTimestampUtc: asString(benchmarkRecord.end_timestamp_utc, "Unknown end"),
    projectName: asString(benchmarkRecord.project_name, "Unknown project"),
    datasetRoot: asString(benchmarkRecord.dataset_root, "Unknown dataset root"),
    imageCount: asNumber(benchmarkRecord.image_count),
    durationSeconds: asNumber(benchmarkRecord.duration_seconds),
    odmImage: asString(benchmarkRecord.odm_image, "Unknown image"),
    odmArgs: asString(benchmarkRecord.odm_args, "Unknown args"),
    dockerVersion: asString(benchmarkRecord.docker_version, "Unknown Docker version"),
    host: asString(benchmarkRecord.host, "Unknown host"),
    runLog: asString(benchmarkRecord.run_log, "Run log unavailable"),
    status: asString(benchmarkRecord.status, "unknown"),
    runExitCode: asNumber(benchmarkRecord.run_exit_code, -1),
    requiredOutputsPresent: asBoolean(qaGate.required_outputs_present),
    minimumPass: asBoolean(qaGate.minimum_pass),
    missingRequiredOutputs: asStringArray(qaGate.missing_required_outputs),
    outputs: [
      getOutputSummary(outputsRecord, "orthophoto"),
      getOutputSummary(outputsRecord, "dem"),
      getOutputSummary(outputsRecord, "point_cloud"),
      getOutputSummary(outputsRecord, "mesh"),
    ],
  };
}

export function getBenchmarkOutputForArtifact(
  summary: BenchmarkSummaryView | null,
  artifactKind: string,
) {
  if (!summary) {
    return null;
  }

  const benchmarkKey = artifactKind === "orthomosaic"
    ? "orthophoto"
    : artifactKind === "dsm" || artifactKind === "dtm" || artifactKind === "dem"
      ? "dem"
      : artifactKind === "point_cloud"
        ? "point_cloud"
        : artifactKind === "mesh" || artifactKind === "tiles_3d"
          ? "mesh"
          : null;

  if (!benchmarkKey) {
    return null;
  }

  return summary.outputs.find((output) => output.key === benchmarkKey) ?? null;
}
