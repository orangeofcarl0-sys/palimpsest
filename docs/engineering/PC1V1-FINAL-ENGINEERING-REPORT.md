# PC1-V1 — Final engineering report

## 0. One accurate verdict

**The measured product gaps are corrected, deterministically qualified, and now behaviorally
observed. Eight matched real-model sessions completed with real Subagents and zero provider errors.
Both P and F were correct and complete; F used 15.16M tokens versus P's 26.52M. The required
comparative benefit is `NOT_SUPPORTED`; strong native DSH is competitive or superior on this
evidence.**

| Judgment | Result |
|---|---|
| Source attribution and baseline | `ESTABLISHED` — all changes are bound to the PC1 source, exact PC1-V1 commits and reproducible tests |
| Completion/Release consistency | `ESTABLISHED` deterministically — a documentation/data task can complete and be promotion-eligible under one applicable bar; missing applicable evidence still blocks |
| Actionable product state | `ESTABLISHED` — the live P session used `start` to claim a created position and continued through the Field Study without the old VERIFYING deadlock |
| Cognitive work productivity | `ESTABLISHED` behaviorally — both conditions produced all five Field Study artifacts; P completed T1/T2 instead of stopping at the design |
| Safe effect boundaries | `ESTABLISHED` deterministically — the in-place and worktree boundaries match observed filesystem/Git behavior |
| Proposal/Review continuity | `ESTABLISHED` deterministically — a model-originated Journal proposal can be adopted, reviewed and applied with exact-digest authority; live P recorded proposals but no operator decision was made in-session |
| Exact source acceptance | `ESTABLISHED` deterministically — wrong-but-in-scope bytes complete file/scope checks but cannot be promoted; correct bytes can |
| Currentness and decision correction | `ESTABLISHED` behaviorally — P and F both reported the Field Study R4 D29/2026-03-30 miss correctly at T2 |
| Actual independent contribution | `ESTABLISHED` behaviorally — 11 real Subagent child sessions across the eight principal runs; their findings were consumed and cited in the final artifacts |
| Comparative product value | `NOT_SUPPORTED` — both conditions correct and complete; P used 26.52M tokens vs F 15.16M (+75%); no P correctness or completeness advantage |

The primary product decision is **E — Strong native DSH remains competitive or superior**. Preserve
advanced governance for high-impact exact-source/high-risk acceptance workflows, but do not make the
full governance path the default for ordinary planning. The live details are in
[`PC1V1-LIVE-ADDENDUM.md`](PC1V1-LIVE-ADDENDUM.md).

## A. Git and delivery identity

