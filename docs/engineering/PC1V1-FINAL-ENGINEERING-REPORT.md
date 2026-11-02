# PC1-V1 — Final engineering report

## 0. One accurate verdict

**The measured product gaps are corrected and deterministically qualified. The behavioral and
comparative gates are not established: no new PC1-V1 model cohort was authorized, so the R9 verdict
is `BLOCKED`, not favorable or unfavorable.**

| Judgment | Result |
|---|---|
| Source attribution and baseline | `ESTABLISHED` — all changes are bound to the PC1 source, exact PC1-V1 commits and reproducible tests |
| Completion/Release consistency | `ESTABLISHED` deterministically — a documentation/data task can complete and be promotion-eligible under one applicable bar; missing applicable evidence still blocks |
| Actionable product state | `ESTABLISHED` deterministically — status/continuity no longer advertise `next` when the Scheduler's VERIFYING latch refuses it |
| Cognitive work productivity | `PARTIAL` — the deterministic exploration + one-formal-deliverable path completes the Field Study artifact set; no live model multi-role behavior was measured |
| Safe effect boundaries | `ESTABLISHED` deterministically — the in-place and worktree boundaries match observed filesystem/Git behavior |
| Proposal/Review continuity | `ESTABLISHED` deterministically — a model-originated Journal proposal can be adopted, reviewed and applied with exact-digest authority |
| Exact source acceptance | `ESTABLISHED` deterministically — wrong-but-in-scope bytes complete file/scope checks but cannot be promoted; correct bytes can |
| Currentness and decision correction | `PARTIAL` — historical acceptance and current applicability are separate, and D8+21=D29 can be checked; no live model used it |
| Actual independent contribution | `NOT EXERCISED` live — the real delegation service and receipt/consume path are exercised with a controlled branch host; no real model Subagent ran |
| Comparative product value | `BLOCKED` — no new PC1-V1 spend authorization; 0 model calls; the PC1 `NOT_SUPPORTED` result remains binding |

The primary product decision is **F — Evidence insufficient**, with the provisional direction
described in §9. This is not a claim that Palimpsest is superior, and not a claim that it is
inferior in a new matched comparison.

## A. Git and delivery identity

| Fact | Value |
|---|---|
| Repository | `orangeofcarl0-sys/palimpsest` |
| Incoming branch | `palimpsest-product-convergence-v1` |
| Incoming HEAD / tree | `e938502005e8d9334c2438fa47488f253bd78cc8` / `0749706c5cc4800b996e86eb728650bb1a1d8beb` |
| Protected `main` | `044330b2e55198542d545edc42ed9c36e7ce896b` — unchanged |
| PC1-V1 branch | `palimpsest-pc1v1-governance-to-outcome` |
| Code Freeze 1 | `b7cb43b771f76efe2d8efa5eb63318b9ff83b43b` / tree `e2af03a1e5c16618428fb4520b3483497c1c0496` |
| **Code Freeze 2 (final executable)** | **`bf5e59e338962e9316d5be97c92271091c56e552` / tree `304bf165052b5b69edc87ade6360ea96cf95a00e`** |
| RC | `dist-rc/palimpsest-0.2.0-pc1.1-pc1v1.tar.gz`, 4,039 staged files |
| RC SHA-256 | `722e616d6647e6c28c3be764c6f53b6437515da1091cd2f3fc796536732a8dcd` |
| Evidence freeze | the commit containing this report, `research-evidence/pc1v1/rc.json` and the manifests |
| PR / mainline | no PR opened; `main` not moved |

No force-push, rebase, branch deletion, historical Code/Evidence Freeze amendment, worktree removal,
lock removal, historical Ordarium edit, scored-run overwrite, PR or main merge was performed. The
baseline proof worktree was a new test-owned worktree at `e938502`; it was not a historical branch
or retained evidence worktree.

### Production files changed

