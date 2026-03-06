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

  it("shows manual fallback text when clipboard API is unavailable", () => {
    render(<SupportContextCopyButton text="Role: Admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support context" }));

    expect(screen.getByRole("status").textContent).toContain("ready-to-copy text");

    const fallbackText = screen.getByLabelText("Support context text") as HTMLTextAreaElement;
    expect(fallbackText.value).toBe("Role: Admin");
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
