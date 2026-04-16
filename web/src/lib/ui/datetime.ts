export function formatDateTime(
  value: string | Date | null | undefined,
  fallback = "TBD"
): string {
  if (value === null || value === undefined) return fallback;
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function formatDate(
  value: string | Date | null | undefined,
  fallback = "TBD"
): string {
  if (value === null || value === undefined) return fallback;
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) return fallback;

  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(timestamp);
}

export function formatRelativeTime(
  value: string | Date | null | undefined,
  reference: Date = new Date()
): string {
  if (value === null || value === undefined) return "";
  const timestamp = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "";

  const diffMs = timestamp.getTime() - reference.getTime();
  const absSeconds = Math.abs(diffMs) / 1000;

  const units: Array<{ limit: number; divisor: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { limit: 60, divisor: 1, unit: "second" },
    { limit: 3600, divisor: 60, unit: "minute" },
    { limit: 86400, divisor: 3600, unit: "hour" },
    { limit: 2592000, divisor: 86400, unit: "day" },
    { limit: 31536000, divisor: 2592000, unit: "month" },
  ];

  const formatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
  for (const { limit, divisor, unit } of units) {
    if (absSeconds < limit) {
      const value = Math.round(diffMs / (divisor * 1000));
      return formatter.format(value, unit);
    }
  }

  return formatter.format(Math.round(diffMs / (31536000 * 1000)), "year");
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms < 0) {
    return "";
  }
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}