| Group | Files |
|---|---|
| R1 completion/release identity | `src/domain/completion_contract.ts`, `src/domain/command_identity.ts`, `src/tools/work_evidence.ts`, `src/evidence/gate_dsl.ts`, `src/tools/controller.ts`, `src/effects/promotion.ts`, `src/domain/promotion_eligibility.ts` |
| R2 executable state | `src/domain/work_state.ts`, `src/adapters/dsh/normal.ts`, `src/project_continuity/service.ts`, `src/project_continuity/types.ts`, `src/tools/controller.ts` |
| R3 exploratory cognition | `src/adapters/dsh/normal.ts` (`explore`/`explorations`) |
| R4 boundary | `src/application/surfaces/work.ts`, `src/adapters/dsh/normal.ts` |
| R5 proposal/review | `src/project_review/types.ts`, `src/project_review/service.ts`, `src/adapters/dsh/normal.ts`, `src/cli_product.ts`, `src/product.ts` |
| R6 source admission | `src/domain/promotion_eligibility.ts`, `src/effects/promotion.ts`, `src/project_review/service.ts`, `src/product.ts`, `src/composition/{core,install_contract,project_intent_contract}.ts`, `src/install.ts`, `src/tools/controller.ts` |
| R7 currentness/domain | `src/domain/hard_constraints.ts`, `src/domain_outcome/service.ts`, `src/adapters/dsh/outcome.ts`, `src/application/{workspace_extra,surfaces/project}.ts`, `src/project_continuity/{service,types}.ts` |
| R8 delegation/receipt | `src/interaction/delegation.ts`, `src/project_handoff/{delegation,index}.ts`, `src/composition/delegation.ts`, `src/install.ts`, `src/application/surfaces/product.ts`, `src/adapters/dsh/product.ts` |
| Tests | 9 new `test/pc1v1_*.test.ts` files plus five additive/stale-expectation updates |
| Tools/docs | `scripts/pc1v1/**`, `docs/engineering/PC1V1-ROOT-CAUSE-AND-OUTCOME-PLAN.md`, `docs/programs/pc1v1/**`, `research-evidence/pc1v1/**` |

No canonical event, schema, TaskSpec, TaskEnvelope, Stage Graph or ProjectIR shape changed. New
non-canonical Journal markers are `pc1-exploration/v1`, `pc1-hard-constraint/v1`,
`pc1-consumption/v1`, and the review store gained the `ACTION` proposal/adoption fields. No new
runtime dependency was added.

## B. Completion and acceptance

**What caused the mismatch?** `deriveAttemptCompletionContract()` narrowed command checks for
documentation/data write scopes, while `standardGateChain()` declared the full project standard as
`gate-release`. `finish` executed the narrowed contract, but `nextEvidenceNeeded` and the gate still
demanded `exists(tests_pass)`. Two same-predicate commands were also indistinguishable because the
old evidence atom had no command identity in the gate's `value` map.

**How was it reproduced?** `test/pc1v1_completion_release.test.ts`:
- a valid Markdown task completes with no `tests_pass` atom and the effective release gate PASSES;
- before completion the same gate is INCOMPLETE and names `tests_pass`;
- two distinct `tests_pass` commands are two obligations, and one observation does not satisfy both;
- an unauthorized required command refuses `finish` and leaves the attempt RUNNING;
- a manually declared legacy `gate-release` is not re-derived and remains INCOMPLETE, proving
  historical gate declarations keep their original interpretation.

**Which owner changed?** The controller's gate evaluation now derives an **effective release chain**
from the same completion contract for the standard-derived gate only
(`effectiveReleaseGateDefinition` in `src/domain/completion_contract.ts`). The stored
`GATE_DEFINED` record is not rewritten. New command evidence records `command_digest`; new artifact
evidence records `paths_digest`. The gate engine evaluates an already-derived definition through
the same verdict algorithm.

**Is every mandatory check a matching observation?** For the standard-derived gate, yes: each
mechanical check has exactly one clause, and a command clause names its exact command digest.
Structural checks remain product-observed; a caller's exit-zero command cannot manufacture
`write_scope_valid` or `expected_files_exist`.

**Can missing commands or artifacts still be falsely qualified?** No in the tested paths. A missing
applicable command is INCOMPLETE; an unauthorized command refuses; an empty/partial artifact list
does not bypass the declared artifact set.

**Are old Gate records unaffected?** Yes. `GATE_DEFINED` payloads and historical evidence atoms are
unchanged. A manual/non-standard-derived gate evaluates exactly as before, including a foreign
attempt's honest INCOMPLETE.

## C. Work and cognition

Exploratory cognition now has a normal product path: `palimpsest_work action=explore` records a
Journal `REFERENCE_NOTE`/`NEGATIVE_RESULT` with sources, uncertainty and candidate artifacts;
`explorations` reads them. It creates no Task, Attempt, Evidence, Promotion or ProjectIR change and
cannot satisfy a Work gate. `test/pc1v1_exploration_field_study.test.ts` proves this and then runs
the intended Field Study shape: independent exploration first, one formal governable deliverable
that produces all five required artifacts, a VERIFYING candidate, and a separate Promotion.

