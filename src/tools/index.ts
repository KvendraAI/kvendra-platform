/* SPDX-License-Identifier: AGPL-3.0-only */
import type { ZodTypeAny } from 'zod';

import type { EmbeddingsProvider } from '../embeddings/index.js';
import type { EntityRepo } from '../storage/entity-repo.js';
import type { HistoryRepo } from '../storage/history-repo.js';
import type { TxnRepo } from '../storage/txn-repo.js';

import { entityGetTool } from './entity-get.js';
import { entityCreateTool } from './entity-create.js';
import { entityUpdateTool } from './entity-update.js';
import { entityArchiveTool } from './entity-archive.js';
import { entityRelatedTool } from './entity-related.js';
import { entityQueryTool } from './entity-query.js';
import { entitySearchTool } from './entity-search.js';
import { txnCreateTool } from './txn-create.js';
import { txnActivateTool } from './txn-activate.js';
import { txnCancelTool } from './txn-cancel.js';
import { txnCheckInterruptedTool } from './txn-check-interrupted.js';
import { whoamiTool } from './whoami.js';
import { configGetTool } from './config-get.js';
import { helpTool } from './help.js';

export interface ToolDeps {
  entityRepo: EntityRepo;
  historyRepo: HistoryRepo;
  txnRepo: TxnRepo;
  embeddings: EmbeddingsProvider;
}

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: ZodTypeAny;
  handler: (deps: ToolDeps, input: unknown) => Promise<unknown>;
}

export function buildToolRegistry(): Record<string, ToolDescriptor> {
  const tools: ToolDescriptor[] = [
    entityGetTool,
    entityCreateTool,
    entityUpdateTool,
    entityArchiveTool,
    entityRelatedTool,
    entityQueryTool,
    entitySearchTool,
    txnCreateTool,
    txnActivateTool,
    txnCancelTool,
    txnCheckInterruptedTool,
    whoamiTool,
    configGetTool,
    helpTool,
  ];
  const registry: Record<string, ToolDescriptor> = {};
  for (const t of tools) registry[t.name] = t;
  return registry;
}

export const TOOL_NAMES = [
  'entity_get',
  'entity_create',
  'entity_update',
  'entity_archive',
  'entity_related',
  'entity_query',
  'entity_search',
  'txn_create',
  'txn_activate',
  'txn_cancel',
  'txn_check_interrupted',
  'whoami',
  'config_get',
  'help',
] as const;
