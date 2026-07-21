"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Re-fetches the current server-rendered route on an interval so job progress
 * and status pills update without a manual reload. Refreshes only while the
 * tab is visible, and only when `enabled` (callers pass true while a job is
 * still queued/running).
 */
export function AutoRefresh({
  enabled = true,
  intervalMs = 10_000,
}: {
  enabled?: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, enabled, intervalMs]);

  return null;
}
