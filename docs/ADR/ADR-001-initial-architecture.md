# ADR-001: Compose Around ODM Ecosystem (Do Not "Clone and Rewrite" v1)

## Status
Proposed

## Context
Nathaniel wants a significantly better version of ODM/WebODM functionality and a free public showcase on natfordplanning.com.

ODM is AGPLv3 and has a mature ecosystem (ODM, WebODM, NodeODM, ClusterODM). Full rewrite would be slow and risky. Direct derivative work may trigger source-sharing obligations when network-served.

## Decision
Build a **composed platform**:
- Use ODM-compatible processing services as underlying engine(s)
- Build Nat Ford value in orchestration, UX, QA, narrative reporting, and planning-focused workflows
- Keep legal boundaries explicit and attribution prominent

## Why this decision
1. Fastest path to useful public demo
2. Lower algorithmic risk (reuse proven photogrammetry core)
3. Better strategic differentiation in workflow/UI/analysis layer
4. Keeps OSS collaboration path open while protecting execution velocity

## Consequences
### Positive
- Faster MVP
- Reduced core-processing risk
- Easier interoperability with existing ODM users

### Negative / Risks
- Need careful AGPL compliance posture
- Dependency on upstream ODM behavior/performance
- Must avoid deceptive "from scratch" claims

## Implementation Notes
- Frontend: Next.js showcase + run dashboards
- Orchestration API: queue + job tracking + artifact indexing
- Processing workers: ODM/NodeODM/ClusterODM
- Storage: object storage for large artifacts
- Post-processing: QA checks + client-safe export package

## Compliance Guardrails
- Maintain clear attribution and license notices
- Track modified upstream components and source publication obligations
- Keep ADR updates for legal/architecture changes
