"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  generateProcessingQaAction,
  type ProcessingQaFormState,
} from "@/app/jobs/[jobId]/copilot-actions";
import { formatTenthCentsUsd } from "@/lib/copilot/pricing";

type Props = {
  jobId: string;
  available: boolean;
  availabilityHint: string;
  /** Hide the panel unless the job status is "interesting" enough to diagnose. */
  relevant: boolean;
  relevanceHint?: string;
};

const INITIAL: ProcessingQaFormState = { status: "idle" };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? "Diagnosing…" : "Ask Aerial Copilot"}
    </button>
  );
}

function blockedMessage(state: ProcessingQaFormState): string | null {
  if (state.status !== "blocked") return null;
  switch (state.reason) {
    case "not-authenticated":
      return "Sign in is required to run a copilot diagnostic.";
    case "not-authorized":
      return "Your role does not include copilot.generate.";
    case "global-disabled":
      return "Aerial Copilot is disabled on this deployment (env kill-switch).";
    case "missing-api-key":
      return "Aerial Copilot is missing its Anthropic API key.";
    case "org-disabled":
      return "Aerial Copilot is off for this organization.";
    case "job-not-found":
      return "This job could not be loaded for your org.";
    case "no-facts":
      return "No benchmark/log facts are attached to this job yet.";
    case "quota-exhausted": {
      const spent = formatTenthCentsUsd(state.spendTenthCents ?? 0);
      const cap = formatTenthCentsUsd(state.capTenthCents ?? 0);
      return `Monthly copilot quota exhausted (${spent} of ${cap} used).`;
    }
    default:
      return "Copilot call was blocked.";
  }
}

function refusedMessage(state: ProcessingQaFormState): string | null {
  if (state.status !== "refused") return null;
  switch (state.reason) {
    case "too-many-dropped":
      return `Diagnostic refused: ${state.droppedSentences} of ${state.totalSentences} sentences failed grounding.`;
    case "too-short":
      return "Diagnostic refused: the grounded output was too thin to be actionable.";
    case "empty-output":
      return "Diagnostic refused: the model produced no citable sentences.";
  }
}

export function ProcessingQaPanel({ jobId, available, availabilityHint, relevant, relevanceHint }: Props) {
  const [state, formAction] = useActionState(generateProcessingQaAction, INITIAL);

  if (!relevant) {
    return (
      <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
        <header>
          <h3 className="text-sm font-semibold text-slate-900">Aerial Copilot — Processing QA</h3>
          <p className="mt-0.5 text-xs text-slate-600">
            {relevanceHint ??
              "Copilot diagnostic is offered when a job failed or produced fewer artifacts than expected."}
          </p>
        </header>
      </section>
    );
  }

  const blocked = blockedMessage(state);
  const refused = refusedMessage(state);

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900">Aerial Copilot — Processing QA</h3>
        <p className="mt-0.5 text-xs text-slate-600">
          AI-assisted diagnostic. Every sentence cites a real benchmark/log fact from this job.
          Review before acting on suggested settings.
        </p>
      </header>

      {!available ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {availabilityHint}
        </p>
      ) : (
        <form action={formAction} className="flex items-center gap-2">
          <input type="hidden" name="jobId" value={jobId} />
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
        <div className="mt-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{state.text}</p>
          <p className="text-xs text-slate-600">
            {state.keptSentences}/{state.totalSentences} sentences kept · spend{" "}
            {formatTenthCentsUsd(state.spendTenthCents)} · model {state.modelId}
          </p>
        </div>
      ) : null}
    </section>
  );
}
