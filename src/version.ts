/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';

/**
 * Engine version, read once from package.json so /version and the MCP
 * serverInfo always match the released build (src/ and dist/ both sit one
 * level below package.json, in the repo and in the image).
 */
function readVersion(): string {
  try {
    const raw = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    const version = (JSON.parse(raw) as { version?: unknown }).version;
    return typeof version === 'string' && version.length > 0 ? version : 'unknown';
  } catch {
    return 'unknown';
  }
}

export const ENGINE_VERSION: string = readVersion();
