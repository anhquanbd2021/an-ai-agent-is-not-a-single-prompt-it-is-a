// lab.mjs — the agent engine. One deterministic run, five load-bearing layers.
// Browser UI, server tests, and the test suite all import this module.
import { LAYER_DEFS, LAYERS, STEP_DURATION_MS, BREACH_SIGNATURES, layerSummary, initialLayerState } from './layers.mjs';
import { taskById } from './tasks.mjs';

export const LAB_LAYERS = Object.fromEntries(
  LAYER_DEFS.map((layer) => [layer.id, { name: layer.name, contract: layer.contract }]),
);

function decision(state, task, request) {
  const keywords = `${task.title} ${task.description}`.toLowerCase();
  if (request.intent === 'refund' || keywords.includes('refund')) {
    state.decision = { tool: 'RefundApi.refund_booking', reason: 'User asked for a refund.' };
  } else if (request.intent === 'search' || keywords.includes('alternative flight')) {
    state.decision = { tool: 'SearchFlights.search', reason: 'User needs flight options.' };
  } else if (request.intent === 'upgrade' || keywords.includes('upgrade')) {
    state.decision = { tool: 'BookingApi.confirm_upgrade', reason: 'User asked to confirm an upgrade.' };
  } else {
    state.decision = { tool: 'Reply.echo', reason: 'No matching goal contract found.' };
  }
}

function memory(state, task, request) {
  if (task.id === 'refund' || task.id === 'refund_over_limit' || task.id === 'upgrade') {
    state.memory = {
      booking_id: request.booking_id || task.expected.booking_id,
      history: [`User requested ${task.title.toLowerCase()}.`],
    };
  } else {
    state.memory = {
      origin: request.origin,
      destination: request.destination,
      date: request.date,
      history: ['User asked for an alternative flight.'],
    };
  }
}

const availableFlights = [
  { airline: 'VN', flight: 'VN120', departs: '08:15', arrives: '10:05', price: 14200, currency: 'USD' },
  { airline: 'TG', flight: 'TG560', departs: '11:40', arrives: '13:25', price: 13850, currency: 'USD' },
  { airline: 'VietJet', flight: 'VJ810', departs: '18:05', arrives: '19:50', price: 12100, currency: 'USD' },
];

function toolPass(state, task, request) {
  const tool = state.decision?.tool;
  if (task.id === 'search' && tool === 'SearchFlights.search') {
    state.tool = { output: { results: availableFlights, currency: 'USD' } };
    return;
  }
  // The tool layer executes; the guardrails layer is what decides what is safe.
  if ((task.id === 'refund' || task.id === 'refund_over_limit') && tool === 'RefundApi.refund_booking') {
    state.tool = {
      output: {
        action: 'issued',
        booking_id: state.memory?.booking_id || request.booking_id,
        refund_cents: request.requested_refund_cents,
      },
    };
    return;
  }
  if (task.id === 'upgrade' && tool === 'BookingApi.confirm_upgrade') {
    state.tool = {
      output: {
        action: 'confirmed',
        booking_id: state.memory?.booking_id || request.booking_id,
        seats_left: 3,
        payment_source: request.payment_source,
      },
    };
    return;
  }
  state.tool = { output: null, reason: 'no tool matched the decision layer' };
}
function guardrails(state, task, request) {
  const output = state.tool?.output;
  const problems = [];
  if (!output) {
    problems.push('no tool output to validate');
  } else {
    if (task.expected.max_refund_cents && output.refund_cents > task.expected.max_refund_cents) {
      problems.push(`refund ${output.refund_cents} > limit ${task.expected.max_refund_cents}`);
    }
    if (task.expected.tool && state.decision?.tool !== task.expected.tool) {
      problems.push(`selected ${state.decision?.tool}, expected ${task.expected.tool}`);
    }
    if (task.expected.action && output.action !== task.expected.action) {
      problems.push(`action was ${output.action}, expected ${task.expected.action}`);
    }
    if (task.expected.result_count && output.results?.length !== task.expected.result_count) {
      problems.push(`returned ${output.results?.length} results, expected ${task.expected.result_count}`);
    }
  }
  state.guardrails = { passed: problems.length === 0, evidence: problems };
}

function feedback(state, task, request) {
  const output = state.tool?.output;
  if (task.expected.requiresMemory && state.disabled.memory) {
    state.feedback = {
      action: 'escalate',
      message: BREACH_SIGNATURES.memory,
      user_message: 'I lost the booking context — can you resend the details?',
    };
    return;
  }
  if (state.disabled.decision) {
    state.feedback = {
      action: 'escalate',
      message: BREACH_SIGNATURES.decision,
      user_message: 'I could not tell what you wanted me to do.',
    };
    return;
  }
  if (!output) {
    state.feedback = {
      action: 'escalate',
      message: BREACH_SIGNATURES.tools,
      user_message: 'I hit a dead end and need a human.',
    };
    return;
  }
  if (!state.disabled.guardrails && state.guardrails?.passed === false) {
    state.feedback = {
      action: 'blocked',
      message: state.guardrails.evidence.join('; '),
      user_message: 'I can not complete that action right now.',
    };
    return;
  }
  if (task.id === 'search') {
    state.feedback = {
      action: 'completed',
      message: `Returned ${output.results.length} flight options in ${output.currency}.`,
      user_message: `I found ${output.results.length} options starting at $${output.results[0].price / 100}.`,
    };
    return;
  }
  state.feedback = {
    action: 'completed',
    message: `${task.title.toLowerCase()} completed for ${output.booking_id}.`,
    user_message: `Done — ${task.title.toLowerCase()} is confirmed for booking ${output.booking_id}.`,
  };
}

