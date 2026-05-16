-- ── RLS for settings and invoices tables ─────────────────────────────────────
-- Neither table had row-level security enabled, meaning any authenticated user
-- could read or write any other user's settings and invoice history.

-- ── Settings ──────────────────────────────────────────────────────────────────

alter table settings enable row level security;

drop policy if exists "settings_own_select" on settings;
drop policy if exists "settings_own_insert" on settings;
drop policy if exists "settings_own_update" on settings;
drop policy if exists "settings_own_delete" on settings;

create policy "settings_own_select" on settings
  for select using (auth.uid() = user_id);

create policy "settings_own_insert" on settings
  for insert with check (auth.uid() = user_id);

create policy "settings_own_update" on settings
  for update using (auth.uid() = user_id);

create policy "settings_own_delete" on settings
  for delete using (auth.uid() = user_id);

-- ── Invoices ──────────────────────────────────────────────────────────────────

alter table invoices enable row level security;

drop policy if exists "invoices_own_select" on invoices;
drop policy if exists "invoices_own_insert" on invoices;
drop policy if exists "invoices_own_update" on invoices;
drop policy if exists "invoices_own_delete" on invoices;

create policy "invoices_own_select" on invoices
  for select using (auth.uid() = user_id);

create policy "invoices_own_insert" on invoices
  for insert with check (auth.uid() = user_id);

create policy "invoices_own_update" on invoices
  for update using (auth.uid() = user_id);

create policy "invoices_own_delete" on invoices
  for delete using (auth.uid() = user_id);
