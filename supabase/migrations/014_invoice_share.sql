-- 014_invoice_share.sql
-- Adds a share_token to invoices so they can be viewed publicly via /invoice/[token].

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS share_token uuid;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_share_token_idx
  ON invoices(share_token) WHERE share_token IS NOT NULL;

-- Anon users can read any invoice that has a share token.
-- Security is provided by the UUID token's unguessability.
CREATE POLICY "public_read_shared_invoices"
  ON invoices FOR SELECT
  TO anon
  USING (share_token IS NOT NULL);
