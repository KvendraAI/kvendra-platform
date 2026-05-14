/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Pool } from './db.js';
import type { HistoryEntry } from '../domain/entity-types.js';

export class HistoryRepo {
  constructor(private readonly pool: Pool) {}

  async getHistory(entityId: string, limit = 20): Promise<HistoryEntry[]> {
    const { rows } = await this.pool.query(
      `SELECT id, entity_id, fecha, autor, trigger, change_summary,
              version_before, version_after, created_at
         FROM entity_history
        WHERE entity_id = $1
        ORDER BY id DESC
        LIMIT $2`,
      [entityId, limit],
    );
    return rows.map((r) => ({
      id: String(r.id),
      entity_id: r.entity_id as string,
      fecha: new Date(r.fecha as string).toISOString(),
      autor: r.autor as string,
      trigger: (r.trigger as string | null) ?? null,
      change_summary: r.change_summary as string,
      version_before: (r.version_before as number | null) ?? null,
      version_after: r.version_after as number,
      created_at: new Date(r.created_at as string).toISOString(),
    }));
  }
}
