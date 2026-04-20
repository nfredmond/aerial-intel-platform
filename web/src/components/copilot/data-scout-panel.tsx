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
      className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
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
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900">Aerial Copilot — Data-cleaning scout</h3>
        <p className="mt-0.5 text-xs text-slate-600">
          Deterministic per-image flags plus a grounded AI paragraph explaining what a planner should
          do before dispatching to processing. Every sentence cites a real per-image fact.
        </p>
      </header>

      {!available ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {availabilityHint}
        </p>
      ) : (
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="datasetId" value={datasetId} />
          <SubmitButton disabled={!available} />
          {state.status === "error" ? (
            <span className="text-xs text-rose-700">Error: {state.message}</span>
          ) : null}
        </form>
      )}

      {blocked ? (
        <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {blocked}
        </p>
      ) : null}
      {refused ? (
        <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {refused}
        </p>
      ) : null}

      {state.status === "ok" ? (
        <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{state.summary}</p>
          {state.flags.length > 0 ? (
            <ul className="space-y-1 text-xs text-slate-700">
              {state.flags.slice(0, 10).map((flag, idx) => (
                <li key={`${flag.basename}-${flag.kind}-${idx}`}>
                  <span className="font-mono text-slate-900">{flag.basename}</span>
                  {" — "}
                  <span className="font-semibold text-rose-700">{flag.kind}</span>
                  {": "}
                  {flag.detail}
                </li>
              ))}
              {state.flags.length > 10 ? (
                <li className="text-slate-500">…and {state.flags.length - 10} more.</li>
              ) : null}
            </ul>
          ) : null}
          <p className="text-xs text-slate-600">
            {state.keptSentences}/{state.totalSentences} sentences kept · {state.imageCount} images
            inspected · spend {formatTenthCentsUsd(state.spendTenthCents)} · model {state.modelId}
          </p>
        </div>
      ) : null}
    </section>
  );
}
