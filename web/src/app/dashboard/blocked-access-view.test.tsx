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

  it("adds a one-click action to copy the signed-in user ID", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy signed-in user ID" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("user-123");
  });

  it("adds a one-click action to copy the signed-in account email", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy signed-in account email" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("pilot@example.com");
  });

  it("adds a one-click action to copy the organization ID", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy organization ID" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("org-456");
  });

  it("adds a one-click action to copy the organization slug", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy organization slug" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("skyline-survey");
  });

  it("adds a one-click action to copy the organization name", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy organization name" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("Skyline Survey");
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

  it("adds a one-click action for copying the prefilled support email link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support email link" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedLink = writeText.mock.calls[0]?.[0] as string;
    expect(copiedLink).toContain("mailto:support@natfordplanning.com?subject=");
    expect(copiedLink).toContain("DroneOps%20access%20blocked%20(AIR-20260306213312)");
    expect(copiedLink).toContain("body=Hello%20support%20team%2C");
  });

  it("adds a one-click action for copying the prefilled support Gmail compose link", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support Gmail compose link" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedLink = writeText.mock.calls[0]?.[0] as string;
    expect(copiedLink).toContain("https://mail.google.com/mail/?view=cm&fs=1&to=support%40natfordplanning.com");
    expect(copiedLink).toContain("su=DroneOps%20access%20blocked%20(AIR-20260306213312)");
    expect(copiedLink).toContain("body=Hello%20support%20team%2C");
  });

  it("adds an Open in Gmail shortcut with a prefilled subject and body", () => {
    render(<BlockedAccessView access={blockedAccessFixture} />);

    const gmailLink = screen.getByRole("link", { name: "Open in Gmail" });
    const href = gmailLink.getAttribute("href");

    expect(href).not.toBeNull();
    expect(href).toContain("https://mail.google.com/mail/?view=cm&fs=1&to=support%40natfordplanning.com");
    expect(href).toContain("su=DroneOps%20access%20blocked%20(AIR-20260306213312)");
    expect(href).toContain("body=Hello%20support%20team%2C");
    expect(gmailLink.getAttribute("target")).toBe("_blank");
    expect(gmailLink.getAttribute("rel")).toBe("noopener noreferrer");
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

  it("adds a one-click action for the support snapshot timestamp", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support snapshot timestamp" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith("2026-03-06T21:33:12.000Z");
  });

  it("adds a one-click action for support triage summary text", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support triage summary" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedText).toContain("Support reference: AIR-20260306213312");
    expect(copiedText).toContain("Signed-in account: pilot@example.com");
    expect(copiedText).toContain("Organization: Skyline Survey (skyline-survey)");
    expect(copiedText).toContain(
      "Observed reason: Your organization does not currently have an active DroneOps entitlement.",
    );
  });

  it("adds a one-click action for a compact support follow-up line", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support follow-up line" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith(
      "Ref AIR-20260306213312 | Acct pilot@example.com | Org Skyline Survey (skyline-survey) | Reason Your organization does not currently have an active DroneOps entitlement.",
    );
  });

  it("adds a one-click action for a phone-ready support call brief", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support call brief" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedText).toContain("Hello support team — I’m calling about blocked DroneOps access.");
    expect(copiedText).toContain("Support reference: AIR-20260306213312.");
    expect(copiedText).toContain("Signed-in account: pilot@example.com.");
    expect(copiedText).toContain("Organization: Skyline Survey (skyline-survey).");
    expect(copiedText).toContain(
      "Observed reason: Your organization does not currently have an active DroneOps entitlement.",
    );
    expect(copiedText).toContain("Snapshot UTC: 2026-03-06T21:33:12.000Z.");
  });

  it("adds a one-click action for a compact support reference plus snapshot line", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support reference + snapshot line" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith(
      "Ref AIR-20260306213312 | Snapshot 2026-03-06T21:33:12.000Z",
    );
  });

  it("adds a one-click action for a support diagnostics CSV block", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support diagnostics CSV block" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    const [header, row] = copiedText.split("\n");

    expect(header).toBe(
      "support_reference,snapshot_utc,signed_in_account_email,organization_slug,organization_name,blocked_reason",
    );
    expect(row).toContain("AIR-20260306213312");
    expect(row).toContain("2026-03-06T21:33:12.000Z");
    expect(row).toContain("pilot@example.com");
    expect(row).toContain("skyline-survey");
    expect(row).toContain("Skyline Survey");
    expect(row).toContain(
      "Your organization does not currently have an active DroneOps entitlement.",
    );
  });

  it("adds a one-click action for a support diagnostics TSV block", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support diagnostics TSV block" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    const [header, row] = copiedText.split("\n");

    expect(header).toBe(
      "support_reference\tsnapshot_utc\tsigned_in_account_email\torganization_slug\torganization_name\tblocked_reason",
    );

    const columns = row?.split("\t") ?? [];

    expect(columns[0]).toBe("AIR-20260306213312");
    expect(columns[1]).toBe("2026-03-06T21:33:12.000Z");
    expect(columns[2]).toBe("pilot@example.com");
    expect(columns[3]).toBe("skyline-survey");
    expect(columns[4]).toBe("Skyline Survey");
    expect(columns[5]).toBe(
      "Your organization does not currently have an active DroneOps entitlement.",
    );
  });

  it("adds a one-click action for a support diagnostics key-value block", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support diagnostics key-value block" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;

    expect(copiedText).toContain("support_reference: AIR-20260306213312");
    expect(copiedText).toContain("snapshot_utc: 2026-03-06T21:33:12.000Z");
    expect(copiedText).toContain("signed_in_account_email: pilot@example.com");
    expect(copiedText).toContain("organization_slug: skyline-survey");
    expect(copiedText).toContain("organization_name: Skyline Survey");
    expect(copiedText).toContain(
      "blocked_reason: Your organization does not currently have an active DroneOps entitlement.",
    );
  });

  it("adds a one-click action for a support diagnostics markdown block", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support diagnostics markdown block" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;

    expect(copiedText).toContain("- support_reference: AIR-20260306213312");
    expect(copiedText).toContain("- snapshot_utc: 2026-03-06T21:33:12.000Z");
    expect(copiedText).toContain("- signed_in_account_email: pilot@example.com");
    expect(copiedText).toContain("- organization_slug: skyline-survey");
    expect(copiedText).toContain("- organization_name: Skyline Survey");
    expect(copiedText).toContain(
      "- blocked_reason: Your organization does not currently have an active DroneOps entitlement.",
    );
  });

  it("adds a one-click action for just the blocked-access reason", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy blocked-access reason" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith(
      "Your organization does not currently have an active DroneOps entitlement.",
    );
  });

  it("adds a one-click action for an operator handoff checklist", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy operator handoff checklist" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedText).toContain("Support reference: AIR-20260306213312");
    expect(copiedText).toContain("Support inbox: support@natfordplanning.com");
    expect(copiedText).toContain("Recommended email subject: DroneOps access blocked (AIR-20260306213312)");
    expect(copiedText).toContain("Operator handoff checklist:");
    expect(copiedText).toContain("1) Paste the support triage summary into the ticket or chat thread.");
  });

  it("adds a one-click action for an operator escalation packet", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy operator escalation packet" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedText).toContain("Support reference: AIR-20260306213312");
    expect(copiedText).toContain("Snapshot UTC: 2026-03-06T21:33:12.000Z");
    expect(copiedText).toContain("Support email link: mailto:support@natfordplanning.com?subject=");
    expect(copiedText).toContain("Support Gmail compose link: https://mail.google.com/mail/?view=cm&fs=1&to=support%40natfordplanning.com");
    expect(copiedText).toContain("Support triage summary:");
    expect(copiedText).toContain("Support email draft:");
    expect(copiedText).toContain("Support context JSON:");
    expect(copiedText).toContain('"supportReference": "AIR-20260306213312"');
  });

  it("adds a one-click action for the support ticket title", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support ticket title" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith(
      "DroneOps blocked access | pilot@example.com | Skyline Survey (skyline-survey) | AIR-20260306213312",
    );
  });

  it("adds a one-click action for the support ticket header line", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support ticket header line" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledWith(
      "### DroneOps blocked access · AIR-20260306213312 · pilot@example.com · Skyline Survey (skyline-survey)",
    );
  });

  it("adds a one-click action for the support ticket body", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support ticket body" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    expect(copiedText).toContain(
      "### DroneOps blocked access · AIR-20260306213312 · pilot@example.com · Skyline Survey (skyline-survey)",
    );
    expect(copiedText).toContain("Support reference: AIR-20260306213312");
    expect(copiedText).toContain("Snapshot UTC: 2026-03-06T21:33:12.000Z");
    expect(copiedText).toContain("Support triage summary:");
    expect(copiedText).toContain("Support diagnostics (markdown):");
    expect(copiedText).toContain(
      "- blocked_reason: Your organization does not currently have an active DroneOps entitlement.",
    );
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

  it("adds a one-click action for JSON support context payloads", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<BlockedAccessView access={blockedAccessFixture} />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support context JSON" }));

    await vi.advanceTimersByTimeAsync(1);

    expect(writeText).toHaveBeenCalledTimes(1);

    const copiedText = writeText.mock.calls[0]?.[0] as string;
    const payload = JSON.parse(copiedText) as {
      supportReference: string;
      snapshotGeneratedUtc: string;
      observedReason: string;
      diagnostics: Record<string, string>;
    };

    expect(payload.supportReference).toBe("AIR-20260306213312");
    expect(payload.snapshotGeneratedUtc).toBe("2026-03-06T21:33:12.000Z");
    expect(payload.observedReason).toBe(
      "Your organization does not currently have an active DroneOps entitlement.",
    );
    expect(payload.diagnostics["User ID"]).toBe("user-123");
    expect(payload.diagnostics["Organization ID"]).toBe("org-456");
  });
});
