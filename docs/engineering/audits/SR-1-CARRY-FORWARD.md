# SR-1 — Carry-forward

Status: **PARTIAL** — R0 (with the R0A/R0B repairs), R1 and the §21 parity fixture are complete;
R2 and R3 are not started. This is the ordered remainder for SR-1 PASS.

---

## 1. Required to reach SR-1 PASS

| id | item | why | status |
| --- | --- | --- | --- |
| **R2** | Split `src/application/surface.ts` (1,535 lines, fan-out 44) into `src/application/surfaces/<capability>.ts` + `common.ts` + `factory.ts`, preserving `PalimpsestApplicationSurface`, `ApplicationSurfaceDeps` and `makePalimpsestApplicationSurface` through compatibility exports | §39 lists "application surface remains effective monolith" as PARTIAL; §22 | not started |
| **R3A** | Split `src/tools/application_tools.ts` (1,090 lines) into `src/adapters/dsh/*` behind the unchanged `defineApplicationTools(application)` | §39 lists "DSH/HTTP remain effective switchboards"; §23 | not started |
| **R3B** | Split `src/application/http.ts` (1,126 lines) into `src/adapters/http/*` behind the unchanged `handleApplicationRequest` / `applicationErrorStatus` / `ApplicationRouteInput` / `ApplicationRouteResult` | §24 | not started |
| **A03** | install root fan-out reduced — now **true and measured** (38 → 11); the test is not written | §25 | test missing |
| **A04** | the application factory composes per-capability surfaces | waits on R2 | not started |
| **A05/A06** | aggregate DSH / HTTP entries preserved — behaviour is covered by the parity fixture and existing suites; dedicated tests missing | §25 | test missing |
| **A07** | adapters avoid direct semantic-store access | becomes meaningful with R3 | not started |
| **A13** | HTTP route parity table (method/path/required capability/success class/failure class) and the post-split comparison | §32; the current fixture covers tools and surfaces, not routes | not started |
| **§30 remainder** | add readiness fields and lifecycle observations to the parity fixture (it currently captures capability keys, surface keys, tool names/modes/actions and the absence matrix) | §21 | partial |

## 2. Deliberately untouched (§27)

```text
the canvas/derive ↔ tools/controller ↔ tools/graph cross-layer cycle   (recorded as an exception)
the four historical L2→L3 imports                                     (recorded per concrete edge)
ProjectController (3,095 lines, fan-out 27)                           (SR-2 candidate)
the historical G10 barrel structure in src/index.ts / src/advanced.ts  (SR-3 candidate)
```

## 3. Findings SR-1C produced

1. **A layer-pair exception is not an exception.** Recording `L2->L3` would have let the four
   historical upward imports grow without the check noticing. Concrete edges only, now enforced
   and demonstrated with a live probe.
2. **Host JavaScript was outside the checker.** `host/**` is now scanned as L5; it happened to be
   clean, which is exactly why the coverage matters rather than the current result.
3. **Cutting a body does not prune an import.** After two cluster extractions the root had lost
   60% of its lines and none of its fan-out: the imports were still there. The step that met §19
   was pruning by identifier usage. Worth remembering for R2/R3, where the same trap exists.
4. **A dropped optional face looks like "absent by configuration".** One mechanical rename
   rewrote shorthand KEYS in the surface literal, silently removing the `collaboration` and
   `crossProject` faces; 55 tests failed. A refactor that moves optional wiring must be verified
   by the regression suite, not by reading the diff.
5. **The provider outage is environmental, with a control.** The live smoke fails identically on
   this tree and on the exact canonical baseline (`a30a328`), so per §29 it is neither green nor a
   regression.

## 4. After SR-1 (unchanged, none automatic)

```text
SR-2   ProjectController internal decomposition
SR-3   public API / export surface cleanup
SR-4   test layout / historical naming cleanup
SR-OWN resource lifetime contract cleanup (the CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY cases)
```

Product backlog stays separate: CF-UXA-04 (semantic profiler), CF-UXB-04 (fuzzy resolver),
daemon/autostart, budget presets, finding-specific verification, branch-artifact retention, PIAS.
