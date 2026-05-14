/* SPDX-License-Identifier: AGPL-3.0-only */
import { txnCheckInterruptedInput } from '../domain/validation.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const txnCheckInterruptedTool: ToolDescriptor = {
  name: 'txn_check_interrupted',
  description: 'List transactions still in-progress for a given project (and optionally component).',
  inputSchema: txnCheckInterruptedInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = txnCheckInterruptedInput.parse(raw);
    const txns = await deps.txnRepo.checkInterrupted(
      input.project_id,
      input.component_id ?? null,
    );
    return { interrupted: txns };
  },
};
