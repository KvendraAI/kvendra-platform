-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0009 — CFG metadata lookup index.
-- ISSUE-KVD-PLATFORM-006: speed up scope/user_id/project_id lookups used by
-- buildCfgCascade. Partial index on entity_type='CFG' to keep it small.

CREATE INDEX IF NOT EXISTS entities_cfg_lookup
  ON entities (
    (metadata->>'scope'),
    (metadata->>'user_id'),
    (metadata->>'project_id')
  )
  WHERE entity_type = 'CFG';
