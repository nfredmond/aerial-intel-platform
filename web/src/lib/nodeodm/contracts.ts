export type NodeOdmInfo = {
  version: string;
  taskQueueCount: number;
  maxImages: number | null;
  maxParallelTasks: number | null;
  engineVersion: string;
  availableOptions?: Array<{ name: string; type: string; value?: unknown; help?: string }>;
};

export type NodeOdmTaskNewResponse = {
  uuid: string;
};

export type NodeOdmTaskStatusCode =
  | 10 // QUEUED
  | 20 // RUNNING
  | 30 // FAILED
  | 40 // COMPLETED
  | 50; // CANCELED

export type NodeOdmTaskInfo = {
  uuid: string;
  name?: string;
  dateCreated?: number;
  processingTime?: number;
  imagesCount?: number;
  progress?: number;
  status?: { code: NodeOdmTaskStatusCode; errorMessage?: string };
  options?: Array<{ name: string; value: unknown }>;
};

export type NodeOdmTaskOutput = {
  /** Lines of log or stderr output; shape varies by NodeODM version */
  output: string[];
};

export function isNodeOdmTaskNewResponse(value: unknown): value is NodeOdmTaskNewResponse {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    typeof (value as { uuid?: unknown }).uuid === "string"
  );
}

export function isNodeOdmInfo(value: unknown): value is NodeOdmInfo {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<NodeOdmInfo>;
  return typeof v.version === "string" && typeof v.engineVersion === "string";
}

export function isNodeOdmTaskInfo(value: unknown): value is NodeOdmTaskInfo {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<NodeOdmTaskInfo>;
  return typeof v.uuid === "string";
}

export function statusCodeName(code: NodeOdmTaskStatusCode | undefined): string {
  switch (code) {
    case 10:
      return "queued";
    case 20:
      return "running";
    case 30:
      return "failed";
    case 40:
      return "completed";
    case 50:
      return "canceled";
    default:
      return "unknown";
  }
}
