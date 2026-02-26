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
- [ ] Product scope set: SSO only vs SSO + Directory Sync/SCIM (+ optional audit features).
- [ ] Supabase JWT claim mapping documented (`role=authenticated`) with `user_role` preserved.
- [ ] RBAC/RLS validation plan approved (positive + negative access tests).
- [ ] Auth failure-mode plan documented (token expiry, provider outage, malformed claims).
- [ ] Rollback path documented and tested in non-production.
- [ ] Cost estimate approved by COO/CEO (WorkOS + Supabase third-party MAU impact).

## 48-Hour Activation Plan (once GO is declared)
**Day 1 (Integration + Baseline Validation)**
- [ ] Configure WorkOS in non-production
- [ ] Validate org login, role claims, and Supabase authorization path
- [ ] Verify core user journeys (sign-in, org switch, permission boundaries)

**Day 2 (Hardening + Launch Readiness)**
- [ ] Execute security and regression checks
- [ ] Finalize runbook + on-call response steps
- [ ] Complete launch checklist and obtain COO go-live approval

## Escalation Rules (decision-grade only)
Escalate immediately to COO if:
- [ ] OpenPlan blocker exceeds 4 hours due to WorkOS work
- [ ] Any production/inbound lead outage exceeds 30 minutes
- [ ] Legal/licensing or customer-commitment risk appears within 72 hours

## Ownership & Validation
- **Coordinator:** Elena Marquez
- **Technical validator:** Iris Chen
- **Status:** Awaiting Iris validation response (`ACK-WORKOS-VALIDATION`)
- **Last updated:** 2026-02-25 (PST)
