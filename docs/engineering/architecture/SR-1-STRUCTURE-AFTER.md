# SR-1 — structure after SR-1 (final)

Measured, not asserted. Every number comes from `node scripts/audit/module-architecture.mjs`
(`architecture/module-architecture.json`) and from `git diff` against the canonical baseline
`a30a328` (tree `83ef6ba`). *Baseline* = the canonical tree; *after* = this branch.

## 1. Work packages

| work package | status | where |
| --- | --- | --- |
| **R0** dependency baseline + machine-enforced layer rules | **complete** | `tools/architecture/{layers,graph,rules,report,public-api,baseline-reasons}.ts`, `scripts/audit/module-architecture.mjs` |
| **R0A** forbidden-edge exceptions are exact concrete imports (§4–§7) | **complete** | baseline schema v2 |
| **R0B** first-party host JavaScript inside the checker (§8–§10) | **complete** | `listSourceFiles` scans `src/**/*.ts` + `host/**/*.js`, host is L5 |
| **R1** install/composition-root decomposition (§11–§19) | **complete** | `src/composition/` (9 modules) |
| **R2** application-surface modularization (§22) | **complete** | `src/application/{factory,common}.ts` + `src/application/surfaces/` (8 clusters) |
| **R2 seal** the public API is exact, additions rejected (§2–§4) | **complete** | explicit re-exports in `surface.ts`; `checkPublicApiParity` requires `added === 0` |
| **R3A** DSH adapter modularization (§9–§16) | **complete** | `src/adapters/dsh/` (10 modules) |
| **R3B** HTTP adapter modularization + static route manifest (§17–§24) | **complete** | `src/adapters/http/` (12 modules) |
| **§21** golden structural parity fixture | **complete** | `test/fixtures/sr1/application-parity.json` + `test/architecture/application_parity.test.ts` |
| **§31** change radius | **complete** | `test/architecture/change_radius.test.ts` |

## 2. Before / after

| metric | baseline | after | note |
| --- | --- | --- | --- |
| modules | 300 (`src/**`) | **341** (`src/**`) / 344 total | +22 adapters, +9 composition, +8 surface clusters, −4 removed monoliths |
| first-party host modules covered | 0 | **3** | `host/dsh/lib/{index,runner,startup}.js`, all L5 |
| lines of TypeScript | 93,386 | **96,184** | +3% (typed cluster inputs, the route manifest, doc comments) |
| import edges | 1,230 | **1,436** | +206 |
| unresolved relative imports | 0 | **0** | the extractor's self-check |
| **concrete forbidden imports** | 4 | **4** | unchanged, each recorded per edge — no exception was added to make R3 pass |
| **strongly connected components** | 8 | **8** | no new cycle, and none contains an adapter |
| `src/install.ts` | 2,476 LOC, fan-out 38 | **336 LOC, fan-out 11** | capability-family imports 38 → **2** |
| `src/application/surface.ts` | 1,535 LOC, fan-out 44 | **56 LOC, fan-out 9** | was 20 LOC after R2; +36 to publish the 33 canonical façade types explicitly |
| `src/application/factory.ts` | — | **237 LOC, fan-out 34** | owns the aggregate interface and composes 8 clusters |
| `src/tools/application_tools.ts` | 1,090 LOC, fan-out 8 | **10 LOC, fan-out 1** | the compatibility path (§10) |
| `src/adapters/dsh/index.ts` | — | **31 LOC, fan-out 10** | the aggregate; declares no tool |
| `src/application/http.ts` | 1,126 LOC, fan-out 10 | **18 LOC, fan-out 2** | the compatibility path (§18) |
| `src/adapters/http/router.ts` | — | **105 LOC, fan-out 11** | the aggregate; declares no route |
| `src/tools/controller.ts` | 3,095 LOC, fan-out 27 | unchanged | deliberately untouched (§25) |

§19's directional targets are met on both counts: install fan-out 38 → 11 (≤20) and
capability-family imports 38 → 2 (≤8) — a 71% reduction in implementation fan-out (target ≥50%).

## 3. The four decomposed surfaces

### 3.1 Composition root

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

### 3.2 Application surface (R2)

