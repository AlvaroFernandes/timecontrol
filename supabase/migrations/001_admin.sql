-- ── Profiles table ────────────────────────────────────────────────────────────
-- Stores role (user | admin) and which admin manages each user.
-- Run this in your Supabase SQL editor.

create table if not exists profiles (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  role     text not null default 'user' check (role in ('user', 'admin')),
  admin_id uuid references profiles(user_id),
  email    text,
  name     text,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- ── Helper functions (security definer avoids policy recursion) ────────────────

create or replace function is_admin()
returns boolean language sql security definer stable as $$
  select exists (select 1 from profiles where user_id = auth.uid() and role = 'admin');
$$;

create or replace function manages_user(target_user_id uuid)
returns boolean language sql security definer stable as $$
  select exists (select 1 from profiles where user_id = target_user_id and admin_id = auth.uid());
$$;

-- ── Profiles RLS ──────────────────────────────────────────────────────────────

create policy "profiles_own_select"    on profiles for select using (auth.uid() = user_id);
create policy "profiles_managed_select" on profiles for select using (is_admin() and admin_id = auth.uid());
create policy "profiles_own_insert"    on profiles for insert with check (auth.uid() = user_id);
create policy "profiles_own_update"    on profiles for update using (auth.uid() = user_id);

-- ── Entries RLS – admin extensions ────────────────────────────────────────────
-- These policies add to whatever existing policies allow users to access their own entries.

create policy "entries_admin_select" on entries
  for select using (is_admin() and manages_user(user_id));

create policy "entries_admin_update" on entries
  for update using (is_admin() and manages_user(user_id));

create policy "entries_admin_delete" on entries
  for delete using (is_admin() and manages_user(user_id));

-- ── Auto-create profile on signup ─────────────────────────────────────────────

create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, email, name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ── Back-fill profiles for existing users ─────────────────────────────────────
-- Run once to create profiles for users who signed up before this migration.

insert into profiles (user_id, email)
select id, email from auth.users
on conflict (user_id) do nothing;
