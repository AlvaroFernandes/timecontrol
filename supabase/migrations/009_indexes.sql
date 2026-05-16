-- Performance indexes for the three most-queried non-PK columns.
-- Run in the Supabase SQL editor.

-- entries: getEntries and getAdminEntries both filter by user_id
-- and order by date then start_time — a covering index serves both paths.
create index if not exists entries_user_id_date_idx
  on entries (user_id, date, start_time);

-- invoices: getInvoices filters by user_id and orders by invoice_num DESC.
create index if not exists invoices_user_id_invoice_num_idx
  on invoices (user_id, invoice_num desc);

-- profiles: getManagedTeam / getManagedUsers / getManagedAdmins all query
-- admin_id = <root> AND role = 'user'|'admin' — composite covers both predicates.
create index if not exists profiles_admin_id_role_idx
  on profiles (admin_id, role);
