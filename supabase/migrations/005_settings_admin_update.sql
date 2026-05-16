-- ── Admin write access to managed workers' settings ───────────────────────────
-- Allows admins to update a managed worker's settings row so they can set
-- per-worker TFN hour limits and overtime thresholds from the admin UI.

drop policy if exists "settings_admin_update" on settings;

create policy "settings_admin_update" on settings
  for update using (is_admin() and manages_user(user_id));
