import type { ChatRequest, StreamEvent } from '@/lib/marvin-protocol';

/**
 * Renderer → sidecar transport. The sidecar owns the API key; the renderer only
 * sends the composed system blocks + conversation and consumes the SSE stream.
 *
 * Dev: http://localhost:8787 (run `npm run sidecar`). Packaged Tauri app: the
 * same loopback port, spawned by Rust and allowed by the app capabilities.
 */

const SIDECAR_URL =
  process.env.NEXT_PUBLIC_MARVIN_SIDECAR_URL ?? 'http://localhost:8787';

export async function streamMarvin(
  req: ChatRequest,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  let resp: Response;
  try {
    resp = await fetch(`${SIDECAR_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
  } catch {
    onEvent({
      type: 'error',
      message: `Can't reach MARVIN's runtime at ${SIDECAR_URL}. Start it with: npm run sidecar`,
    });
    return;
  }

  if (!resp.ok || !resp.body) {
    onEvent({ type: 'error', message: `MARVIN sidecar responded ${resp.status}.` });
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(5).trim()) as StreamEvent);
      } catch {
        // ignore malformed frame
      }
    }
  }
}
