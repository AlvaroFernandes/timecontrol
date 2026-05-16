-- ── Admin read access to managed workers' settings ────────────────────────────
-- Without this, admins can only read their own settings row, so the app
-- cannot apply each worker's tfnLimit / overtimeThreshold / tfnRate when
-- processing that worker's entries in the admin weekly report.

drop policy if exists "settings_admin_select" on settings;

create policy "settings_admin_select" on settings
  for select using (is_admin() and manages_user(user_id));
