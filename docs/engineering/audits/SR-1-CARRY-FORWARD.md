# SR-1 — Carry-forward

Status: SR-1 is **PARTIAL** (R0 complete, R1 partial, R2/R3 not started). This document maps what
remains, in the order it should be attempted, and records the structural items SR-1 surfaced but
deliberately did not touch.

---

## 1. Required to reach SR-1 PASS

| id | item | why | evidence it is not done |
| --- | --- | --- | --- |
| **SR1-R1b** | Extract the capability-wiring middle of `install.ts` (~1,000 lines: proof/disclosure, federation + boundary, campaign + institutions, organizations + dynamics + evolution, runtime scopes + evolution, reasoning cells, recipe execution + advisor, attention, verification, external-asset bridge, monitor, project management) into `composeProjectCapabilities` / `composeCognitionCapabilities` / `composeGovernanceCapabilities` / `composeCollaborationCapabilities` | this is where `install.ts`'s ~40 capability imports live; until they move, §38's "direct dependency families materially reduced" cannot be met | `install.ts` fan-out rose 38 → 41 with the delivered R1 slice |
| **SR1-R1c** | Move the application assembly (`makePalimpsestApplicationSurface({...})`) and `hasAdvancedSurface` into `composition/application.ts`, taking the composed groups as an input | ~100 lines of the surface wiring; makes §2's "composition owner" column real | still in `install.ts` |
| **SR1-R2** | Split `src/application/surface.ts` (1,535 lines, fan-out 44) into `src/application/surfaces/<capability>.ts` + `common.ts` + `factory.ts` | the largest single façade monolith; §49 lists "application surface remains monolithic" as PARTIAL | file unchanged |
| **SR1-R3a** | Split `src/tools/application_tools.ts` (1,090 lines) into `src/adapters/dsh/*` behind the unchanged `defineApplicationTools(application)` | the DSH switchboard; every new tool edits the same 1,000-line file | file unchanged |
| **SR1-R3b** | Split `src/application/http.ts` (1,126 lines) into `src/adapters/http/*` behind the unchanged `handleApplicationRequest(input)` | the HTTP switchboard; every new route edits the same file | file unchanged |
| **SR1-N** | Implement the remaining architecture tests: **A03** (install root fan-out reduced — becomes true after R1b), **A04** (application factory composes per-capability surfaces — after R2), **A05/A06** (aggregate entries — trivial now, meaningful after R3), **A07** (adapters do not access semantic stores directly), **A10/A11** (capability absence + application availability parity), **A12/A13** (tool catalogue + HTTP route parity), **A15** (UX-A/UX-B product tool contracts) | §29 | only A01, A02, A08, A09, A14 exist |
| **SR1-G** | The golden structural parity fixture (§30): installed capability keys, application surface keys, DSH tool names + action sets, HTTP route inventory, readiness view, ownership/disposal observations — compared before/after | it becomes the safety net for R2/R3 | not created |
| **SR1-CR** | The three change-radius examples (§39): a new CrossProject read action, a new Verification read view, a new ProjectWorkspace read endpoint, with the expected file set after the refactor | §38/§39 | not written |

## 2. Structural findings SR-1 surfaced (candidates for a later stage)

| id | finding | where it is recorded |
| --- | --- | --- |
| **SR-2 candidate** | the cross-layer cycle `canvas/derive ↔ tools/controller ↔ tools/graph`: the projection depends on the owner *and* the owner depends on the projection. Unwinding it means deciding which direction is canonical. | `architecture/module-architecture.json` → `cycles`; `baseline-reasons.ts` |
| **SR-2 candidate** | the four `L2 → L3` upward edges (monitor → operating posture; workspace view + controller → graph projection) | same |
| **SR-2 candidate** | `tools/controller.ts` at 3,095 lines / fan-out 27 stays deliberately untouched (§25) and is the single largest module in the repository | `MODULE-ARCHITECTURE-BASELINE.md` §3 |
| **SR-3** | public API cleanup: the root entry's historical "P0 contract core" doc block, the embedding doubles (`FakeGitPort`, `MockExecutor`) shipped in the product surface, `definePalimpsestTools` superseded by `defineApplicationTools`, and splitting `advanced` into named subpath exports | `PUBLIC-API-ASSESSMENT.md` §2.4/§3 |
| **SR-4** | test layout: 175 flat `test/*.test.ts` files with historical campaign prefixes (`g10*`, `aa*`, `ux*`, `rc*`); SR-1 added `test/architecture/` and `test/composition/` for new work and moved nothing | `SR-1-DELIVERY.md`; §28 |

## 3. Process notes worth keeping

1. **The extractor decision.** The `typescript@7.0.2` toolchain is the native compiler and no
   longer exposes the JS `createSourceFile` API, so R0 uses a purpose-built, fixture-tested
   specifier extractor rather than adding a dependency-analysis framework. Its safety property is
   worth reusing: a misparse becomes an *unresolved import*, and `--check` fails on those, so the
   graph cannot silently shrink.
2. **The checker's shape.** `explicit exceptions + no-new-violations`, with each exception
   carrying a written reason in code (`baseline-reasons.ts`) so `--write` is deterministic and a
   reason change shows up in review. No wildcards; a NEW cycle of any size fails, not only a
   cross-layer one.
3. **What a partial refactor costs.** Splitting the low-coupling pieces first *increased*
   `install.ts`'s fan-out. The lesson for R1b/R2/R3: extract by dependency *weight*, not by
   convenience, and re-measure after each block.

## 4. Product backlog is untouched

Per §47 the product items stay separate and untouched by SR-1: `CF-UXA-04` (semantic/model-backed
task profiler), `CF-UXB-04` (fuzzy project resolver), OS daemon/autostart, budget presets,
finding-specific verification, branch-artifact retention, PIAS.
