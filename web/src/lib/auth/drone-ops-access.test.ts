import { AuthApiError, AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClientMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { getDroneOpsAccess, isInvalidSessionError } from "./drone-ops-access";

const SIGNED_OUT = {
  user: null,
  isAuthenticated: false,
  hasMembership: false,
  hasActiveEntitlement: false,
  role: null,
  actions: [],
  org: null,
  entitlement: null,
  blockedReason: "You must sign in to access DroneOps.",
};

function mockGetUserError(error: unknown) {
  createServerSupabaseClientMock.mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error }),
    },
  });
}

describe("getDroneOpsAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("treats a missing auth session as a signed-out state instead of throwing", async () => {
    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: new AuthSessionMissingError(),
        }),
      },
    });

    await expect(getDroneOpsAccess()).resolves.toEqual({
      user: null,
      isAuthenticated: false,
      hasMembership: false,
      hasActiveEntitlement: false,
      role: null,
      actions: [],
      org: null,
      entitlement: null,
      blockedReason: "You must sign in to access DroneOps.",
    });
  });

  it("degrades a stale JWT whose user no longer exists to signed-out instead of crashing", async () => {
    mockGetUserError(
      new AuthApiError("User from sub claim in JWT does not exist", 403, "user_not_found"),
    );

    await expect(getDroneOpsAccess()).resolves.toEqual(SIGNED_OUT);
  });

  it("degrades an expired/invalid token (401) to signed-out", async () => {
    mockGetUserError(new AuthApiError("invalid JWT", 401, "bad_jwt"));

    await expect(getDroneOpsAccess()).resolves.toEqual(SIGNED_OUT);
  });

  it("rethrows a 5xx auth-server error rather than masking it as a login prompt", async () => {
    mockGetUserError(new AuthApiError("auth service unavailable", 503, "service_unavailable"));

    await expect(getDroneOpsAccess()).rejects.toThrow("auth service unavailable");
  });

  it("rethrows non-auth errors", async () => {
    mockGetUserError(new Error("boom"));

    await expect(getDroneOpsAccess()).rejects.toThrow("boom");
  });
});

describe("isInvalidSessionError", () => {
  it("matches session-missing and 4xx auth API errors", () => {
    expect(isInvalidSessionError(new AuthSessionMissingError())).toBe(true);
    expect(isInvalidSessionError(new AuthApiError("bad", 401, "bad_jwt"))).toBe(true);
    expect(isInvalidSessionError(new AuthApiError("forbidden", 403, "user_not_found"))).toBe(true);
  });

  it("does not match 5xx auth errors or non-auth errors", () => {
    expect(isInvalidSessionError(new AuthApiError("down", 503, "unavailable"))).toBe(false);
    expect(isInvalidSessionError(new Error("boom"))).toBe(false);
    expect(isInvalidSessionError(null)).toBe(false);
  });
});
