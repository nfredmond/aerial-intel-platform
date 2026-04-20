"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { inviteMemberAction, type PeopleActionResult } from "./actions";

const INITIAL: PeopleActionResult = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button button-primary" disabled={pending}>
      {pending ? "Creating invitation…" : "Create invitation"}
    </button>
  );
}

export function InviteMemberForm() {
  const [state, formAction] = useActionState(inviteMemberAction, INITIAL);

  return (
    <form action={formAction} className="stack-sm">
      <div className="form-row">
        <label className="stack-xs">
          <span className="label">Email</span>
          <input
            type="email"
            name="email"
            required
            autoComplete="off"
            placeholder="teammate@example.com"
            className="input"
          />
        </label>
        <label className="stack-xs">
          <span className="label">Role</span>
          <select name="role" defaultValue="viewer" className="input">
            <option value="viewer">Viewer</option>
            <option value="analyst">Analyst</option>
            <option value="admin">Admin</option>
          </select>
        </label>
      </div>
      <div className="header-actions">
        <SubmitButton />
      </div>
      {state.status === "error" ? (
        <p className="muted" role="alert">
          {state.message}
        </p>
      ) : null}
      {state.status === "ok" ? (
        <div className="stack-xs">
          <p className="muted">{state.message}</p>
          {state.invitationUrl ? (
            <p className="admin-table__mono">
              Share this URL with the invitee:{" "}
              <code>{state.invitationUrl}</code>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
