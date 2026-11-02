# PC1-V1 — Root-cause and outcome plan (R0)

Status: engineering ruling prepared before any production change on
`palimpsest-pc1v1-governance-to-outcome`.

## 1. Baseline and method

| Fact | Value |
|---|---|
| Source branch | `palimpsest-product-convergence-v1` |
| Source HEAD | `e938502005e8d9334c2438fa47488f253bd78cc8` |
| Source tree | `0749706c5cc4800b996e86eb728650bb1a1d8beb` |
| Protected `main` | `044330b2e55198542d545edc42ed9c36e7ce896b` (unchanged) |
| PC1-V1 branch | `palimpsest-pc1v1-governance-to-outcome`, created at the source HEAD |
| Node | local `v24.14.1` is below `engines.node >=24.15.0`; staged `v24.22.0` is used for qualification |
| Ordarium | `@ordarium/core`, `host-kit`, `ledger-sqlite`, `testing` 1.3.1 |
| DSH | local runtime bundles `0.2.0-rc.2`; the PC1 scored campaign used the separately staged WSL DSH runtime recorded in `research-evidence/pc1/live/cohort.json` |

The ruling uses the actual source paths and the eight PC1 scored sessions. It does not use a new
model call, and it does not treat a plausible function as a proven cause. Each item separates what
was observed, what the code does, what is inferred, and what remains unproven.

Binding historical result: PC1's comparative verdict is `NOT_SUPPORTED`. Palimpsest was stronger on
provenance and negative-standing, but not cheaper or more complete overall. This stage must not
convert that negative result into a favorable one by changing the comparison.

## 2. R1 — Completion and Release disagree

**Observed failure.** The field-study design task wrote only Markdown. `finish` completed it under
a contract that narrowed the standard's command checks, yet the model-visible `nextEvidenceNeeded`
still named `exists(tests_pass)`, so the task looked simultaneously complete and unpromotable. In
the Sablewick P run the same split appeared as a missing `tests_pass` atom after a valid
documentation result.

**Actual code path.**
- `src/domain/completion_contract.ts:170-186` sets `documentationOnly` from the envelope's write
  paths and omits every `run_standard_command` check.
- `src/domain/standard.ts:58-76` derives `standardGateChain()` from the full confirmed standard,
  with no task applicability.
- `src/tools/controller.ts:1293-1310` declares that full chain once as `gate-release`.
- `src/tools/controller.ts:3134-3268` makes `finish` execute the narrowed contract.
- `src/tools/controller.ts:3272-3279` reports `nextEvidenceNeeded` by evaluating every declared gate
  against the attempt, so the full gate still demands the omitted predicate.
- `src/tools/controller.ts:57-76` and `src/tools/controller.ts:4331-4433` expose a status that has
  no single derived acceptance requirement.
- `src/evidence/gate_dsl.ts:209-234` matches `where` only inside the evidence `value` map, and
  `src/tools/work_evidence.ts:242-260` records no command identity there. Two commands labelled
  `tests_pass` therefore cannot be distinguished by an unqualified `exists(tests_pass)`.
- `src/evidence/promotion_eligibility.ts:381-389` enforces a gate only when the caller supplied
  one; `src/effects/promotion.ts:286-306` likewise makes the gate optional.

**Inferred cause.** Completion and release have two derivations of the same bar: a task-aware
contract and a project-wide gate. The product never reconciles them, and command evidence has no
per-command identity for a narrow clause to match.

**Missing proof.** No current test reproduces a documentation task that completes and then fails a
standard-derived release gate. No test distinguishes two same-predicate commands. No test proves a
not-authorized command is refused with an actionable requirement rather than silently skipped.

**Minimal change.** Keep the gate definition historical and unmodified. For the standard-derived
`gate-release` only, derive an effective chain from the attempt's completion contract:
`assert_write_scope` → `write_scope_valid`; `assert_required_artifacts` → `expected_files_exist`
with the declared-paths digest; each `run_standard_command` → its predicate with the exact
`command_digest`. Record `command_digest` and `paths_digest` in new evidence atoms (the `value` map
is already open). Evaluate that effective chain in `evaluateAttemptGate`, `nextEvidenceNeeded`,
promotion preview and promotion admission. Old atoms and old gate declarations stay byte-identical.

**Expected outcome effect.** A valid documentation/data task reaches genuine promotion eligibility
without manufacturing a command; a missing applicable command still blocks; two distinct commands
cannot be satisfied by one observation.

