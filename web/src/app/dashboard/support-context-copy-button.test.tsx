import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SupportContextCopyButton } from "./support-context-copy-button";

describe("SupportContextCopyButton", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });

  it("copies support context to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SupportContextCopyButton text="User ID: 123" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support context" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("User ID: 123");
    });

    expect(screen.getByRole("status").textContent).toContain("Support context copied");
  });

  it("supports custom labels and success messaging", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(
      <SupportContextCopyButton
        text="Subject: DroneOps access blocked"
        buttonLabel="Copy support email draft"
        successMessage="Support email draft copied."
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy support email draft" }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith("Subject: DroneOps access blocked");
    });

    expect(screen.getByRole("status").textContent).toContain("Support email draft copied.");
  });

  it("shows manual fallback text when clipboard API is unavailable", () => {
    render(<SupportContextCopyButton text="Role: Admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support context" }));

    expect(screen.getByRole("status").textContent).toContain("ready-to-copy text");

    const fallbackText = screen.getByLabelText("Support context text") as HTMLTextAreaElement;
    expect(fallbackText.value).toBe("Role: Admin");
  });

  it("supports custom fallback copy text", () => {
    render(
      <SupportContextCopyButton
        text="Subject: DroneOps access blocked"
        buttonLabel="Copy support email draft"
        fallbackStatusMessage="Couldn’t access your clipboard. Use the ready-to-copy email draft below."
        fallbackAriaLabel="Support email draft text"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy support email draft" }));

    expect(screen.getByRole("status").textContent).toContain("ready-to-copy email draft");

    const fallbackText = screen.getByLabelText("Support email draft text") as HTMLTextAreaElement;
    expect(fallbackText.value).toBe("Subject: DroneOps access blocked");
  });

  it("shows manual fallback text when clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission denied"));

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    render(<SupportContextCopyButton text="Entitlement active: No" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support context" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toContain("ready-to-copy text");
    });

    const fallbackText = screen.getByLabelText("Support context text") as HTMLTextAreaElement;
    expect(fallbackText.value).toBe("Entitlement active: No");
  });
});
