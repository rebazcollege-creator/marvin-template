import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import Anthropic from '@anthropic-ai/sdk';
import { runAgentTurn, type CreateMessage, type LLMResponse } from './agent.ts';
import type { ChatRequest, StreamEvent } from '../src/lib/marvin-protocol.ts';

/**
 * MARVIN sidecar HTTP server.
 *
 * Owns ANTHROPIC_API_KEY (sourced from the OS keychain by Tauri Rust and passed
 * in via env at spawn — never in the renderer). Exposes:
 *   GET  /health  → readiness + whether a key is present
 *   POST /chat    → runs the tool loop, streams StreamEvents as SSE
 *
 * In dev the renderer reaches this over http://localhost:PORT. In the packaged
 * Tauri app, Rust spawns this binary and the renderer reaches it via the same
 * loopback port (allowed by the app's capabilities), keeping the key in-process.
 */

const PORT = Number(process.env.MARVIN_SIDECAR_PORT ?? 8787);
const apiKey = process.env.ANTHROPIC_API_KEY ?? '';

const anthropic = apiKey ? new Anthropic({ apiKey }) : null;

const createMessage: CreateMessage = async (params) => {
  if (!anthropic) throw new Error('ANTHROPIC_API_KEY is not set in the sidecar environment.');
  const res = await anthropic.messages.create({
    model: params.model,
    max_tokens: params.max_tokens,
    system: params.system as Anthropic.MessageCreateParams['system'],
    tools: params.tools as Anthropic.MessageCreateParams['tools'],
    messages: params.messages as Anthropic.MessageParam[],
  });
  return res as unknown as LLMResponse;
};

function cors(res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (req, res) => {
  cors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204).end();
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, hasKey: Boolean(apiKey) }));
    return;
  }

  if (req.method === 'POST' && req.url === '/chat') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    const send = (e: StreamEvent) => res.write(`data: ${JSON.stringify(e)}\n\n`);

    try {
      const body = JSON.parse(await readBody(req)) as ChatRequest;
      if (!apiKey) {
        send({
          type: 'error',
          message:
            'No Anthropic API key in the sidecar. Set ANTHROPIC_API_KEY (the packaged app sources it from the OS keychain).',
        });
      } else {
        await runAgentTurn(body, createMessage, send);
      }
    } catch (err) {
      send({ type: 'error', message: (err as Error).message });
    }
    res.end();
    return;
  }

  res.writeHead(404).end('Not found');
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `MARVIN sidecar on http://localhost:${PORT} (key ${apiKey ? 'present' : 'MISSING'})`,
  );
});
