import { AuthSessionMissingError } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServerSupabaseClientMock } = vi.hoisted(() => ({
  createServerSupabaseClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}));

import { getDroneOpsAccess } from "./drone-ops-access";

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

  it("rethrows non-session auth errors", async () => {
    const authError = new Error("boom");

    createServerSupabaseClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: authError,
        }),
      },
    });

    await expect(getDroneOpsAccess()).rejects.toThrow("boom");
  });
});
