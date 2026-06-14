/* SPDX-License-Identifier: AGPL-3.0-only */
/*
 * entity_update Class-1 mapping behaviour — TXN-KVD-20260614-006.
 *
 * Verifies that the handler MAPS (does not silently drop) the Enterprise-shaped
 * fields: flat fields merge with patch{} (flat wins), tag deltas are
 * read-modify-write, relation deltas hit RelationsRepo, archived===true routes
 * to the archive path, expected_version is passed through (optional), and the
 * legacy nested patch{} shape still works.
 *
 * Uses partial mocks (same style as cfg-no-relations.test.ts) — no DB.
 */
import { describe, expect, it } from 'vitest';

import { entityUpdateTool } from '../../src/tools/entity-update.js';
import type { ToolDeps } from '../../src/tools/index.js';
import type { Entity, Relation } from '../../src/domain/entity-types.js';

interface Captured {
  updateArgs?: {
    entityId: string;
    expectedVersion: number | undefined;
    patch: Record<string, unknown>;
    changeSummary: string;
    updatedBy: string;
  };
  archiveArgs?: { entityId: string; reason: string };
  relAdd: Array<{ source: string; rel: Relation }>;
  relRemove: Array<{ source: string; rel: Relation }>;
}

function makeEntity(overrides: Partial<Entity> = {}): Entity {
  return {
    entity_id: 'ISSUE-KVD-X',
    entity_type: 'ISSUE',
    project_id: 'KVD',
    component_id: null,
    status: 'open',
    archived: false,
    archived_at: null,
    archive_reason: null,
    title: 'Existing title',
    content: 'Existing content',
    tags: ['keep', 'remove-me'],
    metadata: {},
    version: 3,
    txn_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    updated_by: 'system:kvendra-platform',
    ...overrides,
  };
}

function buildDeps(captured: Captured, existing: Entity | null = makeEntity()): ToolDeps {
  return {
    entityRepo: {
      getById: (async () => existing) as unknown as ToolDeps['entityRepo']['getById'],
      update: (async (
        entityId: string,
        expectedVersion: number | undefined,
        patch: Record<string, unknown>,
        changeSummary: string,
        updatedBy: string,
      ) => {
        captured.updateArgs = { entityId, expectedVersion, patch, changeSummary, updatedBy };
        return makeEntity({ entity_id: entityId, version: (existing?.version ?? 0) + 1 });
      }) as unknown as ToolDeps['entityRepo']['update'],
      archive: (async (entityId: string, reason: string) => {
        captured.archiveArgs = { entityId, reason };
        return { entity_id: entityId, archived_at: new Date().toISOString() };
      }) as unknown as ToolDeps['entityRepo']['archive'],
    } as unknown as ToolDeps['entityRepo'],
    historyRepo: {
      latestForEntity: (async () => 'HIST-1') as unknown as ToolDeps['historyRepo']['latestForEntity'],
    } as unknown as ToolDeps['historyRepo'],
    relationsRepo: {
      addRelation: (async (source: string, rel: Relation) => {
        captured.relAdd.push({ source, rel });
      }) as unknown as ToolDeps['relationsRepo']['addRelation'],
      removeRelation: (async (source: string, rel: Relation) => {
        captured.relRemove.push({ source, rel });
      }) as unknown as ToolDeps['relationsRepo']['removeRelation'],
    } as unknown as ToolDeps['relationsRepo'],
    txnRepo: {} as ToolDeps['txnRepo'],
    embeddings: {
      embed: async () => ({ data: [{ embedding: [0.1, 0.2] }] }),
    } as unknown as ToolDeps['embeddings'],
  };
}

function fresh(): Captured {
  return { relAdd: [], relRemove: [] };
}

