-- ── Unique email constraint on profiles ───────────────────────────────────────
-- Without this, multiple profiles can share the same email address, which
-- breaks invite deduplication: the same address can be invited repeatedly,
-- creating orphaned auth users or silently overwriting existing accounts.
--
-- A partial index is used (WHERE email IS NOT NULL) so that profiles created
-- before an email is known (e.g. pre-migration rows) are not affected.
--
-- NOTE: if duplicate emails already exist in the table, this will fail.
-- Deduplicate first with:
--   SELECT email, count(*) FROM profiles WHERE email IS NOT NULL
--   GROUP BY email HAVING count(*) > 1;

create unique index if not exists profiles_email_unique
  on profiles (email)
  where email is not null;
