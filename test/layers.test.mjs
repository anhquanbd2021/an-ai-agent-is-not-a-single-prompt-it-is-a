import test from 'node:test';
import assert from 'node:assert/strict';
import { LAYER_DEFS, LAYERS, createLayer, BREACH_SIGNATURES, STEP_DURATION_MS, layerSummary } from '../public/layers.mjs';

test('five layer definitions carry explicit contracts', () => {
  assert.deepEqual(LAYER_DEFS.map((layer) => layer.id), ['decision', 'memory', 'tools', 'guardrails', 'feedback']);
  for (const layer of LAYER_DEFS) {
    assert.equal(layer.required, true);
    assert.ok(layer.name.length > 0);
    assert.ok(layer.contract.includes('.'));
    assert.equal(typeof layer.validate, 'function');
  }
});

test('every layer has a verbatim breach signature used by the tests', () => {
  for (const layer of LAYER_DEFS) {
    assert.ok(BREACH_SIGNATURES[layer.id], `${layer.id} needs a breach signature`);
    assert.match(BREACH_SIGNATURES[layer.id], new RegExp(`^BREACH ${layer.id}: `));
  }
  assert.equal(Object.keys(BREACH_SIGNATURES).length, 5);
});

test('createLayer exposes the layer contract and process step', () => {
  const layer = createLayer('guardrails');
  assert.equal(layer.id, 'guardrails');
  assert.match(layer.contract(), /Budget/);
  const step = layer.process({ intent: 'refund' });
  assert.equal(step.id, 'guardrails');
  assert.equal(step.input.intent, 'refund');
  assert.throws(() => createLayer('nope'), /unknown layer/);
});

test('UI catalog stays aligned with the layer definitions', () => {
  assert.deepEqual(LAYERS.map((layer) => layer.id), LAYER_DEFS.map((layer) => layer.id));
  for (const layer of LAYERS) {
    assert.ok(layer.summary.length > 0);
    assert.ok(layer.failureClass.length > 0);
    assert.match(layer.color, /^#[0-9A-F]{6}$/);
  }
  assert.equal(typeof STEP_DURATION_MS, 'number');
});

test('layerSummary marks disabled layers inactive', () => {
  const summary = layerSummary({ disabled: { guardrails: true } });
  const guardrails = summary.find((layer) => layer.id === 'guardrails');
  assert.equal(guardrails.active, false);
  assert.equal(summary.find((layer) => layer.id === 'decision').active, true);
});