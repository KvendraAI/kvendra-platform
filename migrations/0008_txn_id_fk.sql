-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0008 — add FK constraint entities.txn_id -> transactions.txn_id.
-- ISSUE-KVD-PLATFORM-005: defense-in-depth so orphan drafts cannot reference a
-- non-existent txn_id. App-side validation lives in src/tools/entity-create.ts.

-- Cleanup orphan rows before adding the FK so the ALTER never aborts.
UPDATE entities
   SET txn_id = NULL
 WHERE txn_id IS NOT NULL
   AND txn_id NOT IN (SELECT txn_id FROM transactions);

ALTER TABLE entities
  DROP CONSTRAINT IF EXISTS entities_txn_id_fkey;

ALTER TABLE entities
  ADD CONSTRAINT entities_txn_id_fkey
  FOREIGN KEY (txn_id) REFERENCES transactions(txn_id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;
