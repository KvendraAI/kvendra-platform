-- SPDX-License-Identifier: AGPL-3.0-only
-- kvendra-platform migration 0004 — transactions table.

CREATE TABLE IF NOT EXISTS transactions (
  txn_id          TEXT        PRIMARY KEY,
  status          TEXT        NOT NULL DEFAULT 'in-progress',
  type            TEXT        NOT NULL,
  trigger         TEXT,
  project_id      TEXT        NOT NULL,
  component_id    TEXT,
  pipeline        JSONB       NOT NULL DEFAULT '{}'::JSONB,
  started_by      TEXT        NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at    TIMESTAMPTZ,
  cancelled_at    TIMESTAMPTZ,
  cancel_reason   TEXT,
  recovery_notes  TEXT,
  CONSTRAINT transactions_status_check
    CHECK (status IN ('in-progress','completed','cancelled'))
);
