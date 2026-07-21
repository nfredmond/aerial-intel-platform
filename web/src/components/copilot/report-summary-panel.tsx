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
      className="button button-primary"
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
    <section className="surface stack-sm">
      <header className="stack-xs">
        <h3>
          Aerial Copilot - Report Summary
        </h3>
        <p className="muted helper-copy">
          Drafts a client-safe artifact summary from real storage, QA, review, and handoff
          evidence. Every sentence keeps its fact citation.
        </p>
      </header>

      {!available ? (
        <p className="callout callout-warning">
          {availabilityHint}
        </p>
      ) : (
        <form action={formAction} className="copilot-meta">
          <input type="hidden" name="artifactId" value={artifactId} />
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
          <div className="copilot-meta">
            <button
              type="button"
              onClick={handleCopy}
              className="button button-secondary"
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
