-- Atomic share-link redemption.
--
-- The app previously incremented use_count with a read-modify-write after
-- serving the signed URL: concurrent downloads could exceed max_uses, and an
-- increment failure still served the file. This function performs the
-- validity check and the increment in one statement; a link that is revoked,
-- expired, or exhausted returns no row, and the caller must refuse to serve.

create or replace function public.redeem_drone_share_link(p_token text)
returns setof public.drone_artifact_share_links
language sql
security definer
set search_path = public
as $$
  update public.drone_artifact_share_links
     set use_count = use_count + 1,
         last_used_at = timezone('utc', now())
   where token = p_token
     and revoked_at is null
     and (expires_at is null or expires_at > timezone('utc', now()))
     and (max_uses is null or use_count < max_uses)
  returning *;
$$;

-- Redemption is a service-role-only operation; RLS-scoped clients must not be
-- able to burn (or probe) share links.
revoke all on function public.redeem_drone_share_link(text) from public;
revoke all on function public.redeem_drone_share_link(text) from anon;
revoke all on function public.redeem_drone_share_link(text) from authenticated;
grant execute on function public.redeem_drone_share_link(text) to service_role;