const LAYER_RUNNERS = { decision, memory, tools: toolPass, guardrails, feedback };

function runLayer(state, layerId, task, request) {
  const startedAt = state.timestamp;
  if (state.disabled[layerId]) {
    state[layerId] = { skipped: true, reason: `${layerId} layer disabled` };
  } else {
    LAYER_RUNNERS[layerId](state, task, request);
  }
  state.timestamp += STEP_DURATION_MS;
  const step = {
    id: layerId,
    startedAt,
    finishedAt: state.timestamp,
    skipped: Boolean(state.disabled[layerId]),
    output: state[layerId] ?? null,
  };
  state.steps.push(step);
  return step;
}

// Audit pass: a task declares its required layers; a run missing one is a breach,
// even when the remaining layers still produce an answer.
const BREACH_EVIDENCE = {
  decision: ['no goal contract was recorded'],
  memory: ['booking_id or trip parameters were unavailable'],
  tools: ['the agent had nothing executable to call'],
  guardrails: ['guardrails layer disabled — action shipped unvalidated'],
  feedback: ['no outcome was surfaced to the user'],
};

function detectBreach(task, state) {
  const output = state.tool?.output;
  for (const layer of LAYER_DEFS) {
    if (!state.disabled[layer.id]) continue;
    if (layer.id === 'guardrails' && task.expected.max_refund_cents && output?.refund_cents > task.expected.max_refund_cents) {
      return {
        layer: 'guardrails',
        signature: BREACH_SIGNATURES.guardrails,
        evidence: [`refund ${output.refund_cents} > limit ${task.expected.max_refund_cents}`],
      };
    }
    return { layer: layer.id, signature: BREACH_SIGNATURES[layer.id], evidence: BREACH_EVIDENCE[layer.id] };
  }
  return null;
}
export function runTask(taskId, disabled = []) {
  const task = taskById(taskId);
  const request = { ...task.request };
  const state = {
    timestamp: 0,
    steps: [],
    disabled: Object.fromEntries(LAYER_DEFS.map((layer) => [layer.id, disabled.includes(layer.id)])),
    ...initialLayerState(),
  };
  const steps = LAYER_DEFS.map((layer) => runLayer(state, layer.id, task, request));
  const outcome = state.feedback?.action || 'skipped';
  const breach = detectBreach(task, state);
  return {
    task,
    request,
    outcome,
    outcomeMessage: state.feedback?.message || 'No layer produced output.',
    userMessage: state.feedback?.user_message || 'No result to show.',
    steps,
    state,
    breach,
    certified: breach === null,
  };
}

export function createAgent(disabled = []) {
  const agent = {
    layers: LAYER_DEFS.map((layer) => layer.id),
    disabled: [...disabled],
    state: null,
    run(taskId) {
      const result = runTask(taskId, agent.disabled);
      agent.state = result.state;
      return result;
    },
    summary() {
      return layerSummary({
        disabled: Object.fromEntries(LAYER_DEFS.map((layer) => [layer.id, agent.disabled.includes(layer.id)])),
      });
    },
  };
  return agent;
}

// PLAN surface: createLab({ layers: [...] }) enables exactly those layers.
export function createLab({ layers } = {}) {
  const all = LAYER_DEFS.map((layer) => layer.id);
  const enabled = Array.isArray(layers) && layers.length > 0 ? layers : all;
  return createAgent(all.filter((id) => !enabled.includes(id)));
}

export function runAgentTask(taskId, agent) {
  return agent.run(taskId);
}

export const REPRO_MAP = {
  decision: { taskId: 'refund', disabled: ['decision'], expectOutcome: 'escalate', expectBreach: BREACH_SIGNATURES.decision },
  memory: { taskId: 'refund', disabled: ['memory'], expectOutcome: 'escalate', expectBreach: BREACH_SIGNATURES.memory },
  tools: { taskId: 'refund', disabled: ['tools'], expectOutcome: 'escalate', expectBreach: BREACH_SIGNATURES.tools },
  guardrails: { taskId: 'refund_over_limit', disabled: ['guardrails'], expectOutcome: 'completed', expectBreach: BREACH_SIGNATURES.guardrails },
  feedback: { taskId: 'refund', disabled: ['feedback'], expectOutcome: 'skipped', expectBreach: BREACH_SIGNATURES.feedback },
};

export function layerStatus(target = {}) {
  const state = target?.state ?? target;
  const steps = state?.steps ?? [];
  return Object.fromEntries(LAYERS.map((layer) => [layer.id, {
    active: !state?.disabled?.[layer.id],
    lastValidation: steps.find((step) => step.id === layer.id)?.finishedAt ?? null,
    contractBreaches: Array.isArray(state?.[layer.id]?.evidence) ? state[layer.id].evidence : [],
  }]));
}

export async function* stepThrough(taskId, disabled = []) {
  const record = runTask(taskId, disabled);
  for (const step of record.steps) {
    yield {
      layer: step.id,
      input: record.request,
      output: step.output,
      flags: step.skipped ? ['skipped'] : (step.output?.passed === false ? ['breach'] : []),
    };
  }
  if (record.breach) {
    yield { layer: 'audit', input: record.request, output: record.breach, flags: ['breach'] };
  }
}