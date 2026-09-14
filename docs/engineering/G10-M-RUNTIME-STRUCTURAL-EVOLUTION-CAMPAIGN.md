# G10-M Campaign — Runtime Structural Evolution & Retirement

Baseline: `main @ dd38147`. Closes CF-J-03 and CF-J-04 (subject-disambiguated).

## Stage topology (as executed)

```text
M0  Audit + L/J carry-forward disposition
    → audits/G10-M-RUNTIME-STRUCTURAL-EVOLUTION-ASSESSMENT.md
    → audits/G10-M-L-CARRY-FORWARD-DISPOSITION.md

M1  RuntimeScope multi-scope atomic transition primitive
    → src/runtime_scope/store.ts (applyStructuralTransition)

M2  Runtime evolution artifacts + untrusted compiler
    → src/runtime_evolution/{artifacts,index}.ts

M3  Pure deterministic runtime safety assessment
    → src/runtime_evolution/assessment.ts

M4  Runtime structural authority + case continuity
    → src/runtime_evolution/{store,service}.ts

M5  Atomic activation: ENCAPSULATE / COLLAPSE / RETIRE_SCOPE
    → service buildTransition + applyStructuralTransition

M6  Dynamics routing / freshness / post-observation
    → runtimeDispositionFor; candidateSatisfiesSubject; re-read basis guard

M7  Organization retirement lifecycle + guards
    → organization/store.ts (lifecycle/retire/retirements, retired_lineage)
    → institution/store.ts (institutions/currentBodies), institution/service.ts + runtime_scope/service.ts guards
    → organization_evolution/retirement.ts + driveRetirement

M8  Runtime golden E2Es (encapsulate / collapse / retire / restart)
M9  Organization retirement E2Es
M10 Adversarial / concurrency / crash closure + docs + CI
```

## Test matrix

| File | Tests | Focus |
|---|---:|---|
| `test/m_runtime_structural_evolution.test.ts` | 15 | multi-scope atomicity/idempotency/partial-fail-closed, ENCAPSULATE golden + Holon digest preservation, COLLAPSE golden + external/campaign blocks, RETIRE golden + blocks, authority/staleness/concurrency/restart, foreign-store firewall |
| `test/m_organization_retirement.test.ts` | 9 | retirement golden, historical readability, post-retirement enforcement, institution-body/open-scope/unknown-enumeration blocks, stale/denied, institution adoption guard, DISSOLVE subject disambiguation |

Baseline before M: 120 files / 1031 unit tests. After M: **122 files / 1055 unit tests**;
`pnpm build` (tsc -b) and `pnpm build:web` green; local `pnpm test:e2e` 20/21, the single failure
being the documented `E2E-DEBUG-01` flake (confirmed genuine by isolation: identical code passed
then failed).

## CI / merge discipline (corrected from G10-L)

Every gate is read from a real exit status or `gh run view --json conclusion` — never from a
piped `gh run watch … | tail`. **A PR is merged only when its required checks are GREEN.**
Existing flakes are confirmed by isolation/rerun and handled by the documented failed-job rerun;
new failures are treated as real until classified.
