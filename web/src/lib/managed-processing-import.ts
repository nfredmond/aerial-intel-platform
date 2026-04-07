import type { Json } from "@/lib/supabase/types";

type JsonRecord = Record<string, Json | undefined>;

export type ManagedImportUploadKind =
  | "benchmark_summary"
  | "run_log"
  | "review_bundle"
  | "orthophoto"
  | "dem"
  | "point_cloud"
  | "mesh";

export type ManagedImportOutputKind = "orthomosaic" | "dem" | "point_cloud" | "mesh";

export type ManagedImportSummaryOutput = {
  key: "orthophoto" | "dem" | "point_cloud" | "mesh";
  path: string;
  exists: boolean;
  nonZeroSize: boolean;
  sizeBytes: number;
};

export type ManagedImportSummary = {
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
  outputs: ManagedImportSummaryOutput[];
  raw: JsonRecord;
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as JsonRecord;
  }

  return value as JsonRecord;
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.filter((item): item is string => typeof item === "string");
}

function sanitizeStem(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "file";
}

function sanitizeFilename(input: string) {
  const trimmed = input.trim();
  if (!trimmed) {
    return "upload.bin";
  }

  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return `${sanitizeStem(trimmed)}.bin`;
  }

  const stem = sanitizeStem(trimmed.slice(0, lastDot));
  const extension = trimmed.slice(lastDot).toLowerCase().replace(/[^.a-z0-9]+/g, "");
  return `${stem}${extension || ".bin"}`;
}

export function buildManagedImportStoragePath(input: {
  orgSlug: string;
  jobId: string;
  kind: ManagedImportUploadKind;
  filename: string;
  uploadedAt?: string;
}) {
  const orgSlug = sanitizeStem(input.orgSlug || "org");
  const jobId = sanitizeStem(input.jobId || "job");
  const kind = sanitizeStem(input.kind || "evidence");
  const filename = sanitizeFilename(input.filename);
  const uploadedAt = (input.uploadedAt || new Date().toISOString()).replace(/[^0-9]/g, "").slice(0, 14) || "upload";

  return `${orgSlug}/managed-imports/${jobId}/${kind}/${uploadedAt}-${filename}`;
}

export function mapBenchmarkOutputKeyToArtifactKind(key: string): ManagedImportOutputKind | null {
  switch (key) {
    case "orthophoto":
      return "orthomosaic";
    case "dem":
      return "dem";
    case "point_cloud":
      return "point_cloud";
    case "mesh":
      return "mesh";
    default:
      return null;
  }
}

export function inferManagedImportFormat(key: string, filename: string) {
  if (key === "orthophoto" || key === "dem") {
    return "GeoTIFF";
  }

  if (key === "point_cloud") {
    return filename.toLowerCase().endsWith(".ply") ? "PLY" : "LAZ";
  }

  if (key === "mesh") {
    const extension = filename.split(".").pop()?.toUpperCase();
    return extension || "OBJ";
  }

  return "Derived artifact";
}

export function parseManagedBenchmarkSummaryText(rawText: string): ManagedImportSummary {
  let parsed: unknown;

  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("Benchmark summary JSON could not be parsed.");
  }

  const root = asRecord(parsed);
  const qaGate = asRecord(root.qa_gate);
  const outputsRecord = asRecord(root.outputs);

  if (!root.timestamp_utc || !root.outputs || typeof root.outputs !== "object") {
    throw new Error("Benchmark summary JSON is missing required benchmark fields.");
  }

  const outputs = (["orthophoto", "dem", "point_cloud", "mesh"] as const).map((key) => {
    const outputRecord = asRecord(outputsRecord[key]);
    return {
      key,
      path: asString(outputRecord.path, ""),
      exists: asBoolean(outputRecord.exists),
      nonZeroSize: asBoolean(outputRecord.non_zero_size),
      sizeBytes: asNumber(outputRecord.size_bytes),
    } satisfies ManagedImportSummaryOutput;
  });

  return {
    timestampUtc: asString(root.timestamp_utc, "Unknown start"),
    endTimestampUtc: asString(root.end_timestamp_utc, "Unknown end"),
    projectName: asString(root.project_name, "Unknown project"),
    datasetRoot: asString(root.dataset_root, "Unknown dataset root"),
    imageCount: asNumber(root.image_count),
    durationSeconds: asNumber(root.duration_seconds),
    odmImage: asString(root.odm_image, "Unknown image"),
    odmArgs: asString(root.odm_args, "Unknown args"),
    dockerVersion: asString(root.docker_version, "Unknown Docker version"),
    host: asString(root.host, "Unknown host"),
    runLog: asString(root.run_log, "Run log unavailable"),
    status: asString(root.status, "unknown"),
    runExitCode: asNumber(root.run_exit_code, -1),
    requiredOutputsPresent: asBoolean(qaGate.required_outputs_present),
    minimumPass: asBoolean(qaGate.minimum_pass),
    missingRequiredOutputs: asStringArray(qaGate.missing_required_outputs),
    outputs,
    raw: root,
  };
}
