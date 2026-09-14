# G10-Q Real Host Cognitive Federation & Anti-Waste Reconciliation — Delivery

Baseline: `main @ d16a7d7c6ae67d7930fe662c7c777941481a31c3`. Ordarium v1.3.1. Host: DSH 0.1.5-rc.2.

## Delivered

| Area | Files |
| --- | --- |
| Anti-waste | `G10-Q-ANTI-WASTE-RECONCILIATION.md`; DEMOTE annotations in `src/federation/transport.ts`, `src/boundary_memory/transport.ts` |
| Host audit / CF-P | `G10-Q-REAL-HOST-ASSESSMENT.md`, `G10-Q-P-CARRY-FORWARD-DISPOSITION.md` |
| Real host bundle | `host/dsh/{package.json,cordis.patch.yml,lib/{index,startup,runner}.js}` |
| Product remote submission | `src/application/surface.ts`, `src/application/http.ts`, `src/tools/application_tools.ts`, `src/deployment/launch.ts`, `src/install.ts`, `src/advanced.ts` |
| Tests | `test/q_remote_submission.test.ts` |
| Dogfood | `scripts/dogfood/real-host-federation.mjs`, `G10-Q-COGNITIVE-DOGFOOD-EVIDENCE.md` |
| Docs | spec, campaign, carry-forward, this delivery |

## Local gates

| Gate | Result |
| --- | --- |
| `pnpm run build` | PASS |
| `pnpm exec vitest run` | PASS — **130 files / 1122 tests** (baseline 129 / 1120) |
| `pnpm run build:web` | PASS |
| `pnpm exec playwright test` | **24 passed / 0 failed** after the presentation-only stabilization (see below) |
| Real-host smoke | PASS — real `dsh` agent called `palimpsest_surfaces` + `palimpsest_federation` (multi-tool turn) |
| Real-host cognitive dogfood | **PASS** — two OS processes, 4 real activations, counter-proposal, commitment ACTIVE decided by O, cold resume, 0 remote Work tasks, 0 user interventions, 46.5s |

## Anti-waste counts

```text
KEEP_SEMANTIC 24 · KEEP_CONSUMER_STATE 3 · BIND_PRODUCTION 10 · DEMOTE_TEST_EMBEDDING 6 ·
DELETE_REDUNDANT 0 · DEFER_TRIGGERED 2
```
No-delete justification and source proofs in the reconciliation doc.

## Flake root cause and fix (honest)

CI attempt 1 failed only `E2E-DEBUG-01` (documented flake); attempt 2 added `E2E-RUNTIME-03`+`E2E-RUNTIME-04`;
attempt 3 failed again. The runtime-debugger spec's kernel modules (`serve/tools/effects/state/domain`) and
the previous web bundle are byte-identical to the baseline, so the campaign change was inert for that spec —
the failures were the pre-existing React Flow "node hidden until measured" race, aggravated by CI load.

Fix: a presentation-only override in `web/src/GraphView.tsx` forcing `.react-flow__node { visibility: visible }`.
React Flow keeps a node's wrapper at `visibility:hidden` until its ResizeObserver measurement lands, so a
graph re-derived on every poll can leave nodes (and their `parentId` satellites) invisible indefinitely under
load. The semantic ids/state were already in the DOM; forcing the wrapper visible removes a rendering-timing
race without touching any identity. Result: the runtime-debugger spec passed 3/3 in a row and the full suite
24/24 locally.

## Deviations (honest)

1. The host bundle is installed by copying `host/dsh` into `$DSH_HOME/profiles/node_modules` and
   writing two profiles; it is not a published DSH package (CF-Q-03).
2. The scenario provided the counter-proposal content (allowed by §36); the commitment decision was
   left open and chosen by O. Broader open-ended negotiation is CF-Q-04.
3. Steady-state activation is in-process within each principal's own host process; the
   out-of-process `--resume` path is used for the cold-resume/restart proof (CF-Q-01).
4. The shipped headless app cannot resume; the custom bundle fills this upstream gap (CF-Q-02).
5. Duplicate-wake convergence is proven deterministically (replayed `operationId`), not via a live
   transport-fault injection (CF-Q-06).
6. One presentation-only web change (`GraphView.tsx` node-visibility override) stabilizes the pre-existing
   `runtime-debugger` CI flake; it touches no semantic identity.
7. `G10-Q-ANTI-WASTE-RECONCILIATION.md` found `DELETE = none`; no code was deleted, and the DEMOTE
   actions are annotations + doc/README discipline only.

## Required CI (canonical gate)

| Checkpoint | Value |
| --- | --- |
| Implementation PR | **#74** `experiment/g10-q-real-host` |
| Tested branch HEAD | `d02d1f8` (feature `cb6ffb0` + flake stabilization `d02d1f8`) |
| Pre-stabilization run | `34849363206` — unit pass; e2e failed on the documented `runtime-debugger` flake family (attempts 1–3) |
| Post-stabilization run | `34850784294` — **unit pass + e2e pass on attempt 1** |
| Merge | `--merge` (normal) → canonical `main @ 8a6062db405ad93a600963e66eb70faeb121f5d4` |
| Tree identity | `git diff d02d1f8 8a6062d` empty → the tested tree IS the merged tree |
| Canonical main run | `34851071694` — **unit pass + e2e pass on attempt 1** |

All required checks were GREEN before merge. No force/bypass/history rewrite; status read via
`gh run view --json` (no shell pipeline masking exit codes).