This uses the existing Journal/Work owners, not a new workflow engine. The default Stage Graph and
single-task latch are unchanged; Promotion CAS, write-scope isolation, result identity and
independent acceptance are unchanged. The deterministic Field Study path produced
`study-plan.md`, `plan.json`, `reviews/evidence.md`, `reviews/delivery.md` and `unresolved.md`; the
test does **not** claim the scientific contents are correct, and it is not a model-behavior result.

The old VERIFYING deadlock is still a property of formal Work; the correction is that exploratory
research no longer has to be represented as four formal Work tasks. A live model must choose the
exploration path to realize this benefit — that choice was not measured in PC1-V1.

## D. Natural product behavior

`ControllerStatusView` now carries `holds` and one `nextAction` derived from the Scheduler's pure
`decide()` result, the scheduler state, the VERIFYING/ACTIVE/READY/BLOCKED task states, holds, the
promotion fence, the head state and whether a confirmed standard exists. `safeStatus()` and
continuity consume the same object.

`test/pc1v1_next_action.test.ts` covers the required controls: READY with no blocker, READY while
another task is VERIFYING, dependency blocked, paused Scheduler, task hold, promotion fence/head
sync, missing standard, and the pure decision matrix. In the integration case, a VERIFYING result
makes a READY task un-nextable: `step()` returns null, the normal tool reports
`WAIT_OPERATOR_ACCEPT`, and continuity does not say `action=next`. No private implementation state
is required to understand the block.

Live model behavior was not measured, so any claim about reduced futile tool calls in real sessions
is `NOT EXERCISED`.

## E. Authorization and source safety

**Can a real Agent proposal enter Operator Review?** Yes, deterministically. `palimpsest_work
action=propose` writes a structured `pc1-proposal/v1` Journal note. `ReviewService.listAll()` (and
the CLI `review list`) performs a verified, idempotent adoption into the existing ReviewStore.
`test/pc1v1_proposal_review.test.ts` exercises plan and generic ACTION proposals, exact preview,
unauthorized refusal, operator approval, application through the plan owner, incomplete-proposal
repair, stale-basis behavior and the no-operator-authority refusal.

**Is approval exact and current?** The record digest binds the proposal content, Journal entry
identity and adoption basis. A changed project basis produces STALE. An approval at digest X does
not authorize a modified Y. Duplicate adoption is idempotent.

**Can it be applied without a model approving itself?** No. `decide`/`apply` require the host
`OperatorAuthorityPort`; a model identity is refused. A generic ACTION records an
operator-approved Journal note and explicitly creates no Work, ProjectIR revision, source
acceptance or promotion.

**Can wrong source bytes be accepted?** No on the tested normal path. An applied SOURCE_INTAKE
proposal is bound to its Work task and target path. Promotion eligibility reads the exact result
blob and changed paths; wrong bytes or out-of-scope changes produce a typed
`source_intake_unverified` blocker. `test/pc1v1_source_intake.test.ts` shows wrong-but-in-scope
bytes completing scope/artifact checks but failing promotion, correct bytes passing, and unrelated
Work unaffected.

**Did any operator effect occur without correct provenance?** No. The review store remains
non-canonical; effects still travel through the existing plan/intent/Work/Promotion owners.

## F. Context and domain

Continuity now distinguishes `historicalAcceptance` from `currentApplicability`
(`APPLICABLE|CONTRADICTED|SUPERSEDED|UNKNOWN`). A later promotion for the same task marks the
earlier one SUPERSEDED; the latest remains UNKNOWN unless a real current-world assessment exists.
This is tested with a two-promotion projection. The code never turns UNKNOWN into APPLICABLE, and a
`NEGATIVE_RESULT` Journal entry is not promoted into proven business impossibility.

The hard-constraint calculators are pure and explicit:
- schedule (`D8 + 21 = D29` against a D28 latest day is FAIL);
- budget totals and fixed costs;
- unit conversion (`1.2 mg/m3 = 1200 ug/m3` via an explicit registry);
- coverage ratio/overlap;
- exact source identity;
- approval requirement.

