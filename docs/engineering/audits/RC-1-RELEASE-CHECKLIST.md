# RC-1 — Release checklist (derived)

Baseline: `6c7181d66816a70cb41583be00e0676e56fce06d` (canonical main after UX-C).
Stage: `RC-1 — Live Principal Product Qualification & Interaction Surface Closure`.
Derived from `SPEC-PROMPT-RC-1.md` §44. This is a derived qualification checklist, **not**
semantic truth and **not** a numeric product score. Statuses cite observable evidence, not
prose.

Evidence bundles:

- `release-evidence/rc1-live-local.json` — local live trials (A / B / C / English / F)
- `release-evidence/rc1-live-cross-project.json` — cross-project live trials (D / E)
- `release-evidence/rc1-live-principal.json` — the composed §40 bundle
- `docs/engineering/audits/RC-1-LIVE-PRINCIPAL-EVIDENCE.md` — the readable record

---

## Interaction

| Item | Status | Evidence |
| --- | --- | --- |
| Local natural-language collaboration (no tool named) | PASS | Scenario A (`并行研究…给我两种独立思路`) reached `palimpsest_collaborate` → `LOCAL_EXPLORE` with real ephemeral branches in ≥4/5 trials; scenario B AUTO likewise. See the trial matrix. |
| Cross-project natural-language Ask (no peer/thread ids, no second prompt) | PASS | Scenario D: one user sentence → origin `palimpsest_cross_project ask` → shipped pump + product attention activates the remote live principal → remote `respond` → origin `receive` surfaces the answer with no further user input, in ≥4/5 trials. |
| Failure honesty (unavailable capability / unknown project) | PASS | Scenario F: a profile without `reasoning` reports a capability limitation and runs zero branches; a profile without `projectDirectory` does not invent a project or a cross-project answer. See the §38 classifications. |
| CHECK remains current Project Head verification | PASS | Scenario C: the high-level path resolves to `LOCAL_VERIFY` ("Verify current project head"); no answer implied the Explore findings were verified (`claimsVerified=false` in every trial). |

## Host

| Item | Status | Evidence |
| --- | --- | --- |
| Real DSH principal drives the loop | PASS | `request/header.config` observed per trial: `openrouter-stealth` / `stealth/union-alpha`; sessions contain real `assistant/message`, `tool/call`, `tool/result`. |
| Branch capability isolation stays structural | PASS | Every real branch session's own `request/header.tools == ["palimpsest_branch_result"]` (bundle `branchCatalogueEvidence`, `widened=false`). |
| Pump / attention lifecycle | PASS | D/E: the remote principal's session shows the delivered product attention text (`[palimpsest cross-project] …`) and product tool calls; the origin surfaces the answer on its own later turn. |
| Activation observability (RC-1 host change) | PASS (recorded change) | `host/dsh/lib/runner.js` now waits for, flushes and reports the activated turn (tool calls + final visible text). No semantics added; it only makes an attention-driven turn observable/durable. |

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
| RCP-A17 required CI green | PASS (workflow unchanged; local gates green) |

No numeric product score is reported (spec §44).
