import { describe, expect, it } from "vitest";

import { getFriendlySignInError } from "./sign-in-errors";

describe("getFriendlySignInError", () => {
  it("maps invalid credentials to a user-friendly message", () => {
    const message = getFriendlySignInError({
      message: "Invalid login credentials",
    });

    expect(message).toContain("couldn’t match");
  });

  it("maps rate-limit errors", () => {
    const message = getFriendlySignInError({
      message: "Too many requests",
    });

    expect(message).toContain("Too many sign-in attempts");
  });

  it("falls back to a generic message", () => {
    const message = getFriendlySignInError({
      message: "unexpected transport failure",
    });

    expect(message).toContain("couldn’t sign you in");
  });
});
