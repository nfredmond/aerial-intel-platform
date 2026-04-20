## ADR-003 — Admin invitation boundary

**Status:** Accepted · 2026-04-19
**Supersedes:** none
**Related:** Wave 2.5 Track C (`1cdb531`), `web/src/app/admin/people/actions.ts`, `web/src/lib/auth/actions.ts` (DroneOps RBAC matrix)

## Context

Track C of the Wave 2.5 bridge slice shipped invite/suspend/reactivate/revoke server actions gated on the `members.invite` and `members.suspend` DroneOps actions. The `members.invite` row in the RBAC matrix is granted to both `owner` and `admin` — which, combined with the `ALLOWED_ROLES = ["admin", "analyst", "viewer"]` allow-list on the invite form, means an admin can invite a peer admin. This was flagged during `/review` as "admin-to-admin invitation escalation" (LOW-MEDIUM, design question not a bug).

The question is where to draw the line. Two reasonable defaults:

- **A. Admins can mint admins.** Mirrors the principal that "if you trust me to invite people, you trust me to invite anyone I could have removed." Simpler model, fewer special cases.
- **B. Only owners can mint admins.** Admins can still delegate day-to-day access (analyst + viewer) but cannot create peer admins or elevate existing non-admins.

## Decision

**Adopt B — owners only may invite or promote users into the `admin` role.** Existing admins may continue to invite analysts and viewers, but cannot create peer admins. Ownership transfer stays out of scope (not yet in the RBAC matrix at all).

## Why

- `admin` grants access to support/admin surfaces (`/admin`, `/admin/people`, `/admin/copilot`), membership changes (suspend/reactivate), invitation minting, and the copilot-spend dashboard. That's a materially larger blast radius than analyst.
- For a small-team SaaS serving planning agencies, RTPAs, counties, and tribes, the realistic abuse case isn't external attack — it's role-sprawl inside a single org. Letting any admin make more admins makes the org's privilege graph impossible to reason about six months in.
- Owner-only admin elevation keeps accountability legible (every admin was elevated by the owner) while preserving the day-to-day delegation that makes admin a useful role at all (analyst + viewer invites are still admin-delegable).
- Reversing this decision later is cheap — broaden the allow-list, no migration needed. Reversing the other direction (A → B) is harder because you'd need to audit and possibly downgrade existing admin-created admins.

## How it lands in code

- `inviteMemberAction` (`web/src/app/admin/people/actions.ts`) rejects `role === "admin"` when `access.role !== "owner"` with the error "Only owners can invite admins." No change to the DroneOps RBAC matrix — both owners and admins still have `members.invite`; the new check is an additional role-specific guard inside the action.
- One new vitest case in `actions.test.ts` asserts an admin attempting to invite `role=admin` gets the targeted error, while the same admin inviting `role=analyst` still succeeds.
- `/admin/people` invite form may hide the `admin` role option for non-owners as a usability polish, but the server-side guard is the authoritative check (ADR-002 Decision 2 convention — never rely on UI-only gates for security decisions).

## Open

- **Ownership transfer.** There is no server action to transfer `owner` or promote `admin → owner`. Handled via SQL for now. Revisit when we have more than one owner use case.
- **Role downgrade / demotion.** Admins demoting other admins is not implemented. The simplest path is a separate `setMemberRole` action, out of scope for Wave 2.5.
