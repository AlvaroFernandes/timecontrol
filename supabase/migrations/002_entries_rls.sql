-- ── User-level RLS policies for entries ──────────────────────────────────────
-- The 001_admin migration assumed user-owned policies already existed.
-- This migration makes them explicit and adds them if they are missing.

alter table entries enable row level security;

-- Drop and recreate to ensure idempotency
drop policy if exists "entries_own_select" on entries;
drop policy if exists "entries_own_insert" on entries;
drop policy if exists "entries_own_update" on entries;
drop policy if exists "entries_own_delete" on entries;

create policy "entries_own_select" on entries
  for select using (auth.uid() = user_id);

create policy "entries_own_insert" on entries
  for insert with check (auth.uid() = user_id);

create policy "entries_own_update" on entries
  for update using (auth.uid() = user_id);

create policy "entries_own_delete" on entries
  for delete using (auth.uid() = user_id);
