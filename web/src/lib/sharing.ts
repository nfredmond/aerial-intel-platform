import { randomBytes } from "node:crypto";

import type { ArtifactShareLinkRow } from "@/lib/supabase/admin";

export type ShareLinkValidationReason =
  | "not_found"
  | "revoked"
  | "expired"
  | "exhausted";

export type ShareLinkValidation =
  | { ok: true; link: ArtifactShareLinkRow }
  | { ok: false; reason: ShareLinkValidationReason };

export function generateShareToken(byteLength = 32): string {
  if (byteLength < 16) {
    throw new Error("share tokens must be at least 16 random bytes");
  }
  return randomBytes(byteLength).toString("base64url");
}

export function isShareLinkExpired(link: ArtifactShareLinkRow, now: Date = new Date()): boolean {
  if (!link.expires_at) return false;
  const expiresAt = Date.parse(link.expires_at);
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= now.getTime();
}

export function isShareLinkRevoked(link: ArtifactShareLinkRow): boolean {
  return typeof link.revoked_at === "string" && link.revoked_at.length > 0;
}

export function isShareLinkExhausted(link: ArtifactShareLinkRow): boolean {
  if (link.max_uses === null || link.max_uses === undefined) return false;
  return link.use_count >= link.max_uses;
}

export function validateShareLink(
  link: ArtifactShareLinkRow | null | undefined,
  now: Date = new Date(),
): ShareLinkValidation {
  if (!link) return { ok: false, reason: "not_found" };
  if (isShareLinkRevoked(link)) return { ok: false, reason: "revoked" };
  if (isShareLinkExpired(link, now)) return { ok: false, reason: "expired" };
  if (isShareLinkExhausted(link)) return { ok: false, reason: "exhausted" };
  return { ok: true, link };
}

export function computeExpiresAt(expiresInHours: number | null, now: Date = new Date()): string | null {
  if (expiresInHours === null || expiresInHours === undefined) return null;
  if (!Number.isFinite(expiresInHours) || expiresInHours <= 0) return null;
  const ms = Math.min(expiresInHours, 24 * 365) * 60 * 60 * 1000;
  return new Date(now.getTime() + ms).toISOString();
}

export function parseExpiresInHoursInput(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function parseMaxUsesInput(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return null;
  return value;
}

export function shareLinkStatus(link: ArtifactShareLinkRow, now: Date = new Date()):
  | "active"
  | "revoked"
  | "expired"
  | "exhausted" {
  if (isShareLinkRevoked(link)) return "revoked";
  if (isShareLinkExpired(link, now)) return "expired";
  if (isShareLinkExhausted(link)) return "exhausted";
  return "active";
}
