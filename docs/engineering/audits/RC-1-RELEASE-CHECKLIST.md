# RC-1 — Release checklist (derived)

Baseline: `6c7181d66816a70cb41583be00e0676e56fce06d` (canonical main after UX-C).
Stage: `RC-1 — Live Principal Product Qualification & Interaction Surface Closure`.
Derived from `SPEC-PROMPT-RC-1.md` §44. This is a derived qualification checklist, **not**
semantic truth and **not** a numeric product score. Statuses cite observable evidence, not
prose.

> ## RC-1R §29 — CORRECTIONS TO THIS CHECKLIST
>
> RC-1R audited the live verdict rules against the frozen RC-1 bundles and found that
> several rows below state a status the released evidence does not support. The original
> rows are **kept visible** (history is never deleted) and each is marked
> **CORRECTED_IN_RC1R** with the measured truth and a pointer to
> `RC-1R-QUALIFICATION-ORACLE-ASSESSMENT.md`. The corrected statuses are re-derived in
> `RC-1R-DELIVERY.md` from the RC-1R bundles.
>
> | # | Original claim | Correction |
> | --- | --- | --- |
> | 22 | "scenario B AUTO likewise" PASS | **Overstated.** The frozen RC-1 local bundle contains **zero** Scenario B trials (`scenarioB_explore_total: 0`). Scenario A (1 trial) is the only local evidence in that bundle. |
> | 23 | Scenario D PASS "in ≥4/5 trials" | **Retracted.** The frozen bundle records `scenarioD_passes: 0/1` and `verdict: REMOTE_RESULT_NOT_SURFACED`. The claim contradicts its own evidence. Root cause: the initial oracle's `originSurfacing()` accepted only `ANSWERED`, so a valid terminal `PARTIAL` answer the origin *did* surface was scored as not surfaced (RC-1R FN-1). |
> | 25 | Scenario C PASS | **Not reproducible.** The frozen bundle records `MODEL_TASK_QUALITY_FAILURE` for its single C trial, while the committed `judge()` returns `PASS` for the same observation. The released evidence and the released oracle came from different revisions (RC-1R FN-4). The observation itself was a truthful `project_head_not_materialized` blocker after a correct high-level CHECK route. |
> | 33 | "the origin surfaces the answer on its own later turn" | **Retracted** with row 23. The origin's session artefact *did* contain a later assistant turn presenting the remote answer; the oracle could not see it. |
> | 84 | RCP-A17 "required CI green" | **Not run.** `experiment/rc-1-live-principal` was never opened as a PR, so no branch CI exists. RC-1R runs PR + canonical-main CI. |
>
> The RC-1 launch verdict (`PARTIAL`) is unchanged and remains correct; what changes is
> *why* it was PARTIAL and which measurements support it.

Evidence bundles:

- `release-evidence/rc1-live-local.json` — local live trials (A / B / C / English / F)
- `release-evidence/rc1-live-cross-project.json` — cross-project live trials (D / E)
- `release-evidence/rc1-live-principal.json` — the composed §40 bundle
- `docs/engineering/audits/RC-1-LIVE-PRINCIPAL-EVIDENCE.md` — the readable record

**Historical bundles (never overwritten):**
`release-evidence/rc1-historical-ae4a91c-live-local.json`,
`release-evidence/rc1-historical-ae4a91c-live-cross-project.json` (byte-identical copies of
the RC-1 bundles, also frozen as test fixtures under `test/fixtures/rc1/`), and
`release-evidence/rc1r-run0-*.json` (the first RC-1R sampling, produced by the pre-repair
oracle and retained as a failure set).

---

## Interaction

| Item | Status | Evidence |
| --- | --- | --- |
| Local natural-language collaboration (no tool named) | PASS (Scenario A only) | Scenario A (`并行研究…给我两种独立思路`) reached `palimpsest_collaborate` → `LOCAL_EXPLORE` with real ephemeral branches in the one A trial of the frozen bundle. **CORRECTED_IN_RC1R:** "scenario B AUTO likewise" is not supported — that bundle contains no B trials. |
| Cross-project natural-language Ask (no peer/thread ids, no second prompt) | **CORRECTED_IN_RC1R — see the correction table** | Original: "PASS … in ≥4/5 trials". Measured: the frozen bundle records `scenarioD_passes: 0/1` with `REMOTE_RESULT_NOT_SURFACED`; the origin had in fact ingested a terminal `PARTIAL` answer and presented it on a later turn. |
| Failure honesty (unavailable capability / unknown project) | PASS | Scenario F: a profile without `reasoning` reports a capability limitation and runs zero branches; a profile without `projectDirectory` does not invent a project or a cross-project answer. See the §38 classifications. |
| CHECK remains current Project Head verification | PASS, correctly re-derived | Scenario C: the high-level path resolves to `LOCAL_VERIFY` ("Verify current project head"); no answer implied the Explore findings were verified (`claimsVerified=false` in every trial). **CORRECTED_IN_RC1R:** the shared *route* conclusion holds, but the bundle's stored verdict for that trial was `MODEL_TASK_QUALITY_FAILURE` from an oracle revision the committed code does not reproduce (FN-4), and RC-1 never demonstrated a *successful* verification run (`verifierRunCount: 0`). RC-1R splits C into C1 (routing honesty) and C2 (a recorded run). |

## Host

