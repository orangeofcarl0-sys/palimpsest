# SR-1 — Architectural Decomposition & Composition-Root Refactor: delivery

**Baseline:** canonical main `a30a328afbe2850e02151f4e41f32242091abeae` (tree
`83ef6ba115feaae39a4b47c9881ad78fb6df2639`).
**Branch:** `refactor/sr1-architecture`.
**Companion documents:** `MODULE-ARCHITECTURE-BASELINE.md` (generated),
`SR-1-STRUCTURE-AFTER.md`, `APPLICATION-ADAPTER-MATRIX.md`, `SEMANTIC-OWNER-MAP.md`,
`PUBLIC-API-ASSESSMENT.md`, `SR-1-CARRY-FORWARD.md`,
`release-evidence/gate-sr1f-provider-differential.md`.

---

## 0. Verdict

> ## `PALIMPSEST SR-1 ARCHITECTURAL DECOMPOSITION & COMPOSITION-ROOT REFACTOR: PASS`

All four work packages are complete and every closure item is closed. The four monoliths SR-1 was
chartered to decompose are gone:

| file | baseline | after |
| --- | --- | --- |
| `src/install.ts` | 2,476 LOC, fan-out 38 | **336 LOC, fan-out 11** |
| `src/application/surface.ts` | 1,535 LOC, fan-out 44 | **56 LOC, fan-out 9** |
| `src/tools/application_tools.ts` | 1,090 LOC | **10 LOC** (compatibility path) |
| `src/application/http.ts` | 1,126 LOC | **18 LOC** (compatibility path) |

and the composed replacements are cohesive rather than renamed:

```text
src/composition/        9 modules   the composition root
src/application/surfaces/ 8 clusters + factory.ts + common.ts
src/adapters/dsh/      10 modules   24 tools, contract byte-identical
src/adapters/http/     12 modules   127 routes, static typed manifest
```

Nothing semantic changed: the public API is **exact** (missing 0, kind changes 0, added 0), the DSH
catalogue and the HTTP route table match the canonical baseline byte for byte, and the architecture
gate still records **4 concrete forbidden imports and 8 SCCs** — no exception was added to make R3
pass.

---

## 1. What was delivered, by work package

### R0 — dependency baseline and machine-enforced rules

`tools/architecture/{layers,graph,rules,report,public-api,baseline-reasons}.ts` +
`scripts/audit/module-architecture.mjs` (`--write`, `--check`, `--write-public-api`,
`--check-public-api`, `--json`), the committed baselines under `architecture/`, and both checks wired
into `.github/workflows/ci.yml`. The toolchain ships the native `typescript@7.0.2`, whose JavaScript
API no longer exposes `ts.createSourceFile`, so `graph.ts` is a purpose-built module-specifier
extractor with fixture tests and the safety property that a misparse becomes an *unresolved relative
import*, which `--check` fails on.

**R0A** — forbidden-edge exceptions are exact concrete imports, not layer-pair wildcards (baseline
schema v2). Demonstrated by inserting a new `L2→L3` import: the check fails while the four recorded
ones stay accepted.
**R0B** — first-party host JavaScript (`host/**`) is inside the checker as L5.

### R1 — composition root

`src/install.ts` 2,476 → **336 LOC**, fan-out 38 → **11** (§19 target ≤20), capability-family imports
38 → **2** (target ≤8): a 71% reduction in implementation fan-out. The wiring lives in nine
`src/composition/` modules, each with a narrow typed input and no registry, no string-keyed lookup
and no discovery. The public contracts moved to `composition/install_contract.ts` (666 LOC) and are
re-exported, so the export surface is unchanged.

### R2 — application surface, with the public API sealed

`src/application/surface.ts` 1,535 → **56 LOC**, composed by `factory.ts` (237 LOC) from eight
clusters each owning its façade interfaces, its constructor and a dedicated narrow `*SurfaceDeps`
input.

The seal (§2–§4) closed a real leak: the first version of the barrel used `export *`, which published
each cluster's `make*Surfaces` constructor and `*SurfaceDeps` input — 16 symbols a consumer never had
— through `application/index.ts` → `advanced.ts`. The barrel now lists the 33 canonical façade types
explicitly, and `checkPublicApiParity` was tightened from "missing + kind changes" to
**`missing === 0 && changedKind === 0 && added === 0`**. Reproduced live: appending the old wildcard
line to `surface.ts` fails the check with exactly `makeWorkSurfaces` and `WorkSurfaceDeps`.

### R3A — DSH adapters

`src/tools/application_tools.ts` 1,089 → **9 LOC**: it re-exports `defineApplicationTools` from
`src/adapters/dsh/index.ts` (31 LOC), which is a literal array of eight
`...define<Cluster>Tools(application)` spreads in the order a host sees.

The split was generated mechanically and the generator self-checked that it was **lossless** — gaps
plus statements plus trailing whitespace rebuild the original body byte for byte — which caught two
generator bugs before they reached the tree (a value import emitted as `import type`, and a block
comment dropped because the gap was read from the masked source).

`src/adapters/**` is now mapped to **L5** (§14). Probed live: a new `L2 → adapters` import and a new
`L3 → adapters` import both fail the check; `adapters → application` is allowed; no SCC contains an
adapter.

### R3B — HTTP adapters and the static route manifest

