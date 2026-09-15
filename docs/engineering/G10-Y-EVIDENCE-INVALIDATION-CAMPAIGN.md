# G10-Y — Campaign record

Baseline `189fcd005885d1d7fdd40174aa6935783be92da6`. One stage, one closure.

## Internal topology (all executed)

| Stage | Work | Result |
| --- | --- | --- |
| Y0 | Reproduce the `CF-W-03` crash fail-open | Reproduced with a REAL process kill |
| Y1 | Audit the exact Work Evidence invalidation scope | Typed pairs; commit subjects excluded |
| Y2 | Pure typed `EvidenceInvalidationPlan` | `compileEvidenceInvalidation` |
| Y3 | Canonical `EVIDENCE_STALE` builder + admission | One builder; `#validateEvidenceStale` |
| Y4 | Integrate into the `appendAtomic` revision batch | Pre-revision, same transaction |
| Y5 | Delete the hidden SQL repair | `#staleEvidenceForScope` removed |
| Y6 | Gate-authority regression | PASS → not PASS; no evidence consumed |
| Y7 | Crash / replay / rebuild closure | 5 checkpoints × old-or-new world |
| Y8 | W / X / Proof / Reasoning regressions | Table-level non-interference |
| Y9 | Anti-waste, docs, CI, carry-forward | This document set |

## Write scope

```
src/evidence/invalidation.ts     plan compiler + reason helper (pure)
src/domain/aggregate.ts          EVIDENCE_STALE admission validation
src/tools/controller.ts          shared builder, batch integration, repair deleted
test/y_evidence_authority.test.ts   15 tests
test/y_adversarial.test.ts          28 tests
scripts/audit/y0-cf-w-03-repro.mjs  real-crash reproducer
docs/**                             this document set
```

No new event type. No migration. No new table. `fixtures/**` untouched.

## Ordering delivered

```text
TASK_STALE → EVIDENCE_STALE → PROJECT_REVISED → TASK_REAUTHORIZED → TASK_CREATED
```

## Evidence

| Artifact | What it proves |
| --- | --- |
| `scripts/audit/y0-cf-w-03-repro.mjs` | Real child-process SIGKILL after the batch COMMIT; pre-fix leaves the mixed fail-open state, post-fix leaves the complete new world |
| `test/y_evidence_authority.test.ts` | Atomic closure, fault injection at 5 checkpoints, retry convergence, replay/rebuild, gate before/after, typed scope |
| `test/y_adversarial.test.ts` | `Y-N01`…`Y-N30`, including Proof-plane non-interference and Work-table write confinement |

## Gates

```text
git diff --check                      clean
pnpm build                            clean
pnpm exec vitest run                  149 files / 1385 tests passed
pnpm run build:web                    ok (203 modules)
pnpm exec playwright test             27 passed
```

## Baseline comparison

| | Baseline `189fcd0` | G10-Y |
| --- | --- | --- |
| Evidence revocation mechanism | raw `UPDATE evidence` after the batch | canonical `EVIDENCE_STALE` inside the batch |
| Crash window | new ProjectIR + active old Evidence | none: old or new world only |
| Gate after revision | could still PASS on revoked Evidence | cannot consume revoked authority |
| Replay fidelity | status restored by repair | status is a pure function of the log |
| Typed subject matching | bare `subject_id` string | exact `(subject_type, subject_id)` |
| Event species added | — | none |
