/* SPDX-License-Identifier: AGPL-3.0-only */
import { describe, expect, it } from 'vitest';

import { entityCreateTool } from '../../src/tools/entity-create.js';
import type { ToolDeps } from '../../src/tools/index.js';
import { PlatformError } from '../../src/server/errors.js';

/**
 * AC-PLAT-10: CFG entities must not admit relations (per ADR-KVD-PLATFORM-001).
 *
 * The handler short-circuits with INVALID_INPUT BEFORE any persistence call,
 * so a partial mock with throwing stubs is sufficient — they should never run
 * in the rejection path. In the success path we verify entityRepo.create is
 * invoked with an empty relations array.
 */

interface CreateCall {
  rowRelations: unknown[];
}

function buildDeps(captured: CreateCall): ToolDeps {
  return {
    entityRepo: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: (async (_row: any, relations: unknown[]) => {
        captured.rowRelations = relations;
        return { entity_id: 'CFG-KVDTEST2-FOO', status: 'active', version: 1 };
      }) as unknown as ToolDeps['entityRepo']['create'],
    } as unknown as ToolDeps['entityRepo'],
    historyRepo: {} as ToolDeps['historyRepo'],
    txnRepo: {} as ToolDeps['txnRepo'],
    embeddings: {
      embed: async () => {
        throw new Error('embeddings should not be called for CFG (generate_embedding default false)');
      },
    } as unknown as ToolDeps['embeddings'],
  };
}

describe('CFG entity validation (AC-PLAT-10)', () => {
  it('CFG con relations debe rechazarse con INVALID_INPUT', async () => {
    const deps = buildDeps({ rowRelations: [] });
    await expect(
      entityCreateTool.handler(deps, {
        entity_type: 'CFG',
        project_id: 'KVDTEST2',
        title: 'test CFG',
        content: 'test',
        relations: [{ type: 'part_of', target: 'PRJ-KVDTEST2' }],
      }),
    ).rejects.toMatchObject({
      name: 'PlatformError',
      code: 'INVALID_INPUT',
    });
  });

  it('CFG con relations rechazado lanza PlatformError con helpTopic entity_types', async () => {
    const deps = buildDeps({ rowRelations: [] });
    try {
      await entityCreateTool.handler(deps, {
        entity_type: 'CFG',
        project_id: 'KVDTEST2',
        title: 'test CFG',
        content: 'test',
        relations: [{ type: 'part_of', target: 'PRJ-KVDTEST2' }],
      });
      expect.fail('Expected PlatformError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(PlatformError);
      expect((err as PlatformError).code).toBe('INVALID_INPUT');
      expect((err as PlatformError).helpTopic).toBe('entity_types');
      expect((err as PlatformError).message).toContain('CFG');
      expect((err as PlatformError).message).toContain('relations');
    }
  });

  it('CFG sin relations debe aceptarse', async () => {
    const captured: CreateCall = { rowRelations: [] };
    const deps = buildDeps(captured);
    const out = (await entityCreateTool.handler(deps, {
      entity_type: 'CFG',
      project_id: 'KVDTEST2',
      title: 'test CFG',
      content: 'test',
    })) as { entity_id: string; status: string; version: number };
    expect(out.entity_id).toBe('CFG-KVDTEST2-FOO');
    expect(captured.rowRelations).toEqual([]);
  });

  it('CFG con relations vacías debe aceptarse', async () => {
    const captured: CreateCall = { rowRelations: [] };
    const deps = buildDeps(captured);
    const out = (await entityCreateTool.handler(deps, {
      entity_type: 'CFG',
      project_id: 'KVDTEST2',
      title: 'test CFG',
      content: 'test',
      relations: [],
    })) as { entity_id: string; status: string; version: number };
    expect(out.entity_id).toBe('CFG-KVDTEST2-FOO');
    expect(captured.rowRelations).toEqual([]);
  });
});
