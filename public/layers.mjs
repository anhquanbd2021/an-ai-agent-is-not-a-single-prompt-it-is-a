// layers.mjs — the five contracts and their breach signatures.
// Shared by the engine, the UI, and the test suite.
export const STEP_DURATION_MS = 240;
export const DEFAULT_DISABLED = [];

export const LAYER_DEFS = [
  {
    id: 'decision',
    name: 'Decision',
    required: true,
    contract: 'One explicit goal, one allowed tool, and written success criteria.',
    validate: (agent) => Boolean(agent.state.decision?.tool),
  },
  {
    id: 'memory',
    name: 'Memory',
    required: true,
    contract: 'Short-term working context: identifiers, trip parameters, history.',
    validate: (agent) => Boolean(agent.state.memory),
  },
  {
    id: 'tools',
    name: 'Tools',
    required: true,
    contract: 'Typed, replaceable tool calls with deterministic outputs.',
    validate: (agent) => agent.state.tool?.output != null,
  },
  {
    id: 'guardrails',
    name: 'Guardrails',
    required: true,
    contract: 'Budget, routing, and side-effect constraints validated before completion.',
    validate: (agent) => agent.state.guardrails?.passed !== false,
  },
  {
    id: 'feedback',
    name: 'Feedback',
    required: true,
    contract: 'Every run ends with an outcome, evidence, and a user-facing message.',
    validate: (agent) => Boolean(agent.state.feedback),
  },
];

export const BREACH_SIGNATURES = {
  decision: 'BREACH decision: no goal contract — the agent guessed a route',
  memory: 'BREACH memory: working context missing — the agent re-asks for known data',
  tools: 'BREACH tools: no tool output — nothing executable ran',
  guardrails: 'BREACH guardrails: over-limit action executed without validation',
  feedback: 'BREACH feedback: outcome never surfaced — the run ended silently',
};

// UI-facing catalog (order matters: it is the stack).
export const LAYERS = [
  {
    id: 'decision',
    name: 'Decision',
    summary: 'Maps intent to one tool goal with success criteria.',
    failureClass: 'wrong tool, no success metric',
    evidence: 'route + reason recorded before any call',
    color: '#245B78',
  },
  {
    id: 'memory',
    name: 'Memory',
    summary: 'Holds booking ids and trip parameters for the whole run.',
    failureClass: 're-asks for known context',
    evidence: 'booking_id, origin, destination, history',
    color: '#2F6E56',
  },
  {
    id: 'tools',
    name: 'Tools',
    summary: 'Executes the chosen service and returns a concrete payload.',
    failureClass: 'echo instead of action',
    evidence: 'typed output or an explicit skip',
    color: '#5E7A74',
  },
  {
    id: 'guardrails',
    name: 'Guardrails',
    summary: 'Validates budget and routing before anything completes.',
    failureClass: 'unsafe action ships unreviewed',
    evidence: 'refund limit + expected tool/action checks',
    color: '#A15C00',
  },
  {
    id: 'feedback',
    name: 'Feedback',
    summary: 'Reports outcome, evidence, and the user-facing message.',
    failureClass: 'silent dead end',
    evidence: 'completed / blocked / escalated + copy',
    color: '#9E2B2B',
  },
];

export function createLayer(id) {
  const def = LAYER_DEFS.find((layer) => layer.id === id);
  if (!def) throw new Error(`unknown layer: ${id}`);
  return {
    id,
    process(input) {
      return { id, input, contract: def.contract };
    },
    contract() {
      return def.contract;
    },
  };
}

export function initialLayerState() {
  return {};
}

export function layerSummary(state) {
  return LAYERS.map((layer) => ({
    ...layer,
    active: !state?.disabled?.[layer.id],
    detail: state?.[layer.id] ?? null,
  }));
}