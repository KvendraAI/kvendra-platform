/* SPDX-License-Identifier: AGPL-3.0-only */
import { txnActivateInput } from '../domain/validation.js';
import { txnInProgress } from '../metrics/prom.js';
import { PlatformError } from '../server/errors.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const txnActivateTool: ToolDescriptor = {
  name: 'txn_activate',
  description:
    'Promote all draft entities of the transaction to active status and mark the transaction completed.',
  inputSchema: txnActivateInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = txnActivateInput.parse(raw);
    try {
      // INTERFACE PARITY: activated_by is optional; default to local identity.
      const { txn, promotedEntities } = await deps.txnRepo.activate(
        input.txn_id,
        input.activated_by ?? 'system:kvendra-platform',
      );
      txnInProgress.dec();
      return {
        txn_id: txn.txn_id,
        completed_at: txn.completed_at,
        promoted_entities: promotedEntities,
      };
    } catch (err) {
      throw new PlatformError('TXN_ACTIVATE_FAILED', (err as Error).message, 'txn');
    }
  },
};
