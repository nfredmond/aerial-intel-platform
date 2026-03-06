import type { User } from "@supabase/supabase-js";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlockedAccessView } from "./blocked-access-view";

describe("BlockedAccessView", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-06T21:33:12.000Z"));

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("adds a quick copy action for the generated support reference", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <BlockedAccessView
        access={{
          user: {
            id: "user-123",
            email: "pilot@example.com",
          } as User,
          isAuthenticated: true,
          hasMembership: true,
          hasActiveEntitlement: false,
          role: "member",
          org: {
            id: "org-456",
            name: "Skyline Survey",
            slug: "skyline-survey",
            created_at: "2026-01-01T00:00:00.000Z",
          },
          entitlement: null,
          blockedReason: "Your organization does not currently have an active DroneOps entitlement.",
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy support reference" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("AIR-20260306213312");
  });
});
