import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgent, createLab, runTask, stepThrough, REPRO_MAP, layerStatus } from '../public/lab.mjs';
import { LAYERS, LAYER_DEFS, DEFAULT_DISABLED, BREACH_SIGNATURES } from '../public/layers.mjs';

test('default agent completes the refund task with all five layers enabled', () => {
  const agent = createAgent(DEFAULT_DISABLED);
  const result = agent.run('refund');
  assert.equal(result.outcome, 'completed');
  assert.equal(result.userMessage, 'Done — process a refund is confirmed for booking BK-8812.');
  assert.equal(result.breach, null);
  assert.deepEqual(agent.disabled, []);
  assert.deepEqual(result.steps.map((step) => step.id), LAYERS.map((layer) => layer.id));
  for (const step of result.steps) {
    assert.ok(step.finishedAt > step.startedAt, `step ${step.id} finishedAt should advance`);
    assert.ok(!step.skipped, `step ${step.id} should not be skipped`);
  }
});

test('guardrails block an over-limit refund when every layer is on', () => {
  const result = runTask('refund_over_limit');
  assert.equal(result.outcome, 'blocked');
  assert.equal(result.state.guardrails.passed, false);
  assert.match(result.outcomeMessage, /420000 > limit 200000/);
  assert.equal(result.breach, null);
});

test('removing guardrails lets the same over-limit refund ship — the failure mode', () => {
  const result = runTask('refund_over_limit', ['guardrails']);
  assert.equal(result.outcome, 'completed');
  assert.equal(result.state.tool.output.refund_cents, 420000);
  assert.equal(result.breach.layer, 'guardrails');
  assert.equal(result.breach.signature, BREACH_SIGNATURES.guardrails);
  assert.match(result.breach.evidence.join(' '), /420000 > limit 200000/);
});

test('every layer in REPRO_MAP reproduces its breach signature on demand', () => {
  for (const [layerId, repro] of Object.entries(REPRO_MAP)) {
    const result = runTask(repro.taskId, repro.disabled);
    assert.equal(result.outcome, repro.expectOutcome, `${layerId} outcome`);
    assert.ok(result.breach, `${layerId} should record a breach`);
    assert.equal(result.breach.layer, layerId);
    assert.equal(result.breach.signature, repro.expectBreach);
    assert.equal(result.breach.signature, BREACH_SIGNATURES[layerId]);
  }
});

test('missing feedback ends the run silently', () => {
  const result = runTask('refund', ['feedback']);
  assert.equal(result.outcome, 'skipped');
  assert.equal(result.userMessage, 'No result to show.');
  assert.ok(result.steps.some((step) => step.id === 'feedback' && step.skipped));
  assert.equal(result.breach.layer, 'feedback');
});

test('createLab enables exactly the listed layers', () => {
  const agent = createLab({ layers: ['decision', 'memory', 'tools', 'feedback'] });
  assert.deepEqual(agent.disabled, ['guardrails']);
  assert.equal(agent.layers.length, LAYER_DEFS.length);
});

test('runTask is deterministic for identical inputs', () => {
  const first = runTask('search', ['memory']);
  const second = runTask('search', ['memory']);
  assert.deepEqual(first.state.memory, second.state.memory);
  assert.deepEqual(first.steps.map((step) => step.id), second.steps.map((step) => step.id));
  assert.equal(first.outcome, second.outcome);
});

test('stepThrough yields one step per layer plus an audit breach frame', async () => {
  const frames = [];
  for await (const frame of stepThrough('refund_over_limit', ['guardrails'])) {
    frames.push(frame);
  }
  assert.deepEqual(frames.slice(0, 5).map((frame) => frame.layer), LAYERS.map((layer) => layer.id));
  const audit = frames.at(-1);
  assert.equal(audit.layer, 'audit');
  assert.deepEqual(audit.flags, ['breach']);
  assert.equal(audit.output.signature, BREACH_SIGNATURES.guardrails);
});

test('layerStatus reports activity and validation per layer', () => {
  const result = runTask('refund');
  const status = layerStatus(result.state);
  for (const layer of LAYERS) {
    assert.equal(status[layer.id].active, true);
    assert.ok(status[layer.id].lastValidation > 0);
  }
  assert.deepEqual(status.guardrails.contractBreaches, []);
});