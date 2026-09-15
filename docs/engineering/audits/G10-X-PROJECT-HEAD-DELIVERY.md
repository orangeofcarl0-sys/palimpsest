# G10-X — Project-Head Delivery

Baseline: `main @ f639181199da9ccd7acb3fac2c46392e0b82eb04`. Ordarium v1.3.1. DSH 0.1.5-rc.2.

Verdict: **G10-X CANONICAL PROJECT-HEAD EVOLUTION: PASS**.

## Delivered

| Area | Files |
| --- | --- |
| Pure kernel | `src/domain/project_head.ts` (new) — `deriveProjectHeadStatus`, `compileProjectHeadReconciliation`, `promotionChainBasis`, `ProjectHeadError`, `ProjectHeadState` |
| Promotion manager | `src/effects/promotion.ts` — `promotionFacts`, `projectHeadStatus`, `canonicalExpectedHead`, `canonicalAttemptResultCommit`, `promoteAttempt`; strict source/head validation in `promote`; typed `external_head_divergence` |
| Controller | `src/tools/controller.ts` — `promoteAttempt`, `reconcileProjectHead`, `#latestHeadPromotion`, `#headReconciliationCandidate`, trusted `planReconciled(..., {headAdvance})`, `status().head`, `runTurn` drift barrier, `pumpSettlement` |
| Product promotion path | `src/cli.ts` (promote/pump), `src/tools/control_surface.ts` — canonical `promoteAttempt`; no caller supplies a commit or a head |
| Management | `src/project_management/{profile,policy,actions,service}.ts` — `RECONCILE_PROJECT_HEAD` action class, matrix, capability, candidate builder, execution case, `reconcileProjectHead()` |
| Workspace | `src/project_workspace/view.ts` — `project.head` (state + label + promotion provenance), `PROJECT_HEAD_DRIFT` / `PROJECT_HEAD_CONFLICT` open loops |
| Application / HTTP / tools | `src/application/surface.ts`, `src/application/http.ts` (`POST /api/project/reconcile_head`), `src/tools/application_tools.ts` (`reconcile_project_head`) |
| Exports | `src/index.ts`, `src/advanced.ts` — additive kernel + controller types |
| Tests (new) | `test/x_multi_promotion.test.ts` (7), `test/x_adversarial.test.ts` (16) |
| Tests (changed) | `test/v_management_autonomy.test.ts`, `test/v_adversarial.test.ts`, `test/visual_orchestration.test.ts` (see below) |
| Dogfood | `scripts/management/multi-promotion.mjs` → `.dogfood/g10x-multi-promotion.json` |
| Docs | `PROJECT-HEAD-EVOLUTION.md`, `G10-X-PROJECT-HEAD-SPEC.md`, `G10-X-MULTI-PROMOTION-CAMPAIGN.md`, `audits/G10-X-{PROJECT-HEAD-ASSESSMENT,W-CARRY-FORWARD-DISPOSITION,HEAD-EVOLUTION-ANTI-WASTE,PROJECT-HEAD-DELIVERY,MULTI-PROMOTION-EVIDENCE,CARRY-FORWARD}.md`, updated `docs/engineering/README.md` |

## Tests changed and why (no coverage deleted)

| Test | Change | Justification |
| --- | --- | --- |
| `v_management_autonomy.test.ts` | `EXPECTED_MATRIX` gains `RECONCILE_PROJECT_HEAD`; class count 13 → 14; `palimpsest_manage` action list and application-surface key list gain the reconciliation entry | a new action class is the stage's contract; every existing cell assertion is retained unchanged |
| `v_adversarial.test.ts` | same two list assertions | same |
| `visual_orchestration.test.ts` | the control-surface mock now provides `evaluateAttemptGate` + `promoteAttempt` instead of `promoteWhenGatePasses`; the promote assertion checks `{attemptId, gateId}` only | the surface is now product-safe: it must be proven NOT to supply commits/heads. The pre-existing report gains a `resultCommit` because the promotion source is now the canonical report commit. |

## Gates

| Gate | Result |
| --- | --- |
| `pnpm run build` (`tsc -b`) | clean |
| `pnpm exec vitest run` | 147 files / 1342 tests, all green (baseline 145 / 1319; +7 multi-promotion, +16 adversarial) |
| `node scripts/management/multi-promotion.mjs` | PASS — `dshPrincipal: true`, `dshAttempt: false`, 36/36 checks, rev0 → rev2, heads `cccc…` → `0000…0002` → `0000…0004`, ProjectIR head === git head |
| `fixtures/**` | untouched |
| Wire contract / migrations | untouched (no new event type, no payload change, no migration) |

## Honest deviations

1. **Parallel old-base is `NOT_APPLICABLE_CURRENT_TOPOLOGY` (CF-X-01).** `#validateTaskSatisfied`
   requires `promotion.expected_head_commit === envelope.base_commit`; a task authorized at an older
   base cannot be satisfied by a promotion whose expected head advanced. The scenario is asserted
   with the aggregate refusal, not faked. Recorded as a carry-forward.
2. **Web UI does not render the head panel (CF-X-02).** `web/**` is outside this stage's write
   scope; the derived overview payload (`project.head`) and the HTTP surface are the contract, and
   the workspace tests assert the payload.
3. **The `headAdvance` trusted option has no production caller (CF-X-03).** It is exercised through
   `reconcileProjectHead` and the forgery-negative tests only.
4. **`dshAttempt: false`.** A live DSH attempt execution is not possible over the host's HTTP
   surface (there is no remote claim/report/gate channel, and a headless DSH session cannot drive
   the Work tools without a model). The work runs on the real scheduler/controller/Ordarium path;
   the evidence records the exact reason. The real DSH principal did boot and read the final head
   (`dshPrincipal: true`).
5. **`git.head()` remains in two diagnostics.** `PromotionManager.#gitHeadOrUndefined` (divergence
   check) and the pre-existing `gitPromote` recovery probe. Neither assigns `projects.head_commit`;
   the anti-waste audit's source scans pin that.

## Required CI (canonical gate)

| Checkpoint | Value |
| --- | --- |
| Implementation PR |  |
| Tested branch HEAD |  |
| PR run |  |
| Merge |  |
| Tree identity |  |
| Canonical main run |  |

*(Left blank deliberately: this record is written before the remote gate runs. Required checks must
be GREEN — read from the real conclusion — before the merge.)*
