import { describe, expect, it } from "vitest";

import {
  DRONE_OPS_SUPPORT_EMAIL,
  buildBlockedAccessSupportSubject,
  createSupportGmailComposeUrl,
  createSupportMailto,
} from "./support";

describe("support", () => {
  it("builds blocked-access subjects with support reference", () => {
    expect(buildBlockedAccessSupportSubject("AIR-20260306193312")).toBe(
      "DroneOps access blocked (AIR-20260306193312)",
    );
  });

  it("falls back to a generic blocked-access subject when reference is blank", () => {
    expect(buildBlockedAccessSupportSubject("   ")).toBe("DroneOps access blocked");
  });

  it("builds a mailto link using the default support inbox", () => {
    const href = createSupportMailto({
      subject: "DroneOps access blocked (AIR-20260306193312)",
      body: "User ID: abc123",
    });

    expect(href).toBe(
      `mailto:${DRONE_OPS_SUPPORT_EMAIL}?subject=DroneOps%20access%20blocked%20(AIR-20260306193312)&body=User%20ID%3A%20abc123`,
    );
  });

  it("allows overriding the support inbox", () => {
    const href = createSupportMailto({
      email: "ops@example.com",
      subject: "Need help",
    });

    expect(href).toBe("mailto:ops@example.com?subject=Need%20help");
  });

  it("builds a Gmail compose URL using the default support inbox", () => {
    const href = createSupportGmailComposeUrl({
      subject: "DroneOps access blocked (AIR-20260306193312)",
      body: "User ID: abc123",
    });

    expect(href).toBe(
      "https://mail.google.com/mail/?view=cm&fs=1&to=support%40natfordplanning.com&su=DroneOps%20access%20blocked%20(AIR-20260306193312)&body=User%20ID%3A%20abc123",
    );
  });

  it("allows overriding the support inbox for Gmail compose URLs", () => {
    const href = createSupportGmailComposeUrl({
      email: "ops@example.com",
      subject: "Need help",
    });

    expect(href).toBe(
      "https://mail.google.com/mail/?view=cm&fs=1&to=ops%40example.com&su=Need%20help",
    );
  });
});
