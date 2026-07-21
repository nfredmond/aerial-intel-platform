export default function Loading() {
  return (
    <main className="app-shell stack-md">
      <section className="surface stack-sm" aria-busy="true" aria-live="polite">
        <p className="eyebrow">Loading</p>
        <h1>Fetching workspace data…</h1>
        <p className="muted">Pulling the latest missions, jobs, and artifacts for your org.</p>
      </section>
    </main>
  );
}
