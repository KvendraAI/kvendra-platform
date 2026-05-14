/* SPDX-License-Identifier: AGPL-3.0-only */
import { randomBytes } from 'node:crypto';

import type { Pool } from './db.js';
import type { Transaction } from '../domain/entity-types.js';

function rowToTxn(row: Record<string, unknown>): Transaction {
  return {
    txn_id: row.txn_id as string,
    status: row.status as Transaction['status'],
    type: row.type as string,
    trigger: (row.trigger as string | null) ?? null,
    project_id: row.project_id as string,
    component_id: (row.component_id as string | null) ?? null,
    pipeline: (row.pipeline as Transaction['pipeline']) ?? [],
    started_by: row.started_by as string,
    started_at: new Date(row.started_at as string).toISOString(),
    completed_at: row.completed_at ? new Date(row.completed_at as string).toISOString() : null,
    cancelled_at: row.cancelled_at ? new Date(row.cancelled_at as string).toISOString() : null,
    cancel_reason: (row.cancel_reason as string | null) ?? null,
    recovery_notes: (row.recovery_notes as string | null) ?? null,
  };
}

export class TxnRepo {
  constructor(private readonly pool: Pool) {}

  async create(input: {
    project_id: string;
    component_id?: string | null;
    type: string;
    trigger?: string | null;
    pipeline?: Array<{ step: number; name: string }>;
    started_by: string;
    force_id?: string | null;
  }): Promise<Transaction> {
    const txnId = input.force_id ?? this.generateId(input.project_id);
    const { rows } = await this.pool.query(
      `INSERT INTO transactions
         (txn_id, status, type, trigger, project_id, component_id, pipeline, started_by)
       VALUES ($1, 'in-progress', $2, $3, $4, $5, $6::JSONB, $7)
       RETURNING *`,
      [
        txnId,
        input.type,
        input.trigger ?? null,
        input.project_id,
        input.component_id ?? null,
        JSON.stringify(input.pipeline ?? []),
        input.started_by,
      ],
    );
    return rowToTxn(rows[0] as Record<string, unknown>);
  }

  async get(txnId: string): Promise<Transaction | null> {
    const { rows } = await this.pool.query(`SELECT * FROM transactions WHERE txn_id = $1`, [txnId]);
    if (rows.length === 0) return null;
    return rowToTxn(rows[0] as Record<string, unknown>);
  }

  async activate(
    txnId: string,
    activatedBy: string,
  ): Promise<{ txn: Transaction; promotedEntities: string[] }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: currentRows } = await client.query(
        `SELECT * FROM transactions WHERE txn_id = $1 FOR UPDATE`,
        [txnId],
      );
      if (currentRows.length === 0) {
        throw new Error(`Transaction "${txnId}" not found.`);
      }
      const current = rowToTxn(currentRows[0] as Record<string, unknown>);
      if (current.status !== 'in-progress') {
        throw new Error(`Transaction "${txnId}" is not in-progress (status=${current.status}).`);
      }
      const { rows: promotedRows } = await client.query(
        `UPDATE entities
            SET status = 'active',
                updated_at = now(),
                version = version + 1,
                updated_by = $2
          WHERE txn_id = $1 AND status = 'draft'
          RETURNING entity_id`,
        [txnId, activatedBy],
      );
      const { rows: txnRows } = await client.query(
        `UPDATE transactions
            SET status = 'completed', completed_at = now()
          WHERE txn_id = $1
          RETURNING *`,
        [txnId],
      );
      await client.query('COMMIT');
      return {
        txn: rowToTxn(txnRows[0] as Record<string, unknown>),
        promotedEntities: promotedRows.map((r) => r.entity_id as string),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async cancel(
    txnId: string,
    reason: string,
    cancelledBy: string,
  ): Promise<Transaction> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: currentRows } = await client.query(
        `SELECT status FROM transactions WHERE txn_id = $1 FOR UPDATE`,
        [txnId],
      );
      if (currentRows.length === 0) {
        throw new Error(`Transaction "${txnId}" not found.`);
      }
      if (currentRows[0]?.status !== 'in-progress') {
        throw new Error(
          `Transaction "${txnId}" is not in-progress (status=${currentRows[0]?.status}).`,
        );
      }
      await client.query(
        `UPDATE entities
            SET status = 'cancelled',
                updated_at = now(),
                version = version + 1,
                updated_by = $2
          WHERE txn_id = $1 AND status = 'draft'`,
        [txnId, cancelledBy],
      );
      const { rows } = await client.query(
        `UPDATE transactions
            SET status = 'cancelled', cancelled_at = now(), cancel_reason = $2
          WHERE txn_id = $1
          RETURNING *`,
        [txnId, reason],
      );
      await client.query('COMMIT');
      return rowToTxn(rows[0] as Record<string, unknown>);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async countInProgress(): Promise<number> {
    const { rows } = await this.pool.query<{ c: string }>(
      `SELECT count(*)::TEXT AS c FROM transactions WHERE status = 'in-progress'`,
    );
    return Number(rows[0]?.c ?? '0');
  }

  async checkInterrupted(
    projectId: string,
    componentId?: string | null,
  ): Promise<Transaction[]> {
    const params: unknown[] = [projectId];
    let sql = `SELECT * FROM transactions WHERE status = 'in-progress' AND project_id = $1`;
    if (componentId) {
      sql += ` AND component_id = $2`;
      params.push(componentId);
    }
    sql += ` ORDER BY started_at DESC`;
    const { rows } = await this.pool.query(sql, params);
    return rows.map((r) => rowToTxn(r as Record<string, unknown>));
  }

  private generateId(projectId: string): string {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const seq = randomBytes(2).toString('hex').toUpperCase();
    return `TXN-${projectId.toUpperCase()}-${ymd}-${seq}`;
  }
}