| Fact | Value |
|---|---|
| Repository | `orangeofcarl0-sys/palimpsest` |
| Incoming branch | `palimpsest-product-convergence-v1` |
| Incoming HEAD / tree | `e938502005e8d9334c2438fa47488f253bd78cc8` / `0749706c5cc4800b996e86eb728650bb1a1d8beb` |
| Protected `main` | `044330b2e55198542d545edc42ed9c36e7ce896b` — unchanged |
| PC1-V1 branch | `palimpsest-pc1v1-governance-to-outcome` |
| Code Freeze 1 | `b7cb43b771f76efe2d8efa5eb63318b9ff83b43b` / tree `e2af03a1e5c16618428fb4520b3483497c1c0496` |
| Code Freeze 2 | `bf5e59e338962e9316d5be97c92271091c56e552` / tree `304bf165052b5b69edc87ade6360ea96cf95a00e` |
| Code Freeze 3 (signed operator identity) | `e6159e6b2bf595d8eecb4c709f57e315c1bb5854` / tree `fae1a606a5d8eba269adbd772e4c015104f9502a` |
| Code Freeze 4 (Subagent/cohort tooling) | `6c8ebd98f9e8f89804201d0b77c6d57d96ff0898` / tree `8ade5b49b2f2ceee0838ea619d8e996500df2cff` |
| Code Freeze 5 (scoring isolation, start claim) | `7edb4c622c62c9623767185ef87c3f32b5b6e901` / tree `bce3722ac14456cb89906f970e49d95413698a74` |
| Code Freeze 6 (runtime/prompt behavior) | `92158e37b66b2a649093d870765b6e8b312d6d58` / tree `a0c4e007ca42fbb83f9c6b678a112d5c050ea340` |
| Code Freeze 7 (RC packaging only) | `b93f1ff991777ba9e702e657f0eda7bf0680e3bd` / tree `9f3f6f39ee68842f0d6455ed3d237852008ca493` |
| **Code Freeze 8 (final executable; behavior-preserving CI correction)** | **`18a9c1cef45fda9373b50004ee70650b0e9579af` / tree `8914b91f708dd01b1f6fad26a03d5234f72e545d`** |
| RC | `dist-rc/palimpsest-0.2.0-pc1.1-pc1v1.tar.gz` (rebuilt from Code Freeze 8; see `research-evidence/pc1v1/rc.json`) |
| Evidence freeze | the commit containing this report, the live addendum, `research-evidence/pc1v1` and the manifests |
| PR / mainline | owner authorized PR/merge on 2026-11-03; see §12/§13 for the final integration state |

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
research no longer has to be represented as four formal Work tasks. The scored P sessions chose
this path: Field Study T1/T2 completed all five artifacts while the formal design result remained a
candidate, and P continued through T2 rather than stopping at the old latch.

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

The live P session initially exposed a real `start` dead-end (the model fell back to inspecting
private implementation details); it was corrected by claiming an existing `ATTEMPT_CREATED`
position. The scored P T1 used the corrected `start` path, and the scored P T2 continued through
exploration/proposals instead of the old VERIFYING deadlock. A precise reduction in futile-tool-call
count was not separately instrumented.

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
non-canonical; effects still travel through the existing plan/intent/Work/Promotion owners. The
scored P sessions recorded structured open questions and exact-digest proposals but made no
acceptance or promotion. The local CLI now requires an Ed25519-signed operator credential; a bare
operator-id string no longer decides or applies.

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

The live R4 correction was exercised: at T2 both P and F correctly reported completion on
2026-03-30, the Day 29 miss against the D28 boundary, and the absence of an approved same-day
order. P also recorded an explicit hard-constraint budget note. The evaluator does not embed the
scenario answer; it computes from the supplied observation day, lead time and latest day.

## G. Multi-agent cooperation

A real independent model Agent **did** run: every scored principal session used the native DSH
`subagent` tool, producing 11 child sessions in total (P 4 subagent calls, F 7), whose findings were
reported separately and cited in the final artifacts. This meets the behavioral
independent-contribution gate. The Palimpsest-specific delegation receipt/consume path was not the
live mechanism the P model chose; it remains exercised with a controlled branch host through the
real `makeDelegationService` path: start → terminal settlement → Handoff/Receipt projection →
`inspect` → `consume`. The receipt names the executor identity, basis, status, claim and the
**declared** read footprint; `hypothesis: true` prevents a finding from becoming the positive side
of an independence count. Two branches over the same frozen basis are shown not to be independent
verification.

The product adapter records one idempotent non-canonical consumption note. It does not accept the
finding, create Evidence, promote, or revise ProjectIR. The final decision's `changedPlan` is the
principal's own statement, not a machine inference.

Because no real model Subagent ran, G8 is `NOT EXERCISED` behaviorally; the deterministic protocol
path is `PARTIAL`.

## H. Native DSH comparison

A matched PC1-V1 P/F cohort ran: eight principal sessions, both conditions at Sablewick T1/T2 and
Field Study T1/T2, same provider/model, same visible facts, same observation times and the same
Subagent invitation. Both conditions used real Subagents. All 19 model sessions (8 principal + 11
Subagent child sessions) completed; provider errors were 0.

