/* SPDX-License-Identifier: AGPL-3.0-only */
import { readFileSync } from 'node:fs';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { logger } from '../utils/logger.js';

const EXEMPT_PATHS = new Set(['/healthz', '/ready', '/version', '/metrics']);

export interface AuthOptions {
  tokenFile: string;
  initialToken: string;
}

/**
 * Register a global preHandler that gates requests by Bearer token.
 *
 * Exempt:
 *   - GET /healthz, /ready, /version, /metrics
 *   - POST /mcp with JSON-RPC method "initialize" or "tools/list"
 *
 * Everything else (notably "tools/call") requires `Authorization: Bearer <token>`
 * matching the token in `tokenFile` (read on every check so rotation is hot).
 */
export function registerAuth(app: FastifyInstance, opts: AuthOptions): void {
  let cachedToken = opts.initialToken;

  function readTokenFresh(): string {
    try {
      const t = readFileSync(opts.tokenFile, 'utf8').trim();
      if (t) cachedToken = t;
    } catch (err) {
      logger.warn({ err, tokenFile: opts.tokenFile }, 'Could not read auth token file');
    }
    return cachedToken;
  }

  app.addHook('preHandler', async (req: FastifyRequest, reply: FastifyReply) => {
    if (EXEMPT_PATHS.has(req.url) || req.url.startsWith('/healthz')) return;

    // The MCP endpoint is special: discovery (initialize, tools/list) is exempt,
    // tools/call requires auth. We have to peek at the body to decide.
    if (req.url === '/mcp' && req.method === 'POST') {
      const body = req.body as { method?: string } | undefined;
      const method = body?.method ?? '';
      if (method === 'initialize' || method === 'tools/list' || method === 'notifications/initialized') {
        return;
      }
    }

    const header = req.headers['authorization'];
    if (typeof header !== 'string' || !header.startsWith('Bearer ')) {
      reply.code(401).send({ error: 'unauthorized', message: 'Missing Bearer token.' });
      return reply;
    }
    const presented = header.slice('Bearer '.length).trim();
    const expected = readTokenFresh();
    if (!expected || presented !== expected) {
      reply.code(401).send({ error: 'unauthorized', message: 'Invalid Bearer token.' });
      return reply;
    }
  });
}
