"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  generateDataScoutAction,
  type DataScoutFormState,
} from "@/app/datasets/[datasetId]/copilot-actions";
import { formatTenthCentsUsd } from "@/lib/copilot/pricing";

type Props = {
  datasetId: string;
  available: boolean;
  availabilityHint: string;
};

const INITIAL: DataScoutFormState = { status: "idle" };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="button button-primary"
    >
      {pending ? "Scouting…" : "Run data-cleaning scout"}
    </button>
  );
}

function blockedMessage(state: DataScoutFormState): string | null {
  if (state.status !== "blocked") return null;
  switch (state.reason) {
    case "not-authenticated":
      return "Sign in is required to run a copilot scout.";
    case "not-authorized":
      return "Your role does not include copilot.scout.";
    case "global-disabled":
      return "Aerial Copilot is disabled on this deployment (env kill-switch).";
    case "missing-api-key":
      return "Aerial Copilot is missing its AI Gateway credentials.";
    case "org-disabled":
      return "Aerial Copilot is off for this organization.";
    case "dataset-not-found":
      return "This dataset could not be loaded for your org.";
    case "no-facts":
      return "No per-image metadata is attached to this dataset yet — nothing to scout.";
    case "all-clean":
      return "Deterministic scan found no data-quality flags on this dataset.";
    case "quota-exhausted": {
      const spent = formatTenthCentsUsd(state.spendTenthCents ?? 0);
      const cap = formatTenthCentsUsd(state.capTenthCents ?? 0);
      return `Monthly copilot quota exhausted (${spent} of ${cap} used).`;
    }
    default:
      return "Copilot call was blocked.";
  }
}

function refusedMessage(state: DataScoutFormState): string | null {
  if (state.status !== "refused") return null;
  switch (state.reason) {
    case "too-many-dropped":
      return `Scout refused: ${state.droppedSentences} of ${state.totalSentences} sentences failed grounding.`;
    case "too-short":
      return "Scout refused: the grounded output was too thin to be actionable.";
    case "empty-output":
      return "Scout refused: the model produced no citable sentences.";
  }
}

export function DataScoutPanel({ datasetId, available, availabilityHint }: Props) {
  const [state, formAction] = useActionState(generateDataScoutAction, INITIAL);

  const blocked = blockedMessage(state);
  const refused = refusedMessage(state);

  return (
    <section className="surface stack-sm">
      <header className="stack-xs">
        <h3>Aerial Copilot — Data-cleaning scout</h3>
        <p className="muted helper-copy">
          Deterministic per-image flags plus a grounded AI paragraph explaining what a planner should
          do before dispatching to processing. Every sentence cites a real per-image fact.
        </p>
      </header>

      {!available ? (
        <p className="callout callout-warning">
          {availabilityHint}
        </p>
      ) : (
        <form action={formAction} className="header-actions">
          <input type="hidden" name="datasetId" value={datasetId} />
          <SubmitButton disabled={!available} />
          {state.status === "error" ? (
            <span className="copilot-inline-error">Error: {state.message}</span>
          ) : null}
        </form>
      )}

      {blocked ? (
        <p className="callout callout-warning">
          {blocked}
        </p>
      ) : null}
      {refused ? (
        <p className="callout callout-error">
          {refused}
        </p>
      ) : null}

      {state.status === "ok" ? (
        <div className="copilot-result stack-sm">
          <p className="copilot-result-text">{state.summary}</p>
          {state.flags.length > 0 ? (
            <ul className="stack-xs muted helper-copy">
              {state.flags.slice(0, 10).map((flag, idx) => (
                <li key={`${flag.basename}-${flag.kind}-${idx}`}>
                  <span className="mono copilot-strong">{flag.basename}</span>
                  {" — "}
                  <span className="copilot-strong--error">{flag.kind}</span>
                  {": "}
                  {flag.detail}
                </li>
              ))}
              {state.flags.length > 10 ? (
                <li className="muted">…and {state.flags.length - 10} more.</li>
              ) : null}
            </ul>
          ) : null}
          <p className="muted helper-copy">
            {state.keptSentences}/{state.totalSentences} sentences kept · {state.imageCount} images
            inspected · spend {formatTenthCentsUsd(state.spendTenthCents)} · model {state.modelId}
          </p>
        </div>
      ) : null}
    </section>
  );
}
