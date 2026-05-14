/* SPDX-License-Identifier: AGPL-3.0-only */
import { queryInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const entityQueryTool: ToolDescriptor = {
  name: 'entity_query',
  description:
    'Boolean filter over entities (no embedding). Supports entity_type, project_id, component_id, status, tags_all/tags_any, drafts, archived, limit/offset.',
  inputSchema: queryInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = queryInput.parse(raw);
    const statusList = input.status
      ? Array.isArray(input.status)
        ? input.status
        : [input.status]
      : null;
    return deps.entityRepo.query({
      ...(input.entity_type ? { entity_type: input.entity_type } : {}),
      ...(input.project_id ? { project_id: input.project_id } : {}),
      ...(input.component_id ? { component_id: input.component_id } : {}),
      ...(statusList ? { status: statusList } : {}),
      ...(input.tags_all ? { tags_all: input.tags_all } : {}),
      ...(input.tags_any ? { tags_any: input.tags_any } : {}),
      drafts: input.drafts ?? false,
      archived: input.archived ?? false,
      limit: input.limit ?? 50,
      offset: input.offset ?? 0,
      ...(input.order_by ? { order_by: input.order_by } : {}),
    });
  },
};
