-- ── Invitation-based user creation ────────────────────────────────────────────
-- Updates the signup trigger so that users invited by an admin automatically
-- get the right role and admin_id from the invitation metadata.
-- Also broadens manages_user() so sub-admins can see their sibling workers.

-- ── 1. Update signup trigger ──────────────────────────────────────────────────
-- Admins call supabase.auth.admin.inviteUserByEmail with:
--   data: { invited_role: 'user'|'admin', invited_by: '<root-admin-uuid>' }
-- The trigger reads these fields from raw_user_meta_data.

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
    case when p_role = 'admin' then 'admin' else 'user' end,
    p_admin_id
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- ── 2. Broaden manages_user for sub-admins ────────────────────────────────────
-- A sub-admin (role=admin, admin_id=<root>) should be able to see/edit
-- all workers linked to the same root admin.

create or replace function manages_user(target_user_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from profiles target_p
    where target_p.user_id = target_user_id
    and (
      -- Root admin: I directly own this user
      target_p.admin_id = auth.uid()
      -- Sub-admin: we share the same root admin
      or target_p.admin_id = (
        select admin_id from profiles
        where user_id = auth.uid() and admin_id is not null
        limit 1
      )
    )
  );
$$;