**Correctness/completeness:** equal. Both conditions found Candidate A and kept it unaccepted, both
identified Site B's no-compliant-vendor condition, both ignored the newsletter, both distinguished
the corrected candidate from the duplicate at T2, and both made no acceptance/promotion. In the
Field Study both produced all five artifacts, applied the unit conversion, detected the Echo
high-humidity bias, treated the 6,000 directive as a request, and correctly reported the D29 /
2026-03-30 R4 miss. P also passed the explicit `json-artifact` contract.

**Cost:** P used **26,524,721** tokens; F used **15,160,662** (+75% for P). Sablewick: P 4.23M vs F
3.40M (+24%). Field Study: P 22.30M vs F 11.76M (+90%). F used more Subagent child sessions (7
calls vs 4 for P) and was still cheaper. P has stronger structured provenance/negative-standing;
that did not produce a better business decision, a more complete artifact set or lower cost.

**Verdict:** the required comparative benefit is **`NOT_SUPPORTED`**. Strong native DSH is
competitive or superior on this evidence. The earlier PC1 negative finding is confirmed rather than
overturned, although PC1-V1 P is materially improved relative to PC1 P (complete artifacts and
correct R4 rather than the VERIFYING deadlock/day-count error).

## I. Product decision

**Primary recommendation: E — Strong native DSH remains competitive or superior.**

The matched P/F cohort shows equivalent correctness and completeness at materially higher P cost.
Simplify the default product path and preserve advanced governance for demonstrated high-impact
exact-source/high-risk acceptance workflows, where the deterministic R5/R6 safeguards have value
even though this cohort did not exercise them as a correctness advantage.

**B — Gain is selective** remains the packaging direction for the retained advanced features:
trustworthy governance for high-consequence acceptance, direct/ordinary editing for the rest. Do not
choose A: there is no favorable comparative evidence. Do not make the full governance path the
default for ordinary planning.

## 10. Verification evidence

| Check | Result | Evidence |
|---|---|---|
| Build (Node 24.22.0) | PASS | `research-evidence/pc1v1/s10/final-build.log` |
| Architecture | PASS, 0 violations, 9 accepted baseline exceptions | `final-architecture.log` |
| Public API | PASS, 0 missing / 0 changed kind / 0 added | `final-public-api.log` |
| Curated PC1/PC1-V1 + architecture suite (CF8) | **36 files / 272 tests PASS**, including the adapter guard and trajectory kernel-coverage test | `final-curated-tests-cf8.log` |
| Full ordinary suite (Windows) | **NOT CLEANLY OBSERVED**: 36 failed files / 121 failed tests, 407 passed files / 5,524 passed tests | `final-full-suite.log` |
| Full ordinary suite (WSL-native Git clone, pre-CF8) | 37 failed files / 134 failed tests; 407 passed files / 5,515 passed tests; CF8 fixes the adapter guard identified in this log, but the full suite was not rerun | `final-full-suite-wsl-git.log` |
| Baseline pre-existing failures | `lean_work_execution_world` and `architecture/dsh_adapter_clusters` fail at `e938502` too | `baseline-preexisting-failures.log` |
| RC | local tarball + manifest + SHA-256; `dirty:false`; 4,042 files | `dist-rc/`, `research-evidence/pc1v1/rc.json` |
| Installed RC smoke | PASS: Node 24.22, Git 2.53, DSH 0.2.1-rc.3, Ordarium 1.3.1; Windows sandbox WARN; live model BLOCKED | `research-evidence/pc1v1/s10/rc-doctor.json` |
| R9 behavioral gate | **EXECUTED**: 8 principal runs, 11 Subagent child sessions, 0 provider errors, 41,685,383 tokens; both conditions correct/complete | `research-evidence/pc1v1/live/usage.json`, `outcomes.json`, `PC1V1-LIVE-ADDENDUM.md` |

### Full-suite qualification

