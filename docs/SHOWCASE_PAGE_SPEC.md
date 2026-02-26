# natfordplanning.com ODM+ Showcase Page Spec

## Purpose

Present ODM+ as a credible, practical geospatial processing offer with clear scope, transparent constraints, and an easy lead handoff.

## Audience

- Municipal planning teams
- Engineering/inspection consultants
- Drone service operators needing repeatable processing workflows

## Page Structure

1. Hero section
- Headline: "ODM+ for Reliable Drone Mapping Delivery"
- Subhead: "OpenDroneMap-based processing workflows with reproducible benchmarks and client-ready outputs."
- Primary CTA button: "Book a 20-Minute Discovery Call"
- Secondary CTA button: "Request Benchmark Sample Pack"

2. Problem and outcome section
- Title: "From Raw Imagery to Decisions, Faster"
- Three pain points: inconsistent outputs, unclear QA, non-repeatable workflows.
- Three outcomes: standardized runs, transparent QA checks, clear delivery artifacts.

3. "How ODM+ Works" section
- Step 1: Intake (dataset and objective review)
- Step 2: Processing (ODM run using documented config)
- Step 3: QA + packaging (checklist and output bundle)
- Step 4: Handoff (summary and next-step recommendations)

4. Capability snapshot section
- Compact table: baseline OSS capability vs ODM+ process layer
- Link/anchor to detailed matrix in `docs/ODM_PLUS_COMPARISON_MATRIX.md`

5. Benchmark credibility section
- Copy: "Runs are documented with dataset metadata, hardware context, command args, timing, and QA checkpoints."
- CTA: "Download Benchmark Protocol"
- Link/anchor to `docs/SAMPLE_DATASET_BENCHMARK_PROTOCOL.md`

6. Trust, safety, and license disclosures section
- Safety notice: "ODM+ outputs support planning/inspection workflows and do not replace licensed professional judgment where required."
- Data handling notice: "Client data is processed only for agreed scope; retention/deletion terms are defined per engagement."
- License notice: "Processing pipeline uses OpenDroneMap ecosystem components under their respective open-source licenses."
- Accuracy notice: "Output quality depends on source imagery quality, overlap, GCP/control quality, and environmental conditions."

7. Lead capture section
- Form fields:
  - Name (required)
  - Work email (required)
  - Organization (required)
  - Use case type (dropdown: planning, inspection, other)
  - Estimated dataset size (optional)
  - Timeline (dropdown)
  - Notes (optional)
- Consent checkbox (required): "I agree to be contacted about ODM+ services."
- Submit button: "Request ODM+ Consultation"

8. Footer CTA strip
- Copy: "Need a reality check on your current drone mapping workflow?"
- Button: "Schedule Discovery Call"

## CTA Copy Library

- Primary hero CTA: "Book a 20-Minute Discovery Call"
- Secondary hero CTA: "Request Benchmark Sample Pack"
- Mid-page CTA: "Download Benchmark Protocol"
- Form submit CTA: "Request ODM+ Consultation"
- Footer CTA: "Schedule Discovery Call"

## Lead Capture Flow

1. User submits form.
2. Frontend validates required fields and consent.
3. Backend stores lead with timestamp, source page, and UTM parameters.
4. Auto-response email sent within 5 minutes:
- Subject: "ODM+ request received"
- Body: expected response window and requested prep items.
5. Internal routing:
- New lead notification to sales/ops inbox or CRM webhook.
- Priority tags by timeline and use case.
6. SLA target:
- Human follow-up within 1 business day.

## Compliance and Disclosure Requirements

- Include privacy policy link near form.
- Include terms link in footer.
- Display open-source attribution and links to ODM ecosystem repositories/licenses.
- Do not claim guaranteed accuracy or regulatory certification unless contractually supported.
