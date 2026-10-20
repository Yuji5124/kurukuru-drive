import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { extname, join, resolve, sep } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { isDriveInput, type DriveInput } from '../src/network/protocol.ts';

const sessions = new Map<string, { host?: WebSocket; controller?: WebSocket; lastSeq: number; expiresAt: number }>();
const distRoot = resolve(process.cwd(), 'dist');
const controllerRoot = join(distRoot, 'controller');
const contentTypes: Record<string, string> = {
  '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

async function serveStatic(request: import('node:http').IncomingMessage, response: import('node:http').ServerResponse) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  if (url.pathname === '/controller') {
    response.writeHead(308, { location: '/controller/' }).end();
    return;
  }
  const isController = url.pathname.startsWith('/controller/');
  const root = isController ? controllerRoot : distRoot;
  let pathname: string;
  try { pathname = decodeURIComponent(isController ? url.pathname.slice('/controller/'.length) : url.pathname.slice(1)); }
  catch { response.writeHead(400).end('Bad request'); return; }
  let file = resolve(root, pathname || 'index.html');
  if (file !== root && !file.startsWith(`${root}${sep}`)) { response.writeHead(403).end('Forbidden'); return; }
  try {
    let info = await stat(file);
    if (info.isDirectory()) { file = join(file, 'index.html'); info = await stat(file); }
    if (!info.isFile()) throw new Error('Not a file');
  } catch {
    file = join(root, 'index.html');
    try { await stat(file); } catch { response.writeHead(404).end('Not found'); return; }
  }
  response.writeHead(200, {
    'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
    'cache-control': file.endsWith('.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
  });
  if (request.method === 'HEAD') { response.end(); return; }
  createReadStream(file).on('error', () => response.destroy()).pipe(response);
}

const server = createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/api/sessions') {
    const token = randomBytes(18).toString('base64url');
    sessions.set(token, { lastSeq: -1, expiresAt: Date.now() + 10 * 60_000 });
    response.writeHead(201, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify({ token }));
    return;
  }
  if (request.method === 'GET' || request.method === 'HEAD') {
    void serveStatic(request, response);
    return;
  }
  response.writeHead(404).end('Not found');
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const token = url.searchParams.get('token') ?? '';
  const role = url.searchParams.get('role');
  const session = sessions.get(token);
  if (session && session.expiresAt <= Date.now()) sessions.delete(token);
  if (url.pathname !== '/ws' || !session || session.expiresAt <= Date.now() || (role !== 'host' && role !== 'controller')) {
    socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, ws => {
    if (role === 'host') {
      if (session.host?.readyState === WebSocket.OPEN) session.host.close(4002, 'Host replaced');
      session.host = ws;
    } else {
      if (session.controller?.readyState === WebSocket.OPEN) session.controller.close(4002, 'Controller replaced');
      session.controller = ws;
    }
    const notify = () => {
      if (session.host?.readyState === WebSocket.OPEN) {
        session.host.send(JSON.stringify({ type: 'status', connected: session.controller?.readyState === WebSocket.OPEN }));
      }
      if (session.controller?.readyState === WebSocket.OPEN) {
        session.controller.send(JSON.stringify({ type: 'status', connected: session.host?.readyState === WebSocket.OPEN }));
      }
    };
    notify();
    ws.on('message', data => {
      if (role !== 'controller' || !session.host || session.host.readyState !== WebSocket.OPEN) return;
      let parsed: unknown;
      try { parsed = JSON.parse(data.toString()); } catch { return; }
      if (!isDriveInput(parsed) || parsed.seq <= session.lastSeq) return;
      session.lastSeq = parsed.seq;
      const receivedAt = Date.now();
      session.host.send(JSON.stringify({ ...parsed, receivedAt } satisfies DriveInput));
      if (session.controller?.readyState === WebSocket.OPEN) {
        session.controller.send(JSON.stringify({ type: 'ack', seq: parsed.seq }));
      }
    });
    ws.on('close', () => {
      if (role === 'host' && session.host === ws) session.host = undefined;
      if (role === 'controller' && session.controller === ws) session.controller = undefined;
      notify();
    });
    ws.on('error', () => ws.close());
  });
});

const expiryTimer = setInterval(() => {
  for (const [token, session] of sessions) {
    if (session.expiresAt <= Date.now()) {
      session.host?.close(4001, 'Session expired');
      session.controller?.close(4001, 'Session expired');
      sessions.delete(token);
    }
  }
}, 60_000);
expiryTimer.unref();

const port = Number(process.env.PORT ?? 3000);
server.listen(port, '0.0.0.0', () => console.log(`Drive signaling server listening on ${port}`));
