# Agent Stack Lab — companion demo

Interactive lab for the article *An AI Agent Is Not a Single Prompt — It Is a System of Decisions, Memory, Tools, Guardrails, and Feedback*. The simulation ships one deterministic agent request through five load-bearing layers so you can reproduce the missing-layer failure on demand.

Zero dependencies — Node 24+ only. The lab uses plain ES modules shared by the browser UI, the server, and the `node:test` suite.

## What it proves

Run the same task with all five layers enabled and the agent completes the task — or blocks it for the right reason. Disable one layer and the same request predictably fails: it escalates, it goes silent, or it completes an action it should have refused.

The flagship case: **Refund an over-limit charge** ($4,200 against a $2,000 limit). With every layer on, the guardrails layer blocks it. Disable **Guardrails** and the same request completes — the trace flags the breach that shipped with it.

## Run it

```text
npm start        # serve the lab on http://localhost:3000
npm test         # domain model + server + e2e
npm run check    # both
```

## Layout

- `public/lab.mjs` — the engine: `runTask`, `createAgent`, `createLab`, `runAgentTask`, `REPRO_MAP`, `layerStatus`, `stepThrough`
- `public/layers.mjs` — layer definitions, `BREACH_SIGNATURES`, UI catalog, step timing
- `public/tasks.mjs` — the four deterministic tasks and their required layers
- `public/index.html` / `public/guide.html` — the lab and its layer-by-layer guide
- `public/app.js` — DOM wiring for the lab page
- `public/styles.css` — demo theme (tokens + components)
- `public/pb-shell.css` / `public/pb-back.css` — Article Playbook brand pills (verbatim)
- `app/server.js` — static host, `/health`, `/version`, and `/api/run`
- `test/lab.test.mjs` — engine assertions including the failure mode
- `test/layers.test.mjs` — layer contracts and breach signatures
- `test/tasks.test.mjs` — required-layer enforcement with exact signatures
- `test/server.test.mjs` — boot-time and API server checks
- `test/e2e.test.mjs` — boots the server and reproduces the guardrails-removed failure mode

## Live links

- Live demo: https://an-ai-agent-is-not-a-single-prompt-it-is-a.onrender.com/
- Repo: https://github.com/anhquanbd2021/an-ai-agent-is-not-a-single-prompt-it-is-a

## Honest limits

- The simulated tools are fixtures, not live airline APIs.
- Real agents mix layers in pipelines, orchestrators, and human handoffs.
- A passing run proves this request passed — never every possible request.