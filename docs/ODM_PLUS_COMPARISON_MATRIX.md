# ODM+ Comparison Matrix

This matrix compares current open-source ODM options with the proposed Nat Ford ODM+ product direction. It is written for client-facing planning and avoids unreleased claims.

| Capability | ODM CLI | WebODM | NodeODM | Nat Ford ODM+ Differentiator | MVP Phase |
| --- | --- | --- | --- | --- | --- |
| Primary interface | Command line on local/remote host | Browser UI for job/project management | HTTP API wrapper around processing node | Opinionated workflow that combines reproducible automation with decision-ready deliverables | Phase 1 |
| User onboarding | Technical setup; docs-driven | Easier for non-CLI users; still self-host heavy | API-first; developer-centric | Fast-start templates and guided benchmark path for internal/demo use | Phase 1 |
| Processing orchestration | Manual commands/scripts | Queueing via WebODM server | Programmatic submission to node | Repeatable run protocol with consistent metadata capture and artifacts | Phase 1 |
| Benchmark reproducibility | Possible but custom to each team | Limited by operator consistency | Possible with disciplined API tooling | Standard benchmark script + protocol docs to compare runs across datasets and hardware | Phase 1 |
| Output packaging for stakeholders | Raw ODM outputs | Visual project/job views | API access to output files/status | Curated, client-safe output bundles (maps, summaries, QA notes, run metadata) | Phase 2 |
| Quality assurance workflow | Manual review | Manual review in UI | Must be built in consuming app | Defined QA checklist and acceptance thresholds tied to benchmark outputs | Phase 1 |
| Commercial readiness posture | Open-source tooling only | Open-source tooling only | Open-source tooling only | Service-oriented delivery model, scoped SLAs/process controls, and client communication templates | Phase 2 |
| Domain-specific reporting | Not included by default | Not included by default | Not included by default | Verticalized report formats for planning/inspection use cases with clear assumptions/disclaimers | Phase 3 |
| Deployment flexibility | High, infra-managed by operator | Moderate to high, infra-managed by operator | High for developers | Reference deployment patterns that reduce variance between test, demo, and production | Phase 2 |
| Governance and traceability | Depends on local practices | Basic job history | Depends on consuming system | Standardized run logs, summary manifests, and versioned protocol documentation | Phase 1 |

## MVP Phase Definitions

- Phase 1: Foundation artifacts for reproducible benchmarks, comparison narrative, and initial demo credibility.
- Phase 2: Packaging and operational hardening for client pilots.
- Phase 3: Domain-tailored analytics/reporting extensions.
