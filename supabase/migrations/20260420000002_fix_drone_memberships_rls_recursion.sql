-- The members_can_read_memberships policy from the 2026-03-04 auth
-- foundation migration self-references drone_memberships in its
-- USING clause, which Postgres rejects with "infinite recursion
-- detected in policy for relation drone_memberships" whenever any
-- query touches drone_memberships or any table whose policy
-- subqueries drone_memberships (drone_orgs, drone_entitlements).
--
-- Scope reads to the user's own membership rows. Cross-member reads
-- (admin UIs, invitation accept) run via service-role through
-- adminRestRequest, which bypasses RLS.

drop policy if exists "members_can_read_memberships" on public.drone_memberships;

create policy "users_read_own_memberships"
on public.drone_memberships
for select
using (user_id = auth.uid());
