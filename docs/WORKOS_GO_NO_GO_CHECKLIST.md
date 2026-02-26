# WORKOS GO/NO-GO CHECKLIST

## Decision State (Locked)
- **Current state:** **USE LATER**
- **Directive owner:** COO (Bartholomew Hale)
- **Why:** Keep Lane 1 (OpenPlan pilot/commercial readiness) protected; activate WorkOS only when customer demand makes it decision-critical.

## GO Triggers (activate WorkOS now)
Mark **GO** when **any one** is true:
- [ ] Signed pilot/LOI requires enterprise SSO/SCIM within the next 30–60 days.
- [ ] Active procurement/security review explicitly requires SAML/OIDC + SCIM + audit/admin controls.
- [ ] Revenue-critical deal is blocked by missing enterprise auth capabilities.

## NO-GO / HOLD Conditions (stay USE LATER)
If **all GO triggers are false**, remain **USE LATER**, especially when:
- [ ] OpenPlan critical-path milestones would be delayed by auth work.
- [ ] No active enterprise requirement exists from a real prospect/customer.
- [ ] Team capacity cannot absorb integration without deadline/quality risk.

## Pre-Activation Readiness (must all be true before production)
### Product/Architecture prerequisites
- [ ] Product scope set: SSO only vs SSO + Directory Sync/SCIM (+ optional audit features).
- [ ] Integration mode chosen and documented: **Supabase Auth Provider (OAuth WorkOS)** vs **Supabase Third-Party Auth (issuer/JWT template)**.
- [ ] Redirect/callback URI mapping documented and configured in both Supabase and WorkOS.
- [ ] Required WorkOS credentials documented and stored securely (`WORKOS_CLIENT_ID`, API key/secret, webhook secret).

### Supabase auth/RLS prerequisites
- [ ] Supabase JWT claim mapping documented (`role=authenticated`) with `user_role` preserved.
- [ ] RBAC/RLS validation plan approved (positive + negative access tests across org/workspace boundaries).
- [ ] RLS policies explicitly avoid trusting mutable client-side fields and only use validated JWT claims + membership tables.
- [ ] JWT key rotation behavior and OIDC discovery assumptions documented (including key-refresh delay expectations).

### Webhook/security/operations prerequisites
- [ ] Webhook signature verification planned using raw request body + `WorkOS-Signature` header + webhook secret.
- [ ] Webhook idempotency plan approved (store processed event IDs; ignore duplicates).
- [ ] Out-of-order/stale event handling defined (upsert + timestamp guards).
- [ ] Webhook endpoint network controls defined (HTTPS only; IP allowlist decision documented).
- [ ] Auth failure-mode plan documented (token expiry, provider outage, malformed claims, webhook downtime).
- [ ] Rollback path documented and tested in non-production (feature-flag/provider toggle + fallback login path).
- [ ] Secret rotation + incident response steps documented (credential leak / signature failure scenarios).
- [ ] Cost estimate approved by COO/CEO (WorkOS + Supabase third-party MAU impact).

## 48-Hour Activation Plan (once GO is declared)
**Day 1 (Integration + Baseline Validation)**
- [ ] Configure WorkOS in non-production.
- [ ] Validate org login, role claims, and Supabase authorization path.
- [ ] Verify core user journeys (sign-in, org switch, permission boundaries).

**Day 2 (Hardening + Launch Readiness)**
- [ ] Execute security and regression checks (including webhook signature + duplicate replay tests).
- [ ] Finalize runbook + on-call response steps.
- [ ] Complete launch checklist and obtain COO go-live approval.

## Escalation Rules (decision-grade only)
Escalate immediately to COO if:
- [ ] OpenPlan blocker exceeds 4 hours due to WorkOS work.
- [ ] Any production/inbound lead outage exceeds 30 minutes.
- [ ] Legal/licensing or customer-commitment risk appears within 72 hours.

## Technical Validation (Iris)
- **Validation result:** `CONDITIONALLY SUFFICIENT` after checklist expansion.
- **Meaning:** With the added webhook/idempotency/RLS/rollback checks above, the checklist is technically sufficient for controlled activation when a GO trigger is met.
- **Remaining decision points before activation:**
  - Confirm integration mode (Supabase Auth provider vs Third-Party Auth issuer path).
  - Confirm whether SCIM/Directory Sync is in v1 activation or deferred.
  - Confirm spending guardrail (expected Third-Party MAU range + spend cap posture).

## Primary source references
- WorkOS + Supabase SSO integration docs: https://workos.com/docs/integrations/supabase-sso
- Supabase WorkOS provider setup: https://supabase.com/docs/guides/auth/social-login/auth-workos
- Supabase Third-party Auth (WorkOS): https://supabase.com/docs/guides/auth/third-party/workos
- Supabase Third-party auth pricing/limits: https://supabase.com/docs/guides/auth/third-party/overview
- Supabase Third-party MAU billing details: https://supabase.com/docs/guides/platform/manage-your-usage/monthly-active-users-third-party
- WorkOS webhook verification/idempotency guidance: https://workos.com/docs/events/data-syncing/webhooks

## Ownership & Validation
- **Coordinator:** Elena Marquez
- **Technical validator:** Iris Chen
- **Status:** Iris validation completed (expanded technical gates)
- **Last updated:** 2026-02-25 (PST)
