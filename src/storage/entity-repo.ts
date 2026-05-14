/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Pool } from './db.js';
import type { Entity, EntityType, Relation } from '../domain/entity-types.js';

export interface EntityCreateInput {
  entity_id: string;
  entity_type: EntityType;
  project_id?: string | null;
  component_id?: string | null;
  status: string;
  title: string;
  content: string;
  tags: string[];
  metadata: Record<string, unknown>;
  embedding?: number[] | null;
  txn_id?: string | null;
  updated_by: string;
}

export interface EntityQueryFilter {
  entity_type?: EntityType;
  project_id?: string;
  component_id?: string;
  status?: string[] | null;
  tags_all?: string[];
  tags_any?: string[];
  drafts?: boolean;
  archived?: boolean;
  limit?: number;
  offset?: number;
  order_by?: 'updated_at_desc' | 'entity_id_asc';
}

export interface SearchOptions {
  query_embedding: number[];
  entity_type?: EntityType;
  project_id?: string;
  tags_all?: string[];
  limit: number;
  min_score: number;
  include_archived: boolean;
}

export interface SearchHit {
  entity_id: string;
  score: number;
  title: string;
  snippet: string;
}

function rowToEntity(row: Record<string, unknown>): Entity {
  return {
    entity_id: row.entity_id as string,
    entity_type: row.entity_type as EntityType,
    project_id: (row.project_id as string | null) ?? null,
    component_id: (row.component_id as string | null) ?? null,
    status: row.status as string,
    archived: row.archived as boolean,
    archived_at: row.archived_at ? new Date(row.archived_at as string).toISOString() : null,
    archive_reason: (row.archive_reason as string | null) ?? null,
    title: row.title as string,
    content: row.content as string,
    tags: (row.tags as string[]) ?? [],
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    version: row.version as number,
    txn_id: (row.txn_id as string | null) ?? null,
    created_at: new Date(row.created_at as string).toISOString(),
    updated_at: new Date(row.updated_at as string).toISOString(),
    updated_by: row.updated_by as string,
  };
}

export class EntityRepo {
  constructor(private readonly pool: Pool) {}

  async create(input: EntityCreateInput, relations: Relation[]): Promise<Entity> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const embeddingParam = input.embedding ? formatVector(input.embedding) : null;
      const { rows } = await client.query(
        `INSERT INTO entities
          (entity_id, entity_type, project_id, component_id, status, title, content,
           tags, metadata, embedding, txn_id, updated_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::TEXT[], $9::JSONB, $10::vector, $11, $12)
         RETURNING *`,
        [
          input.entity_id,
          input.entity_type,
          input.project_id ?? null,
          input.component_id ?? null,
          input.status,
          input.title,
          input.content,
          input.tags,
          JSON.stringify(input.metadata),
          embeddingParam,
          input.txn_id ?? null,
          input.updated_by,
        ],
      );
      for (const r of relations) {
        await client.query(
          `INSERT INTO entity_relations(source_entity_id, target_entity_id, relation_type)
           VALUES ($1, $2, $3)
           ON CONFLICT DO NOTHING`,
          [input.entity_id, r.target, r.type],
        );
      }
      await client.query('COMMIT');
      return rowToEntity(rows[0] as Record<string, unknown>);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getById(
    entityId: string,
    includeDrafts = false,
    includeArchived = false,
  ): Promise<Entity | null> {
    const { rows } = await this.pool.query(
      `SELECT * FROM entities WHERE entity_id = $1`,
      [entityId],
    );
    if (rows.length === 0) return null;
    const entity = rowToEntity(rows[0] as Record<string, unknown>);
    if (!includeDrafts && entity.status === 'draft') return null;
    if (!includeArchived && entity.archived) return null;
    return entity;
  }

  async getRelations(entityId: string): Promise<{
    outbound: Array<{ type: string; target: string }>;
    inbound: Array<{ type: string; source: string }>;
  }> {
    const [outRows, inRows] = await Promise.all([
      this.pool.query(
        `SELECT relation_type, target_entity_id FROM entity_relations WHERE source_entity_id = $1`,
        [entityId],
      ),
      this.pool.query(
        `SELECT relation_type, source_entity_id FROM entity_relations WHERE target_entity_id = $1`,
        [entityId],
      ),
    ]);
    return {
      outbound: outRows.rows.map((r) => ({
        type: r.relation_type as string,
        target: r.target_entity_id as string,
      })),
      inbound: inRows.rows.map((r) => ({
        type: r.relation_type as string,
        source: r.source_entity_id as string,
      })),
    };
  }

