"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  generateSupportAssistantAction,
  type SupportAssistantFormState,
} from "@/app/admin/copilot/support-actions";
import { formatTenthCentsUsd } from "@/lib/copilot/pricing";

type Props = {
  available: boolean;
  availabilityHint: string;
};

const INITIAL: SupportAssistantFormState = { status: "idle" };

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="inline-flex items-center rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? "Checking docs..." : "Ask support copilot"}
    </button>
  );
}

function blockedMessage(state: SupportAssistantFormState): string | null {
  if (state.status !== "blocked") return null;
  switch (state.reason) {
    case "not-authenticated":
      return "Sign in is required to use the support assistant.";
    case "not-authorized":
      return "Your role does not include copilot.generate.";
    case "global-disabled":
      return "Aerial Copilot is disabled on this deployment.";
    case "missing-api-key":
      return "Aerial Copilot is missing AI Gateway credentials.";
    case "org-disabled":
      return "Aerial Copilot is off for this organization.";
    case "empty-question":
      return "Ask a concrete support question.";
    case "no-matching-docs":
      return "No matching support facts were found in the bundled ops corpus.";
    case "quota-exhausted": {
      const spent = formatTenthCentsUsd(state.spendTenthCents ?? 0);
      const cap = formatTenthCentsUsd(state.capTenthCents ?? 0);
      return `Monthly copilot quota exhausted (${spent} of ${cap} used).`;
    }
    default:
      return "Support assistant call was blocked.";
  }
}

function refusedMessage(state: SupportAssistantFormState): string | null {
  if (state.status !== "refused") return null;
  switch (state.reason) {
    case "too-many-dropped":
      return `Answer refused: ${state.droppedSentences} of ${state.totalSentences} sentences failed grounding.`;
    case "too-short":
      return "Answer refused: the grounded response was too thin to use.";
    case "empty-output":
      return "Answer refused: the model produced no citable sentences.";
  }
}

export function SupportAssistantPanel({ available, availabilityHint }: Props) {
  const [state, formAction] = useActionState(generateSupportAssistantAction, INITIAL);
  const blocked = blockedMessage(state);
  const refused = refusedMessage(state);

  return (
    <section className="surface stack-sm">
      <div className="stack-xs">
        <p className="eyebrow">Support assistant</p>
        <h2>Ask the ops docs</h2>
        <p className="muted">
          Internal support answers drawn from the bundled operations corpus. Every sentence keeps
          its fact citation so reviewers can trace the answer back to source guidance.
        </p>
      </div>

      {!available ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {availabilityHint}
        </p>
      ) : (
        <form action={formAction} className="stack-sm">
          <label className="stack-xs text-sm font-medium text-slate-900">
            Support question
            <textarea
              name="question"
              required
              minLength={8}
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm font-normal text-slate-900"
              placeholder="What is still blocking a production raster claim?"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton disabled={!available} />
            {state.status === "error" ? (
              <span className="text-xs text-rose-700">Error: {state.message}</span>
            ) : null}
          </div>
        </form>
      )}

      {blocked ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          {blocked}
        </p>
      ) : null}
      {refused ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">
          {refused}
        </p>
      ) : null}

      {state.status === "ok" ? (
        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
          <p className="whitespace-pre-wrap text-sm text-slate-800">{state.answer}</p>
          {state.sources.length > 0 ? (
            <div className="space-y-1 text-xs text-slate-700">
              <p className="font-semibold text-slate-900">Cited support sources</p>
              <ul className="space-y-1">
                {state.sources.map((source) => (
                  <li key={source.id}>
                    <span className="font-mono">{source.id}</span>
                    {" - "}
                    {source.sourcePath}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="text-xs text-slate-600">
            {state.keptSentences}/{state.totalSentences} sentences kept · spend{" "}
            {formatTenthCentsUsd(state.spendTenthCents)} · model {state.modelId}
          </p>
        </div>
      ) : null}
    </section>
  );
}
