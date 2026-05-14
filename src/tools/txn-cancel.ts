/* SPDX-License-Identifier: AGPL-3.0-only */
import { txnCancelInput } from '../domain/validation.js';
import { PlatformError } from '../server/errors.js';
import type { ToolDescriptor, ToolDeps } from './index.js';

export const txnCancelTool: ToolDescriptor = {
  name: 'txn_cancel',
  description: 'Abort a transaction. Marks all its draft entities and the transaction as cancelled.',
  inputSchema: txnCancelInput,
  async handler(deps: ToolDeps, raw: unknown) {
    const input = txnCancelInput.parse(raw);
    try {
      const txn = await deps.txnRepo.cancel(input.txn_id, input.reason, input.cancelled_by);
      return { txn_id: txn.txn_id, cancelled_at: txn.cancelled_at };
    } catch (err) {
      throw new PlatformError('TXN_CANCEL_FAILED', (err as Error).message, 'txn');
    }
  },
};
