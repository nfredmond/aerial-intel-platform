# Production copilot smoke - 2026-04-24

Purpose: verify the current Production deployment after the Wave 2.5 exit
handoff and the Supabase leaked-password protection closure.

## Target

- Production deployment:
  `https://aerial-intel-platform-jqcd9ywgt-natford.vercel.app`
- Supabase project: `bvrmnesiamadpnysqiqd`
- Org: `nat-ford-drone-lab`
  (`a7081499-7f98-4915-9b68-27856fb7d440`)
- Mission:
  `3ca2d074-0f00-4adf-b3a4-75f63a964a77`
- Test owner: `test.drone.owner@natfordplanning.test`

## Method

- Signed in with the established passwordless Supabase admin magic-link OTP
  pattern: `admin.generateLink` -> `verifyOtp` -> auth cookie injection.
- Opened `/missions/3ca2d074-0f00-4adf-b3a4-75f63a964a77`.
- Clicked **Generate client brief** in the mission-brief panel.
- Reloaded `/admin/copilot` and also read recent `drone_org_events` rows through
  Supabase REST to verify the audit record.

## Result

Production passed the mission-brief smoke:

- Visible `[fact:*]` citations rendered in the mission-brief panel.
- `8/8` sentences kept, `0` dropped.
- Model: `anthropic/claude-opus-4.7`.
- Spend: `74` tenth-cents (`$0.074`).
- New audit event:
  `470419a0-65c8-4aae-906f-60094a32d5cd`.
- Event type: `copilot.call.succeeded`.
- Event payload: `skill=mission-brief`, `status=ok`,
  `targetId=3ca2d074-0f00-4adf-b3a4-75f63a964a77`.
- Browser console/page errors captured by the smoke: none.

This verifies that the current Production deployment is audit/citation clean
for the W2-C1 happy path. It does not re-run the Preview-only cap-exhaustion
or grounding-challenge loops from the Wave 2.5 exit note.

