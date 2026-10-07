import test from 'node:test';
import assert from 'node:assert/strict';
import { TASKS, TASK_LIST, taskById } from '../public/tasks.mjs';
import { runTask } from '../public/lab.mjs';
import { BREACH_SIGNATURES } from '../public/layers.mjs';

const ALL_LAYERS = ['decision', 'memory', 'tools', 'guardrails', 'feedback'];

test('four deterministic tasks ship request and expected contracts', () => {
  assert.deepEqual(TASK_LIST.map((task) => task.id), ['refund', 'refund_over_limit', 'search', 'upgrade']);
  for (const task of TASK_LIST) {
    assert.ok(task.title.length > 0);
    assert.ok(task.request.intent.length > 0);
    assert.ok(task.expected.tool.length > 0);
    assert.ok(task.description.length > 0);
  }
});

test('every task requires all five layers — enforced, not implied', () => {
  for (const task of TASK_LIST) {
    assert.deepEqual(task.requiredLayers, ALL_LAYERS, `${task.id} requiredLayers`);
  }
});

test('each task fails with an exact breach signature when any required layer is disabled', () => {
  for (const task of TASK_LIST) {
    for (const missingLayer of task.requiredLayers) {
      const result = runTask(task.id, [missingLayer]);
      assert.equal(result.certified, false, `${task.id} must not certify a run missing ${missingLayer}`);
      assert.ok(result.breach, `${task.id} should record a breach without ${missingLayer}`);
      assert.equal(result.breach.layer, missingLayer, `${task.id} breach layer`);
      assert.equal(result.breach.signature, BREACH_SIGNATURES[missingLayer], `${task.id} breach signature`);
    }
  }
});

test('the happy path completes, is certified, and stays deterministic', () => {
  const first = runTask('search');
  const second = runTask('search');
  assert.equal(first.outcome, 'completed');
  assert.equal(first.certified, true);
  assert.equal(first.breach, null);
  assert.deepEqual(first.state.tool.output, second.state.tool.output);
  assert.equal(first.state.tool.output.results.length, TASKS.search.expected.result_count);
});

test('taskById resolves known ids and rejects unknown ids', () => {
  assert.equal(taskById('refund').id, 'refund');
  assert.throws(() => taskById('nope'), /unknown task/);
});

test('money is integer cents and the over-limit task exceeds the guardrail contract', () => {
  const overLimit = TASKS.refund_over_limit;
  assert.ok(Number.isInteger(overLimit.request.requested_refund_cents));
  assert.ok(overLimit.request.requested_refund_cents > overLimit.expected.max_refund_cents);
  assert.ok(TASKS.refund.request.requested_refund_cents <= TASKS.refund.expected.max_refund_cents);
});