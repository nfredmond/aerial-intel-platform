import {
  isNodeOdmInfo,
  isNodeOdmTaskInfo,
  isNodeOdmTaskNewResponse,
  type NodeOdmInfo,
  type NodeOdmTaskInfo,
} from "./contracts";
import { NodeOdmError } from "./errors";

export type NodeOdmClientConfig = {
  baseUrl: string;
  token?: string;
  fetchImpl?: typeof fetch;
  /** Override millisecond request timeout. Defaults to 30s. */
  timeoutMs?: number;
};

export type CreateTaskInit = {
  name?: string;
  options?: Array<{ name: string; value: unknown }>;
};

function buildUrl(base: string, path: string, token?: string): string {
  const normalized = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const url = `${normalized}${suffix}`;
  if (!token) return url;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}token=${encodeURIComponent(token)}`;
}

async function parseJson<T>(response: Response, context: string): Promise<T> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    throw new NodeOdmError("validation", `${context}: response was not valid JSON`, {
      status: response.status,
      cause: error,
    });
  }
  return body as T;
}

function mapStatusToKind(status: number): "auth" | "not_found" | "validation" | "network" {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "not_found";
  if (status >= 400 && status < 500) return "validation";
  return "network";
}

function ensureOk(response: Response, context: string): void {
  if (response.ok) return;
  const kind = mapStatusToKind(response.status);
  throw new NodeOdmError(kind, `${context}: ${response.status} ${response.statusText}`, {
    status: response.status,
  });
}

export class NodeOdmClient {
  private readonly baseUrl: string;
  private readonly token?: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(config: NodeOdmClientConfig) {
    if (!config.baseUrl) {
      throw new NodeOdmError("validation", "NodeOdmClient requires a baseUrl");
    }
    this.baseUrl = config.baseUrl;
    this.token = config.token;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  private async request(path: string, init: RequestInit, context: string): Promise<Response> {
    const url = buildUrl(this.baseUrl, path, this.token);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, { ...init, signal: controller.signal });
      return response;
    } catch (error) {
      if ((error as { name?: string }).name === "AbortError") {
        throw new NodeOdmError("network", `${context}: request timed out after ${this.timeoutMs}ms`, { cause: error });
      }
      throw new NodeOdmError("network", `${context}: fetch failed`, { cause: error });
    } finally {
      clearTimeout(timeout);
    }
  }

  async info(): Promise<NodeOdmInfo> {
    const response = await this.request("/info", { method: "GET" }, "NodeODM info");
    ensureOk(response, "NodeODM info");
    const body = await parseJson<unknown>(response, "NodeODM info");
    if (!isNodeOdmInfo(body)) {
      throw new NodeOdmError("validation", "NodeODM info: unexpected response shape");
    }
    return body;
  }

  async createTask(init: CreateTaskInit = {}): Promise<string> {
    const form = new FormData();
    if (init.name) form.append("name", init.name);
    if (init.options && init.options.length > 0) {
      form.append("options", JSON.stringify(init.options));
    }
    const response = await this.request("/task/new/init", { method: "POST", body: form }, "NodeODM createTask");
    ensureOk(response, "NodeODM createTask");
    const body = await parseJson<unknown>(response, "NodeODM createTask");
    if (!isNodeOdmTaskNewResponse(body)) {
      throw new NodeOdmError("validation", "NodeODM createTask: missing uuid");
    }
    return body.uuid;
  }

  async uploadImages(uuid: string, files: Array<{ blob: Blob; filename: string }>): Promise<void> {
    for (const file of files) {
      const form = new FormData();
      form.append("images", file.blob, file.filename);
      const response = await this.request(
        `/task/new/upload/${encodeURIComponent(uuid)}`,
        { method: "POST", body: form },
        `NodeODM uploadImages (${file.filename})`,
      );
      ensureOk(response, `NodeODM uploadImages (${file.filename})`);
    }
  }

  async commitTask(uuid: string): Promise<void> {
    const response = await this.request(
      `/task/new/commit/${encodeURIComponent(uuid)}`,
      { method: "POST" },
      "NodeODM commitTask",
    );
    ensureOk(response, "NodeODM commitTask");
  }

  async taskInfo(uuid: string): Promise<NodeOdmTaskInfo> {
    const response = await this.request(
      `/task/${encodeURIComponent(uuid)}/info`,
      { method: "GET" },
      "NodeODM taskInfo",
    );
    ensureOk(response, "NodeODM taskInfo");
    const body = await parseJson<unknown>(response, "NodeODM taskInfo");
    if (!isNodeOdmTaskInfo(body)) {
      throw new NodeOdmError("validation", "NodeODM taskInfo: unexpected response shape");
    }
    return body;
  }

  async taskOutput(uuid: string, line = 0): Promise<string[]> {
    const response = await this.request(
      `/task/${encodeURIComponent(uuid)}/output?line=${encodeURIComponent(String(line))}`,
      { method: "GET" },
      "NodeODM taskOutput",
    );
    ensureOk(response, "NodeODM taskOutput");
    const body = await parseJson<unknown>(response, "NodeODM taskOutput");
    if (!Array.isArray(body)) {
      throw new NodeOdmError("validation", "NodeODM taskOutput: expected array");
    }
    return body.filter((item): item is string => typeof item === "string");
  }

  async cancelTask(uuid: string): Promise<void> {
    const response = await this.request(
      `/task/cancel`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `uuid=${encodeURIComponent(uuid)}`,
      },
      "NodeODM cancelTask",
    );
    ensureOk(response, "NodeODM cancelTask");
  }

  async removeTask(uuid: string): Promise<void> {
    const response = await this.request(
      `/task/remove`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `uuid=${encodeURIComponent(uuid)}`,
      },
      "NodeODM removeTask",
    );
    ensureOk(response, "NodeODM removeTask");
  }

  /**
   * Downloads the complete output bundle for a task. Returns the response so the caller can stream the body to storage.
   */
  async downloadAllAssets(uuid: string): Promise<Response> {
    const response = await this.request(
      `/task/${encodeURIComponent(uuid)}/download/all.zip`,
      { method: "GET" },
      "NodeODM downloadAllAssets",
    );
    ensureOk(response, "NodeODM downloadAllAssets");
    return response;
  }
}

export function createNodeOdmClient(config: NodeOdmClientConfig): NodeOdmClient {
  return new NodeOdmClient(config);
}
