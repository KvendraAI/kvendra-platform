/* SPDX-License-Identifier: AGPL-3.0-only */
import { archiveEntityInput } from '../domain/validation.js';
import { PlatformError } from '../server/errors.js';
import { RepoError } from '../storage/entity-repo.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const entityArchiveTool: ToolDescriptor = {
  name: 'entity_archive',
  description: 'Soft-archive an entity. Reversible (the entity stays in the database).',
  inputSchema: archiveEntityInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = archiveEntityInput.parse(raw);
    try {
      // INTERFACE PARITY: archive_reason is optional in the schema; default a
      // sentinel so the stored row keeps a non-null reason.
      const reason = input.archive_reason ?? 'archived (no reason supplied)';
      return await deps.entityRepo.archive(input.entity_id, reason, 'system:kvendra-platform');
    } catch (err) {
      if (err instanceof RepoError) {
        throw new PlatformError(err.code, err.message, 'errors');
      }
      throw err;
    }
  },
};
