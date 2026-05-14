/* SPDX-License-Identifier: AGPL-3.0-only */
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';

import { registry } from '../metrics/prom.js';
import { logger } from '../utils/logger.js';
import { registerAuth } from './auth.js';
import { McpServer } from './mcp-server.js';
import { registerMcpRoute } from './mcp-route.js';
import type { ToolDeps } from '../tools/index.js';

export interface HttpOptions {
  port: number;
  host: string;
  authTokenFile: string;
  initialAuthToken: string;
  deps: ToolDeps;
}

export async function buildHttpServer(opts: HttpOptions): Promise<FastifyInstance> {
  const app = Fastify({ loggerInstance: logger }) as unknown as FastifyInstance;

  app.get('/healthz', async () => ({ status: 'ok', schema_version: 'v1.0' }));
  app.get('/ready', async () => ({ status: 'ready' }));
  app.get('/version', async () => ({
    name: 'kvendra-platform',
    version: '0.1.0-alpha.0',
    schema_version: 'v1.0',
  }));
  app.get('/metrics', async (_req, reply) => {
    reply.header('Content-Type', registry.contentType);
    return reply.send(await registry.metrics());
  });

  registerAuth(app, { tokenFile: opts.authTokenFile, initialToken: opts.initialAuthToken });

  const mcp = new McpServer(opts.deps);
  registerMcpRoute(app, mcp);

  return app;
}
