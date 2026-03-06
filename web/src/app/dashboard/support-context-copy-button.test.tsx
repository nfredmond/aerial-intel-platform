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

  it("shows manual fallback message when clipboard API is unavailable", () => {
    render(<SupportContextCopyButton text="Role: Admin" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy support context" }));

    expect(screen.getByRole("status").textContent).toContain("copy the support fields manually");
  });
});