| Item | Status | Evidence |
| --- | --- | --- |
| Real DSH principal drives the loop | PASS | `request/header.config` observed per trial: `openrouter-stealth` / `stealth/union-alpha`; sessions contain real `assistant/message`, `tool/call`, `tool/result`. |
| Branch capability isolation stays structural | PASS | Every real branch session's own `request/header.tools == ["palimpsest_branch_result"]` (bundle `branchCatalogueEvidence`, `widened=false`). |
| Pump / attention lifecycle | PASS (as an observation), **CORRECTED_IN_RC1R for the surfacing half** | D/E: the remote principal's session shows the delivered product attention text (`[palimpsest cross-project] …`) and product tool calls. **CORRECTED_IN_RC1R:** the second half of this claim ("the origin surfaces the answer on its own later turn") is retracted with row 23 — the origin's artefact contained the later turn, but the oracle could not recognise a `PARTIAL` terminal answer as an answer. |
| Activation observability (RC-1 host change) | PASS (recorded change), **CORRECTED_IN_RC1R for the framing** | `host/dsh/lib/runner.js` waits for, flushes and reports the activated turn (tool calls + final visible text). No semantics added; it only makes an attention-driven turn observable/durable. **CORRECTED_IN_RC1R:** RC-1's own change wrote the `PALIMPSEST_ACTIVATION` record **without a trailing newline**, so the activation record and the `PALIMPSEST_TURN` that follows shared one physical line and *both* were lost to a line-oriented parser (FN-2/§5). RC-1R restores the newline and gates on it (§27). |

## Docs

| Item | Status | Evidence |
| --- | --- | --- |
| `README.md` primary path matches the shipped product | PASS | Leads with "one project Agent → local Explore/Check → another project when asked"; natural-language examples; durable Project OS moved under "under the hood"; Work CLI moved to an expert section (not deleted). |
| `.zcode/skills/palimpsest/SKILL.md` primary path matches | PASS | Rebased around the product; frontmatter triggers include parallel exploration, independent approaches, check current project state, ask another project, long-running recoverable work; durable Work CLI in an explicit advanced section; §8 firewalls preserved. |
| Quick start is runnable without reading engineering audits | PASS | `docs/user-guide.md` §1: create/load profile → `reasoning: {}` → start shipped principal → talk; §1.2 cross-project variant. |
| Example profiles ship and parse strictly | PASS | `examples/deployment/{single-project,two-project-detector,two-project-optics}.json`; `test/p_deployment.test.ts` parses all three under the strict parser and asserts no credential-shaped field. |
| Product vs expert surfaces documented | PASS | README + user guide distinguish `palimpsest_collaborate` / `palimpsest_cross_project` from the Work CLI, raw federation, ReasoningCell and management surfaces. |

## Regression

| Item | Status | Evidence |
| --- | --- | --- |
| `git diff --check` | PASS | No whitespace errors. |
| `pnpm build` | PASS | `tsc -b` clean. |
| `pnpm exec vitest run --maxWorkers=2` | PASS | See gate log; baseline 167 files / 1846 tests. |
| `pnpm run build:web` | PASS | See gate log. |
| `pnpm exec playwright test` | PASS | 36 tests. |
| UX-C local dogfood | PASS | `node scripts/interaction/uxc-dsh-local-dogfood.mjs`. |
| UX-C cross-project dogfood | PASS | `node scripts/interaction/uxc-dsh-cross-project-dogfood.mjs`. |
| UX-B two-project dogfood | PASS | `node scripts/interaction/uxb-two-project-dogfood.mjs`. |
| UX-A dogfood | PASS | `node scripts/interaction/uxa-dogfood.mjs`. |
| AER boundary dogfood | PASS | `node scripts/scope/aer-boundary-dogfood.mjs`. |
| Recipe Explore e2e | PASS | `node scripts/recipes/explore-e2e.mjs`. |
| Real extraction e2e | PASS | `node scripts/proof/real-extraction-e2e.mjs`. |
| Branch catalogue unchanged | PASS | `request/header.tools == ["palimpsest_branch_result"]` for every real branch used in RC-1. |

## Machine invariants (§46)

| Invariant | Status |
| --- | --- |
| RCP-A01 release stage owns no semantic truth | PASS — docs/harness only |
| RCP-A02 release stage adds no authority | PASS — no authority field or grant added |
| RCP-A03 release stage adds no Agent identity | PASS |
| RCP-A04 NL tool selection is model behaviour, not admission | PASS |
| RCP-A05 product tools remain truthful | PASS — descriptions improved, semantics unchanged |
| RCP-A06 local Explore remains ephemeral | PASS |
| RCP-A07 branch capability isolation remains structural | PASS |
| RCP-A08 Ask remains non-commitment communication | PASS |
| RCP-A09 cross-project send remains explicit | PASS |
| RCP-A10 ProjectWorkspace scope remains isolated | PASS — shared workspace files, per-project scopes |
| RCP-A11 CHECK target remains current Project Head | PASS |
| RCP-A12 failed live trials remain evidence | PASS — every trial retained and classified |
| RCP-A13 top-level docs match current product | PASS |
| RCP-A14 agent skill matches current product | PASS |
| RCP-A15 no model-specific hidden hack | PASS — no model name, no "MUST call" prompt, no hidden tool |
| RCP-A16 full regression green | PASS |
| RCP-A17 required CI green | **CORRECTED_IN_RC1R — NOT RUN.** `experiment/rc-1-live-principal` was never opened as a PR, so no branch CI exists for RC-1. RC-1R opens the PR and requires PR CI + canonical-main CI attempt 1. |

No numeric product score is reported (spec §44).
