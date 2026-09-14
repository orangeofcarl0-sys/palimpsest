# G10-P Live Federated Workforce & Attention Loop — Delivery

Baseline: `main @ 74b0a90042f091544c36531e7cef5d1bac5b4135`.
Ordarium: selected `v1.3.1` (from `v1.2.0`), all four packages coherent.

## Delivered

| Area | Files |
| --- | --- |
| Audit / disposition | `G10-P-LIVE-FEDERATION-ASSESSMENT.md`, `G10-P-O-CARRY-FORWARD-DISPOSITION.md` |
| Ordarium upgrade | `package.json`, `pnpm-workspace.yaml` (overrides), `pnpm-lock.yaml`, `test/ordarium_ledger.test.ts` (schema v4 fixture) |
| Durable transport | `src/transport/envelope.ts`, `ordarium_transport.ts`, `cursor_store.ts`, `pump.ts`, `adapters.ts`, `index.ts` |
| Attention | `src/attention/signals.ts`, `marks.ts`, `service.ts`, `host_adapter.ts`, `index.ts` |
| Deployment | `src/deployment/profile.ts`, `launch.ts`, `index.ts`; `src/cli.ts` (`serve --profile`) |
| Product wiring | `src/install.ts` (boundaryHome, attention, peerContinuityAssociations, effects close), `src/application/{surface,http}.ts`, `src/tools/application_tools.ts`, `src/federation/{commitment_service,federation_service,index}.ts`, `src/advanced.ts` |
| Dogfood | `scripts/dogfood/live-federation.mjs`, `pnpm run dogfood:live` |
| Tests | `test/p_transport` (14), `test/p_live_federation` (2), `test/p_attention` (11), `test/p_deployment` (4), `test/p_adversarial` (10) |
| Docs | spec, campaign, dogfood evidence, carry-forward, this delivery |

## Local gates

| Gate | Result |
| --- | --- |
| `pnpm run build` | PASS (`tsc -b`) |
| `pnpm exec vitest run` | PASS — **129 files / 1120 tests** (baseline 124 / 1079) |
| `pnpm run build:web` | PASS (199 modules; `dist/web/index-*.js`) |
| `pnpm exec playwright test` | 22 passed / 2 failed — only the documented pre-existing flakes `E2E-DEBUG-01` and `E2E-RUNTIME-03` |
| `node scripts/dogfood/live-federation.mjs` | PASS (real two-peer timeline; see `G10-P-DOGFOOD-EVIDENCE.md`) |
| Ordarium migration proof | unit/build/build:web/e2e re-run on v1.3.1; ledger fixture migrates v2→v3→v4 |

## Browser-flake classification (honest)

`E2E-DEBUG-01` and `E2E-RUNTIME-03` (`e2e/runtime-debugger.spec.ts`) are the two flakes already named
as pre-existing in the spec and in G10-O. Evidence gathered:

- `E2E-DEBUG-01` failed **on the pristine baseline worktree** (`d1f2acc`, Ordarium v1.2.0, unmodified
  sources) with `--repeat-each=3` (1 of 3 failed), and also failed in the P worktree after temporarily
  reverting Ordarium to v1.2.0 — so it is not caused by G10-P or the upgrade.
- `E2E-RUNTIME-03` failed twice in isolated single runs under v1.3.1 but **passed 3/3** with
  `--repeat-each=3`; the kernel/web/tool modules it exercises are byte-identical to baseline
  (`diff -rq` on `dist/src/{serve,tools,effects,state,domain}` and the `dist/web` bundle).
- Therefore both are classified as existing browser flakes. Per the spec's CI discipline they are
  handled in CI only by a documented failed-job rerun, with the isolation/rerun evidence recorded here.

## Deviations (honest)

1. Delivered as one implementation PR (code + docs) rather than the campaign's P0…P14 as separate PRs.
2. The durable boundary client is **submission-only**: a fire-and-forget at-least-once substrate
   cannot honestly answer G10-L's synchronous request/response boundary reads, so remote bound reads
   are refused and become CF-P-02.
3. The inbound pump pages one change at a time (`limit: 1`) so the opaque feed cursor is exact per
   ingest; batching is CF-P-03.
4. Ordarium v1.3.1 exposes no ledger epoch/UUID bound to a cursor; a replaced ledger with an
   equal-or-higher position is undetectable (fail-closed only on a future cursor). Recorded as CF-P-01.
5. `installPalimpsest.dispose()` now closes the Ordarium effects runtime (a real handle leak for
   embedders); this is an additive resource-lifecycle fix with no semantic change.
6. No new semantic kernel / identity species / truth store / planner / effect authority was added;
   `releaseCommitment` gained optional inbound-identity parameters with defaults preserving prior
   behavior, and `listCommitments` / `commitments()` / `AttentionSignal` are read-only additions.

## Required CI (canonical gate)

| Checkpoint | Value |
| --- | --- |
| Implementation PR | **#72** `experiment/g10-p-live-federation` |
| Tested branch HEAD | `377fe36` |
| PR run | `34843398908` — **e2e pass, unit pass, attempt 1** (no flake; no rerun needed) |
| Merge | `--merge` (normal) → canonical `main @ adb3f1239f2c67fcc54b8b65ea43a697bade319a` |
| Tree identity | `git diff 377fe36 adb3f12` empty → the tested tree IS the merged tree |
| Canonical main run | `34843586849` — **e2e pass, unit pass, attempt 1** |
| Flake handling | none required; CI e2e ran clean, so the local `E2E-DEBUG-01`/`E2E-RUNTIME-03` observations are classified as a local-environment flake (baseline-reproduced) |

All required checks were GREEN before merge; no force/bypass/history rewrite; no exit code masked by a
shell pipeline (status/conclusion read via `gh run view --json`).
