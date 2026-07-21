"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";

export type ShareLinkFormState =
  | { status: "idle" }
  | { status: "issued"; url: string; note: string | null }
  | { status: "error"; message: string };

/**
 * Issues an artifact share link and reveals the resulting capability URL
 * exactly once. The token is never stored in plaintext (only its hash is),
 * so it cannot be re-displayed from the list below — the recipient's copy of
 * this URL is the only copy.
 */
export function ShareLinkForm({
  action,
}: {
  action: (formData: FormData) => Promise<ShareLinkFormState>;
}) {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = useState<ShareLinkFormState>({ status: "idle" });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = event.currentTarget;
    startTransition(async () => {
      const result = await action(formData);
      setState(result);
      if (result.status === "issued") {
        form.reset();
      }
    });
  }

  return (
    <div className="stack-sm">
      {state.status === "issued" ? (
        <div className="callout callout-success stack-xs">
          <strong>Share link created — copy it now. It is shown only once.</strong>
          <code className="share-links__url">{state.url}</code>
          {state.note ? <span className="muted">{state.note}</span> : null}
        </div>
      ) : null}
      {state.status === "error" ? (
        <p className="callout callout-error">{state.message}</p>
      ) : null}

      <form onSubmit={handleSubmit} className="share-links__form">
        <label className="stack-xs">
          <span className="muted">Note (optional)</span>
          <input
            type="text"
            name="shareNote"
            placeholder="e.g. Client preview — do not redistribute"
            maxLength={200}
          />
        </label>
        <label className="stack-xs">
          <span className="muted">Expires in hours (optional)</span>
          <input type="number" name="shareExpiresInHours" min={1} max={8760} step={1} placeholder="24" />
        </label>
        <label className="stack-xs">
          <span className="muted">Max uses (optional)</span>
          <input type="number" name="shareMaxUses" min={1} step={1} placeholder="5" />
        </label>
        <button type="submit" className="button button-primary" disabled={isPending}>
          {isPending ? "Issuing…" : "Issue share link"}
        </button>
      </form>
    </div>
  );
}
