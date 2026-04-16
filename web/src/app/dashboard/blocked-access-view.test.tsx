import type { User } from "@supabase/supabase-js";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DroneOpsAccessResult } from "@/lib/auth/drone-ops-access";

import { BlockedAccessView } from "./blocked-access-view";

const blockedAccessFixture: DroneOpsAccessResult = {
  user: {
    id: "user-123",
    email: "pilot@example.com",
  } as User,
  isAuthenticated: true,
  hasMembership: true,
  hasActiveEntitlement: false,
  role: "admin",
  actions: [],
  org: {
    id: "org-456",
    name: "Skyline Survey",
    slug: "skyline-survey",
    created_at: "2026-01-01T00:00:00.000Z",
  },
  entitlement: null,
  blockedReason: "Your organization does not currently have an active DroneOps entitlement.",
};

async function clickTab(name: "Summary" | "Email draft" | "JSON" | "Markdown") {
  fireEvent.click(screen.getByRole("tab", { name }));
  await vi.advanceTimersByTimeAsync(1);
}

async function clickCopy() {
  const button = screen
    .getAllByRole("button")
    .find((el) => /^Copy /.test(el.textContent ?? ""));
  if (!button) throw new Error("Copy button not found");
  fireEvent.click(button);
  await vi.advanceTimersByTimeAsync(1);
}

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

  it("renders the blocked reason and support reference", () => {
    render(<BlockedAccessView access={blockedAccessFixture} />);
    expect(
      screen.getByRole("status").textContent,
    ).toContain("Your organization does not currently have an active DroneOps entitlement.");
    expect(screen.getAllByText(/AIR-20260306213312/).length).toBeGreaterThan(0);
  });

  it("renders the four diagnostic format tabs", () => {
    render(<BlockedAccessView access={blockedAccessFixture} />);
    expect(screen.getByRole("tab", { name: "Summary" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Email draft" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "JSON" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Markdown" })).toBeTruthy();
  });

  it("copies the summary text when the summary tab is active", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);
    await clickCopy();

    expect(writeText).toHaveBeenCalledTimes(1);
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("Support reference: AIR-20260306213312");
    expect(copied).toContain("Signed-in email: pilot@example.com");
    expect(copied).toContain("Observed reason: Your organization does not currently have");
  });

  it("copies the email draft when the Email draft tab is active", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);
    await clickTab("Email draft");
    await clickCopy();

    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toMatch(/^Subject: DroneOps access blocked \(AIR-20260306213312\)/);
    expect(copied).toContain("Hello support team,");
  });

  it("copies the JSON payload when the JSON tab is active", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);
    await clickTab("JSON");
    await clickCopy();

    const payload = JSON.parse(writeText.mock.calls[0][0] as string) as {
      supportReference: string;
      diagnostics: Record<string, string>;
    };
    expect(payload.supportReference).toBe("AIR-20260306213312");
    expect(payload.diagnostics["Signed-in email"]).toBe("pilot@example.com");
  });

  it("copies markdown when the Markdown tab is active", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);
    await clickTab("Markdown");
    await clickCopy();

    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("## Support reference AIR-20260306213312");
    expect(copied).toContain("- **Signed-in email:** pilot@example.com");
  });

  it("shows a fallback hint when clipboard is unavailable", async () => {
    render(<BlockedAccessView access={blockedAccessFixture} />);
    await clickCopy();

    expect(screen.getByText(/Couldn’t access your clipboard/)).toBeTruthy();
  });

  it("renders contact and Gmail actions pointing to support@natfordplanning.com", () => {
    render(<BlockedAccessView access={blockedAccessFixture} />);
    const mailto = screen.getByRole("link", { name: "Contact support" });
    const gmail = screen.getByRole("link", { name: "Open in Gmail" });
    expect(mailto.getAttribute("href")).toMatch(/^mailto:support@natfordplanning\.com/);
    expect(gmail.getAttribute("href")).toContain("mail.google.com");
  });
});
