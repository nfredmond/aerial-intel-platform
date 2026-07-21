import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-shell stack-md">
      <section className="surface stack-sm">
        <p className="eyebrow">Not found</p>
        <h1>That page does not exist</h1>
        <p className="muted">
          The record may have been removed, or the link may be outside your org&apos;s workspace.
        </p>
        <div className="header-actions">
          <Link href="/missions" className="button button-primary">
            Mission workspace
          </Link>
          <Link href="/dashboard" className="button button-secondary">
            Dashboard
          </Link>
        </div>
      </section>
    </main>
  );
}
