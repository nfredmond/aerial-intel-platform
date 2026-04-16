import type { ReactNode } from "react";

export type MetricProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  className?: string;
};

export function Metric({ label, value, hint, className }: MetricProps) {
  const composed = className ? `metric ${className}` : "metric";
  return (
    <div className={composed}>
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {hint && <span className="metric-hint">{hint}</span>}
    </div>
  );
}
