/**
 * Single-port reverse proxy for remote hosting (GitHub Codespaces, a VPS, or your LAN).
 *
 * Why: the renderer and the sidecar are two ports (3000 + 8787). On your own machine the
 * browser reaches both over localhost. But when you open the app from a *different* device
 * (your phone), "localhost" is the phone — so the sidecar is unreachable, and exposing a
 * second port brings cross-origin + auth headaches.
 *
 * This collapses everything behind ONE port:
 *   - /__mv/*  → the sidecar (localhost:8787), prefix stripped
 *   - anything else → the Next UI (localhost:3000), including HMR websockets
 *
 * So you forward/expose a single port, the app talks to the sidecar same-origin at /__mv
 * (see resolveSidecarUrl in src/lib/marvin-client.ts), and there is no CORS or second-port
 * auth to fight. No dependencies — just Node's http/net.
 */
import http from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.PORT || 8080);
const UI = { host: '127.0.0.1', port: Number(process.env.UI_PORT || 3000) };
const SIDECAR = { host: '127.0.0.1', port: Number(process.env.SIDECAR_PORT || 8787) };
const PREFIX = '/__mv';

function forward(clientReq, clientRes, target, path) {
  const opts = {
    host: target.host,
    port: target.port,
    method: clientReq.method,
    path,
    headers: { ...clientReq.headers, host: `${target.host}:${target.port}` },
  };
  const proxyReq = http.request(opts, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });
  proxyReq.on('error', (e) => {
    if (!clientRes.headersSent) clientRes.writeHead(502, { 'content-type': 'text/plain' });
    clientRes.end(`proxy error (is the app running?): ${e.message}`);
  });
  clientReq.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url === PREFIX || url.startsWith(PREFIX + '/')) {
    forward(req, res, SIDECAR, url.slice(PREFIX.length) || '/');
  } else {
    forward(req, res, UI, url);
  }
});

// Proxy websocket upgrades (Next.js HMR) straight through to the UI so live reload works.
server.on('upgrade', (req, socket, head) => {
  const upstream = net.connect(UI.port, UI.host, () => {
    upstream.write(
      `${req.method} ${req.url} HTTP/1.1\r\n` +
        Object.entries(req.headers)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') +
        '\r\n\r\n',
    );
    if (head && head.length) upstream.write(head);
    socket.pipe(upstream);
    upstream.pipe(socket);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `Xanî remote proxy on http://localhost:${PORT}  (UI :${UI.port}, sidecar :${SIDECAR.port} at ${PREFIX}) — expose THIS port`,
  );
});
