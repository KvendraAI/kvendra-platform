/* SPDX-License-Identifier: AGPL-3.0-only */
import type { FastifyInstance } from 'fastify';

import type { McpServer, JsonRpcRequest } from './mcp-server.js';

/**
 * Register the MCP endpoint at /mcp. Accepts JSON-RPC 2.0 over POST.
 * Notifications (no id) return 204 No Content; requests return the response.
 */
export function registerMcpRoute(app: FastifyInstance, server: McpServer): void {
  app.post('/mcp', async (req, reply) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      return reply.code(400).send({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error: expected JSON object' },
      });
    }
    const rpc = body as JsonRpcRequest;
    if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
      return reply.code(400).send({
        jsonrpc: '2.0',
        id: rpc.id ?? null,
        error: { code: -32600, message: 'Invalid JSON-RPC request' },
      });
    }
    const response = await server.handle(rpc);
    if (response === null) {
      return reply.code(204).send();
    }
    return reply.send(response);
  });

  // GET /mcp behavior:
  //   - MCP Streamable HTTP clients open a server-initiated SSE channel via
  //     GET with Accept: text/event-stream. We don't implement server-initiated
  //     events — reply 405 so compliant clients fall back to POST-only mode
  //     (per spec: "The server MAY return 405 to indicate it does not support
  //     server-initiated messages over GET").
  //   - Human inspection (curl with Accept: */* or application/json) keeps the
  //     JSON tool listing.
  app.get('/mcp', async (req, reply) => {
    const accept = String(req.headers.accept ?? '').toLowerCase();
    const wantsSse = accept.includes('text/event-stream');
    const wantsJson = accept.includes('application/json') || accept.includes('*/*') || accept === '';
    if (wantsSse && !wantsJson) {
      return reply.code(405).header('Allow', 'POST').send();
    }
    return { server: 'kvendra-platform', tools: server.listTools() };
  });
}
