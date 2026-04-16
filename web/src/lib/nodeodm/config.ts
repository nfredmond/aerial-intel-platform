import { NodeOdmClient } from "./client";

export type NodeOdmAdapterConfig = {
  configured: boolean;
  baseUrl: string | null;
  token: string | null;
};

function normalizeEnvString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function getNodeOdmAdapterConfig(): NodeOdmAdapterConfig {
  const baseUrl = normalizeEnvString(process.env.AERIAL_NODEODM_URL);
  const token = normalizeEnvString(process.env.AERIAL_NODEODM_TOKEN);
  return {
    configured: Boolean(baseUrl),
    baseUrl,
    token,
  };
}

export function createConfiguredNodeOdmClient(): NodeOdmClient | null {
  const config = getNodeOdmAdapterConfig();
  if (!config.configured || !config.baseUrl) return null;
  return new NodeOdmClient({
    baseUrl: config.baseUrl,
    token: config.token ?? undefined,
  });
}
