"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  generateReportSummaryAction,
  type ReportSummaryFormState,
} from "@/app/artifacts/[artifactId]/copilot-actions";
import { formatTenthCentsUsd } from "@/lib/copilot/pricing";

type Props = {
  artifactId: string;
  artifactName: string;
  available: boolean;
  availabilityHint: string;
};

const INITIAL: ReportSummaryFormState = { status: "idle" };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? "Drafting summary..." : "Generate report summary"}
    </button>
  );
}

function blockedMessage(state: ReportSummaryFormState): string | null {
  if (state.status !== "blocked") return null;
  switch (state.reason) {
    case "not-authenticated":
      return "Sign in is required to generate a report summary.";
    case "not-authorized":
      return "Your role does not include copilot.generate.";
    case "global-disabled":
      return "Aerial Copilot is disabled on this deployment.";
    case "missing-api-key":
      return "Aerial Copilot is missing AI Gateway credentials.";
    case "org-disabled":
      return "Aerial Copilot is off for this organization.";
    case "artifact-not-found":
      return "This artifact could not be loaded for your org.";
    case "no-facts":
      return "No citable artifact facts were found yet.";
    case "quota-exhausted": {
      const spent = formatTenthCentsUsd(state.spendTenthCents ?? 0);
      const cap = formatTenthCentsUsd(state.capTenthCents ?? 0);
      return `Monthly copilot quota exhausted (${spent} of ${cap} used).`;
    }
    default:
      return "Copilot call was blocked.";
  }
}

function refusedMessage(state: ReportSummaryFormState): string | null {
  if (state.status !== "refused") return null;
  switch (state.reason) {
    case "too-many-dropped":
      return `Summary refused: ${state.droppedSentences} of ${state.totalSentences} sentences failed grounding.`;
    case "too-short":
      return "Summary refused: the grounded output was too thin to use.";
    case "empty-output":
      return "Summary refused: the model produced no citable sentences.";
  }
}

export function ReportSummaryPanel({
  artifactId,
  artifactName,
  available,
  availabilityHint,
}: Props) {
  const [state, formAction] = useActionState(generateReportSummaryAction, INITIAL);
  const [copied, setCopied] = useState(false);
  const blocked = blockedMessage(state);
  const refused = refusedMessage(state);

  const handleCopy = async () => {
    if (state.status !== "ok") return;
    await navigator.clipboard.writeText(state.summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <header className="mb-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Aerial Copilot - Report Summary
        </h3>
        <p className="mt-0.5 text-xs text-slate-600">
          Drafts a client-safe artifact summary from real storage, QA, review, and handoff
          evidence. Every sentence keeps its fact citation.
        </p>
      </header>

      {!available ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {availabilityHint}
        </p>
      ) : (
        <form action={formAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="artifactId" value={artifactId} />
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
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            <button
              type="button"
              onClick={handleCopy}
              className="rounded border border-slate-300 bg-white px-2 py-1 hover:bg-slate-100"
            >
              {copied ? "Copied" : "Copy"}
            </button>
            <span>
              {artifactName} - {state.keptSentences}/{state.totalSentences} sentences kept - spend{" "}
              {formatTenthCentsUsd(state.spendTenthCents)} - model {state.modelId}
            </span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
