-- Optional client / project tag on entries.
-- Run in the Supabase SQL editor.

alter table entries add column if not exists client text;
