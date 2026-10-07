// Lab UI: plain DOM wiring, no framework, no runtime fetch.
import { createAgent, runTask } from './lab.mjs';
import { LAYERS, DEFAULT_DISABLED, layerSummary } from './layers.mjs';

const $ = (selector) => document.querySelector(selector);

const agent = createAgent(DEFAULT_DISABLED);

const taskSelect = $('#task-select');
const layerToggles = $('fieldset[aria-label="Layer controls"]');
const runButton = $('#run-task');
const outcomePanel = $('#outcome-panel');
const stepList = $('#step-list');
const summaryGrid = $('#summary-grid');

function currentDisabled() {
  return LAYERS
    .map((layer) => layerToggleFor(layer.id))
    .filter((input) => input && input.checked)
    .map((input) => input.dataset.layer);
}

function layerToggleFor(id) {
  return layerToggles.querySelector(`input[data-layer="${id}"]`);
}

function renderSummary() {
  summaryGrid.innerHTML = '';
  for (const layer of LAYERS) {
    const card = document.createElement('article');
    card.className = 'panel summary-card';
    card.innerHTML = `<p class="eyebrow">${layer.name}</p><p>${layer.summary}</p><p class="muted">${layer.failureClass}</p>`;
    summaryGrid.appendChild(card);
  }
}

function clearOutcome() {
  stepList.innerHTML = '';
  outcomePanel.hidden = true;
  outcomePanel.className = 'outcome';
  outcomePanel.querySelector('h2').textContent = 'Result';
  outcomePanel.querySelector('p').textContent = 'Run a task to see the layer trace.';
  outcomePanel.querySelector('.evidence').hidden = true;
  $('#outcome-badge').textContent = 'ready';
  $('#outcome-badge').className = 'badge';
}

function renderRun(result) {
  stepList.innerHTML = '';
  outcomePanel.hidden = false;
  const breached = Boolean(result.breach);
  outcomePanel.className = `outcome ${breached || result.outcome === 'blocked' ? 'fail' : result.outcome === 'completed' ? 'pass' : 'warn'}`;
  outcomePanel.querySelector('h2').textContent = `${result.task.title} — ${breached ? 'breach' : result.outcome}`;
  outcomePanel.querySelector('p').textContent = result.userMessage;
  const evidence = outcomePanel.querySelector('.evidence');
  evidence.hidden = false;
  evidence.innerHTML = `<strong>Outcome:</strong> ${result.outcomeMessage}`;
  if (breached) {
    evidence.insertAdjacentHTML('beforeend', `<p class="muted">${result.breach.signature} (${result.breach.evidence.join('; ')})</p>`);
  }

  for (const step of result.steps) {
    const item = document.createElement('li');
    const failed = step.output?.passed === false;
    const skipped = step.skipped || step.output?.skipped;
    item.className = `step ${skipped ? 'dim' : failed ? 'fail' : 'pass'}`;
    const layer = layerSummary(result.state).find((entry) => entry.id === step.id);
    const detail = step.output?.reason
      ?? step.output?.evidence?.join('; ')
      ?? step.output?.action
      ?? 'completed';
    item.innerHTML = `<strong>${layer?.name || step.id}</strong><span class="muted">${skipped ? 'skipped' : detail}</span>`;
    stepList.appendChild(item);
  }

  const badge = $('#outcome-badge');
  badge.textContent = breached ? 'breach' : result.outcome;
  badge.className = `badge ${breached || result.outcome === 'blocked' ? 'fail' : result.outcome === 'completed' ? 'pass' : 'warn'}`;
}

function runSelectedTask() {
  agent.disabled = currentDisabled();
  const result = runTask(taskSelect.value, agent.disabled);
  renderRun(result);
}

layerToggles.addEventListener('change', clearOutcome);
runButton.addEventListener('click', runSelectedTask);
taskSelect.addEventListener('change', clearOutcome);

for (const layer of LAYERS) {
  const label = document.createElement('label');
  label.className = 'toggle';
  label.innerHTML = `<input type="checkbox" data-layer="${layer.id}"><span>Disable ${layer.name}</span>`;
  layerToggles.querySelector('#layer-toggles').appendChild(label);
}

renderSummary();
clearOutcome();