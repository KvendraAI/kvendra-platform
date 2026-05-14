/* SPDX-License-Identifier: AGPL-3.0-only */
import { getEntityInput } from '../domain/validation.js';
import { PlatformError } from '../server/errors.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const entityGetTool: ToolDescriptor = {
  name: 'entity_get',
  description:
    'Lookup a Kvendra entity by entity_id. Returns the entity plus tags, outbound/inbound relations, recent history, and optionally semantically related entities.',
  inputSchema: getEntityInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = getEntityInput.parse(raw);
    const entity = await deps.entityRepo.getById(
      input.entity_id,
      input.include_drafts ?? false,
      input.include_archived ?? false,
    );
    if (!entity) {
      throw new PlatformError(
        'ENTITY_NOT_FOUND',
        `Entity "${input.entity_id}" not found (or filtered out by include_* flags).`,
      );
    }
    const [relations, history] = await Promise.all([
      deps.entityRepo.getRelations(input.entity_id),
      deps.historyRepo.getHistory(input.entity_id, 20),
    ]);

    const out: Record<string, unknown> = {
      entity,
      tags: entity.tags,
      relations_outbound: relations.outbound,
      relations_inbound: relations.inbound,
      history,
    };

    if (input.include_related) {
      const limit = input.related_limit ?? 10;
      try {
        const { data } = await deps.embeddings.embed({
          input: [entity.title, entity.content].filter(Boolean).join('\n'),
        });
        const firstEmbedding = data[0]?.embedding ?? [];
        const hits = await deps.entityRepo.search({
          query_embedding: firstEmbedding,
          limit,
          min_score: 0.5,
          include_archived: false,
        });
        out.related = hits.filter((h) => h.entity_id !== input.entity_id).slice(0, limit);
      } catch (err) {
        out.related = [];
        out.related_error = (err as Error).message;
      }
    }

    return out;
  },
};
