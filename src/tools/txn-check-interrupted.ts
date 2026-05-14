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
    // ISSUE-KVD-PLATFORM-008 #7: always return { interrupted: TxnSummary[] },
    // even when the result set is empty.
    const interrupted = (txns ?? []).map((t) => ({
      txn_id: t.txn_id,
      status: t.status,
      type: t.type,
      project_id: t.project_id,
      component_id: t.component_id,
      started_by: t.started_by,
      started_at: t.started_at,
      pipeline: t.pipeline,
    }));
    return { interrupted };
  },
};
