import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createStaticServer } from '../app/server.js';
import { stepThrough } from '../public/lab.mjs';
import { BREACH_SIGNATURES } from '../public/layers.mjs';

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

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}

test('e2e: the served lab reproduces the guardrails-removed failure mode on demand', async () => {
  await withServer(async (base) => {
    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /<nav aria-label="Primary">/);
    assert.match(html, /Agent Stack Lab/);

    const safe = await postJson(`${base}/api/run`, { taskId: 'refund_over_limit', disabled: [] });
    assert.equal(safe.status, 200);
    assert.equal(safe.data.outcome, 'blocked');
    assert.equal(safe.data.certified, true);
    assert.equal(safe.data.breach, null);

    const unsafe = await postJson(`${base}/api/run`, { taskId: 'refund_over_limit', disabled: ['guardrails'] });
    assert.equal(unsafe.status, 200);
    assert.equal(unsafe.data.outcome, 'completed');
    assert.equal(unsafe.data.certified, false);
    assert.equal(unsafe.data.breach.layer, 'guardrails');
    assert.equal(unsafe.data.breach.signature, BREACH_SIGNATURES.guardrails);

    const frames = [];
    for await (const frame of stepThrough('refund_over_limit', ['guardrails'])) {
      frames.push(frame);
    }
    const audit = frames.at(-1);
    assert.equal(audit.layer, 'audit');
    assert.deepEqual(audit.flags, ['breach']);
    assert.equal(audit.output.signature, BREACH_SIGNATURES.guardrails);
  });
});