`src/application/http.ts` 1,125 → **18 LOC**: the four baseline names and nothing else.
`src/adapters/http/` holds twelve modules; `router.ts` (105 LOC) owns only the ordered manifest and
the dispatch loop and declares no route of its own.

The manifest is the substantive change (§19–§21). Two findings made it necessary:

1. **The old probe inventory had a gap of its own.** `ROUTE_PATHS` was a hand-read census of the
   canonical switchboard; auditing it against the canonical source found exactly one real route it
   had never covered — `/api/external-assets/approve-publish`. It is now in both the fixture and the
   manifest, so no exception had to be invented for it.
2. **Method sets had to be observable.** The fixture now probes GET, POST, PUT, DELETE and PATCH and
   derives each route's accepted methods from the adapter's own method guard. That reading also
   captured a structural fact the manifest now names explicitly: the external-asset bridge and
   `/api/project/journal` resolve their face **before** the method guard, so an installation without
   them answers 501 for every method instead of 400 for the wrong one.

Two descriptors are prefix routes and declare the concrete paths they cover, so the inventory stays
an exact set rather than a pattern. A test proves **no two descriptors can match the same pathname**,
which is why the manifest order cannot decide behaviour — and the order still reproduces the
canonical switchboard's groups so a reviewer diffing them sees no reshuffling.

---

## 2. Gates (§32/§33)

| gate | result |
| --- | --- |
| `git diff --check` | clean |
| `pnpm build` (`tsc -b`) | clean |
| `pnpm architecture:check` | **PASS** — 0 violations; 4 concrete forbidden imports + 8 SCCs observed |
| `pnpm architecture:check-public-api` | **PASS** — missing 0, kind changes 0, added 0 |
| `pnpm exec vitest run --maxWorkers=2` | **green** — 178 files / 2,027 tests |
| `pnpm run build:web` | green |
| `pnpm exec playwright test` | green — 36 passed |
| golden parity (`test/architecture/application_parity.test.ts`) | 23/23 — 128 probes × 5 methods, 24 tools with description + full schema + digest |
| frozen dogfoods needing no provider | green — `uxa-dogfood`, `uxb-two-project-dogfood`, `aer-boundary-dogfood`, `ae-dogfood` all `pass=true`, exit 0 |
| provider-dependent dogfoods (UX-C local, UX-C cross-project) | **fail identically on the canonical control** → environmental, never reported green (§33) |

### The provider differential (§33)

`uxc-dsh-local-dogfood` fails with 4 failures and `uxc-dsh-cross-project-dogfood` with 1, on this
branch **and** on a detached worktree of the exact canonical tree (`a30a328`, tree `83ef6ba`), with
identical failure identities in the same order. The branches start, are offered their one tool, and
end `failed` with no candidate digest — the provider produced no assistant message. Full evidence:
`release-evidence/gate-sr1f-provider-differential.md` and the four `gate-sr1f-*` logs.

This is classified environmental, and it is **not** called green and **not** called a regression.

---

## 3. Refactor provenance (§43)

| old source | new source | semantic owner unchanged? | public API unchanged? | parity proof |
| --- | --- | --- | --- | --- |
| `install.ts` body head | `composition/core.ts` (`composeCore`) | yes — same owners, options, order | yes (two helpers re-exported) | `public-api:check` + full suite |
| `install.ts` five private port adapters | `composition/optional.ts` | yes | n/a (were private) | full suite |
| `install.ts` registration + `dispose()` | `composition/lifecycle.ts` | yes — same order, guards, idempotence | yes | `test/composition/lifecycle_ownership.test.ts` |
| `install.ts` capability wiring | `composition/{governance,collaboration,cognition,organization,application}.ts` | yes — same services constructed from the same options | yes | `public-api:check` + full suite |
| `application/surface.ts` body | `application/surfaces/*` + `factory.ts` + `common.ts` | yes | yes — and the 16 leaked internals were removed | golden parity A10–A15 + `composition_root_rules.test.ts` |
| `tools/application_tools.ts` bodies | `adapters/dsh/*` | yes — same façade calls | yes | golden parity: name, mode, description, full parameter schema, digest |
| `application/http.ts` if-chain | `adapters/http/*` + the static manifest | yes — same façade calls, same dispatch order | yes | golden parity: 128 probes × 5 methods, static + behavioural |

---

## 4. Merge sequence (§35/§51)

**PASS.** Not on local evidence only:

| step | value |
| --- | --- |
| branch | `refactor/sr1-architecture` |
| branch head (stage commit) | `de2d1c143b7aaf28893e2394cd4c8068e062feff` |
| PR | [#119](https://github.com/orangeofcarl0-sys/palimpsest/pull/119) |
| PR CI (attempt 1) | [`35340145324`](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/35340145324) — **success**, `unit` 1m0s + `e2e` 1m13s, no retry |
| merge commit | `74bb14225f70a1bc5a2df197736c599414d46a56` |
| canonical main | `74bb14225f70a1bc5a2df197736c599414d46a56` |
| canonical-main CI (attempt 1) | [`35340339464`](https://github.com/orangeofcarl0-sys/palimpsest/actions/runs/35340339464) — **success**, `unit` + `e2e` |
| **tree identity** | branch head tree `a3f272a27cc2b15552faa5c8910e7800cb816a14` **==** main tree `a3f272a27cc2b15552faa5c8910e7800cb816a14` |

The tree identity is the check that matters: the exact tree CI verified on the branch is the exact
tree canonical main now contains. The merge added no content of its own.
