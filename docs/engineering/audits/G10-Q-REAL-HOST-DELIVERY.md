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
| `pnpm exec playwright test` | 22 passed / 2 failed — only the pre-existing documented flakes `E2E-DEBUG-01` / `E2E-RUNTIME-03` (baseline-reproduced in G10-P; CI ran clean there) |
| Real-host smoke | PASS — real `dsh` agent called `palimpsest_surfaces` + `palimpsest_federation` (multi-tool turn) |
| Real-host cognitive dogfood | **PASS** — two OS processes, 4 real activations, counter-proposal, commitment ACTIVE decided by O, cold resume, 0 remote Work tasks, 0 user interventions, 46.5s |

## Anti-waste counts

```text
KEEP_SEMANTIC 24 · KEEP_CONSUMER_STATE 3 · BIND_PRODUCTION 10 · DEMOTE_TEST_EMBEDDING 6 ·
DELETE_REDUNDANT 0 · DEFER_TRIGGERED 2
```
No-delete justification and source proofs in the reconciliation doc.

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
6. `G10-Q-ANTI-WASTE-RECONCILIATION.md` found `DELETE = none`; no code was deleted, and the DEMOTE
   actions are annotations + doc/README discipline only.

## Required CI

See the canonical gate recorded after the implementation PR run (filled in the closure commit).
Required checks must be GREEN before merge; the two documented flakes may be cleared only by a
documented failed-job rerun.
