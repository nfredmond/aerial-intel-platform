-- Hash share-link tokens at rest.
--
-- drone_artifact_share_links.token stored the capability secret in plaintext,
-- and the members_can_read_share_links RLS policy lets any org member SELECT
-- it — so a link meant for one external recipient was readable (and stealable)
-- by every member, and it also landed in plaintext in every database backup.
-- We now store only the SHA-256 hash. The plaintext exists transiently at
-- creation (rendered once into the shareable URL) and is never persisted;
-- redemption hashes the presented token and matches on the hash. Existing
-- links stay valid because their current plaintext is hashed in place below.

create extension if not exists pgcrypto;

alter table public.drone_artifact_share_links
  add column if not exists token_hash text;

update public.drone_artifact_share_links
  set token_hash = encode(digest(token, 'sha256'), 'hex')
  where token_hash is null and token is not null;

-- Retire the plaintext column and its unique index; dropping the column also
-- drops the implicit drone_artifact_share_links_token_key unique constraint.
drop index if exists public.idx_drone_artifact_share_links_token;
alter table public.drone_artifact_share_links
  drop column if exists token;

alter table public.drone_artifact_share_links
  alter column token_hash set not null;
alter table public.drone_artifact_share_links
  add constraint drone_artifact_share_links_token_hash_key unique (token_hash);
create index if not exists idx_drone_artifact_share_links_token_hash
  on public.drone_artifact_share_links (token_hash);

-- Redeem by hash. digest() lives in the extensions schema on Supabase and in
-- public on a vanilla install, so both are on the search_path.
create or replace function public.redeem_drone_share_link(p_token text)
returns setof public.drone_artifact_share_links
language sql
security definer
set search_path = public, extensions
as $$
  update public.drone_artifact_share_links
     set use_count = use_count + 1,
         last_used_at = timezone('utc', now())
   where token_hash = encode(digest(p_token, 'sha256'), 'hex')
     and revoked_at is null
     and (expires_at is null or expires_at > timezone('utc', now()))
     and (max_uses is null or use_count < max_uses)
  returning *;
$$;

revoke all on function public.redeem_drone_share_link(text) from public;
revoke all on function public.redeem_drone_share_link(text) from anon;
revoke all on function public.redeem_drone_share_link(text) from authenticated;
grant execute on function public.redeem_drone_share_link(text) to service_role;
