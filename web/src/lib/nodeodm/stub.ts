import { NodeOdmClient, type CreateTaskInit } from "./client";
import type { NodeOdmInfo, NodeOdmTaskInfo, NodeOdmTaskStatusCode } from "./contracts";
import { NodeOdmError } from "./errors";

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

  override async removeTask(uuid: string): Promise<void> {
    if (!this.tasks.delete(uuid)) {
      throw new NodeOdmError("not_found", `stub removeTask: unknown task ${uuid}`);
    }
  }

  override async downloadAllAssets(uuid: string): Promise<Response> {
    this.requireTask(uuid, "downloadAllAssets");
    const payload = new Blob([new Uint8Array()], { type: "application/zip" });
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
