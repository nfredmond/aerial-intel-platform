type DashboardMetric = {
  id: string;
  label: string;
  value: number | null;
  displayValue: string;
  detail: string;
  tone: "success" | "info" | "warning";
};

type MissionStatusDashboardProps = {
  title: string;
  subtitle: string;
  metrics: DashboardMetric[];
};

function getToneClassName(tone: DashboardMetric["tone"]) {
  switch (tone) {
    case "success":
      return "status-pill status-pill--success";
    case "info":
      return "status-pill status-pill--info";
    default:
      return "status-pill status-pill--warning";
  }
}

function clampPercent(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return 0;
  }

  return Math.max(0, Math.min(100, value));
}

export function MissionStatusDashboard({
  title,
  subtitle,
  metrics,
}: MissionStatusDashboardProps) {
  return (
    <article className="surface stack-sm info-card">
      <div className="stack-xs">
        <p className="eyebrow">Mission dashboard</p>
        <h2>{title}</h2>
        <p className="muted">{subtitle}</p>
      </div>

      <div className="status-dashboard-grid">
        {metrics.map((metric) => (
          <article key={metric.id} className="status-dashboard-card stack-xs">
            <div className="ops-list-card-header">
              <strong>{metric.label}</strong>
              <span className={getToneClassName(metric.tone)}>{metric.displayValue}</span>
            </div>
            <div className="status-meter" aria-hidden="true">
              <span className="status-meter-fill" style={{ width: `${clampPercent(metric.value)}%` }} />
            </div>
            <p className="muted">{metric.detail}</p>
          </article>
        ))}
      </div>
    </article>
  );
}
