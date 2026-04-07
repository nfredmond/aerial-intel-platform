import type { JobDetail } from "@/lib/missions/detail-data";
import type { ManagedDispatchHandoffInput, ManagedProcessingActionSource } from "@/lib/managed-processing";

type DispatchAdapterMode = "unconfigured" | "webhook";

type DispatchLaunchResponseBody = Record<string, unknown> | string | null;

export type DispatchAdapterConfigSummary = {
  mode: DispatchAdapterMode;
  configured: boolean;
  adapterLabel: string;
  endpoint: string | null;
};

export type DispatchLaunchRequest = {
  contractVersion: "aerial-dispatch-adapter.v1";
  requestId: string;
  source: ManagedProcessingActionSource;
  requestedAt: string;
  orgId: string;
  job: {
    id: string;
    engine: string;
    presetId: string | null;
  };
  project: {
    id: string | null;
    name: string | null;
  };
  mission: {
    id: string | null;
    name: string | null;
  };
  dataset: {
    id: string | null;
    name: string | null;
  };
  dispatch: {
    hostLabel: string;
    workerLabel: string | null;
    dispatchNotes: string | null;
  };
};

export type DispatchLaunchResult =
  | {
    ok: true;
    mode: "webhook";
    adapterLabel: string;
    endpoint: string;
    requestId: string;
    responseStatus: number;
    acceptedAt: string;
    externalRunReference: string;
    responseBody: DispatchLaunchResponseBody;
  }
  | {
    ok: false;
    mode: DispatchAdapterMode;
    adapterLabel: string;
    endpoint: string | null;
    requestId: string;
    responseStatus: number | null;
    error: string;
    responseBody: DispatchLaunchResponseBody;
  };

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "default";
}

function getDispatchAdapterMode(): DispatchAdapterMode {
  const endpoint = normalizeOptionalString(process.env.AERIAL_DISPATCH_ADAPTER_URL);
  return endpoint ? "webhook" : "unconfigured";
}

function getDispatchAdapterLabel() {
  return normalizeOptionalString(process.env.AERIAL_DISPATCH_ADAPTER_LABEL) ?? "Configured dispatch adapter";
}

function getDispatchAdapterEndpoint() {
  return normalizeOptionalString(process.env.AERIAL_DISPATCH_ADAPTER_URL);
}

function getDispatchAdapterToken() {
  return normalizeOptionalString(process.env.AERIAL_DISPATCH_ADAPTER_TOKEN);
}

export function getDispatchAdapterConfigSummary(): DispatchAdapterConfigSummary {
  const mode = getDispatchAdapterMode();
  const endpoint = getDispatchAdapterEndpoint();

  return {
    mode,
    configured: mode === "webhook" && Boolean(endpoint),
    adapterLabel: getDispatchAdapterLabel(),
    endpoint,
  };
}

export function buildDispatchRequestId(jobId: string, handoff: Pick<ManagedDispatchHandoffInput, "hostLabel" | "workerLabel">) {
  return `dispatch-${jobId}-${slugify(handoff.hostLabel)}-${slugify(handoff.workerLabel ?? "default")}`;
}

export function buildDispatchLaunchRequest(input: {
  orgId: string;
  detail: JobDetail;
  source: ManagedProcessingActionSource;
  handoff: Pick<ManagedDispatchHandoffInput, "hostLabel" | "workerLabel" | "dispatchNotes">;
}) : DispatchLaunchRequest {
  return {
    contractVersion: "aerial-dispatch-adapter.v1",
    requestId: buildDispatchRequestId(input.detail.job.id, input.handoff),
    source: input.source,
    requestedAt: new Date().toISOString(),
    orgId: input.orgId,
    job: {
      id: input.detail.job.id,
      engine: input.detail.job.engine,
      presetId: input.detail.job.preset_id,
    },
    project: {
      id: input.detail.project?.id ?? null,
      name: input.detail.project?.name ?? null,
    },
    mission: {
      id: input.detail.mission?.id ?? null,
      name: input.detail.mission?.name ?? null,
    },
    dataset: {
      id: input.detail.dataset?.id ?? null,
      name: input.detail.dataset?.name ?? null,
    },
    dispatch: {
      hostLabel: input.handoff.hostLabel,
      workerLabel: normalizeOptionalString(input.handoff.workerLabel),
      dispatchNotes: normalizeOptionalString(input.handoff.dispatchNotes),
    },
  };
}

function readResponseValue(body: DispatchLaunchResponseBody, ...keys: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }

  for (const key of keys) {
    const value = body[key];
    const normalized = typeof value === "string" ? normalizeOptionalString(value) : null;
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

async function readDispatchResponseBody(response: Response): Promise<DispatchLaunchResponseBody> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const parsed = await response.json();
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  try {
    const text = await response.text();
    return text.trim().length > 0 ? text : null;
  } catch {
    return null;
  }
}

export async function launchDispatchViaAdapter(input: {
  orgId: string;
  detail: JobDetail;
  source: ManagedProcessingActionSource;
  handoff: Pick<ManagedDispatchHandoffInput, "hostLabel" | "workerLabel" | "dispatchNotes">;
}) : Promise<DispatchLaunchResult> {
  const config = getDispatchAdapterConfigSummary();
  const request = buildDispatchLaunchRequest(input);

  if (!config.configured || !config.endpoint) {
    return {
      ok: false,
      mode: "unconfigured",
      adapterLabel: config.adapterLabel,
      endpoint: null,
      requestId: request.requestId,
      responseStatus: null,
      error: "No dispatch adapter endpoint is configured in the web environment.",
      responseBody: request,
    };
  }

  const token = getDispatchAdapterToken();

  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-aerial-dispatch-contract": request.contractVersion,
        "x-aerial-dispatch-request-id": request.requestId,
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(request),
      cache: "no-store",
    });
  } catch (error) {
    return {
      ok: false,
      mode: "webhook",
      adapterLabel: config.adapterLabel,
      endpoint: config.endpoint,
      requestId: request.requestId,
      responseStatus: null,
      error: error instanceof Error && error.message.trim().length > 0
        ? error.message
        : "The configured dispatch adapter could not be reached.",
      responseBody: request,
    };
  }

  const responseBody = await readDispatchResponseBody(response);

  if (!response.ok) {
    return {
      ok: false,
      mode: "webhook",
      adapterLabel: config.adapterLabel,
      endpoint: config.endpoint,
      requestId: request.requestId,
      responseStatus: response.status,
      error: `Dispatch adapter returned HTTP ${response.status}.`,
      responseBody,
    };
  }

  const externalRunReference =
    readResponseValue(responseBody, "externalRunReference", "external_run_reference", "runId", "run_id")
    ?? response.headers.get("x-external-run-reference")
    ?? null;

  if (!externalRunReference) {
    return {
      ok: false,
      mode: "webhook",
      adapterLabel: config.adapterLabel,
      endpoint: config.endpoint,
      requestId: request.requestId,
      responseStatus: response.status,
      error: "Dispatch adapter did not return an external run reference.",
      responseBody,
    };
  }

  return {
    ok: true,
    mode: "webhook",
    adapterLabel: config.adapterLabel,
    endpoint: config.endpoint,
    requestId: request.requestId,
    responseStatus: response.status,
    acceptedAt: new Date().toISOString(),
    externalRunReference,
    responseBody,
  };
}