**Negative controls.** (a) docs task with no command; (b) two same-predicate commands, one run;
(c) command required but not authorized; (d) structural check claimed by an unrelated exit-zero
command; (e) historical gate/evidence replay; (f) empty/partial artifact list.

**Rollback/compatibility.** The gate declaration and event schema do not change. The effective
chain is a read-time derivation over the same owners. A deployment can still evaluate a manually
declared gate as before; only the standard-derived release gate is qualified.

## 3. R2 — Status advertises transitions the Scheduler will refuse

**Observed failure.** A READY task produced `palimpsest_work action=next` advice while a VERIFYING
task owned the Scheduler's latch. The follow-up call returned no event. The same broad state
inference appears in the continuity summary.

**Actual code path.**
- `src/scheduler/scheduler.ts:220-238` treats ACTIVE/VERIFYING as latch stages; the default
  concurrency is 1.
- `src/scheduler/scheduler.ts:270-290` activates READY only if activation capacity remains.
- `src/adapters/dsh/normal.ts:44-80` infers `nextActions` from task states alone.
- `src/project_continuity/service.ts:255-266` does the same inference independently.

**Inferred cause.** The model-facing surface duplicates a decision the Scheduler already owns, and
the duplicate does not read the Scheduler's pure `decide()` result.

**Missing proof.** No test asserts that a status action is a transition the Scheduler would actually
commit for each of the required states.

**Minimal change.** Add a read-only `nextDecisionPreview()` to the Work owner and a pure
`explainWorkState()` derivation over task states, scheduler control, the preview decision, holds,
the promotion fence, the head state and the completion standard. Put the resulting `nextAction`
into `status()`, `safeStatus()` and continuity. Suggest `next` only when the pure decision is
non-null; otherwise explain the exact latch/authority blocker.

**Expected outcome effect.** Fewer futile calls, no private implementation inspection, consistent
agent/operator explanation.

**Negative controls.** READY with no blocker; READY while VERIFYING; dependency blocked; paused;
held task; promotion fence; missing standard; unsatisfied evidence.

**Rollback.** `nextAction` is additive status data. Removing it restores the old inference.

## 4. R3 — Exploratory cognition is forced through formal Work

**Observed failure.** The field-study P condition represented design, evidence review, delivery
analysis and synthesis as four formal Work tasks. The design result entered VERIFYING and the
single-task latch prevented the other three from running. Only `study-plan.md` was produced.

**Actual code path.** `src/scheduler/scheduler.ts:220-238`; `src/domain/stage_graph.ts:321-349`
declares the default single-task stages; `src/adapters/dsh/normal.ts:121-139` exposes `plan` as the
only way to structure multi-part work.

**Inferred cause.** The product has no normal, durable way to record exploratory findings outside
canonical Work, so the model reasonably models research roles as Work tasks.

**Missing proof.** No deterministic product path shows independent exploration producing findings
and a complete candidate deliverable without serial formal acceptance.

**Minimal change.** Add a Journal-backed exploration record (`pc1-exploration/v1`) to the normal
work tool: `explore` (open/record/close a research question with sources, uncertainty and candidate
artifacts) and `explorations` (read them). Exploration creates no Task, Attempt, Evidence,
Promotion or ProjectIR change. Keep the Stage Graph unchanged and keep one formal governed task for
the final deliverable. Use the existing delegation/collaboration mechanisms for real independent
help where available.

**Expected outcome effect.** Independent research can proceed while a formal result waits; findings
remain explicitly candidate/exploratory; acceptance stays separate.

**Negative controls.** An exploration finding cannot satisfy a Work gate; closing an exploration
does not move the plan; a formal task still needs its own completion and acceptance.

**Rollback.** The exploration entries are non-canonical journal notes. Removing the tool leaves
canonical state untouched.

## 5. R4 — The in-place boundary is not explicit before the first write

**Observed failure.** The in-place principal edited live project files and advanced the repository
HEAD before promotion. Completion caught uncommitted/out-of-scope edits, but only after they
happened.

**Actual code path.** `src/product.ts:53-90` defaults `execution` to `in-place`;
`src/adapters/dsh/normal.ts:182-217` exposes `begin`/`complete` without stating that native edits
are already live; `src/tools/controller.ts:3946-3965` checks only that the recorded commit equals
the live HEAD at promotion.

**Inferred cause.** The product conflates "the canonical ProjectIR head did not move" with "the live
Git tree did not change".

**Missing proof.** No test states and verifies the declared boundary before the first write in both
placements.

