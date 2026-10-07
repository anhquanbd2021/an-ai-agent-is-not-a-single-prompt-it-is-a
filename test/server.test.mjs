import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import http from 'node:http';
import { createStaticServer } from '../app/server.js';

async function withServer(fn) {
  const server = createStaticServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

function rawRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({
      hostname: '127.0.0.1',
      port: target.port,
      path: target.pathname + target.search,
      method,
      headers: body ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } : {},
    }, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        const data = res.headers['content-type']?.includes('application/json') ? JSON.parse(text) : null;
        resolve({ status: res.statusCode, text: () => text, data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('/health, /version, static files, /api/run, and nav all respond', async () => {
  await withServer(async (base) => {
    const health = await rawRequest('GET', `${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.text(), 'ok');

    const version = await rawRequest('GET', `${base}/version`);
    assert.equal(version.status, 200);
    assert.equal(version.data.name, 'an-ai-agent-is-not-a-single-prompt-it-is-a-demo');

    const index = await rawRequest('GET', `${base}/`);
    assert.equal(index.status, 200);
    assert.match(index.text(), /Agent Stack Lab/);
    assert.match(index.text(), /<nav aria-label="Primary">/);
    assert.match(index.text(), /<a aria-current="page" href="\/">Lab<\/a>/);

    const guide = await rawRequest('GET', `${base}/guide.html`);
    assert.equal(guide.status, 200);
    assert.match(guide.text(), /Five layers, one predictable break/);
    assert.match(guide.text(), /<a aria-current="page" href="\/guide.html">Guide<\/a>/);

    const apiRun = await rawRequest('POST', `${base}/api/run`, JSON.stringify({ taskId: 'refund' }));
    assert.equal(apiRun.status, 200);
    assert.equal(apiRun.data.outcome, 'completed');
    assert.equal(apiRun.data.certified, true);

    for (const assetPath of ['/styles.css', '/app.js', '/lab.mjs', '/layers.mjs', '/tasks.mjs', '/guide.html', '/pb-shell.css', '/pb-back.css']) {
      assert.equal((await rawRequest('GET', `${base}${assetPath}`)).status, 200, assetPath);
    }
  });
});

test('unknown paths, traversal, HEAD, and bad api payloads return expected responses', async () => {
  await withServer(async (base) => {
    assert.equal((await rawRequest('GET', `${base}/../package.json`)).status, 404);
    assert.equal((await rawRequest('GET', `${base}/nope`)).status, 404);
    const head = await rawRequest('HEAD', `${base}/`);
    assert.equal(head.status, 200);
    assert.equal(head.text(), '');
    const missing = await rawRequest('POST', `${base}/api/run`, '{}');
    assert.equal(missing.status, 400);
    assert.match(missing.text(), /taskId/);
    const unknown = await rawRequest('POST', `${base}/api/run`, JSON.stringify({ taskId: 'nope' }));
    assert.equal(unknown.status, 400);
    assert.match(unknown.text(), /unknown taskId/);
  });
});