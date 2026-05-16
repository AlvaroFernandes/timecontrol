-- Soft delete for entries: mark rows instead of removing them.
-- Run in the Supabase SQL editor.

alter table entries add column if not exists deleted_at timestamptz;

-- Replace the plain composite index from 009 with a partial one that only
-- indexes live rows, keeping the index small and queries fast.
drop index if exists entries_user_id_date_idx;

create index if not exists entries_active_user_date_idx
  on entries (user_id, date, start_time)
  where deleted_at is null;
