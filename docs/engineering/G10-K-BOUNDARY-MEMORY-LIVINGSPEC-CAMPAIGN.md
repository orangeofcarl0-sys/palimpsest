# G10-K Campaign — Collaborative Boundary Memory & LivingSpec

Baseline: `main @ 67b29c9`. One major stage; closes CF-J-02 (and CF-J-06/CF-J-07); real
leftovers carried into `G10-K-CARRY-FORWARD.md`.

## Stage topology (as executed)

```text
K0  Current-state audit + CF-J-01…09 disposition
    → docs/engineering/audits/G10-K-BOUNDARY-MEMORY-ASSESSMENT.md
    → docs/engineering/audits/G10-K-J-CARRY-FORWARD-DISPOSITION.md

K1  BoundaryWorkspace identity + canonical append-only store
    → src/boundary_memory/ref.ts, store.ts

K2  BoundaryArtifact + CandidateRevision + extensible type registry
    → src/boundary_memory/artifacts.ts (builtin statement/interface/compatibility/blueprint)

K3  Explicit acceptance / rejection + accepted head + stale/superseded
    → src/boundary_memory/service.ts

K4  Workspace projection / change observation / restart
    → workspaceView, pendingCandidates, changesSince, replay

K5  Commitment binding to an exact accepted revision
    → CommitmentScope.boundary_revision + CommitmentScopeGuard (fail closed)

K6  OrganizationBlueprint builtin type (reuses OrganizationDefinition validators)

K7  FORMALIZE_ORGANIZATION closure
    → src/organization_evolution/formalization.ts
    → additive EVOLUTION_FORMALIZATION_COMPILED event + EXECUTABLE_FORMALIZE disposition
    → driveFormalization (authority-gated OrganizationStore genesis)

K8  Palimpsest↔Ordarium golden E2E (propose/counterpropose/accept/commit/revise/restart)

K9  Formalization E2E + stable-federation non-formalization proof

K10 Adversarial review + docs + CI/merge
```

## Test matrix

| File | Tests | Focus |
|---|---:|---|
| `test/k_boundary_memory.test.ts` | 18 | workspace/artifact identity, type registry, acceptance, branching, rejection, restart, corrupt history, commitment binding, blueprint type |
| `test/k_formalization.test.ts` | 8 | genesis golden path, authority denial, invented content, non-formalization, restart linkage |
| `test/k_golden_e2e.test.ts` | 3 | §50 golden E2E + source firewall + candidate-scope unrepresentability |

Baseline before K: 114 files / 981 unit tests. After K: **117 files / 1010 unit tests**,
`pnpm build` (tsc -b) and `pnpm build:web` green. E2E: 19/21 on the first local run, with the two
documented flakes `E2E-DEBUG-01` and `E2E-RUNTIME-03` (reproduced as genuine flakiness: the same
code passes and fails across identical runs).

## CI / merge gates

Per stage: `git diff --check`, targeted tests, `pnpm test`, `pnpm build`, `pnpm build:web`.
Final: `pnpm test:e2e`. Exact final branch HEAD green → normal PR merge → canonical merged main
green. Existing `E2E-DEBUG-01`/`E2E-RUNTIME-03` are handled only by the documented failed-job rerun.
No force/bypass/history rewrite; frozen contracts unedited.