**Minimal change.** Add an explicit execution-boundary projection to status/begin/complete:
placement, `liveRepositoryMutable`, isolation, and a plain warning that in-place completion observes
scope but cannot prevent an earlier edit. Recommend isolated execution for high-impact candidates;
do not silently claim isolation. Keep in-place as the low-risk default.

**Expected outcome effect.** Users and agents can distinguish direct editing from governed candidate
work, and the warning precedes the first edit.

**Negative controls.** In-place edit changes the live tree; canonical head unchanged until
promotion; worktree candidate not visible on the canonical branch; out-of-scope change refused;
missing world not recreated; result export does not move head; authorized promotion moves it exactly.

**Rollback.** Boundary data is additive and presentation-only.

## 6. R5 — A model proposal does not reach Operator Review

**Observed failure.** `palimpsest_work propose` writes a Journal IDEA; the operator `review` commands
read a separate ReviewService store. The two storage paths do not meet.

**Actual code path.** `src/adapters/dsh/normal.ts:219-262` writes the journal entry;
`src/project_review/service.ts:85,303-305` lists only the review store;
`src/cli_product.ts:203-252` drives the review store.

**Inferred cause.** The proposal contract was implemented twice: once as Journal prose and once as
review metadata, with no verified adoption step.

**Missing proof.** No test shows a model-created proposal appearing in `review list` and being
applied without an operator reconstructing it.

**Minimal change.** Add one verified Journal adoption path into the existing ReviewStore. Parse the
`pc1-proposal/v1` block, validate required fields, bind the exact content/proposal digest, and make
adoption idempotent. Add a generic `ACTION` proposal kind whose application records an
operator-approved Journal note; plan/source proposals continue to use the existing plan/source
application owners. A malformed proposal becomes a reviewable incomplete record with the missing
fields named. No second proposal database.

**Expected outcome effect.** The natural model proposal is visible, exact, and decidable by an
operator; no model can approve itself.

**Negative controls.** Duplicate adoption; changed journal content; stale basis; missing scope;
unauthorized decide/apply; model-supplied operator identity.

**Rollback.** The review store is non-canonical and additive; abandoning it loses only proposal
metadata, not project state.

## 7. R6 — Exact source approval is optional at acceptance

**Observed failure.** PC1 `verifySourceIntake` can detect wrong bytes, but it is an explicit expert
operation. No normal promotion path is required to call it.

**Actual code path.** `src/project_review/service.ts:484-512` implements the comparison;
`src/effects/promotion.ts:344-395` assesses promotion without any source-intake admission;
`src/tools/controller.ts:3973-3989` exposes eligibility without it.

**Inferred cause.** The verification exists as a capability, not as an admission requirement bound
to the Work task that an approved intake created.

**Missing proof.** No RED test produces an approved candidate, a different-but-in-scope result and
a successful promotion.

**Minimal change.** Bind the applied SOURCE_INTAKE proposal to the Work task it created (the review
record already carries the task id, target path, approved digest and basis). Add a source-intake
admission read port to promotion eligibility. It verifies result commit readability, target blob
digest, changed paths within the approved scope, and current proposal basis. Only tasks bound to an
approved intake are affected. Direct promotion refuses with a typed blocker when unverified.

**Expected outcome effect.** Wrong bytes cannot become accepted merely because file and scope checks
pass; correctly approved bytes proceed.

**Negative controls.** Wrong digest; changed source after approval; changed project basis;
duplicate effect; unapproved result; stale operator decision; unrelated Work unaffected.

**Rollback.** The port is optional. Absent means no intake-bound requirement, preserving non-intake
promotions.

## 8. R7 — Historical acceptance is confused with current applicability; hard constraints are late

**Observed failure.** Continuity lists every promotion fact as `ACCEPTED_FOR_PURPOSE` without a
current-world assessment. The field-study P run also made an R4 day-count error (called the
snapshot day 7 and about day 27; the correct count is D8 + 21 = D29 against D28).

**Actual code path.** `src/project_continuity/service.ts:122-135` builds accepted results directly
from promotion facts; `src/project_continuity/service.ts:255-266` derives next actions from broad
states; `src/project_continuity/service.ts:344-391` uses a fixed capsule order. No mechanical
schedule/cost/unit/coverage check exists in the normal path.

**Inferred cause.** Historical acceptance and current applicability are one field, and the product
offers no explicit calculator for constraints that the agent can run before committing.

