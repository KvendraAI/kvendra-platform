/* SPDX-License-Identifier: AGPL-3.0-only */
import { loadConfig } from './config/env.js';
import { resolveEmbeddingsProvider } from './embeddings/index.js';
import { closePool, getPool, runMigrations } from './storage/db.js';
import { EntityRepo } from './storage/entity-repo.js';
import { HistoryRepo } from './storage/history-repo.js';
import { TxnRepo } from './storage/txn-repo.js';
import { buildHttpServer } from './server/http.js';
import { txnInProgress } from './metrics/prom.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  logger.info(
    { port: cfg.port, host: cfg.host, stage: cfg.stage, provider: cfg.embeddingsProvider },
    'Booting kvendra-platform',
  );

  const pool = getPool(cfg.databaseUrl, cfg.pgPoolMax);
  await runMigrations(pool);

  const entityRepo = new EntityRepo(pool);
  const historyRepo = new HistoryRepo(pool);
  const txnRepo = new TxnRepo(pool);
  const embeddings = resolveEmbeddingsProvider(cfg.embeddingsProvider);

  // Sync kvendra_txn_in_progress gauge on startup so it survives restarts.
  try {
    const inProgress = await txnRepo.countInProgress();
    txnInProgress.set(inProgress);
    logger.info({ inProgress }, 'kvendra_txn_in_progress gauge synced');
  } catch (err) {
    logger.warn({ err }, 'failed to sync kvendra_txn_in_progress gauge');
  }

  const app = await buildHttpServer({
    port: cfg.port,
    host: cfg.host,
    authTokenFile: cfg.authTokenFile,
    initialAuthToken: cfg.authToken,
    deps: { entityRepo, historyRepo, txnRepo, embeddings },
  });

  await app.listen({ port: cfg.port, host: cfg.host });
  logger.info({ port: cfg.port }, 'kvendra-platform listening');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    try {
      await app.close();
    } catch (err) {
      logger.error({ err }, 'Error closing HTTP server');
    }
    try {
      await closePool();
    } catch (err) {
      logger.error({ err }, 'Error closing pg pool');
    }
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'Fatal error on boot');
  process.exit(1);
});
