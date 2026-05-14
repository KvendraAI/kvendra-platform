/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';

export interface PlatformConfig {
  databaseUrl: string;
  embeddingsProvider: string;
  authTokenFile: string;
  authToken: string;
  port: number;
  host: string;
  logLevel: string;
  stage: string;
  pgPoolMax: number;
}

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') throw new Error(`Missing required env var ${name}`);
  return v;
}

function optional(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : fallback;
}

export function loadConfig(): PlatformConfig {
  const authTokenFile = optional('AUTH_TOKEN_FILE', '/data/auth.token');
  let authToken = '';
  try {
    authToken = readFileSync(authTokenFile, 'utf8').trim();
  } catch {
    // File may not exist yet during boot — leave empty. Auth middleware will
    // re-read on demand when /healthz / discovery are not enough.
  }
  return {
    databaseUrl: required('DATABASE_URL'),
    embeddingsProvider: optional('EMBEDDINGS_PROVIDER', 'mock'),
    authTokenFile,
    authToken,
    port: Number(optional('PORT', '7777')),
    host: optional('HOST', '0.0.0.0'),
    logLevel: optional('LOG_LEVEL', 'info'),
    stage: optional('STAGE', 'local'),
    pgPoolMax: Number(optional('PG_POOL_MAX', '10')),
  };
}