`palimpsest_outcome action=check` returns PASS/FAIL/UNKNOWN with assumptions and records a
non-canonical note. The caller cannot choose the status. A malformed check is rejected. The
decision-oriented capsule now orders binding constraints, recent changes, current blocking, negative
findings, unresolved assumptions, permissible next actions and historical acceptance; it still names
omitted sections and reports the byte budget.

The live R4 correction was not exercised. The deterministic evaluator makes the correction possible
without embedding the evaluator's answer.

## G. Multi-agent cooperation

A real independent model Agent did **not** run. The delegation service was exercised with a
controlled branch host through the real `makeDelegationService` path: start → terminal settlement →
Handoff/Receipt projection → `inspect` → `consume`. The receipt names the actual executor identity
(`reasoning-cell:<cell>/branch:<branch>`), basis, status, claim and the **declared** read footprint;
it explicitly says per-file reads were not observed. `hypothesis: true` prevents the finding from
becoming the positive side of an independence count. Two branches over the same frozen basis are
shown not to be independent verification.

The product adapter records one idempotent non-canonical consumption note. It does not accept the
finding, create Evidence, promote, or revise ProjectIR. The final decision's `changedPlan` is the
principal's own statement, not a machine inference.

Because no real model Subagent ran, G8 is `NOT EXERCISED` behaviorally; the deterministic protocol
path is `PARTIAL`.

## H. Native DSH comparison

No matched PC1-V1 P/F cohort ran. The PC1 eight-session record remains the historical behavioral
baseline, but it is not a PC1-V1 result and is not pooled. No provider error count is claimed for a
cohort that did not run: the correct count is **0 model calls**, not "0 errors".

The PC1 result remains binding: Palimpsest was not superior overall; it had stronger provenance and
negative-standing but higher Sablewick cost, missing `tests_pass` and an incomplete Field Study,
while the native DSH condition was cheaper on Sablewick and more complete/accurate on the Field
Study. PC1-V1 corrected the measured product gaps but did not measure whether those corrections
improve real model behavior.

Therefore the comparative verdict is **BLOCKED**, not `NOT_SUPPORTED` and not `ESTABLISHED`. The
prerequisite is a new explicit authorization and a frozen matched cohort.

## I. Product decision

**Primary recommendation: F — Evidence insufficient.**

The exact unfinished experiment is the R9 matched P/F cohort. The product blocker for that
experiment is the absence of a new PC1-V1 spend authorization, not a deterministic failure: the
runner, protocol, scenarios and smoke tests are ready. The resource constraint is the same
authorization; no model tokens were spent.

Provisional product direction, if a new cohort confirms the deterministic corrections help:
**B — Gain is selective.** Keep trustworthy governance for high-impact, high-consequence work and
ordinary low-risk editing direct; do not make every exploratory inference pass through formal Work.
**D — Context and decision checks are a main source of value** is the second hypothesis: actionable
next state, currentness and targeted hard-constraint checks are cheaper and more generally useful
than expanded formal coordination.

Do not choose A from this report. There is no new favorable behavioral evidence, and the historical
PC1 negative finding has not been overturned.

## 10. Verification evidence

| Check | Result | Evidence |
|---|---|---|
| Build (Node 24.22.0) | PASS | `research-evidence/pc1v1/s10/final-build.log` |
| Architecture | PASS, 0 violations, 9 accepted baseline exceptions | `final-architecture.log` |
| Public API | PASS, 0 missing / 0 changed kind / 0 added | `final-public-api.log` |
| Curated PC1/PC1-V1 + architecture suite | 33 files / 241 tests PASS | `final-curated-tests.log` |
| Full ordinary suite | **NOT CLEANLY OBSERVED**: 36 failed files / 121 failed tests, 407 passed files / 5,524 passed tests | `final-full-suite.log` |
| Baseline pre-existing failures | `lean_work_execution_world` and `architecture/dsh_adapter_clusters` fail at `e938502` too | `baseline-preexisting-failures.log` |
| RC | local tarball + manifest + SHA-256; `dirty:false`; 4,039 files | `dist-rc/`, `research-evidence/pc1v1/rc.json` |
| Installed RC smoke | PASS: Node 24.22, Git 2.53, DSH 0.2.1-rc.3, Ordarium 1.3.1; Windows sandbox WARN; live model BLOCKED | `research-evidence/pc1v1/s10/rc-doctor.json` |
| R9 behavioral gate | BLOCKED; 0 model calls | `research-evidence/pc1v1/live/BLOCKED.json` |

