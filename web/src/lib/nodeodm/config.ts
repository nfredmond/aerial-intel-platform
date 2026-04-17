import { NodeOdmClient } from "./client";
import { getSharedStubNodeOdmClient } from "./stub";

export type NodeOdmAdapterConfig = {
  configured: boolean;
  baseUrl: string | null;
  token: string | null;
  mode: "real" | "stub";
};

function normalizeEnvString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveMode(): "real" | "stub" {
  const raw = normalizeEnvString(process.env.AERIAL_NODEODM_MODE);
  if (raw?.toLowerCase() === "stub") return "stub";
  return "real";
}

export function getNodeOdmAdapterConfig(): NodeOdmAdapterConfig {
  const baseUrl = normalizeEnvString(process.env.AERIAL_NODEODM_URL);
  const token = normalizeEnvString(process.env.AERIAL_NODEODM_TOKEN);
  const mode = resolveMode();
  return {
    configured: mode === "stub" || Boolean(baseUrl),
    baseUrl,
    token,
    mode,
  };
}

export function createConfiguredNodeOdmClient(): NodeOdmClient | null {
  const config = getNodeOdmAdapterConfig();
  if (config.mode === "stub") {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "AERIAL_NODEODM_MODE=stub is disallowed in production. Configure a real NodeODM URL instead.",
      );
    }
    return getSharedStubNodeOdmClient();
  }
  if (!config.baseUrl) return null;
  return new NodeOdmClient({
    baseUrl: config.baseUrl,
    token: config.token ?? undefined,
  });
}
