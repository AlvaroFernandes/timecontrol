-- ── Viewer (read-only accountant) role ────────────────────────────────────────

-- 1. Widen the role CHECK constraint to accept 'viewer'
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add  constraint profiles_role_check
  check (role in ('user', 'admin', 'viewer'));

-- 2. Update signup trigger so invited viewers get the correct role
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  p_role     text;
  p_admin_id uuid;
begin
  p_role     := coalesce(new.raw_user_meta_data->>'invited_role', 'user');
  p_admin_id := nullif(new.raw_user_meta_data->>'invited_by', '')::uuid;

  insert into profiles (user_id, email, name, role, admin_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    case when p_role in ('admin', 'viewer') then p_role else 'user' end,
    p_admin_id
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 3. Helper: is the current user a viewer?
create or replace function is_viewer()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles where user_id = auth.uid() and role = 'viewer'
  );
$$;

-- 4. Viewers may SELECT entries of workers under their shared root admin.
--    manages_user() already handles the sub-admin / shared-admin_id case,
--    so viewers whose admin_id matches the worker's admin_id pass the check.
create policy "entries_viewer_select" on entries
  for select using (is_viewer() and manages_user(user_id));

-- 5. Viewers may SELECT profiles of workers under their shared root admin
--    (needed to resolve worker names in the Entries and Weekly Report tabs).
create policy "profiles_viewer_select" on profiles
  for select using (is_viewer() and manages_user(user_id));
