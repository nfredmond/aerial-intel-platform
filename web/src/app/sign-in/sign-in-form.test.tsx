import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignInForm } from "./sign-in-form";

const pushMock = vi.fn();
const refreshMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: refreshMock,
  }),
}));

type MockAuthClient = {
  auth: {
    signInWithPassword: ReturnType<typeof vi.fn>;
  };
};

function createMockClient(signInWithPassword: ReturnType<typeof vi.fn>): MockAuthClient {
  return {
    auth: {
      signInWithPassword,
    },
  };
}

describe("SignInForm", () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
  });

  it("toggles password visibility", () => {
    const signInWithPassword = vi.fn();

    render(
      <SignInForm createClient={() => createMockClient(signInWithPassword)} />,
    );

    const passwordInput = screen.getByLabelText("Password") as HTMLInputElement;
    expect(passwordInput.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    expect(passwordInput.type).toBe("text");

    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    expect(passwordInput.type).toBe("password");
  });

  it("shows friendly error copy for invalid credentials", async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValue({ error: { message: "Invalid login credentials" } });

    render(
      <SignInForm createClient={() => createMockClient(signInWithPassword)} />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pilot@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrong-password" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("couldn’t match");
    });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("disables controls while submitting and routes to dashboard on success", async () => {
    let resolvePromise: ((value: { error: null }) => void) | undefined;

    const signInWithPassword = vi.fn().mockImplementation(
      () =>
        new Promise<{ error: null }>((resolve) => {
          resolvePromise = resolve;
        }),
    );

    render(
      <SignInForm createClient={() => createMockClient(signInWithPassword)} />,
    );

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "pilot@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "secure-pass" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      const loadingButton = screen.getByRole("button", {
        name: "Signing in securely…",
      }) as HTMLButtonElement;
      expect(loadingButton.disabled).toBe(true);
    });

    expect((screen.getByRole("group") as HTMLFieldSetElement).disabled).toBe(true);

    resolvePromise?.({ error: null });

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard");
      expect(refreshMock).toHaveBeenCalled();
    });
  });
});
