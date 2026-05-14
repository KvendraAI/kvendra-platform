/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Pool } from './db.js';
import type { Relation } from '../domain/entity-types.js';

export class RelationsRepo {
  constructor(private readonly pool: Pool) {}

  async addRelation(source: string, rel: Relation): Promise<void> {
    await this.pool.query(
      `INSERT INTO entity_relations(source_entity_id, target_entity_id, relation_type)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [source, rel.target, rel.type],
    );
  }

  async removeRelation(source: string, rel: Relation): Promise<void> {
    await this.pool.query(
      `DELETE FROM entity_relations
        WHERE source_entity_id = $1 AND target_entity_id = $2 AND relation_type = $3`,
      [source, rel.target, rel.type],
    );
  }
}
