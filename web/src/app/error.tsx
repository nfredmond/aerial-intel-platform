"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("route.error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="app-shell stack-md">
      <section className="surface stack-sm">
        <p className="eyebrow">Something went wrong</p>
        <h1>This page hit an unexpected error</h1>
        <p className="muted">
          The error has been logged{error.digest ? ` (reference ${error.digest})` : ""}. You can
          retry, or head back to the workspace.
        </p>
        <div className="header-actions">
          <button type="button" className="button button-primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/missions" className="button button-secondary">
            Mission workspace
          </Link>
        </div>
      </section>
    </main>
  );
}
