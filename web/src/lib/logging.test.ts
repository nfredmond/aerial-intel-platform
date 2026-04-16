import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createLogger, extractRequestId } from "./logging";

describe("createLogger", () => {
  const originalEnv = { ...process.env };
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env = { ...originalEnv, AERIAL_LOG_LEVEL: "debug" };
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = originalEnv;
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("emits structured json with namespace, level, message, and merged fields", () => {
    const logger = createLogger("test", { requestId: "req-1" });
    logger.info("hello", { missionId: "m-1" });

    expect(logSpy).toHaveBeenCalledOnce();
    const payload = JSON.parse(logSpy.mock.calls[0]![0] as string);
    expect(payload.namespace).toBe("test");
    expect(payload.level).toBe("info");
    expect(payload.message).toBe("hello");
    expect(payload.requestId).toBe("req-1");
    expect(payload.fields.missionId).toBe("m-1");
  });

  it("serializes errors with name + message + stack", () => {
    const logger = createLogger("test");
    const err = new Error("boom");
    logger.error("failed", { cause: err });

    const payload = JSON.parse(errorSpy.mock.calls[0]![0] as string);
    expect(payload.fields.cause.name).toBe("Error");
    expect(payload.fields.cause.message).toBe("boom");
    expect(payload.fields.cause.stack).toBeTruthy();
  });

  it("child loggers concat namespace + merge base fields", () => {
    const parent = createLogger("api", { requestId: "req-1" });
    const child = parent.child("install-bundle", { missionId: "m-2" });
    child.warn("slow");

    const payload = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(payload.namespace).toBe("api.install-bundle");
    expect(payload.requestId).toBe("req-1");
    expect(payload.missionId).toBe("m-2");
  });

  it("suppresses levels below AERIAL_LOG_LEVEL", () => {
    process.env.AERIAL_LOG_LEVEL = "warn";
    const logger = createLogger("test");
    logger.info("quiet");
    logger.warn("noisy");

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledOnce();
  });
});

describe("extractRequestId", () => {
  it("prefers x-request-id, then x-vercel-id, then cf-ray", () => {
    const headers = new Headers({ "x-vercel-id": "v-1", "cf-ray": "r-1" });
    expect(extractRequestId(headers)).toBe("v-1");

    headers.set("x-request-id", "req-99");
    expect(extractRequestId(headers)).toBe("req-99");
  });

  it("returns null when no known header present", () => {
    expect(extractRequestId(new Headers())).toBe(null);
    expect(extractRequestId(null)).toBe(null);
  });
});
