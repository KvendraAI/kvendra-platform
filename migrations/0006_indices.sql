-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0006 — performance indices.

CREATE INDEX IF NOT EXISTS idx_entities_type        ON entities (entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_project     ON entities (project_id);
CREATE INDEX IF NOT EXISTS idx_entities_component   ON entities (component_id);
CREATE INDEX IF NOT EXISTS idx_entities_status      ON entities (status);
CREATE INDEX IF NOT EXISTS idx_entities_archived    ON entities (archived);
CREATE INDEX IF NOT EXISTS idx_entities_txn         ON entities (txn_id);
CREATE INDEX IF NOT EXISTS idx_entities_updated_at  ON entities (updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entities_tags        ON entities USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_entities_metadata    ON entities USING GIN (metadata);

-- HNSW vector index for cosine similarity (1024-dim).
CREATE INDEX IF NOT EXISTS idx_entities_embedding_hnsw
  ON entities USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_relations_target ON entity_relations (target_entity_id);
CREATE INDEX IF NOT EXISTS idx_relations_type   ON entity_relations (relation_type);

CREATE INDEX IF NOT EXISTS idx_txn_project      ON transactions (project_id);
CREATE INDEX IF NOT EXISTS idx_txn_status       ON transactions (status);
CREATE INDEX IF NOT EXISTS idx_txn_started_at   ON transactions (started_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_entity   ON entity_history (entity_id);
CREATE INDEX IF NOT EXISTS idx_history_fecha    ON entity_history (fecha DESC);