The Windows full suite was attempted once under Node 24.22 with a 600 s limit. It produced 36 failed
files and 121 failed tests; 407 files and 5,524 tests passed. The failure modes are dominated by the
existing `r3l0*` host-capacity/lock/worktree-cleanup families and the `trajectory_*` first-party DSH
cold-recovery family, with worker timeouts and explicit "capacity lock held by a non-existent pid"
errors. An initial WSL run without `.git` was invalid for architecture/history tests and is
preserved separately (`final-full-suite-wsl-nogit.log`). A valid WSL-native run from a
`git clone --no-hardlinks` of the branch is recorded in `final-full-suite-wsl-git.log`; its exact
counts are reported with that log, and the suite is not called green unless that log is green.

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
- Source: final executable Code Freeze 8 `18a9c1cef45fda9373b50004ee70650b0e9579af`, tree
  `8914b91f708dd01b1f6fad26a03d5234f72e545d`, `dirty:false`. The live cohort itself ran at Code
  Freeze 6; Code Freeze 8 moves the hard-constraint vocabulary behind the application facade and
  restores the adapter-cluster guard without changing the measured behavior.
- Contents: `dist/`, product CLI, PC1-V1 docs/pack, PC1 docs/pack, scenario scripts, PC1-V1 live
  runner and examples. The raw live evidence archive is deliberately external because its deep
  paths exceed the Windows package path budget; it is committed and manifested separately.
- Manifest: 4,042 staged files with per-file SHA-256.
- Tarball SHA-256: `844b6ee2b7b9b067844aed52a1d429cf6e8227aef32fbbdec0136cf34d2d4fdb`
  (recorded externally in `research-evidence/pc1v1/rc.json`).
- Installation/upgrade/rollback limits: no registry publication; no canonical migration; the new
  review adoption fields are additive to `review.sqlite`; the RC is local and not a deployment
  authorization.

## 12. Unresolved limitations and owner decisions

1. **Behavioral cohort** — executed for 8 scored sessions; P/F both correct and complete. P is not
   cheaper: 26.52M vs 15.16M tokens. The comparative benefit is `NOT_SUPPORTED`.
2. **Real independent Subagent** — executed: 11 child sessions; both conditions used independent
   Subagents and cited their findings. The Palimpsest-specific delegation receipt/consume path was
   not the live mechanism used by the P model; it remains deterministically tested.
3. **Full suite** — the Windows run is not clean; a WSL-native controlled run was started. Its exact
   result is recorded in the latest evidence log; this report does not call the suite green unless
   that log does.
4. **Operator identity** — the CLI now verifies an Ed25519-signed local credential; it is still not
   a remote IdP/SSO. A deployment needing federated identity supplies its own
   `OperatorAuthorityPort`.
5. **PR / mainline** — owner authorized PR/merge on 2026-11-03; the final integration state is
   recorded below after the integration attempt.
6. **Test-owned resources** — `.pc1-rig`, `.pc1-tmp`, `.c6r-rig`, `.cog5-rig`, `.pc1v1-rig`, the
   live evidence and the untracked Python shim were retained; no credentials were added to the
   repository.
7. **Canonical growth** — no new canonical owner/ledger/promotion path was created. The measured
   product direction is selective governance, not more default Work.

## 13. Final state

- Final executable Code Freeze: `18a9c1cef45fda9373b50004ee70650b0e9579af`.
- Live-cohort runtime/prompt Code Freeze: `92158e37b66b2a649093d870765b6e8b312d6d58`.
- RC digest: `844b6ee2b7b9b067844aed52a1d429cf6e8227aef32fbbdec0136cf34d2d4fdb`.
- R9: `EXECUTED`; 8 principal runs, 11 Subagent child sessions, 0 provider errors, 41,685,383 tokens.
- Comparative benefit: `NOT_SUPPORTED`; strong native DSH competitive or superior.
- PR/mainline: owner authorized; the final integration state is recorded in §12 and the PR/merge
  record. No force-push or historical rewrite was used.
- The evidence manifest and code manifest are generated from committed bytes and do not hash
  themselves; `research-evidence/pc1v1/rc.json` and `docs/programs/pc1v1/FREEZE.json` record the
  exact identities.
