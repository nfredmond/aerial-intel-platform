"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  reactivateMemberAction,
  revokeInvitationAction,
  suspendMemberAction,
  type PeopleActionResult,
} from "./actions";

const INITIAL: PeopleActionResult = { status: "idle" };

function SubmitButton({
  label,
  pendingLabel,
  variant = "secondary",
}: {
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
}) {
  const { pending } = useFormStatus();
  const cls =
    variant === "danger"
      ? "button button-secondary"
      : variant === "primary"
        ? "button button-primary"
        : "button button-secondary";
  return (
    <button type="submit" className={cls} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function SuspendMemberForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(suspendMemberAction, INITIAL);
  return (
    <form action={formAction} className="stack-xs">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton label="Suspend" pendingLabel="Suspending…" variant="danger" />
      {state.status === "error" ? (
        <span className="muted" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function ReactivateMemberForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(reactivateMemberAction, INITIAL);
  return (
    <form action={formAction} className="stack-xs">
      <input type="hidden" name="userId" value={userId} />
      <SubmitButton label="Reactivate" pendingLabel="Reactivating…" />
      {state.status === "error" ? (
        <span className="muted" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function RevokeInvitationForm({ invitationId }: { invitationId: string }) {
  const [state, formAction] = useActionState(revokeInvitationAction, INITIAL);
  return (
    <form action={formAction} className="stack-xs">
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton label="Revoke" pendingLabel="Revoking…" variant="danger" />
      {state.status === "error" ? (
        <span className="muted" role="alert">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
