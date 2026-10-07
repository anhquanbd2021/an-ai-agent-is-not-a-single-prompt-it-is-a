// tasks.mjs — the task registry every layer must survive.
// Money is integer cents; the refund limit is the guardrail contract.
export const TASKS = {
  refund: {
    id: 'refund',
    title: 'Process a refund',
    description: 'User asks for a $420.00 refund on booking BK-8812.',
    request: {
      intent: 'refund',
      booking_id: 'BK-8812',
      requested_refund_cents: 42000,
      payment_source: 'original_payment',
    },
    expected: {
      tool: 'RefundApi.refund_booking',
      action: 'issued',
      booking_id: 'BK-8812',
      max_refund_cents: 200000,
      currency: 'USD',
      requiresMemory: true,
    },
    requiredLayers: ['decision', 'memory', 'tools', 'guardrails', 'feedback'],
  },
  refund_over_limit: {
    id: 'refund_over_limit',
    title: 'Refund an over-limit charge',
    description: 'User asks for a $4,200.00 refund on booking BK-7741 — above the $2,000.00 limit.',
    request: {
      intent: 'refund',
      booking_id: 'BK-7741',
      requested_refund_cents: 420000,
      payment_source: 'original_payment',
    },
    expected: {
      tool: 'RefundApi.refund_booking',
      action: 'issued',
      booking_id: 'BK-7741',
      max_refund_cents: 200000,
      currency: 'USD',
      requiresMemory: true,
    },
    requiredLayers: ['decision', 'memory', 'tools', 'guardrails', 'feedback'],
  },
  search: {
    id: 'search',
    title: 'Find an alternative flight',
    description: 'User needs another SGN-DAD flight on 2026-11-02.',
    request: {
      intent: 'search',
      origin: 'SGN',
      destination: 'DAD',
      date: '2026-11-02',
    },
    expected: {
      tool: 'SearchFlights.search',
      result_count: 3,
      currency: 'USD',
      requiresMemory: true,
    },
    requiredLayers: ['decision', 'memory', 'tools', 'guardrails', 'feedback'],
  },
  upgrade: {
    id: 'upgrade',
    title: 'Confirm an upgrade',
    description: 'User confirms a points-paid upgrade on booking BK-5520.',
    request: {
      intent: 'upgrade',
      booking_id: 'BK-5520',
      payment_source: 'points',
    },
    expected: {
      tool: 'BookingApi.confirm_upgrade',
      action: 'confirmed',
      booking_id: 'BK-5520',
      currency: 'USD',
      requiresMemory: true,
    },
    requiredLayers: ['decision', 'memory', 'tools', 'guardrails', 'feedback'],
  },
};

export const TASK_LIST = Object.values(TASKS);

export function taskById(taskId) {
  const task = TASKS[taskId];
  if (!task) throw new Error(`unknown task: ${taskId}`);
  return task;
}