  async update(
    entityId: string,
    expectedVersion: number,
    patch: {
      title?: string;
      content?: string;
      tags?: string[];
      metadata?: Record<string, unknown>;
      status?: string;
      embedding?: number[] | null;
    },
    changeSummary: string,
    updatedBy: string,
    txnId?: string | null,
  ): Promise<Entity> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const currentRes = await client.query(
        `SELECT version, metadata FROM entities WHERE entity_id = $1 FOR UPDATE`,
        [entityId],
      );
      if (currentRes.rows.length === 0) {
        throw new RepoError('ENTITY_NOT_FOUND', `Entity "${entityId}" not found.`);
      }
      const currentVersion = currentRes.rows[0]?.version as number;
      if (currentVersion !== expectedVersion) {
        throw new RepoError(
          'VERSION_CONFLICT',
          `Optimistic lock failed: expected version ${expectedVersion}, current is ${currentVersion}.`,
        );
      }
      const currentMetadata =
        (currentRes.rows[0]?.metadata as Record<string, unknown>) ?? {};
      const nextMetadata: Record<string, unknown> = {
        ...currentMetadata,
        ...(patch.metadata ?? {}),
        change_summary: changeSummary,
        updated_by: updatedBy,
      };
      const setParts: string[] = [
        'version = version + 1',
        'updated_at = now()',
        'updated_by = $2',
        'txn_id = $3',
        'metadata = $4::JSONB',
      ];
      const params: unknown[] = [entityId, updatedBy, txnId ?? null, JSON.stringify(nextMetadata)];
      let idx = 5;
      if (patch.title !== undefined) {
        setParts.push(`title = $${idx++}`);
        params.push(patch.title);
      }
      if (patch.content !== undefined) {
        setParts.push(`content = $${idx++}`);
        params.push(patch.content);
      }
      if (patch.tags !== undefined) {
        setParts.push(`tags = $${idx++}::TEXT[]`);
        params.push(patch.tags);
      }
      if (patch.status !== undefined) {
        setParts.push(`status = $${idx++}`);
        params.push(patch.status);
      }
      if (patch.embedding !== undefined) {
        setParts.push(`embedding = $${idx++}::vector`);
        params.push(patch.embedding ? formatVector(patch.embedding) : null);
      }
      const sql = `UPDATE entities SET ${setParts.join(', ')} WHERE entity_id = $1 RETURNING *`;
      const { rows } = await client.query(sql, params);
      await client.query('COMMIT');
      return rowToEntity(rows[0] as Record<string, unknown>);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async archive(
    entityId: string,
    reason: string,
    updatedBy: string,
  ): Promise<{ entity_id: string; archived_at: string }> {
    const { rows } = await this.pool.query(
      `UPDATE entities
         SET archived = true,
             archived_at = now(),
             archive_reason = $2,
             updated_by = $3,
             updated_at = now(),
             version = version + 1
       WHERE entity_id = $1
       RETURNING entity_id, archived_at`,
      [entityId, reason, updatedBy],
    );
    if (rows.length === 0) {
      throw new RepoError('ENTITY_NOT_FOUND', `Entity "${entityId}" not found.`);
    }
    return {
      entity_id: rows[0]?.entity_id as string,
      archived_at: new Date(rows[0]?.archived_at as string).toISOString(),
    };
  }

  async query(filter: EntityQueryFilter): Promise<{ entities: Entity[]; total: number }> {
    const params: unknown[] = [];
    const where: string[] = ['1=1'];
    let idx = 1;
    if (filter.entity_type) {
      where.push(`entity_type = $${idx++}`);
      params.push(filter.entity_type);
    }
    if (filter.project_id) {
      where.push(`project_id = $${idx++}`);
      params.push(filter.project_id);
    }
    if (filter.component_id) {
      where.push(`component_id = $${idx++}`);
      params.push(filter.component_id);
    }
    if (filter.status && filter.status.length) {
      where.push(`status = ANY($${idx++}::TEXT[])`);
      params.push(filter.status);
    } else if (!filter.drafts) {
      where.push(`status <> 'draft'`);
    }
    if (!filter.archived) where.push('archived = false');
    if (filter.tags_all && filter.tags_all.length) {
      where.push(`tags @> $${idx++}::TEXT[]`);
      params.push(filter.tags_all);
    }
    if (filter.tags_any && filter.tags_any.length) {
      where.push(`tags && $${idx++}::TEXT[]`);
      params.push(filter.tags_any);
    }
    const orderBy =
      filter.order_by === 'entity_id_asc' ? 'entity_id ASC' : 'updated_at DESC';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const totalRes = await this.pool.query(
      `SELECT count(*)::INT AS c FROM entities WHERE ${where.join(' AND ')}`,
      params,
    );
    const { rows } = await this.pool.query(
      `SELECT * FROM entities WHERE ${where.join(' AND ')}
       ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    return {
      entities: rows.map((r) => rowToEntity(r as Record<string, unknown>)),
      total: (totalRes.rows[0]?.c as number) ?? 0,
    };
  }

  async search(opts: SearchOptions): Promise<SearchHit[]> {
    const params: unknown[] = [formatVector(opts.query_embedding)];
    const where: string[] = ['embedding IS NOT NULL', `status <> 'draft'`];
    let idx = 2;
    if (!opts.include_archived) where.push('archived = false');
    if (opts.entity_type) {
      where.push(`entity_type = $${idx++}`);
      params.push(opts.entity_type);
    }
    if (opts.project_id) {
      where.push(`project_id = $${idx++}`);
      params.push(opts.project_id);
    }
    if (opts.tags_all && opts.tags_all.length) {
      where.push(`tags @> $${idx++}::TEXT[]`);
      params.push(opts.tags_all);
    }
    const sql = `
      SELECT entity_id, title, content,
             1 - (embedding <=> $1::vector) AS score
        FROM entities
       WHERE ${where.join(' AND ')}
       ORDER BY embedding <=> $1::vector
       LIMIT ${opts.limit}
    `;
    const { rows } = await this.pool.query(sql, params);
    return rows
      .map((r) => ({
        entity_id: r.entity_id as string,
        title: r.title as string,
        snippet: ((r.content as string) ?? '').slice(0, 200),
        score: Number(r.score) || 0,
      }))
      .filter((r) => r.score >= opts.min_score);
  }
}

export class RepoError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'RepoError';
  }
}

function formatVector(vec: number[]): string {
  // pgvector accepts '[v1,v2,...]' as text for the vector type.
  return `[${vec.map((n) => n.toString()).join(',')}]`;
}
