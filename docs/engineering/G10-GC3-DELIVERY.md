# G10-GC3 — Delivery Record

## Scope delivered

| Stage | Deliverable | Proof |
|---|---|---|
| GC3-0 | Frozen unified admission contract | `G10-GC3-UNIFIED-NEXT-ACTION-CONTRACT.md` |
| GC3-1 | Strict `CompiledCampaignAction` parser + canonical candidate digest | `gc3_unified_admission` C1-M01…M10 |
| GC3-2 | One read-only freshness evaluator (both arms) | C2-M01…M08 |
| GC3-3 | Unified dispatch (`admitCompiledNextAction`) | C3-M01…M08 |
| GC3-4 | `WaitAdmission` candidate provenance + prospective checkpoint | C4-M01…M09 |
| GC3-5 | Wake completion through admission | C5-M01…M08 |
| GC3-6 | Positive + negative E2E, crash + replay | `gc3_unified_e2e`, `gc3_crash_recovery`, N01–N10 |
| GC3-7 | Installed golden path | `gc3_unified_e2e` installed-surface flow |

## Honest deviations

- Stage grouping: the strict parser, shared freshness, unified boundary, WAIT
  provenance, and completion are one causally-coupled unit; the event/payload
  changes (`WAIT_ADMITTED.candidateDigest`, `CAMPAIGN_QUIESCING` discriminator)
  are required by both the parser and the admission stage. They are delivered as
  one implementation PR plus one docs-only closure PR. Stage-level proofs remain
  individually labelled (C1-M…, N…, P…).
- Non-wake WAIT admission (a WAIT candidate while ACTIVE) is intentionally NOT
  implemented (§116/§117 allow this); the initial-dormancy `production.admitWait`
  primitive remains for entering DORMANT before any wake.
- `production.admitWaitAction` was removed rather than retained internally: the
  WAIT semantics must require a complete candidate, not merely hide the method.

## Verification (local, pre-merge)

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm test` | 108 files / 933 tests passed |
| `pnpm build` / `build:web` | PASS |
| `pnpm test:e2e` | 21/21 after the documented `E2E-DEBUG-01` flake rerun |

`E2E-DEBUG-01` is the pre-existing hold/release race (proven to reproduce on
untouched main during G10-F0); in isolation it passed 2/3 runs and the full suite
passed on rerun. It is not a GC3 regression and was handled only by rerun.

## Branch / merge checkpoints

| Stage | Branch | PR / merge |
|---|---|---|
| GC3-0…7 + docs | `experiment/g10-gc3-unified-admission` | PR **#54** → merge commit `77de168` |
| Closure verification record | `experiment/g10-gc3-pag-freeze` | PR #55 (this record) |

## Remote CI (exact final HEAD)

| Run | HEAD | Result |
|---|---|---|
| `34768147435` (attempt 1) | `f16055f` (the merged GC3 HEAD) | **SUCCESS** — `unit` ✓, `e2e` ✓, first try |

## Canonical main gate (merge commit `77de168`)

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm test` | 108 files / **933 tests passed** |
| `pnpm build` / `build:web` | PASS |
| `pnpm test:e2e` | 20/21, failing only the documented `E2E-DEBUG-01` flake |

`E2E-DEBUG-01` is the pre-existing hold/release race (proven to reproduce on
untouched main during G10-F0); it passed intermittently in isolation and the
remote e2e job passed it first try on the exact merged HEAD `f16055f`. It is not a
GC3 regression; no code change was made for it.
