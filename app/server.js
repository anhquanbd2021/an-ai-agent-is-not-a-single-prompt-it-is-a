import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTask } from '../public/lab.mjs';
import { taskById } from '../public/tasks.mjs';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));
const PACKAGE = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const STATIC_FILES = new Map([
  ['/', ['text/html; charset=utf-8', 'index.html']],
  ['/guide.html', ['text/html; charset=utf-8', 'guide.html']],
  ['/styles.css', ['text/css; charset=utf-8', 'styles.css']],
  ['/app.js', ['text/javascript; charset=utf-8', 'app.js']],
  ['/lab.mjs', ['text/javascript; charset=utf-8', 'lab.mjs']],
  ['/layers.mjs', ['text/javascript; charset=utf-8', 'layers.mjs']],
  ['/tasks.mjs', ['text/javascript; charset=utf-8', 'tasks.mjs']],
  ['/pb-shell.css', ['text/css; charset=utf-8', 'pb-shell.css']],
  ['/pb-back.css', ['text/css; charset=utf-8', 'pb-back.css']],
].map(([path, [type, file]]) => [path, [type, readFileSync(join(PUBLIC, file))]]));
const SECURITY_HEADERS = {
  'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'x-content-type-options': 'nosniff',
};

export function createStaticServer() {
  return createServer((req, res) => {
    const pathname = (req.url || '/').split('?')[0] || '/';
    if (pathname === '/health') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'text/plain; charset=utf-8' }).end('ok');
      return;
    }
    if (pathname === '/version') {
      res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' })
        .end(JSON.stringify({
          name: PACKAGE.name,
          version: PACKAGE.version,
          commit: process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || 'local',
        }));
      return;
    }
    if (pathname === '/api/run' && req.method === 'POST') {
      const chunks = [];
      req.setEncoding('utf8');
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        const body = chunks.join('');
        try {
          const payload = body ? JSON.parse(body) : {};
          const taskId = typeof payload.taskId === 'string' ? payload.taskId : '';
          if (!taskId) {
            res.writeHead(400, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'taskId is required' }));
            return;
          }
          try {
            taskById(taskId);
          } catch {
            res.writeHead(400, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'unknown taskId' }));
            return;
          }
          const disabled = Array.isArray(payload.disabled) ? payload.disabled.filter(id => typeof id === 'string') : [];
          const result = runTask(taskId, disabled);
          res.writeHead(200, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(result));
        } catch (error) {
          if (!res.writableEnded) {
            res.writeHead(500, { ...SECURITY_HEADERS, 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify({ error: 'internal' }));
          }
        }
      });
      return;
    }
    if (req.method === 'GET' || req.method === 'HEAD') {
      const asset = STATIC_FILES.get(pathname);
      if (asset) {
        res.writeHead(200, {
          ...SECURITY_HEADERS,
          'cache-control': 'public, max-age=300',
          'content-type': asset[0],
        }).end(req.method === 'HEAD' ? undefined : asset[1]);
        return;
      }
    }
    res.writeHead(404, SECURITY_HEADERS).end('not found');
  });
}

export async function startProduction({ port = Number(process.env.PORT) || 3000 } = {}) {
  const server = createStaticServer();
  server.listen(port, '0.0.0.0');
  await once(server, 'listening');
  const close = () => new Promise(resolve => server.close(resolve));
  return { server, close };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { server, close } = await startProduction();
  console.log(`Agent Stack Lab listening on ${server.address().port}`);
  const shutdown = async () => { await close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}