**Missing proof.** No test separates historical acceptance from current applicability, and no
deterministic evaluator produces D29 from D8 + 21 without hardcoding the scenario answer.

**Minimal change.** Add `historicalAcceptance` and `currentApplicability`
(`APPLICABLE|CONTRADICTED|SUPERSEDED|UNKNOWN`) with an explicit basis; default to `UNKNOWN` when no
current-world assessment exists; mark earlier promotions for the same task `SUPERSEDED`. Reorder the
capsule around binding constraints, blocking state, negative findings, open assumptions, next legal
actions and source refs. Add pure hard-constraint evaluators for schedule, budget, unit conversion,
coverage, source identity and approval, exposed during candidate formation. They return `PASS`,
`FAIL` or `UNKNOWN` from explicit inputs and disclose their assumptions; no scenario answer is
embedded.

**Expected outcome effect.** Historical facts do not become current truth by appearing in an
accepted list; an agent can correct D8 + 21 > D28 before formal acceptance.

**Negative controls.** Conservative `UNKNOWN` is not incompatibility; a negative Journal entry does
not prove business impossibility; a calculator cannot return a caller-chosen status.

**Rollback.** Applicability and capsule changes are derived reads; the calculators are pure and
additive.

## 9. R8 — Handoff/Receipt is not connected to real delegation

**Observed failure.** All eight PC1 sessions were single-principal. The receipt contract was not in
the delegation return path, so no real independent contribution was delivered or consumed.

**Actual code path.** `src/interaction/delegation.ts:360-430` settles a branch and delivers a
conclusion, but has no handoff/receipt projection; `src/project_handoff/service.ts` is unused by
that path; `src/adapters/dsh/product.ts:147-183` exposes only start/status/inspect.

**Inferred cause.** The collaboration contract and the delegation runtime were implemented in
separate slices without an adapter between them.

**Missing proof.** No test consumes a terminal delegation result into a receipt and a durable
principal decision; no live independent Agent has run.

**Minimal change.** Build the Handoff from the actual frozen delegation basis and runtime
capability, build the Receipt from the actual terminal projection (executor identity, basis, status,
conclusion, declared-not-observed footprint), and add an idempotent `consume` action that records
the receipt and the principal's decision note in the Journal. Do not turn the finding into
Evidence or canonical truth.

**Expected outcome effect.** A real delegated result, when a branch host and model are available,
has a durable delivery/consumption path and an honest independence label.

**Negative controls.** Duplicate delivery; late delivery; interrupted host; restart; conflicting
claims; consumed-but-not-adopted; same-root receipts not counted as independent verification.

**Rollback.** Handoff/receipt projection is non-canonical and additive.

## 10. Measurement ruling and budget

PC1's eight scored sessions remain the behavioral baseline. This stage will not spend model tokens
during R0–R8. A scored PC1-V1 cohort requires a new, explicit owner authorization; the prior PC1
"no special limit" authorization is not inherited by this programme. If no such authorization is
supplied, R9 is reported `BLOCKED`, the deterministic engineering and frozen runner are still
completed, and no model result is fabricated.

The comparison target remains the same model family and native DSH baseline, with matched facts and
capabilities. Palimpsest does not receive the evaluator oracle. A negative or equivalent result is
a valid product finding.

## 11. Acceptance map

| Goal | Deterministic evidence | Behavioral evidence |
|---|---|---|
| G1 | R1 RED/pass tests: docs completion, same-predicate commands, unauthorized command, structural evidence, historical replay | Not required to establish consistency |
| G2 | R2 state matrix with pure Scheduler decisions | Can be observed in a future cohort |
| G3 | R3 exploration path + field-study golden-path test | Live independent research `BLOCKED` without budget/provider |
| G4 | R4 placement/boundary tests | In-place behavior observable in any run |
| G5 | R5 propose → adopt → preview → decide → apply | Model-created proposal can be run deterministically |
| G6 | R6 wrong-byte RED and correct-byte pass | Promotion refusal observable deterministically |
| G7 | R7 applicability + hard-constraint evaluators | Corrected R4 reasoning only observable with a new cohort |
| G8 | R8 receipt/consume protocol test | Real subagent contribution `BLOCKED` without a branch host/model |
| G9 | Frozen protocol, matched runner, preflight | `BLOCKED` without explicit new spend authorization |
| G10 | Build, architecture, public API, focused suites, RC, manifests | — |

This plan is a ruling, not a claim that any proposed repair has succeeded. Each item must be
demonstrated by the tests and evidence named above before the final report can claim it.
