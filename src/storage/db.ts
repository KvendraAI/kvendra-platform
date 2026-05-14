/* SPDX-License-Identifier: AGPL-3.0-only */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

import { logger } from '../utils/logger.js';

const { Pool } = pg;

export type Pool = InstanceType<typeof pg.Pool>;

let pool: Pool | null = null;

export function getPool(connectionString?: string, max = 10): Pool {
  if (pool) return pool;
  if (!connectionString) {
    throw new Error('Database pool not initialized — pass connectionString on first call.');
  }
  pool = new Pool({ connectionString, max });
  pool.on('error', (err: Error) => logger.error({ err }, 'pg pool error'));
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Run all SQL files in /migrations (alphabetical) that have not yet been
 * applied. Each file runs in its own transaction. Idempotent: previously
 * applied files are skipped via the schema_migrations bookkeeping table
 * (which 0001 also creates).
 */
export async function runMigrations(p: Pool): Promise<void> {
  const migrationsDir = resolveMigrationsDir();
  logger.info({ migrationsDir }, 'Running database migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));

  // Bootstrap schema_migrations table on the very first migration call. The
  // 0001 file also creates it, but we need it to exist BEFORE we query it,
  // so we touch it here defensively.
  await p.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT        PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const { rows: appliedRows } = await p.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  const applied = new Set(appliedRows.map((r) => r.version));

  for (const file of files) {
    const version = file;
    if (applied.has(version)) {
      logger.debug({ version }, 'migration already applied — skipping');
      continue;
    }
    const sqlPath = join(migrationsDir, file);
    const sql = readFileSync(sqlPath, 'utf8');
    const client = await p.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [version]);
      await client.query('COMMIT');
      logger.info({ version }, 'migration applied');
    } catch (err) {
      await client.query('ROLLBACK');
      logger.error({ err, version }, 'migration failed — rolled back');
      throw err;
    } finally {
      client.release();
    }
  }
}

function resolveMigrationsDir(): string {
  // In production (compiled, dist/storage/db.js) migrations live at /app/migrations.
  // In dev (tsx src/storage/db.ts) at ../../migrations relative to this file.
  const __filename = fileURLToPath(import.meta.url);
  const here = dirname(__filename);
  // Try sibling of dist/, then sibling of src/.
  const candidates = [
    resolve(here, '..', '..', 'migrations'),
    resolve(here, '..', '..', '..', 'migrations'),
    resolve(process.cwd(), 'migrations'),
  ];
  for (const c of candidates) {
    try {
      readdirSync(c);
      return c;
    } catch {
      // try next
    }
  }
  throw new Error(
    `Could not locate migrations directory. Tried: ${candidates.join(', ')}`,
  );
}
