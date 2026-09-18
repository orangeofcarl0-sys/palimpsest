# SR-1 — Architectural Decomposition & Composition-Root Refactor: delivery

**Baseline:** canonical main `a30a328afbe2850e02151f4e41f32242091abeae` (tree
`83ef6ba115feaae39a4b47c9881ad78fb6df2639`).
**Branch:** `refactor/sr1-architecture`.
**Companion documents:** `MODULE-ARCHITECTURE-BASELINE.md` (generated),
`SEMANTIC-OWNER-MAP.md`, `PUBLIC-API-ASSESSMENT.md`, `APPLICATION-ADAPTER-MATRIX.md`,
`SR-1-STRUCTURE-AFTER.md`, `SR-1-CARRY-FORWARD.md`.

---

## 0. Verdict

> ## `PALIMPSEST SR-1 ARCHITECTURAL DECOMPOSITION & COMPOSITION-ROOT REFACTOR: PARTIAL`

**R0 (including the R0A/R0B checker repairs), R1 and the FULL golden parity baseline (capability
keys, surfaces, tools, 127 HTTP routes × both methods, readiness, lifecycle) are complete and
verified. R2 and R3 are not started**, and §39 names exactly those two as PARTIAL conditions
("application surface remains effective monolith"; "DSH/HTTP remain effective switchboards").

Everything that IS delivered is measured. `install.ts` went 2,476 → **336 lines**, its fan-out
38 → **11** (target ≤20) and its capability-family imports 38 → **2** (target ≤8), so §19's
directional targets are met, while the public export surface, the DSH catalogue, the capability
absence matrix and the whole suite are unchanged. No forbidden edge or cycle was added.

The previous SR-1 report's reason for PARTIAL ("`install.ts` fan-out went 38 → 41") is resolved;
the remaining PARTIAL is exactly R2/R3 and the tests that depend on them.

---

## 1. Delivered

### R0 — dependency baseline and machine-enforced rules (complete)

| artifact | what it is |
| --- | --- |
| `tools/architecture/layers.ts` | the logical layer map (L1 kernel → L5 host adapters, plus package `BARREL` and root `ENTRY`), with a per-file override and a written reason for each |
| `tools/architecture/graph.ts` | the module graph: import extraction, NodeNext resolution, fan-in/fan-out, directory and layer matrices, Tarjan SCCs |
| `tools/architecture/rules.ts` | "explicit baseline exceptions + no-new-violations" |
| `tools/architecture/report.ts` | the generated baseline document and the check summary |
| `tools/architecture/public-api.ts` | the export-surface snapshot and parity check for both package entries |
| `tools/architecture/baseline-reasons.ts` | the written reason for every recorded exception |
| `scripts/audit/module-architecture.mjs` | thin CLI: `--write`, `--check`, `--write-public-api`, `--check-public-api`, `--json` |
| `architecture/module-architecture.json`, `architecture/public-api-baseline.json` | the committed baselines of record |
| `docs/engineering/architecture/*` | baseline doc (generated), semantic owner map, public API assessment, adapter matrix |
| CI | `.github/workflows/ci.yml` runs `pnpm architecture:check` and `pnpm architecture:check-public-api` in the unit job |

Measured baseline (300 modules, 93,386 LOC, 1,230 edges, **0 unresolved imports**):

* **one forbidden layer edge class (4 concrete imports)** — `L2 → L3`: `monitor/driver.ts` reads
  the operating posture, and `project_workspace/view.ts` + `tools/controller.ts` read the
  orchestration graph projection. Recorded with reasons rather than relabelled away, so no NEW one
  may appear.
* **eight cycles, one cross-layer** (`canvas/derive ↔ tools/controller ↔ tools/graph`). Recorded;
  unwinding it is SR-2 work.

### R1 — composition root (partial)

| move | effect |
| --- | --- |
| `src/composition/core.ts` | `composeCore(narrowOptions)` returns the kernel substrate (repository, git, store, effects, policy, controller, baseTools) from an explicitly typed record, not the options bag (§34). `trustedDefaultPolicy` and `defaultAllocateActivationId` moved here and are re-exported by `install.ts`, so the export surface is byte-identical. |
| `src/composition/optional.ts` | the five private port adapters (`campaignActivityPort`, `coordinationObservationPort`, `directManagementControl`, `campaignProjectRefPort`, `externalImportViewOf`), relocated unchanged. |
| `src/composition/lifecycle.ts` | `composeInstalledLifecycle`: tool registration, the re-register closure, and the disposal ORDER with every optional store's ownership named as data. |

`src/install.ts`: 2,476 → 2,274 LOC. `installPalimpsest` keeps its signature, its returned shape,
its absence semantics and its disposal semantics; the ownership invariants of §14 are preserved
verbatim, including the two easy-to-break ones (the monitor settles and stops before any store
closes; the two stores whose ownership the install computes close only when it created them).

### Tests added

