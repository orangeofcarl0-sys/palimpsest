# G10-Q Carry-Forward Register

Mandatory input for the next stage. No `BLOCKER_IN_Q`. CF-P dispositions:
`G10-Q-P-CARRY-FORWARD-DISPOSITION.md`; anti-waste classes: `G10-Q-ANTI-WASTE-RECONCILIATION.md`.

## CF-Q-01 — Steady-state activation is in-process
- **Observed at:** `host/dsh/lib/runner.js`
- **Evidence:** each principal's attention loop wakes the SAME agent inside its own host process via
  the real `dshAgentsAttentionAdapter` bound to the live agent. The out-of-process variant
  (`dsh --profile <p> --resume <sessionId> "<message>"`) is supported by the same bundle and is used
  for the restart/cold-resume proof, but is not the steady-state loop.
- **Category:** HOST · **Trigger:** a host requirement for per-activation process isolation. · **Blocking:** NON_BLOCKING

## CF-Q-02 — Shipped headless cannot resume
- **Observed at:** `@deepseek-ai/dsh-headless` 0.1.5-rc.2
- **Evidence:** it always creates a fresh session, never prints the session id, and declares no
  `--resume`. Persistent principals require the custom `palimpsest-dsh-host` bundle.
- **Category:** UPSTREAM · **Trigger:** an upstream headless resume/session-id surface. · **Blocking:** NON_BLOCKING

## CF-Q-03 — Host bundle is installed by copy, not published
- **Observed at:** `host/dsh`, `scripts/dogfood/real-host-federation.mjs`
- **Evidence:** the dogfood copies `host/dsh` into `$DSH_HOME/profiles/node_modules/palimpsest-dsh-host`
  and writes two profiles. `package.json` is `private: true`.
- **Category:** DISTRIBUTION · **Trigger:** publishing `palimpsest-dsh-host` as a DSH bundle. · **Blocking:** NON_BLOCKING

## CF-Q-04 — Counter-proposal content was scenario-provided
- **Observed at:** `scripts/dogfood/real-host-federation.mjs` (`O_TASK`)
- **Evidence:** the amended interface content came from the scenario prompt (allowed by §36); the
  agent executed it as a real tool-mediated turn, and the commitment decision was left open and
  chosen by the agent. Broader open-ended negotiation is future work.
- **Category:** DOGFOOD SCOPE · **Trigger:** open-ended multi-round negotiation experiments. · **Blocking:** NON_BLOCKING

## CF-Q-05 — Pi host adapter is conformance-only
- **Observed at:** `src/attention/host_adapter.ts` (`piAttentionAdapter`)
- **Evidence:** Pi is installed but was not exercised as a live host; DSH is the chosen primary host.
- **Trigger:** a Pi host dogfood. · **Blocking:** NON_BLOCKING

## CF-Q-06 — Live duplicate-wake injection not performed
- **Observed at:** `test/q_remote_submission.test.ts`
- **Evidence:** duplicate delivery/decision convergence is proven deterministically (replayed
  `operationId` → one ACTIVE commitment); the live run exercised the single-delivery path.
- **Trigger:** a live transport-fault injection harness. · **Blocking:** NON_BLOCKING

## CF-Q-07 — Single model, single run
- **Evidence:** one provider/model; acceptance was milestone-based, not prose-based. Repeated runs and
  multi-model comparison belong to the empirical stage. · **Trigger:** G10-R. · **Blocking:** NON_BLOCKING

## CF-Q-08 — G10-P residuals retained
- CF-P-01 (ledger epoch), CF-P-03 (pump `limit: 1`), CF-P-04 (poisoned envelope), CF-P-06 (explicit
  escalation policy), CF-P-09 (adapter-asserted auth wording), CF-P-10 (static discovery) are
  unchanged. · **Blocking:** NON_BLOCKING

## CF-Q-09 — Cognitive telemetry is noncanonical and minimal
- **Evidence:** the dogfood records activations, tool-call counts, milestone latencies, restarts and
  user interventions — never tokens/provider/secrets, and never as identity/commitment/boundary truth.
- **Trigger:** a host telemetry API if the empirical stage needs cost/latency. · **Blocking:** NON_BLOCKING

## CF-Q-10 — Remote synchronous boundary reads still absent
- **Evidence:** the durable boundary path is submission-only (CF-P-02); the dogfood reads canonical
  state locally via the product HTTP surface after the home applies a mutation. · **Blocking:** NON_BLOCKING

---
```text
No BLOCKER_IN_Q. Next stage (spec §82): G10-R Empirical Organization Evaluation & Organization Memory,
now that mechanical substrate + semantic collaboration + real cognitive-agent evidence all exist.
No universal organization score is permitted there either.
```
