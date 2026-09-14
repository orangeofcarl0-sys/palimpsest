# G10-N Campaign — Collaborative Reasoning Cells & Epistemic Admission

Baseline: `main @ c08f960`. One major stage; closes the M carry-forward disposition; real leftovers
carried into `G10-N-CARRY-FORWARD.md`.

## Stage topology (as executed)

```text
N0  Audit: Evidence ownership (none), verification/admission boundary, store identity, M disposition
    → audits/G10-N-COLLABORATIVE-REASONING-ASSESSMENT.md
    → audits/G10-N-M-CARRY-FORWARD-DISPOSITION.md

N1  ReasoningCell identity + canonical store + lifecycle
    → src/reasoning_cell/{ref,store}.ts

N2  Claim type registry + accepted claim DAG (content-addressed claim identity)
    → src/reasoning_cell/claims.ts

N3  Branch + FrontierBasis + frozen BranchBrief (blind-until-commit)
N4  Candidate submission + duplicate-claim convergence
N5  Verification + separate epistemic admission (basis-bound, atomic)
N6  Invalidation + derived dependency cascade
N7  installed.reasoningCells + admin/branch views
    → src/reasoning_cell/{artifacts,service,index}.ts + install/advanced wiring

N8  Danus-like golden E2E (parallel branches, dedupe, unresolved, composability, cascade, restart)
N9  verification ≠ admission + blind-until-commit + negative knowledge
N10 Adversarial / failure-mode / crash closure + docs + CI
```

## Test matrix

| File | Tests | Focus |
|---|---:|---|
| `test/n_reasoning_cell.test.ts` | 14 | Danus-like golden E2E (parallel branches, same-semantic-claim dedupe, unresolved, composable dependency, invalidation cascade, restart), verification ≠ admission, blind-until-commit, negative/dead-end knowledge, unknown type / malformed content, dependency rules, operational-error handling, stale-frontier zero-write, cell closure, attribution ≠ identity, corrupted history, foreign-truth source firewall |

Baseline before N: 122 files / 1055 unit tests. After N: **123 files / 1069 unit tests**;
`pnpm build` (tsc -b) and `pnpm build:web` green.

## CI / merge discipline

Every gate is read from a real exit status or `gh run view --json conclusion`; **required checks must
be GREEN before merge.** Existing browser flakes (`E2E-DEBUG-01`, `E2E-RUNTIME-03`) are confirmed by
isolation and handled only by the documented failed-job rerun; new failures are treated as real until
classified.
