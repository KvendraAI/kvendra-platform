/* SPDX-License-Identifier: AGPL-3.0-only */

export type HelpTopic =
  | 'bootstrap'
  | 'identity'
  | 'naming'
  | 'txn'
  | 'validation'
  | 'errors'
  | 'embeddings'
  | 'tools'
  | 'examples'
  | 'entity_types'
  | 'version';

export interface ErrorPayload {
  code: string;
  message: string;
  help?: { topic: HelpTopic };
}

export class PlatformError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly helpTopic?: HelpTopic,
  ) {
    super(message);
    this.name = 'PlatformError';
  }

  toPayload(): ErrorPayload {
    const payload: ErrorPayload = { code: this.code, message: this.message };
    if (this.helpTopic) payload.help = { topic: this.helpTopic };
    return payload;
  }
}

export function asErrorPayload(err: unknown): ErrorPayload {
  if (err instanceof PlatformError) return err.toPayload();
  if (err instanceof Error) return { code: 'INTERNAL_ERROR', message: err.message };
  return { code: 'INTERNAL_ERROR', message: String(err) };
}