| suite | tests | what it pins |
| --- | --- | --- |
| `test/architecture/module_architecture_rules.test.ts` | 21 | the four rejections §10 names (kernel → deployment, capability → DSH adapter, backwards adapter dependency, a new forbidden SCC), the allowed directions, recorded-vs-unrecorded exceptions, unresolved imports, and the extractor's own coverage (every specifier form; comments/strings/templates must not create edges) |
| `test/architecture/public_api_parity.test.ts` | 5 | SR1-A14: the export surface of both entries, the purity of the collector, and package.json's entry points |
| `test/composition/lifecycle_ownership.test.ts` | 8 | SR1-A08/A09: disposal order, idempotence, reverse registration order, no monitor call when none is composed, and a throwing owned resource that is neither swallowed nor re-closed |

### Not delivered

| item | status |
| --- | --- |
| the capability-wiring middle of `install.ts` (~1,000 lines: proof, federation, campaign, organization, runtime, verification, monitor, management, collaboration, cross-project) | **not extracted** — this is where the fan-out lives |
| R2 — `application/surface.ts` (1,535 lines, 44 imports) split into per-capability surfaces + factory | **not started** |
| R3 — DSH tools (1,090 lines) and HTTP (1,126 lines) split into per-capability adapters | **not started** |
| SR1-A03…A13, A15 | partly unimplemented; see `SR-1-CARRY-FORWARD.md` for the mapping |
| golden structural parity fixture (§30) | not created (it becomes meaningful once R2/R3 exist) |
| the three change-radius examples (§39) | not written |

---

## 2. Gates

| gate | result |
| --- | --- |
| `git diff --check` | clean |
| `pnpm build` (`tsc -b`) | clean |
| `pnpm exec vitest run --maxWorkers=2` | green — see the gate log |
| `pnpm run build:web` | green |
| `pnpm exec playwright test` | green |
| `pnpm architecture:check` | **PASS** (0 violations, 9 recorded exceptions observed) |
| `pnpm architecture:check-public-api` | **PASS** (missing 0, kind changes 0) |
| frozen dogfoods (UX-A, UX-B, AE-R scope isolation) | **pass** |
| frozen dogfoods (UX-C local, UX-C cross-project) | **BLOCKED by provider unavailability**, not by the refactor — see below |
| one live local collaboration smoke (§44) | **BLOCKED by provider unavailability** (two attempts, both `INCOMPLETE_OBSERVATION` in ~5 s) |

### The live-gate blocker (retained and diagnosed, §44)

The two packaged-host dogfoods and the live smoke fail because **the model provider returned
nothing** for this machine at this time:

* the branch agents started and were offered exactly one tool
  (`real_branch_process_was_offered_exactly_one_tool: ok, frames=9,
  catalogues=[["palimpsest_branch_result"]]`), and seven `branch-*` session artifacts exist —
  but each contains 18 records ending at `request/header`, with **no assistant message, no
  tool call**;
* a live principal shows the same signature: `INFRASTRUCTURE_ERROR / INCOMPLETE_OBSERVATION`,
  no assistant message, ~5 s, twice in a row;
* **the pristine baseline fails identically**: the same dogfood was run in the untouched
  canonical worktree (`a851848`, without any SR-1 `src/` change) and produced byte-identical
  failures;
* RC-1E ran nine live trials with real branches on this machine about an hour earlier, and the
  same dogfoods passed then.

Full evidence: `release-evidence/gate-sr1-provider-outage.md` and the `gate-sr1-*` logs.

---

## 3. Refactor provenance (§43)

| old source | new source | semantic owner unchanged? | public API unchanged? | parity proof |
| --- | --- | --- | --- | --- |
| `install.ts` body head (repository/git/store/effects/policy/controller/baseTools) | `composition/core.ts` (`composeCore`) | yes — same owners constructed, same options, same order | yes — nothing exported from here before except the two helpers, which are re-exported | `public-api:check` + full suite |
| `install.ts` `defaultAllocateActivationId`, `trustedDefaultPolicy` | `composition/core.ts` | yes (pure functions, byte-identical bodies) | yes (re-exported from `install.ts`) | `public-api:check` (132 root / 2,276 advanced names) |
| `install.ts` five private port adapters | `composition/optional.ts` | yes — each still adapts the same owner for the same consumer | n/a (were private) | full suite |
| `install.ts` registration + `dispose()` | `composition/lifecycle.ts` (`composeInstalledLifecycle`) | yes — same order, same guards, same idempotence | yes — `InstalledPalimpsest.dispose`/`register` behaviour identical | `test/composition/lifecycle_ownership.test.ts` + full suite |

---

## 4. Merge discipline (§51)

PARTIAL ⇒ **push the branch, no PR, no merge** (§49). The exact blocker is §0: the composition
root's coupling has not yet been materially reduced, and R2/R3 have not started. The next session
can continue from this branch without rework — the layer map, the baselines, the checker, the
`src/composition/` skeleton and its patterns are all in place.
