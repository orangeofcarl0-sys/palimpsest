# SR-1 — Carry-forward

Status: **PASS** — R0 (with the R0A/R0B repairs), R1, the §21 parity baseline, R2 (with the
public-API seal), R3A and R3B are complete and verified, every closure item A03–A15 is closed, and
the branch completed PR/canonical-main CI closure (§35).

```text
branch head   de2d1c143b7aaf28893e2394cd4c8068e062feff
PR            #119          CI attempt 1  35340145324  success
merge         74bb14225f70a1bc5a2df197736c599414d46a56
canonical main 74bb14225f70a1bc5a2df197736c599414d46a56
main CI       attempt 1    35340339464  success
tree identity a3f272a27cc2b15552faa5c8910e7800cb816a14  (branch head == main)
```

**No unfinished R2/R3 item remains.** What is listed below is either deliberately out of scope or a
later campaign.

---

## 1. Required to reach SR-1 PASS — all closed

| id | item | status |
| --- | --- | --- |
| **R2** | split `src/application/surface.ts` (1,535 / fan-out 44) into 8 cluster modules + `factory.ts` + `common.ts` | **done** — 56 LOC compatibility barrel, fan-out 9 |
| **R2 seal** | the 16 internal `*SurfaceDeps` / `make*Surfaces` symbols `export *` leaked into `advanced` are removed, and public-API parity now rejects additions | **done** — missing 0 / kind changes 0 / added 0; the leak is reproduced by appending one wildcard line and caught |
| **R3A** | split `src/tools/application_tools.ts` (1,090) into `src/adapters/dsh/*` behind the unchanged `defineApplicationTools(application)` | **done** — 10 LOC compatibility path; 8 clusters + a 31-line aggregate |
| **R3B** | split `src/application/http.ts` (1,126) into `src/adapters/http/*` behind the unchanged four baseline names, with a static typed route manifest | **done** — 18 LOC compatibility path; 12 modules, `router.ts` 105 LOC |
| **A03** | install root fan-out ≤20 and ≤8 direct L2/L3 family imports | **closed** — measured 11 and 2, asserted in `composition_root_rules.test.ts` |
| **A04** | the application factory composes per-capability clusters with narrow inputs | **closed** — only the factory calls a constructor; the barrel's cluster imports are type-only; each cluster declares its own `*SurfaceDeps` and never takes the aggregate |
| **A05/A06** | the aggregate DSH / HTTP entries are preserved | **closed** — both compatibility paths and both aggregates are asserted to reach the *same* function object |
| **A07** | adapters avoid direct semantic-store access | **closed** — every below-façade import is pinned symbol by symbol with a store/service-shaped-name guard, for both adapter trees |
| **A13** | HTTP route parity, static **and** behavioural | **closed** — the static manifest equals the canonical path/method set exactly (127 routes), and the behavioural probe matches over 128 probes × 5 methods |
| **§8** | the golden fixture pins each tool's description and full parameter schema, not just its action enum | **done** — plus a digest and four mutation regressions |
| **§30/§13** | readiness fields and lifecycle observations in the parity fixture | **done in SR-1D** — 9 readiness keys + a computed dispose-idempotence observation; closure ORDER stays pinned by `test/composition/lifecycle_ownership.test.ts` |
| **§31** | the change radius | **closed** — `test/architecture/change_radius.test.ts` asserts both the files a change lands in and the four files it must not touch |

## 2. Findings SR-1 produced along the way

1. **A layer-pair exception is not an exception.** Recording `L2→L3` would have let the four
   historical upward imports grow without the check noticing. Concrete edges only — now enforced and
   demonstrated with a live probe.
2. **Host JavaScript was outside the checker.** `host/**` is now scanned as L5.
3. **Cutting a body does not prune an import.** After two cluster extractions the root had lost 60%
   of its lines and none of its fan-out; the step that met §19 was pruning by *identifier usage*.
4. **A dropped optional face looks like "absent by configuration".** One mechanical rename rewrote
   shorthand KEYS in the surface literal, silently removing the `collaboration` and `crossProject`
   faces; 55 tests failed. A refactor that moves optional wiring must be verified by the suite.
5. **`export *` is a public-API decision.** Splitting a file into clusters and re-exporting them with
   a wildcard published every cluster's constructor and narrow deps input to consumers. Parity had to
   start rejecting *additions*, not just omissions, for the leak to be visible.
6. **A golden inventory can have gaps of its own.** The 127-route probe list was a hand-read census;
   auditing it against the canonical source found one real route
   (`/api/external-assets/approve-publish`) it had never covered. The static manifest exists so the
   inventory is complete going forward rather than one exception at a time.
7. **A digest alone is not a diagnosis.** The DSH contract digest is reported next to both parameter
   schemas, because "the digest changed" tells a reviewer nothing about what to fix.
8. **A mutation test can be wrong.** P9 of the tool-contract regressions targeted a property that did
   not exist, changed nothing, and failed — which is evidence the digest is taken over the mutated
   schema rather than being a constant.
9. **The checker is not live until `dist` is rebuilt.** After adding `adapters: "L5"` to the layer
   map, `architecture:check` passed — because the CLI reads `dist/`, and the change was not compiled
   yet. The adapters were still classified `BARREL`. The probe that proved the rule *load-bearing* (a
   new `L2→adapters` import failing, and an `L3→adapters` import too) is what made this visible; the
   passing check alone was not.
10. **The provider outage is environmental, with a control.** Both UX-C dogfoods fail with identical
    failure sets on this branch and on the exact canonical tree
    (`release-evidence/gate-sr1f-provider-differential.md`). Per §33 it is neither green nor a
    regression.

## 3. Deliberately untouched

```text
the canvas/derive ↔ tools/controller ↔ tools/graph cross-layer cycle   (recorded as an exception)
the four historical L2→L3 imports                                     (recorded per concrete edge)
the 8 historical SCCs                                                  (recorded by exact file set)
ProjectController (3,095 lines, fan-out 27)                            (SR-2 candidate)
the historical G10 barrel structure in src/index.ts / src/advanced.ts  (SR-3 candidate)
the three residual non-composition imports in install.ts               (contract/vocabulary types)
```

No exception was added to make R3 pass: the counts are still 4 concrete forbidden imports and 8 SCCs.

## 4. After SR-1 (none automatic)

```text
SR-2   ProjectController internal decomposition
SR-3   public API / export surface cleanup (the canonical API still carries historical names)
SR-4   test layout / historical naming cleanup
SR-OWN resource lifetime contract cleanup (the CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY cases)
```

Product backlog stays separate: CF-UXA-04 (semantic profiler), CF-UXB-04 (fuzzy resolver),
daemon/autostart, budget presets, finding-specific verification, branch-artifact retention, PIAS.
