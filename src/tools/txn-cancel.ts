/* SPDX-License-Identifier: AGPL-3.0-only */
import { txnCancelInput } from '../domain/validation.js';
import { txnInProgress } from '../metrics/prom.js';
import { PlatformError } from '../server/errors.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const txnCancelTool: ToolDescriptor = {
  name: 'txn_cancel',
  description: 'Abort a transaction. Marks all its draft entities and the transaction as cancelled.',
  inputSchema: txnCancelInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = txnCancelInput.parse(raw);
    try {
      // INTERFACE PARITY: cancelled_by is optional; default to local identity.
      const txn = await deps.txnRepo.cancel(
        input.txn_id,
        input.reason,
        input.cancelled_by ?? 'system:kvendra-platform',
      );
      txnInProgress.dec();
      return { txn_id: txn.txn_id, cancelled_at: txn.cancelled_at };
    } catch (err) {
      throw new PlatformError('TXN_CANCEL_FAILED', (err as Error).message, 'txn');
    }
  },
};
