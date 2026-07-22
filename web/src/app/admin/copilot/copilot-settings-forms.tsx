"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { capTenthCentsToDollars } from "@/lib/copilot/cap";
import {
  setCopilotCapAction,
  setCopilotEnabledAction,
  type CopilotSettingsActionResult,
} from "./actions";

const INITIAL: CopilotSettingsActionResult = { status: "idle" };

function SubmitButton({
  label,
  pendingLabel,
  variant = "primary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={variant === "primary" ? "button button-primary" : "button button-secondary"}
      disabled={pending}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function ActionMessage({ state }: { state: CopilotSettingsActionResult }) {
  if (state.status === "idle") return null;
  return (
    <span
      className="muted"
      role={state.status === "error" ? "alert" : "status"}
      style={state.status === "error" ? { color: "#b91c1c" } : undefined}
    >
      {state.message}
    </span>
  );
}

export function CopilotEnableForm({ enabled }: { enabled: boolean }) {
  const [state, formAction] = useActionState(setCopilotEnabledAction, INITIAL);
  return (
    <form action={formAction} className="stack-xs">
      {/* The button flips the current state; hidden field carries the target. */}
      <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
      <SubmitButton
        label={enabled ? "Disable copilot" : "Enable copilot"}
        pendingLabel={enabled ? "Disabling…" : "Enabling…"}
        variant={enabled ? "secondary" : "primary"}
      />
      <ActionMessage state={state} />
    </form>
  );
}

export function CopilotCapForm({ capTenthCents }: { capTenthCents: number }) {
  const [state, formAction] = useActionState(setCopilotCapAction, INITIAL);
  return (
    <form action={formAction} className="stack-xs">
      <label htmlFor="copilot-cap">Monthly cap (USD, this month)</label>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        <input
          id="copilot-cap"
          name="capDollars"
          type="number"
          min="0"
          step="0.01"
          defaultValue={capTenthCentsToDollars(capTenthCents)}
          style={{ maxWidth: "10rem" }}
        />
        <SubmitButton label="Save cap" pendingLabel="Saving…" />
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