### Full-suite qualification

The full suite was attempted once under Node 24.22 with a 600 s limit. It produced 36 failed files
and 121 failed tests; 407 files and 5,524 tests passed. The failure modes are dominated by the
existing `r3l0*` host-capacity/lock/worktree-cleanup families and the `trajectory_*` first-party DSH
cold-recovery family, with worker timeouts and explicit "capacity lock held by a non-existent pid"
errors. The run is not reported green.

Four failure files were isolated because they touch changed or adjacent areas:
- `lean_delegation_orthogonality` and `lean_delegation_surface` initially failed because the new R8
  basis lookup required an initialized project, and the surface test pinned the old action list.
  Both were corrected; they now pass (11 tests).
- `lean_work_execution_world` and `architecture/dsh_adapter_clusters` reproduce at the frozen
  baseline `e938502` with the same fixture/expectation mismatch (`.palimpsest/worktrees` vs the
  product's `.palimpsest/worlds`; stale adapter/tool-count expectations). They are pre-existing PC1
  issues, not PC1-V1 regressions.

The remaining 32 failed files were not individually re-triaged. Their observed causes are the
environment families above; this report does not claim they are all pre-existing, and it does not
claim the suite is green.

### Platform note

The Windows host has Python only as `py`, not `python`. `execFile("python", …)` cannot launch a
`.cmd` wrapper, so the in-place gate suite was run with a test-owned `python.exe` launcher shim in
the untracked `node_modules/.bin` directory. This is an environment qualification note, not a
product change.

## 11. Release candidate details

- RC version label: `0.2.0-pc1.1-pc1v1` (the package version remains `0.2.0-pc1.1`; the label is
  local delivery metadata).
- Source: Code Freeze 2 `bf5e59e338962e9316d5be97c92271091c56e552`, tree
  `304bf165052b5b69edc87ade6360ea96cf95a00e`, `dirty:false`.
- Contents: `dist/`, product CLI, PC1-V1 docs, PC1 docs/pack, scenario scripts, PC1-V1 live runner,
  examples and `research-evidence/pc1v1`.
- Manifest: 4,039 staged files with per-file SHA-256.
- Tarball SHA-256: `722e616d6647e6c28c3be764c6f53b6437515da1091cd2f3fc796536732a8dcd`.
- Installation/upgrade/rollback limits: no registry publication; no canonical migration; the new
  review adoption fields are additive to `review.sqlite`; the RC is local and not a deployment
  authorization.

## 12. Unresolved limitations and owner decisions

1. **Behavioral cohort** — no new PC1-V1 spend authorization; R9 is BLOCKED. A future cohort must
   supply the authorization file, a frozen cohort, provider/runtime readiness and both P/F
   conditions.
2. **Real independent Subagent** — not run. The deterministic receipt/consume path is ready; actual
   multi-agent synthesis is not claimed.
3. **Full suite** — not cleanly observed on this Windows host. A supported, resource-controlled
   WSL2/Linux run is needed before claiming a green full suite. The two baseline-reproduced failures
   and the remaining environment families are documented, not hidden.
4. **Operator identity** — the local CLI `operatorId` assertion is still a local assertion, not a
   remote IdP. A deployment that needs stronger identity must supply a real `OperatorAuthorityPort`.
5. **PR / mainline** — no PR was opened and `main` was not moved. Integration is an owner decision.
6. **Test-owned resources** — `.pc1-rig`, `.pc1-tmp`, `.c6r-rig`, `.cog5-rig`, the new PC1-V1
   worktree/evidence and the untracked Python shim were retained; no credentials were added.
7. **Canonical growth** — no new canonical owner/ledger/promotion path was created. The remaining
   question is product scope, not architecture: whether the selective-governance direction is worth
   another live cohort.

## 13. Final state

- Code Freeze 2: `bf5e59e338962e9316d5be97c92271091c56e552`.
- RC digest: `722e616d6647e6c28c3be764c6f53b6437515da1091cd2f3fc796536732a8dcd`.
- R9: `BLOCKED`, 0 model calls.
- No PR, no main movement, no force-push, no historical rewrite.
- The evidence manifest and code manifest are generated from committed bytes and do not hash
  themselves; `research-evidence/pc1v1/rc.json` and `docs/programs/pc1v1/FREEZE.json` record the
  exact identities.