describe('entity_update — Class-1 mapping (interface parity)', () => {
  it('flat fields override patch{} and CAS is applied when expected_version present', async () => {
    const cap = fresh();
    const deps = buildDeps(cap);
    await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      expected_version: 3,
      patch: { title: 'from patch', status: 'patched' },
      title: 'from flat', // flat wins
      content: 'new content',
      change_summary: 'merge test',
    });
    expect(cap.updateArgs?.expectedVersion).toBe(3);
    expect(cap.updateArgs?.patch.title).toBe('from flat');
    expect(cap.updateArgs?.patch.status).toBe('patched'); // patch-only field preserved
    expect(cap.updateArgs?.patch.content).toBe('new content');
  });

  it('expected_version absent → passed through as undefined (lenient last-write-wins)', async () => {
    const cap = fresh();
    const deps = buildDeps(cap);
    await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      content: 'no version',
      change_summary: 'lenient',
    });
    expect(cap.updateArgs?.expectedVersion).toBeUndefined();
  });

  it('tags_add/tags_remove are read-modify-write against the current row', async () => {
    const cap = fresh();
    const deps = buildDeps(cap, makeEntity({ tags: ['keep', 'remove-me'] }));
    await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      tags_add: ['added'],
      tags_remove: ['remove-me'],
      change_summary: 'tag delta',
    });
    const tags = cap.updateArgs?.patch.tags as string[];
    expect(tags).toContain('keep');
    expect(tags).toContain('added');
    expect(tags).not.toContain('remove-me');
  });

  it('tags_set replaces the array', async () => {
    const cap = fresh();
    const deps = buildDeps(cap, makeEntity({ tags: ['old1', 'old2'] }));
    await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      tags_set: ['only'],
      change_summary: 'tag set',
    });
    expect(cap.updateArgs?.patch.tags).toEqual(['only']);
  });

  it('relations_add / relations_remove / relations_set hit RelationsRepo', async () => {
    const cap = fresh();
    const deps = buildDeps(cap);
    await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      relations_add: [{ type: 'part_of', target: 'REL-X' }],
      relations_set: [{ type: 'depends_on', target: 'CMP-Y' }],
      relations_remove: [{ type: 'blocks', target: 'ISSUE-Z' }],
      change_summary: 'rel mutations',
    });
    const addTargets = cap.relAdd.map((r) => r.rel.target);
    expect(addTargets).toContain('REL-X'); // relations_add
    expect(addTargets).toContain('CMP-Y'); // relations_set (additive ensure)
    expect(cap.relRemove.map((r) => r.rel.target)).toContain('ISSUE-Z');
  });

  it('archived===true routes to the archive path (archive_reason used)', async () => {
    const cap = fresh();
    const deps = buildDeps(cap);
    const out = (await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      archived: true,
      archive_reason: 'superseded',
      change_summary: 'archiving',
    })) as { entity_id: string; archived_at: string };
    expect(cap.archiveArgs?.reason).toBe('superseded');
    expect(cap.updateArgs).toBeUndefined(); // did NOT go through the update path
    expect(out.archived_at).toBeTruthy();
  });

  it('trigger is accepted and ignored (Class 2 — never reaches the repo)', async () => {
    const cap = fresh();
    const deps = buildDeps(cap);
    await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      content: 'c',
      trigger: 'skill:foo',
      change_summary: 'with trigger',
    });
    // No 'trigger' field leaks into the persisted patch.
    expect(cap.updateArgs?.patch).not.toHaveProperty('trigger');
  });

  it('legacy patch{}-only shape still works (back-compat)', async () => {
    const cap = fresh();
    const deps = buildDeps(cap);
    await entityUpdateTool.handler(deps, {
      entity_id: 'ISSUE-KVD-X',
      expected_version: 3,
      patch: { title: 'legacy', content: 'legacy body', tags: ['l'] },
      change_summary: 'legacy path',
    });
    expect(cap.updateArgs?.patch.title).toBe('legacy');
    expect(cap.updateArgs?.patch.tags).toEqual(['l']);
    expect(cap.updateArgs?.expectedVersion).toBe(3);
  });
});
