export function formatBytes(
  bytes: number | string | null | undefined,
  fallback = "Not recorded"
): string {
  const parsed = typeof bytes === "string" ? Number(bytes) : bytes;
  if (parsed === null || parsed === undefined || !Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  let size = parsed as number;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  const digits = size >= 100 || unitIndex === 0 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unitIndex]}`;
}
