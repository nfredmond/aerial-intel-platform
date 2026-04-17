import { strToU8, zipSync } from "fflate";

import { NodeOdmClient, type CreateTaskInit } from "./client";
import type { NodeOdmInfo, NodeOdmTaskInfo, NodeOdmTaskStatusCode } from "./contracts";
import { NodeOdmError } from "./errors";

function buildSyntheticBenchmarkSummary(uuid: string, projectName: string): string {
  const short = uuid.slice(0, 8);
  const start = new Date().toISOString();
  const end = new Date(Date.now() + 42_000).toISOString();
  return JSON.stringify({
    timestamp_utc: start,
    end_timestamp_utc: end,
    project_name: `stub-${short}`,
    dataset_root: "synthetic://stub",
    image_count: 13,
    duration_seconds: 42,
    odm_image: "stub-nodeodm",
    odm_args: "--preset balanced (synthetic)",
    docker_version: "stub",
    host: "stub-nodeodm-host",
    run_log: "logs/run.log",
    status: "success",
    run_exit_code: 0,
    outputs: {
      orthophoto: {
        path: "odm_orthophoto/odm_orthophoto.tif",
        exists: true,
        non_zero_size: true,
        size_bytes: 32,
      },
      dem: {
        path: "odm_dem/dsm.tif",
        exists: true,
        non_zero_size: true,
        size_bytes: 32,
      },
      point_cloud: {
        path: "odm_georeferencing/odm_georeferenced_model.laz",
        exists: true,
        non_zero_size: true,
        size_bytes: 16,
      },
      mesh: {
        path: "odm_texturing/odm_textured_model_geo.obj",
        exists: true,
        non_zero_size: true,
        size_bytes: 32,
      },
    },
    qa_gate: {
      required_outputs_present: true,
      minimum_pass: true,
      missing_required_outputs: [],
    },
    project_name_hint: projectName,
  });
}

export function buildSyntheticOutputZip(uuid: string, projectName = "synthetic"): Uint8Array {
  const tiffMagic = new Uint8Array(32);
  tiffMagic.set([0x49, 0x49, 0x2a, 0x00]);
  const lasMagic = new Uint8Array(16);
  lasMagic.set([0x4c, 0x41, 0x53, 0x46]);
  return zipSync({
    "odm_orthophoto/odm_orthophoto.tif": tiffMagic,
    "odm_dem/dsm.tif": tiffMagic,
    "odm_georeferencing/odm_georeferenced_model.laz": lasMagic,
    "odm_texturing/odm_textured_model_geo.obj": strToU8("o synthetic\nv 0 0 0\nf 1 1 1\n"),
    "benchmark_summary.json": strToU8(buildSyntheticBenchmarkSummary(uuid, projectName)),
    "logs/run.log": strToU8("[stub] queued\n[stub] processing\n[stub] output-zip assembled\n"),
  });
}

export type StubNodeOdmOptions = {
  progressStep?: number;
  info?: Partial<NodeOdmInfo>;
};

type StubTask = {
  uuid: string;
  name: string;
  imagesCount: number;
  committed: boolean;
  createdAt: number;
  statusCode: NodeOdmTaskStatusCode;
  progress: number;
  cancelled: boolean;
  options: Array<{ name: string; value: unknown }>;
};

function nextUuid(seq: number): string {
  return `stub-task-${seq.toString(16).padStart(8, "0")}`;
}

export class StubNodeOdmClient extends NodeOdmClient {
  private readonly tasks = new Map<string, StubTask>();
  private readonly progressStep: number;
  private readonly infoOverride: Partial<NodeOdmInfo>;
  private sequence = 0;

  constructor(options: StubNodeOdmOptions = {}) {
    super({ baseUrl: "stub://nodeodm", fetchImpl: undefined as unknown as typeof fetch });
    this.progressStep = options.progressStep ?? 25;
    this.infoOverride = options.info ?? {};
  }

  override async info(): Promise<NodeOdmInfo> {
    return {
      version: "stub-2.5.3",
      engineVersion: "stub-3.5",
      taskQueueCount: this.tasks.size,
      maxImages: 500,
      maxParallelTasks: 2,
      ...this.infoOverride,
    };
  }

  override async createTask(init: CreateTaskInit = {}): Promise<string> {
    this.sequence += 1;
    const uuid = nextUuid(this.sequence);
    this.tasks.set(uuid, {
      uuid,
      name: init.name ?? `stub-${this.sequence}`,
      imagesCount: 0,
      committed: false,
      createdAt: Date.now(),
      statusCode: 10,
      progress: 0,
      cancelled: false,
      options: init.options ?? [],
    });
    return uuid;
  }

  override async uploadImages(
    uuid: string,
    files: Array<{ blob: Blob; filename: string }>,
  ): Promise<void> {
    const task = this.requireTask(uuid, "uploadImages");
    task.imagesCount += files.length;
  }

  override async commitTask(uuid: string): Promise<void> {
    const task = this.requireTask(uuid, "commitTask");
    task.committed = true;
    task.statusCode = 20;
  }

  override async taskInfo(uuid: string): Promise<NodeOdmTaskInfo> {
    const task = this.requireTask(uuid, "taskInfo");
    if (!task.cancelled && task.statusCode === 20) {
      task.progress = Math.min(100, task.progress + this.progressStep);
      if (task.progress >= 100) {
        task.statusCode = 40;
      }
    }
    return {
      uuid: task.uuid,
      name: task.name,
      dateCreated: task.createdAt,
      imagesCount: task.imagesCount,
      progress: task.progress,
      status: { code: task.statusCode },
      options: task.options,
    };
  }

  override async taskOutput(): Promise<string[]> {
    return ["[stub] processing", "[stub] synthetic output only"];
  }

  override async cancelTask(uuid: string): Promise<void> {
    const task = this.requireTask(uuid, "cancelTask");
    task.cancelled = true;
    task.statusCode = 50;
  }

  completeTask(uuid: string): void {
    const task = this.requireTask(uuid, "completeTask");
    task.progress = 100;
    task.statusCode = 40;
  }

  failTask(uuid: string): void {
    const task = this.requireTask(uuid, "failTask");
    task.statusCode = 30;
  }

  override async removeTask(uuid: string): Promise<void> {
    if (!this.tasks.delete(uuid)) {
      throw new NodeOdmError("not_found", `stub removeTask: unknown task ${uuid}`);
    }
  }

  override async downloadAllAssets(uuid: string): Promise<Response> {
    const task = this.requireTask(uuid, "downloadAllAssets");
    const bytes = buildSyntheticOutputZip(uuid, task.name);
    const payload = new Blob([bytes as BlobPart], { type: "application/zip" });
    return new Response(payload, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "X-Stub-NodeODM": "synthetic",
      },
    });
  }

  private requireTask(uuid: string, context: string): StubTask {
    const task = this.tasks.get(uuid);
    if (!task) {
      throw new NodeOdmError("not_found", `stub ${context}: unknown task ${uuid}`);
    }
    return task;
  }
}

export function createStubNodeOdmClient(options: StubNodeOdmOptions = {}): StubNodeOdmClient {
  return new StubNodeOdmClient(options);
}

let sharedStub: StubNodeOdmClient | null = null;

export function getSharedStubNodeOdmClient(): StubNodeOdmClient {
  if (!sharedStub) {
    sharedStub = new StubNodeOdmClient();
  }
  return sharedStub;
}

export function resetSharedStubNodeOdmClient(): void {
  sharedStub = null;
}
