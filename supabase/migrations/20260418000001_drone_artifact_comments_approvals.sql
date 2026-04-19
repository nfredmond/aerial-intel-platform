-- W1-C: artifact comment threads + reviewer approvals
-- Paired tables that let reviewers post comments against a processing
-- output and record approve / changes-requested decisions. Approvals
-- gate the "exported" transition in the artifact detail UI so that no
-- artifact leaves the org until at least one reviewer has cleared it.

create table if not exists public.drone_artifact_comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  artifact_id uuid not null,
  parent_id uuid references public.drone_artifact_comments(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_email text,
  body text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint drone_artifact_comments_org_artifact_fkey
    foreign key (org_id, artifact_id)
    references public.drone_processing_outputs (org_id, id)
    on delete cascade,
  constraint drone_artifact_comments_body_nonempty
    check (char_length(trim(body)) > 0)
);

create index if not exists idx_drone_artifact_comments_artifact_id
  on public.drone_artifact_comments (artifact_id);
create index if not exists idx_drone_artifact_comments_org_id
  on public.drone_artifact_comments (org_id);
create index if not exists idx_drone_artifact_comments_created_at
  on public.drone_artifact_comments (created_at desc);

alter table public.drone_artifact_comments enable row level security;

create policy "members_can_read_artifact_comments"
on public.drone_artifact_comments
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

drop trigger if exists trg_drone_artifact_comments_updated_at on public.drone_artifact_comments;
create trigger trg_drone_artifact_comments_updated_at
before update on public.drone_artifact_comments
for each row execute function public.set_drone_updated_at();

create table if not exists public.drone_artifact_approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.drone_orgs(id) on delete cascade,
  artifact_id uuid not null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_email text,
  decision text not null,
  note text,
  decided_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint drone_artifact_approvals_org_artifact_fkey
    foreign key (org_id, artifact_id)
    references public.drone_processing_outputs (org_id, id)
    on delete cascade,
  constraint drone_artifact_approvals_decision_values
    check (decision in ('approved', 'changes_requested'))
);

create index if not exists idx_drone_artifact_approvals_artifact_id
  on public.drone_artifact_approvals (artifact_id);
create index if not exists idx_drone_artifact_approvals_org_id
  on public.drone_artifact_approvals (org_id);
create index if not exists idx_drone_artifact_approvals_decided_at
  on public.drone_artifact_approvals (decided_at desc);

alter table public.drone_artifact_approvals enable row level security;

create policy "members_can_read_artifact_approvals"
on public.drone_artifact_approvals
for select
using (
  org_id in (
    select org_id from public.drone_memberships where user_id = auth.uid()
  )
);

drop trigger if exists trg_drone_artifact_approvals_updated_at on public.drone_artifact_approvals;
create trigger trg_drone_artifact_approvals_updated_at
before update on public.drone_artifact_approvals
for each row execute function public.set_drone_updated_at();
