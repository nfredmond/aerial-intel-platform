-- Suspended memberships must not retain direct read access through existing
-- Supabase JWTs. Earlier policies checked only `user_id = auth.uid()`;
-- after `drone_memberships.status` exists, every member-read policy must
-- require the current membership row to be active.

drop policy if exists "members_can_read_orgs" on public.drone_orgs;
create policy "members_can_read_orgs"
on public.drone_orgs
for select
using (
  id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_memberships" on public.drone_memberships;
drop policy if exists "users_read_own_memberships" on public.drone_memberships;
create policy "users_read_own_memberships"
on public.drone_memberships
for select
using (user_id = auth.uid() and status = 'active');

drop policy if exists "members_can_read_entitlements" on public.drone_entitlements;
create policy "members_can_read_entitlements"
on public.drone_entitlements
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_projects" on public.drone_projects;
create policy "members_can_read_projects"
on public.drone_projects
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_sites" on public.drone_sites;
create policy "members_can_read_sites"
on public.drone_sites
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_missions" on public.drone_missions;
create policy "members_can_read_missions"
on public.drone_missions
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_mission_versions" on public.drone_mission_versions;
create policy "members_can_read_mission_versions"
on public.drone_mission_versions
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_datasets" on public.drone_datasets;
create policy "members_can_read_datasets"
on public.drone_datasets
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_ingest_sessions" on public.drone_ingest_sessions;
create policy "members_can_read_ingest_sessions"
on public.drone_ingest_sessions
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_processing_jobs" on public.drone_processing_jobs;
create policy "members_can_read_processing_jobs"
on public.drone_processing_jobs
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_processing_outputs" on public.drone_processing_outputs;
create policy "members_can_read_processing_outputs"
on public.drone_processing_outputs
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_processing_job_events" on public.drone_processing_job_events;
create policy "members_can_read_processing_job_events"
on public.drone_processing_job_events
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_share_links" on public.drone_artifact_share_links;
create policy "members_can_read_share_links"
on public.drone_artifact_share_links
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_artifact_comments" on public.drone_artifact_comments;
create policy "members_can_read_artifact_comments"
on public.drone_artifact_comments
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_artifact_approvals" on public.drone_artifact_approvals;
create policy "members_can_read_artifact_approvals"
on public.drone_artifact_approvals
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_org_settings" on public.drone_org_settings;
create policy "members_can_read_org_settings"
on public.drone_org_settings
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_org_ai_quota" on public.drone_org_ai_quota;
create policy "members_can_read_org_ai_quota"
on public.drone_org_ai_quota
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_invitations" on public.drone_invitations;
create policy "members_can_read_invitations"
on public.drone_invitations
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);

drop policy if exists "members_can_read_org_events" on public.drone_org_events;
create policy "members_can_read_org_events"
on public.drone_org_events
for select
using (
  org_id in (
    select org_id from public.drone_memberships
    where user_id = auth.uid() and status = 'active'
  )
);