```text
src/application/surface.ts     56  compatibility barrel: the aggregate types, the factory, and the
                                   33 canonical façade types — explicit, never `export *`
src/application/factory.ts    237  owns PalimpsestApplicationSurface + ApplicationSurfaceDeps,
                                   composes the eight clusters
src/application/common.ts      43  the four shared pure helpers
src/application/surfaces/
  work 41   projections 94   product 121   proof 153
  organization 185   federation 189   cognition 239   project 347
```

Each cluster owns its façade interfaces **and** its constructor, and takes a dedicated narrow
`*SurfaceDeps` input: it cannot see a capability it does not read, and it never receives the
aggregate. `test/architecture/composition_root_rules.test.ts` asserts both halves — only the
factory calls a constructor, and the barrel's cluster imports are type-only.

### 3.3 DSH adapters (R3A)

```text
src/tools/application_tools.ts  10  compatibility path: re-exports defineApplicationTools
src/adapters/dsh/
  index 31   graph 34   work 52   common 87   organization 106
  proof 135   federation 139   product 148   cognition 183   project 317
```

The aggregate is a literal array of eight `...define<Cluster>Tools(application)` spreads, in the
order a host sees. 24 tools, byte-identical contracts.

### 3.4 HTTP adapters (R3B)

```text
src/application/http.ts    18  compatibility path: the four baseline names, and nothing else
src/adapters/http/
  router 105   projections 56   work 57   management 89   common 190
  product 121   organization 164   federation 206   external_assets 213
  proof 234   cognition 305   project 369
```

`APPLICATION_ROUTE_MANIFEST` is a static array of ten cluster manifests; `applicationRouteInventory()`
expands it into 127 path/method/face rows. Two descriptors are prefix routes and declare the
concrete paths they cover, so the inventory is an exact set rather than a pattern. The router
holds no route of its own — a test asserts it contains no concrete `/api/<a>/<b>` string.

## 4. Change radius (§31) — the point of the whole exercise

Machine-checked in `test/architecture/change_radius.test.ts`: for each of the three representative
changes, the test asserts which files the change lands in **and** that `install.ts`, the `surface.ts`
barrel and both aggregates do not mention it.

### 4.1 A new CrossProject read action

| layer | file |
| --- | --- |
| semantic owner | `src/interaction/cross_project.ts` |
| application cluster | `src/application/surfaces/product.ts` |
| DSH cluster | `src/adapters/dsh/product.ts` |
| HTTP cluster | `src/adapters/http/product.ts` |
| tests | `test/architecture/change_radius.test.ts` + the product suite |

**Not touched:** `src/install.ts`, `src/application/surface.ts`, `src/adapters/dsh/index.ts`,
`src/adapters/http/router.ts`.

### 4.2 A new Verification read view

`src/project_verification/*` (owner) → `src/application/surfaces/project.ts` →
`src/adapters/dsh/project.ts` + `src/adapters/http/project.ts`. Same four files untouched.

### 4.3 A new ProjectWorkspace endpoint

`src/project_workspace/*` (owner) → `src/application/surfaces/project.ts` →
`src/adapters/dsh/project.ts` + `src/adapters/http/project.ts`. Same four files untouched. The
composition root is not in the path at all: a read endpoint changes no wiring.

**The honest reading.** Before SR-1, each of these touched `src/install.ts` (2,476 lines of
capability wiring) *and* a 1,500-line façade monolith *and* a 1,100-line adapter switchboard. Now
each touches one file per layer, and adding a route or a tool to an existing cluster does not edit
either switchboard at all — that is what the change-radius test proves rather than asserts.

## 5. What SR-1 did NOT change

```text
install fan-out residual      `src/install.ts` still imports three non-composition modules
                              (`experiment`, `interaction`, `tools/dsh_types`) for contract types.
                              Pinned, not removed: removing them would change public types.
the 4 historical L2→L3 imports  recorded as exact concrete edges; unchanged
the 8 historical cycles        recorded by exact file set; unchanged, no adapter among them
ProjectController (3,095)      deliberately untouched (§25)
the public API                 byte-identical: missing 0, kind changes 0, added 0
```

## 6. Reproducing every number

```text
pnpm build
pnpm architecture:write              # regenerate architecture/module-architecture.json + baseline doc
pnpm architecture:check              # rules gate (exact concrete edges)
pnpm architecture:write-public-api   # capture the export surface
pnpm architecture:check-public-api   # SR1-A14 parity gate: exact, additions rejected
node scripts/audit/application-parity.mjs --tree <canonical baseline> --write   # §21 fixture
pnpm exec vitest run test/architecture
```
