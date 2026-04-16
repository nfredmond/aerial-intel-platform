import { formatDateTime, formatDate, formatRelativeTime } from "@/lib/ui/datetime";

export type DateTimeProps = {
  value: string | Date | null | undefined;
  fallback?: string;
  mode?: "datetime" | "date" | "relative";
  className?: string;
  reference?: Date;
};

export function DateTime({
  value,
  fallback = "TBD",
  mode = "datetime",
  className,
  reference,
}: DateTimeProps) {
  let formatted: string;
  if (mode === "date") {
    formatted = formatDate(value, fallback);
  } else if (mode === "relative") {
    formatted = formatRelativeTime(value, reference) || fallback;
  } else {
    formatted = formatDateTime(value, fallback);
  }

  if (value === null || value === undefined || value === "") {
    return <span className={className}>{formatted}</span>;
  }

  const timestamp = value instanceof Date ? value : new Date(value);
  const iso = Number.isNaN(timestamp.getTime()) ? undefined : timestamp.toISOString();

  return (
    <time className={className} dateTime={iso} title={iso}>
      {formatted}
    </time>
  );
}
