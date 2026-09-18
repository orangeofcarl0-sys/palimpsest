# SR-1 — structure after the delivered work packages

Measured, not asserted: every number comes from `node scripts/audit/module-architecture.mjs`
(`architecture/module-architecture.json`) and from `git diff` against the baseline
`a30a328` (tree `83ef6ba`).

## 1. What moved

| work package | status | new modules |
| --- | --- | --- |
| **R0** dependency baseline + machine-enforced layer rules | **complete** | `tools/architecture/{layers,graph,rules,report,public-api,baseline-reasons,index}.ts`, `scripts/audit/module-architecture.mjs` |
| **R1** install/composition-root decomposition | **partial** | `src/composition/{core,optional,lifecycle}.ts` |
| **R2** application-surface modularization | **not started** | — |
| **R3** DSH tool + HTTP route modularization | **not started** | — |

## 2. Before / after

| metric | baseline `a30a328` | after R0+R1 | note |
| --- | --- | --- | --- |
| modules under `src/**` | 300 | 303 | +3 composition modules |
| lines of TypeScript | 93,386 | 93,623 | +237 (typed inputs and doc comments) |
| import edges | 1,230 | 1,250 | +20 |
| unresolved relative imports | 0 | 0 | the extractor's self-check |
| forbidden layer edge classes | 1 (4 imports) | 1 (4 imports) | unchanged, still recorded with reasons |
| strongly connected components | 8 | 8 | no new cycle was introduced |
| `src/install.ts` LOC | 2,476 | **2,274** | −202 (−8.2%) |
| `src/install.ts` fan-out | 38 | **41** | **+3 — see §3** |
| `src/install.ts` fan-in | 2 | 2 | unchanged |
| `src/application/surface.ts` | 1,535 LOC, fan-out 44 | unchanged | R2 not started |
| `src/tools/application_tools.ts` | 1,090 LOC, fan-out 8 | unchanged | R3 not started |
| `src/application/http.ts` | 1,126 LOC, fan-out 10 | unchanged | R3 not started |
| `src/tools/controller.ts` | 3,095 LOC, fan-out 27 | unchanged | deliberately not decomposed (§25) |

## 3. The honest reading of the install.ts numbers

`install.ts` is 202 lines shorter and now composes three explicit groups, but its **fan-out went
up**, not down: it imports `composition/core.js`, `composition/optional.js` and
`composition/lifecycle.js` on top of everything it already imported.

The reason is structural and worth stating plainly: the ~40 capability imports in `install.ts`
belong to the *capability wiring blocks* (proof, federation, campaign, organization, runtime,
verification, monitor, management, collaboration, cross-project), and **those blocks are still
in `install.ts`**. Moving the three lowest-coupling pieces reduced the file's size and made its
lifecycle and its two public helpers reviewable, but it did not reduce the composition root's
dependency count.

So R1 does **not** yet meet its own directional metric (§38: "install.ts direct dependency
families materially reduced"), and this document does not claim it does. The remaining work is
mechanical but must be done block by block, because each block's closure captures have to become
explicit typed inputs.

## 4. What R1 did deliver

```text
src/composition/core.ts       107 lines   composeCore(narrowOptions) → the kernel substrate
                                          (repository, git, store, effects, policy, controller,
                                          baseTools) + the two public helpers, re-exported so
                                          the export surface is unchanged
src/composition/optional.ts   214 lines   the five read-only port adapters that adapt an
                                          EXISTING owner's store/service for another capability
src/composition/lifecycle.ts  118 lines   registration + the DISPOSAL ORDER, with every optional
                                          store's ownership named as data
```

* `installPalimpsest(context, options)` keeps its exact signature, its returned shape, its
  absence semantics and its disposal semantics; `public-api:check` proves the export surface is
  unchanged (132 root names, 2,276 advanced names, missing 0, kind changes 0).
* The §14 ownership invariants are now testable without a full installation
  (`test/composition/lifecycle_ownership.test.ts`, 8 tests, including: a monitor stops before any
  store closes; a throwing owned resource is not silently re-closed).
* `src/composition/` is mapped to L5 in the layer map, so the checker treats the composition
  root's modules as host-side wiring.

## 5. What is left, precisely

| remaining | where | why it is the next step |
| --- | --- | --- |
| the capability-wiring middle (~1,000 lines) | `install.ts` lines ~1,040–2,100 | this is where the fan-out lives; extract as `composeProjectCapabilities`, `composeCognitionCapabilities`, `composeGovernanceCapabilities`, `composeCollaborationCapabilities` |
| the application assembly + `hasAdvancedSurface` | `install.ts` ~2,100–2,200 | becomes `composeApplicationSurface(groups)` during R2 |
| surface monolith split (21 façades) | `application/surface.ts` | R2 |
| adapter split (DSH + HTTP) | `tools/application_tools.ts`, `application/http.ts` | R3 |
| golden structural parity fixture (§30) | not created | needs the pre/post comparison to be meaningful; R2/R3 are where parity risk appears |

## 6. Reproducing every number here

```text
pnpm architecture:write            # regenerate architecture/module-architecture.json + baseline doc
pnpm architecture:check            # rules gate
pnpm architecture:write-public-api # capture the export surface
pnpm architecture:check-public-api # SR1-A14 parity gate
pnpm exec vitest run test/architecture test/composition
```
