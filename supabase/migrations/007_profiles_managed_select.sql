-- ── Fix profiles_managed_select policy ────────────────────────────────────────
-- The original policy used a hardcoded admin_id = auth.uid() check, which
-- broke sub-admins: they could not see the profiles of workers in their pool.
-- Replace it with manages_user() which already handles both root and sub-admins.

drop policy if exists "profiles_managed_select" on profiles;

create policy "profiles_managed_select" on profiles
  for select using (is_admin() and manages_user(user_id));
