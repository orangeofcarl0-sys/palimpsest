# G10-GC2 — Delivery Record

## Scope delivered

| Stage | Deliverable | Proof file |
|---|---|---|
| GC2-A | Exact `CampaignProjectRef` grounding + projection | `test/gc2_provenance_closure.test.ts` (A-M01…A-M08) |
| GC2-B | Work knowledge completeness | same (B-M01…B-M08) |
| GC2-C | Canonical BeliefState provenance | same (C-M01…C-M08) |
| GC2-D | Strict production parser closure | same (D-M01…D-M10) |
| GC2-E/H | Wake causal state machine + current-wake gating | same (E-M01…E-M09, H-M01…H-M08) |
| GC2-F/G | Project + WAIT admission bound to THIS wake | same (F-M01…F-M09, G-M01…G-M09) |
| GC2-I | Genuine P1→Dormant→P2 E2E | `test/gc2i_genuine_e2e.test.ts` |
| GC2-H | Crash matrix | `test/gc2h_crash_matrix.test.ts` |
| GC2-J | Campaign-wide provenance audit | `G10-GC2-J-CAMPAIGN-WIDE-PROVENANCE-AUDIT.md` |

## Design decisions

- **One merged semantic stage + one closure stage.** The event-schema upgrade, wake gating,
  and admission linkage are a single causal unit; splitting them would have produced
  intermediate commits that knowingly violate the invariant. Stage proofs remain
  individually labelled. See the umbrella §8.
- **No second store / no new ontology.** All causality is Campaign history.
- **The legacy G5/G6 primitives are retained** (`WAKE_COMPLETED`, `lifecycle.completeWake`)
  for backward compatibility and prior-stage tests; the GC2 golden path is the production
  service, which is what §99/§100 deprecates in favour of.
- **Project admission always registers its declared Intervention** in the same atomic batch
  (§81); the proposal parser already requires an `intervention` field.

## Verification (local, pre-merge)

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| focused GC2 proofs | provenance 28 · genuine E2E 1 · crash matrix 5 |
| `pnpm test` | 105 files / 905 tests passed |
| `pnpm build` | PASS |
| `pnpm build:web` | PASS |
| `pnpm test:e2e` | 21/21 passed (first trial) |

Known flake: `ordarium_ledger.test.ts` ("carries a transiently locked open…") failed once on
a full run (`expected 75 ≥ 200`) and passed on immediate re-run; it is Ordarium-open backoff
timing, unrelated to campaign code. The established `E2E-DEBUG-01`/`E2E-RUNTIME-03` e2e
flakes are only ever handled by the documented failed-job rerun protocol.

## Branch / merge checkpoints

| Stage | Branch | PR / merge |
|---|---|---|
| GC2-A…H + GC2-I/J proofs + docs | `experiment/g10-gc2-project-work-grounding` | PR **#52** → merge commit `f981525` |
| Closure verification record | `experiment/g10-gc2-pag-final-closure` | PR #53 (this record) |

## Remote CI (exact final HEAD)

| Run | HEAD | Result |
|---|---|---|
| `34765360010` (attempt 1) | `62f073a` (the merged GC2 HEAD) | **SUCCESS** — `unit` ✓, `e2e` ✓, first try |

## Canonical main gate (merge commit `f981525`)

| Gate | Result |
|---|---|
| `git diff --check` | clean |
| `pnpm test` | 105 files / **907 tests passed** |
| `pnpm build` | PASS |
| `pnpm build:web` | PASS |
| `pnpm test:e2e` | first run failed only on the documented `E2E-DEBUG-01` flake; rerun **21/21 passed** |

`E2E-DEBUG-01` is the pre-existing, documented hold/release race (proven to reproduce on
untouched main during G10-F0); it is not a GC2 regression and was handled solely by rerun,
with no code change. CI e2e passed first try on the exact merged HEAD.
