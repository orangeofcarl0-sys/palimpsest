# SR-1 — structure after SR-1C

Measured, not asserted. Every number comes from `node scripts/audit/module-architecture.mjs`
(`architecture/module-architecture.json`) and from `git diff` against the baseline
`a30a328` (tree `83ef6ba`). Baseline column = the canonical tree; After = this branch.

## 1. Work packages

| work package | status | where |
| --- | --- | --- |
| **R0** dependency baseline + machine-enforced layer rules | **complete** | `tools/architecture/{layers,graph,rules,report,public-api,baseline-reasons}.ts`, `scripts/audit/module-architecture.mjs` |
| **R0A** forbidden-edge exceptions are exact concrete imports (§4-§7) | **complete** | baseline schema v2 |
| **R0B** first-party host JavaScript inside the checker (§8-§10) | **complete** | `listSourceFiles` scans `src/**/*.ts` + `host/**/*.js`, host is L5 |
| **R1** install/composition-root decomposition (§11-§19) | **complete** | `src/composition/` (9 modules) |
| **R2** application-surface modularization (§22) | **not started** | `src/application/surface.ts` unchanged |
| **R3A/R3B** DSH + HTTP adapter modularization (§23/§24) | **not started** | the two adapter files unchanged |
| **§21** golden structural parity fixture | **complete** | `test/fixtures/sr1/application-parity.json` + `test/architecture/application_parity.test.ts` |

## 2. Before / after

| metric | baseline | after | note |
| --- | --- | --- | --- |
| modules under `src/**` | 300 | 309 | +9 composition modules |
| **first-party host modules covered** | 0 | **3** | `host/dsh/lib/{index,runner,startup}.js`, all L5 |
| lines of TypeScript | 93,386 | 94,830 | +1.4% (typed cluster inputs + doc comments) |
| import edges | 1,230 | 1,317 | +87 |
| unresolved relative imports | 0 | **0** | the extractor's self-check |
| **concrete forbidden imports** | 4 | **4** | unchanged, each recorded individually |
| **strongly connected components** | 8 | **8** | no new cycle |
| `src/install.ts` LOC | 2,476 | **336** | **−86%** |
| `src/install.ts` fan-out | 38 | **11** | target ≤20 |
| `src/install.ts` capability-family imports | 38 | **2** | target ≤8 (`experiment`, `interaction`) |
| `src/application/surface.ts` | 1,535 / fan-out 44 | unchanged | R2 outstanding |
| `src/tools/application_tools.ts` | 1,090 / fan-out 8 | unchanged | R3 outstanding |
| `src/application/http.ts` | 1,126 / fan-out 10 | unchanged | R3 outstanding |
| `src/tools/controller.ts` | 3,095 / fan-out 27 | unchanged | deliberately untouched (§25) |

§19's directional targets are met on both counts: fan-out 38 → 11 (≤20) and capability-family
imports 38 → 2 (≤8), i.e. a 71% reduction in implementation fan-out (target ≥50%).

## 3. The composition root now

```text
src/install.ts                336 lines   calls eight compose*() functions and returns the result
src/composition/
  install_contract.ts         666  the PUBLIC CONTRACTS (options + Installed* surfaces), re-exported
  governance.ts               553  operating posture, verification runtime, external-asset bridge,
                                   monitor + delivery marks, project management
  collaboration.ts            436  proof/disclosure, runtime carrier, boundary memory, federation,
                                   campaign + institution epoch source
  cognition.ts                342  evidence extraction, organization memory, recipes, profiler,
                                   live verification probe, advisor, recipe execution, attention,
                                   project workspace
  organization.ts             257  organization/institution, runtime scopes + Holons, dynamics,
                                   both evolution planes, reasoning cells
  application.ts              ~125 aggregate surface assembly + tool set + hasAdvancedSurface
  optional.ts                 214  the five read-only port adapters
  lifecycle.ts                135  registration + the disposal ORDER with ownership categories
  core.ts                     107  the kernel substrate
```

Every cluster: a narrow `Pick`-based input (§16), a narrow typed output, no registry, no
string-keyed lookup, no discovery, no policy of its own. Grouping followed **dependency
evidence**, not the sketch in §15 — the organization and cognition groups would have needed a
lazy cross-reference to stay separate, and one cluster covers what §15 splits between
"governance" and "project" because they share their option surface.

## 4. Change radius (§32) — the point of the whole exercise

Three concrete future changes, with the files each one now touches:

### 4.1 A new CrossProject read action (`palimpsest_cross_project` gains `summarise`)

| before | after |
| --- | --- |
| `src/interaction/cross_project.ts` (semantic owner) | `src/interaction/cross_project.ts` |
| `src/application/surface.ts` — the 1,535-line façade monolith | → **unchanged** (the face is already exposed; only the new verb's shape is added where it belongs) |
| `src/tools/application_tools.ts` — the 1,090-line switchboard, action enum + validation + wiring | `src/tools/application_tools.ts` (action enum + one branch) — **R3 would shrink this to `src/adapters/dsh/cross_project.ts`** |
| `src/application/http.ts` if a route is needed | same |
| tests | tests |

### 4.2 A new Verification read view

`src/project_verification/*` (owner) + `src/application/surface.ts` (the face) + `http.ts` (route).
After R2 the middle column becomes `src/application/surfaces/verification.ts`.

### 4.3 A new ProjectWorkspace read endpoint

`src/project_workspace/*` (owner) + `src/composition/cognition.ts` **only if the wiring changes**
(a read endpoint does not) + `application/http.ts` (route) + `tools/application_tools.ts` (tool).

**The honest reading:** the composition root is no longer in the change path for any of the three
— that was R1's goal and it is achieved. The *façade* and the *adapter* layers still are, because
R2 and R3 have not been done. Before SR-1C, changes 4.1–4.3 would each have touched
`src/install.ts` (2,476 lines of capability wiring) as well; now they cannot.

## 5. Reproducing every number

```text
pnpm architecture:write              # regenerate architecture/module-architecture.json + baseline doc
pnpm architecture:check              # rules gate (exact concrete edges)
pnpm architecture:write-public-api   # capture the export surface
pnpm architecture:check-public-api   # SR1-A14 parity gate
node scripts/audit/application-parity.mjs --tree <baseline> --write   # §21 fixture (baseline only)
pnpm exec vitest run test/architecture test/composition
```
