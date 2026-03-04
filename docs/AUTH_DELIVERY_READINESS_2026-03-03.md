# DroneOps Auth Delivery Readiness Plan

Date: 2026-03-03
Owner: Bartholomew

## Why this is now critical
DroneOps tiers are already listed on the public product/pricing website. We need buyer-ready authenticated access so delivery can start immediately after purchase.

## Delivery objective
Stand up a secure auth + entitlement baseline for DroneOps customers, with customer/admin roles and purchase-linked activation.

## Scope (Phase 1)
1. Supabase auth foundation (users, organizations, memberships, entitlements)
2. Purchase linkage from website checkout to DroneOps entitlements
3. Minimum app auth surface (sign-in, account context, role checks)
4. Manual fallback provisioning command for same-day customer onboarding

## Role model
- `owner` — organization owner, billing + governance
- `admin` — operations and team access management
- `analyst` — project execution access
- `viewer` — read-only access to outputs

## Entitlement model
- product_id: `drone-ops`
- tier_id: `drone-starter | drone-professional | drone-enterprise`
- status: `active | past_due | canceled | refunded | pending`

## Integration with current website
- Website webhook writes `customer_product_access` entitlements by email.
- DroneOps app should read the same entitlement status before granting workspace access.

## 7-day implementation checklist
- [x] Auth foundation schema drafted in migration scaffold
- [ ] Wire app auth pages (`/sign-in`, `/dashboard`) and role gate middleware
- [ ] Add entitlement gate to mission/workflow routes
- [ ] Add smoke test: paid tier user can sign in and access authorized features
- [ ] Add smoke test: canceled/refunded user is blocked with billing guidance

## Acceptance criteria
- Paid buyer can sign in and access product lane same day.
- Non-entitled user is blocked from protected DroneOps features.
- Role boundaries are enforced and auditable.
