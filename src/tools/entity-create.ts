/* SPDX-License-Identifier: AGPL-3.0-only */
import { resolveEntityId } from '../domain/ids.js';
import { createEntityInput } from '../domain/validation.js';
import { PlatformError } from '../server/errors.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

const DEFAULT_GENERATE_EMBEDDING_TYPES = new Set([
  'PRJ',
  'CMP',
  'IF',
  'REQ',
  'TEST',
  'REG',
  'ISSUE',
  'REL',
  'SLA',
  'ROAD',
  'GLO',
  'STD',
  'PAT',
  'ADR',
  'RUN',
  'UX',
  'DOC',
  'ENV',
  'COST',
]);

export const entityCreateTool: ToolDescriptor = {
  name: 'entity_create',
  description:
    'Create a new typed Kvendra entity. Server validates schema, format, relations, and computes embeddings unless generate_embedding=false. PRJ/CMP/REL require force_id.',
  inputSchema: createEntityInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = createEntityInput.parse(raw);
    // CFG entity type does not admit relations (per ADR-KVD-PLATFORM-001).
    if (input.entity_type === 'CFG' && input.relations && input.relations.length > 0) {
      throw new PlatformError(
        'INVALID_INPUT',
        'CFG entity type does not admit relations (per ADR-KVD-PLATFORM-001)',
        'entity_types',
      );
    }
    const forceId = input.force_id ?? input.entity_id;
    const resolved = resolveEntityId(
      input.entity_type,
      forceId,
      input.project_id ?? null,
      input.component_id ?? null,
    );
    if ('ok' in resolved && !resolved.ok) {
      throw new PlatformError('INVALID_ID', resolved.reason, resolved.help_topic);
    }
    const entityId = (resolved as { entityId: string }).entityId;

    const updatedBy =
      (input.metadata?.updated_by as string | undefined) ?? 'system:kvendra-platform';

    // CFG entities default to generate_embedding=false (per ADR-KVD-PLATFORM-001).
    const explicit = input.generate_embedding;
    const shouldEmbed =
      explicit === undefined
        ? DEFAULT_GENERATE_EMBEDDING_TYPES.has(input.entity_type)
        : explicit;

    let embedding: number[] | null = null;
    if (shouldEmbed) {
      try {
        const { data } = await deps.embeddings.embed({
          input: [input.title, input.content].filter(Boolean).join('\n'),
        });
        embedding = data[0]?.embedding ?? null;
      } catch (err) {
        throw new PlatformError(
          'EMBEDDING_FAILED',
          `Failed to compute embedding: ${(err as Error).message}`,
          'embeddings',
        );
      }
    }

    // Drafts iff there is a txn_id; otherwise active.
    const status = input.status ?? (input.txn_id ? 'draft' : 'active');

    const entity = await deps.entityRepo.create(
      {
        entity_id: entityId,
        entity_type: input.entity_type,
        project_id: input.project_id ?? null,
        component_id: input.component_id ?? null,
        status,
        title: input.title,
        content: input.content,
        tags: input.tags ?? [],
        metadata: { ...input.metadata, updated_by: updatedBy },
        embedding,
        txn_id: input.txn_id ?? null,
        updated_by: updatedBy,
      },
      input.relations ?? [],
    );

    return {
      entity_id: entity.entity_id,
      status: entity.status,
      version: entity.version,
    };
  },
};
