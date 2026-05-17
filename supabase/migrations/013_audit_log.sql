-- 013_audit_log.sql
-- Tracks admin actions: entry edits/deletes, invites, worker rule changes.

CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      text        NOT NULL,
  target_type text,
  target_id   text,
  meta        jsonb       NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_admin_created_idx
  ON audit_log(admin_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- Admin sees their own log
CREATE POLICY "admins_read_audit"
  ON audit_log FOR SELECT
  USING (admin_id = auth.uid());

-- Any authenticated admin may insert (actor_id must match caller)
CREATE POLICY "admins_insert_audit"
  ON audit_log FOR INSERT
  WITH CHECK (actor_id = auth.uid() AND is_admin());
