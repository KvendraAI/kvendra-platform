-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0005 — entity_history table + autopopulate trigger.

CREATE TABLE IF NOT EXISTS entity_history (
  id              BIGSERIAL   PRIMARY KEY,
  entity_id       TEXT        NOT NULL,
  fecha           TIMESTAMPTZ NOT NULL DEFAULT now(),
  autor           TEXT        NOT NULL,
  trigger         TEXT,
  change_summary  TEXT        NOT NULL,
  version_before  INTEGER,
  version_after   INTEGER     NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION trg_entity_history()
RETURNS TRIGGER AS $$
DECLARE
  v_trigger TEXT;
  v_summary TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_trigger := COALESCE(NEW.txn_id, 'direct');
    v_summary := 'Creación inicial (' || NEW.entity_type::TEXT || ')';
    INSERT INTO entity_history (entity_id, autor, trigger, change_summary, version_before, version_after)
    VALUES (NEW.entity_id, NEW.updated_by, v_trigger, v_summary, NULL, NEW.version);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only emit a history row when something other than the bookkeeping columns changed.
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.archived IS DISTINCT FROM NEW.archived
       OR OLD.title IS DISTINCT FROM NEW.title
       OR OLD.content IS DISTINCT FROM NEW.content
       OR OLD.tags IS DISTINCT FROM NEW.tags
       OR OLD.metadata IS DISTINCT FROM NEW.metadata
       OR OLD.embedding IS DISTINCT FROM NEW.embedding THEN
      v_trigger := COALESCE(NEW.txn_id, 'direct');
      v_summary := COALESCE(NEW.metadata->>'change_summary', 'Actualización');
      INSERT INTO entity_history (entity_id, autor, trigger, change_summary, version_before, version_after)
      VALUES (NEW.entity_id, NEW.updated_by, v_trigger, v_summary, OLD.version, NEW.version);
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS entities_history_trigger ON entities;
CREATE TRIGGER entities_history_trigger
  AFTER INSERT OR UPDATE ON entities
  FOR EACH ROW EXECUTE FUNCTION trg_entity_history();
