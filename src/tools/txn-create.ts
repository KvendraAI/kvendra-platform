/* SPDX-License-Identifier: AGPL-3.0-only */
import { txnCreateInput } from '../domain/validation.js';
import { txnInProgress } from '../metrics/prom.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const txnCreateTool: ToolDescriptor = {
  name: 'txn_create',
  description: 'Open a transaction grouping draft entities until activation or cancellation.',
  inputSchema: txnCreateInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = txnCreateInput.parse(raw);
    const txn = await deps.txnRepo.create({
      project_id: input.project_id,
      ...(input.component_id ? { component_id: input.component_id } : {}),
      type: input.type,
      ...(input.trigger ? { trigger: input.trigger } : {}),
      ...(input.pipeline ? { pipeline: input.pipeline } : {}),
      started_by: input.started_by,
      ...(input.force_id ? { force_id: input.force_id } : {}),
    });
    txnInProgress.inc();
    return { txn_id: txn.txn_id, started_at: txn.started_at };
  },
};
