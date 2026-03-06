import type { User } from "@supabase/supabase-js";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BlockedAccessView } from "./blocked-access-view";

const blockedAccessFixture = {
  user: {
    id: "user-123",
    email: "pilot@example.com",
  } as User,
  isAuthenticated: true,
  hasMembership: true,
  hasActiveEntitlement: false,
  role: "member" as const,
  org: {
    id: "org-456",
    name: "Skyline Survey",
    slug: "skyline-survey",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  entitlement: null,
  blockedReason: "Your organization does not currently have an active DroneOps entitlement.",
};

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

  it("adds a one-click action to copy the support inbox address", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support email address" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("support@natfordplanning.com");
  });

  it("adds a quick copy action for the generated support reference", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support reference" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("AIR-20260306213312");
  });

  it("adds a one-click action for the prefilled support email subject", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support email subject" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("DroneOps access blocked (AIR-20260306213312)");
  });

  it("adds a one-click action for the prefilled support email body", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support email body" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedText).toContain("Hello support team,");
    expect(copiedText).toContain("Support reference: AIR-20260306213312");
    expect(copiedText).toContain("Observed reason: Your organization does not currently have an active DroneOps entitlement.");
    expect(copiedText).toContain("Please help me restore access.");
  });
});
