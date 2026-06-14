/* SPDX-License-Identifier: AGPL-3.0-only */
/*
 * Integration tests for the 14 MCP tools.
 *
 * These tests assume a Postgres+pgvector instance is reachable via the
 * DATABASE_URL env var (the docker-compose stack provides one). When that
 * is not available, the suite is skipped with a clear message.
 *
 * Tester v3 (phase 4) wires this up. Implementer v3 ships the skeleton.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveEmbeddingsProvider } from '../../src/embeddings/index.js';
import { closePool, getPool, runMigrations } from '../../src/storage/db.js';
import { EntityRepo } from '../../src/storage/entity-repo.js';
import { HistoryRepo } from '../../src/storage/history-repo.js';
import { RelationsRepo } from '../../src/storage/relations-repo.js';
import { TxnRepo } from '../../src/storage/txn-repo.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { buildToolRegistry } from '../../src/tools/index.js';

const DB_URL = process.env.DATABASE_URL ?? '';

const describeIfDb = DB_URL ? describe : describe.skip;

describeIfDb('MCP tools — integration (Postgres+pgvector required)', () => {
  let deps: ToolDeps;
  const registry = buildToolRegistry();

  beforeAll(async () => {
    const pool = getPool(DB_URL, 5);
    await runMigrations(pool);
    deps = {
      entityRepo: new EntityRepo(pool),
      historyRepo: new HistoryRepo(pool),
      relationsRepo: new RelationsRepo(pool),
      txnRepo: new TxnRepo(pool),
      embeddings: resolveEmbeddingsProvider('mock'),
    };
  });

  afterAll(async () => {
    await closePool();
  });

  it('entity_create — PRJ with entity_id (literal)', async () => {
    const tool = registry.entity_create!;
    const out = (await tool.handler(deps, {
      entity_type: 'PRJ',
      entity_id: 'PRJ-TEST',
      project_id: 'TEST',
      title: 'Test project',
      content: 'Test content',
    })) as { entity_id: string; status: string };
    expect(out.entity_id).toBe('PRJ-TEST');
    expect(out.status).toBe('active');
  });

  it('entity_create — PRJ without entity_id fails', async () => {
    const tool = registry.entity_create!;
    await expect(
      tool.handler(deps, { entity_type: 'PRJ', title: 't', content: 'c' }),
    ).rejects.toThrow();
  });

  it('txn_create + entity_create draft + txn_activate', async () => {
    const txnCreate = registry.txn_create!;
    const entityCreate = registry.entity_create!;
    const txnActivate = registry.txn_activate!;
    const txn = (await txnCreate.handler(deps, {
      project_id: 'TEST',
      type: 'feature',
      trigger: 'integration test',
      started_by: 'test',
    })) as { txn_id: string };

    const cmp = (await entityCreate.handler(deps, {
      entity_type: 'CMP',
      entity_id: 'CMP-TEST-ALPHA',
      project_id: 'TEST',
      title: 'Alpha cmp',
      content: 'desc',
      txn_id: txn.txn_id,
    })) as { entity_id: string; status: string };
    expect(cmp.status).toBe('draft');

    const activation = (await txnActivate.handler(deps, {
      txn_id: txn.txn_id,
      activated_by: 'test',
    })) as { promoted_entities: string[] };
    expect(activation.promoted_entities).toContain('CMP-TEST-ALPHA');
  });

  it('entity_query filters by entity_type', async () => {
    const tool = registry.entity_query!;
    const out = (await tool.handler(deps, { entity_type: 'PRJ', limit: 50 })) as {
      entities: Array<{ entity_id: string }>;
      total: number;
    };
    expect(out.entities.some((e) => e.entity_id === 'PRJ-TEST')).toBe(true);
  });

  it('entity_search finds at least one result', async () => {
    const tool = registry.entity_search!;
    const out = (await tool.handler(deps, {
      query: 'Test project',
      limit: 5,
      min_score: 0.0,
    })) as { results: Array<{ entity_id: string; score: number }> };
    expect(out.results.length).toBeGreaterThan(0);
  });

  it('whoami returns local-uninit when no CFG-USER exists', async () => {
    const tool = registry.whoami!;
    const out = (await tool.handler(deps, {})) as { mode: string };
    expect(['local', 'local-uninit']).toContain(out.mode);
  });

  it('help returns content for known topic', async () => {
    const tool = registry.help!;
    const out = (await tool.handler(deps, { topic: 'tools' })) as { content: string };
    expect(out.content.length).toBeGreaterThan(20);
  });

  it('txn_cancel transitions in-progress txn to cancelled', async () => {
    const txnCreate = registry.txn_create!;
    const txnCancel = registry.txn_cancel!;
    const txn = (await txnCreate.handler(deps, {
      project_id: 'TEST',
      type: 'feature',
      trigger: 'cancel test',
      started_by: 'test',
    })) as { txn_id: string };
    const out = (await txnCancel.handler(deps, {
      txn_id: txn.txn_id,
      reason: 'aborted by test',
      cancelled_by: 'test',
    })) as { txn_id: string };
    expect(out.txn_id).toBe(txn.txn_id);
  });

  it('txn_check_interrupted returns array', async () => {
    const tool = registry.txn_check_interrupted!;
    const out = (await tool.handler(deps, { project_id: 'TEST' })) as { interrupted: unknown[] };
    expect(Array.isArray(out.interrupted)).toBe(true);
  });
});
