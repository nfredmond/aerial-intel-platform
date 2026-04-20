# Supabase security-advisor state — 2026-04-19

Ran `get_advisors(security)` via Supabase MCP on project `bvrmnesiamadpnysqiqd`. Three lints surfaced; this note captures the honest state of each so we don't repeat the diagnosis on the next audit.

## 1. `rls_disabled_in_public` on `public.spatial_ref_sys` — ERROR, not fixable in place

PostGIS installs `spatial_ref_sys` as an extension-owned reference table (every EPSG CRS definition) and reads it internally on every geometry operation. `ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY` errors with `42501: must be owner of table spatial_ref_sys` in the SQL editor because the Supabase-exposed role doesn't own extension tables, and forcing it through would break `ST_Transform` and anything else that looks up SRIDs.

**Action taken:** none. The advisor is a known false positive for extension-owned tables. Dismiss it in the dashboard ("Ignore this lint" on the row in Database → Advisors) so it stops drowning real findings.

## 2. `extension_in_public` for `postgis` — WARN, not fixable in place

The clean fix is `ALTER EXTENSION postgis SET SCHEMA extensions`, but PostGIS's control file declares it non-relocatable — the migration errors with `0A000: extension "postgis" does not support SET SCHEMA`. The only in-place alternative is `DROP EXTENSION postgis CASCADE` followed by `CREATE EXTENSION postgis SCHEMA extensions`, which cascades through every `geometry` column and would destroy data in `drone_datasets`, `drone_missions`, and `drone_sites`. That's not a worthwhile trade for an advisory warning.

A real relocation needs either a Supabase-platform migration (dump → restore into a fresh DB where PostGIS is created in `extensions` up front) or a support-ticket escalation. Defer.

**Action taken:** none. Dismiss in the dashboard. Reconsider only if we ever stand up a new Supabase project from scratch — at that point, `CREATE EXTENSION postgis SCHEMA extensions` on day one avoids the whole problem.

## 3. `auth_leaked_password_protection` — WARN, one-click fix

Enables Supabase Auth's HaveIBeenPwned check on password signups / changes. Not exposed via MCP; must be toggled in the dashboard.

**Action required:** go to https://supabase.com/dashboard/project/bvrmnesiamadpnysqiqd/auth/providers, scroll to **Email → Password Protection**, enable **Prevent use of compromised passwords**. Worth doing before inviting the first external user through `/admin/people`.

## What did get fixed on 2026-04-19

`supabase/migrations/20260420000002_fix_drone_memberships_rls_recursion.sql` replaced the self-referencing `members_can_read_memberships` policy with `users_read_own_memberships (user_id = auth.uid())`. That wasn't one of the advisor lints, but it was the actual root cause of the 42P17 "infinite recursion detected in policy" errors at sign-in after Codex applied the missing staging migrations. Cross-member reads (admin UI, invitation accept) go through service-role `adminRestRequest`, which bypasses RLS, so no app change was needed alongside the policy rewrite.
