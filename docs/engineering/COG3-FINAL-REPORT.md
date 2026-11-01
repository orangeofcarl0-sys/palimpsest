# COG-3 — Final Report

**Question:** can Palimpsest's existing, normally composed capabilities enable one real agent's
independent finding to influence another agent's subsequent work, correctly account for changing
project reality, and produce measurable value beyond strong ordinary-file and native DSH
collaboration baselines?

**Answer:** the handoff is **real**. A shipped-host principal started a delegated research branch
over a frozen basis, the branch read the sources, its finding was admitted and delivered, and the
principal changed a load-bearing planning assumption with it. The principal also revised the plan
correctly when the project reality changed. But **no advantage over the native DSH baseline was
demonstrated**, and Palimpsest was by far the most expensive condition.

**Stage label:** `COG-3: PARTIAL — REAL HANDOFF AND INFLUENCE, NO SUPERIORITY`.

Gate verdicts: **G0 ESTABLISHED, G1 ESTABLISHED (after one bounded correction), G2 ESTABLISHED,
G3 PARTIAL, G4 PARTIAL, G5 ESTABLISHED** (with the budget overrun disclosed).

---

## 1. Executive summary

- **The COG-2 limitation was a deployment artefact.** The normal host composes the branch port,
  reasoning store, terminal delivery and cold resume (`localExplore: AVAILABLE`, `attention: ACTIVE`).
  COG-2's `CAPABILITY_REQUIRED` was produced by a direct `launchDeployment` call with no host
  services and pull-only attention.
- **One real defect was found and fixed.** A `PROJECT_READ_ONLY` branch was told it had exactly one
  tool and to reason only over the brief. Live, it made one call and answered "undetermined" while
  the answer sat in a tracked file at its own basis. The prompt is now profile-aware; the branch
  reads its frozen snapshot, and the result shape no longer invites a settlement-breaking citation.
- **The handoff works end to end.** The branch read seven sources (9 calls), settled as ADMITTED,
  delivered a grounded conclusion with its basis, and the principal consumed it.
- **Influence is real but not exclusive.** In the scored run the principal naturally delegated the
  per-reel scan-time question, used the delivered 20–40 minute range to set a 20–30 minute planning
  assumption and a three-week booking. It also web-searched the same question, so the finding is not
  the sole cause.
- **Currentness is partially established.** The applicable finding was used; the stale finding was
  correctly not carried into the revised plan (B scanning moved to 2–20 February before the 1 March
  room closure); the irrelevant figure was confined to the newsletter; the estate conflict was
  preserved. The last two were not delivered results, so those cases are partial.
- **No comparative advantage.** The single-agent baseline scored 11/12 on the common rubric for
  1.83M tokens. The native DSH baseline, with one subagent, scored 12/12 and produced the strongest
  risk analysis in the campaign for 8.54M tokens. Palimpsest scored 12/12 for 16.22M tokens. The
  strongest risk analysis in the campaign came from the native baseline's red-team subagent.
- **The campaign exceeded its token cap** (27.13M against 25M), the F baseline was truncated, and
  P-minus was not run. That is a protocol violation, reported rather than hidden.

## 2. A. Git and resource integrity

| question | answer |
| --- | --- |
| Incoming commit / tree | `2928adc187ea3598639c5bd1e42828448d6ce56d` / `77ba519540ba23dc982579b9eda85feee18bd274` |
| Development branch | `palimpsest-cog3-native-synthesis`, created from the incoming commit |
| Commits | `04d972c` (rig + protocol + branch-read correction), `bf21110` (Code Freeze) |
| Production files | `host/dsh/lib/branch_prompt.js` (new), `host/dsh/lib/runner.js` (import/re-export), `test/cog3_branch_read_prompt.test.ts` (new) |
| Historical refs unchanged | `origin/main` `044330b`, local `main` `67b29c9`, COG-2 remote `2928adc`, COG-2 Code Freeze `e23a29a`, COG-2 Evidence Freeze `dec8bf3` |
| Resources | 95 worktree registrations, 19 gate roots, 71 evidence trees (70 + `cog3`), 0 stashes |
| Working tree | clean at the Evidence Freeze except the docs/evidence it commits |
| Deliberately not performed | moving or updating `main`; opening a PR; tags; branch deletion; worktree prune or lock removal; `gc --prune=now`; `clean -fdx`; force-push; rewriting any freeze; P-minus after the cap |

The `r3-a2` remote inconsistency in COG-2's governance record is corrected forward-only in
[`COG3-FORWARD-ERRATA.md`](COG3-FORWARD-ERRATA.md): the remote ref exists at `10a5978`, identical to
the local ref. The COG-2 freeze was not altered.

## 3. B. Actual capability composition

**Available in the real host:** project genesis/read/journal, advisor, local FOCUS, local EXPLORE
(branch adapter present), `palimpsest_collaborate`, `palimpsest_delegate`, long-lived principal,
terminal delivery, cold resume, Project Verification.

**Absent only because of COG-2's diagnostic deployment:** host-derived branch execution, the
delegation service, terminal delivery and active attention. All four are present in the normal host.

**Still unavailable in normal production composition:**

- `crossProject: UNAVAILABLE` (no project directory configured);
- Managed Work: the profile has no confirmed completion standard, and the principal bootstrap path
  requires in-place execution while the profile defaults to worktree. The principal's
  `palimpsest_begin` call was refused with a precise message;
- Project Intent and Trajectory are not model-facing tools.

**Tools actually offered:** 26 `palimpsest_*` tools, including `palimpsest_delegate` and
`palimpsest_collaborate`, verified in the `PALIMPSEST_HOST_READY` line. The branch was restricted to
`palimpsest_branch_result` plus `read`/`glob`/`grep`.

**Did any normal Host execution or delivery fail?** No delivery failed. One non-fatal startup
warning (permission presets over an unconfined bash executor) appears in the logs; it did not affect
tool registration or the run. The only failed calls were the honest Managed Work refusal and, in the
pre-correction probes, the settlement refusal of a malformed result.

## 4. C. Real agent behaviour

- **Actual model executions:** 12 sessions (6 diagnostic probes, 3 P, 1 S, 2 F). One delegated
  branch and one native subagent ran as real second executions.
- **Did the principal naturally choose collaboration?** Yes. In the scored task it was not told which
  tool to call; it read the journal, identified the missing per-reel scan time, and called
  `palimpsest_delegate`. It also called `palimpsest_status`/`inspect` once each (mild polling despite
  the tool description).
- **Did a second real model execute?** Yes: the branch session has 9 tool calls and its own token
  usage; the native subagent session is separate.
- **Did the principal continue independently while the research ran?** Yes: it wrote and edited the
  plan during the launch turn while the branch ran; the delivery arrived as a later follow-up turn.
- **Did the result reach and get consumed?** Yes: `PALIMPSEST_DELEGATION {delivered:true}` and the
  delivery turn quotes and applies the finding.
- **What did the principal change?** The calibration assumption (20–30 minutes per reel), the batch
  size (one reel per 30-minute window), the Filmtek booking (three weeks), and, after the update, the
  whole B window (2–20 February).

## 5. D. Cognitive synthesis

- **Did a new finding influence a decision?** Yes, traceably: branch statement → admitted claim →
  terminal text → principal's delivery turn → plan assumptions. The web search is a co-cause, so the
  causal attribution is bounded.
- **Was the finding source-grounded?** The branch read seven sources at its frozen basis. Its positive
  throughput range is explicitly external calibration, not pack fact; it said so.
- **Was it applicable at use time?** Yes, for the throughput assumption. The plan then treated it as
  an assumption, not as Evidence.
- **Were stale and irrelevant results handled correctly?** Stale: yes (the revised plan moved B before
  1 March). Irrelevant: the 2,340 figure was confined to the newsletter; no delivered irrelevant
  result was tested. Uncertain: C was excluded and the conflict preserved; no delivered uncertain
  result was tested.
- **Did the system preserve uncertainty?** Yes: the plan states its assumptions, the calibration gate
  and the missing per-reel speed; it does not invent a measurement.
- **Did an authorized ProjectIR revision occur?** No. The plan is a deliverable; no ProjectIR
  revision was attempted or claimed.

## 6. E. Comparative value

| | S | F (truncated) | P |
| --- | --- | --- | --- |
| common rubric (Q1–Q5, Q8) | 11/12 | 12/12 | 12/12 |
| currentness / provenance | not exercised | not exercised | 2 + 2 |
| sessions | 1 | 2 | 3 |
| tokens | 1.83M | 8.54M | 16.22M |
| plan | 39 KB | 71 KB | 58/63 KB |
| strongest feature | compact, competent | red-team audit, per-reel sensitivity, go/no-go | conservative grounded plan, correct stale revision |

- **Did ordinary files solve it?** Yes, almost perfectly (11/12); the only gap was the under-analysed
  scan-time assumption.
- **Did native DSH collaboration solve it?** Yes, and better: the subagent's red-team audit produced
  the campaign's strongest uncertainty handling.
- **Was Palimpsest better on quality, reliability, cost or coordination?** No measurable quality
  advantage; higher cost; reliability comparable; coordination not measurably reduced. Its
  distinctive result is the currentness revision, which the other conditions were not given.
- **Attributable vs single-run:** the handoff and the finding's use are attributable to the Palimpsest
  path. Every comparative difference is one run, one evaluator, one model family, no blinding.
- **Unsupported:** superiority over native or file baselines; statistical claims; autonomous
  collaboration; continuous adaptation; generalization beyond this scenario/model.

## 7. F. Engineering outcome

- **Highest-impact bottleneck:** the delegated branch could not exercise the read capability it had,
  because its prompt contradicted the composed tool set; and its natural citation shape broke
  settlement. Both are presentation, not architecture.
- **Bounded correction:** required by the observed failure; one module, one import, five tests.
- **RED/GREEN:** 3/4 failed → 5/5 passed; the fifth assertion failed before its wording was added.
  Live: pre-correction branch 1 call/4,161 tokens/undetermined; post-correction 9 calls/16,798
  tokens/admitted/delivered/consumed.
- **Tests:** build 0; architecture PASS (0 violations, 9 exceptions); public API PASS (0/0/0);
  targeted 15 files/164 tests passed; broad 301 files/3,782 tests with **3 environment-caused
  failures** in `inplace_execution.test.ts`, proven by an isolated 9/9 pass with `python` on PATH.
- **Remaining risks:** environment-dependent gate tests; single-run comparisons; the token cap was
  exceeded; the native baseline was truncated; delivery is in-memory and not crash-durable.
- **New architectural abstraction?** No. The evidence did not justify one.

## 8. G. Future direction

**D — the simple baseline remains equally effective; change the target task class before further
development, and simplify the path that is being compared.**

This is chosen from the evidence, not preference:

1. S solved the task at 1.83M tokens and 11/12; F solved it at 8.54M with a stronger risk analysis;
   P tied F's quality at 16.22M. There is no measured capability gap for Palimpsest to close here.
2. The product's unique contribution in this campaign was not better reasoning; it was a different
   presentation of an independent result and a correct stale revision. That is real, but it did not
   produce a better plan.
3. The task class — a small pack a strong model can read in one context — gives the delegation no
   information advantage. A task class where the raw material genuinely exceeds one context, or where
   independent long-running lines must be reconciled, is the honest next target.

Option A (improve activation/task UX) is not supported: activation worked naturally. Option B (a
bounded composition gap) was the correction already made. Option C (architecture change) is not
justified: the existing composition delivered a real handoff without a new runtime.

## 9. Findings

| id | finding | status |
| --- | --- | --- |
| H3-SYN | independent result influences another agent's work | **SUPPORTED (bounded)** — one applicable finding, consumed, one load-bearing change; web co-cause |
| H3-COMP | existing DSH Host + Palimpsest composition is sufficient | **SUPPORTED** — shipped host, no new runtime |
| H3-ACT | natural collaboration selection | **SUPPORTED** — delegate selected without a tool instruction |
| H3-CUR | applicable/stale/irrelevant/uncertain handled | **PARTIAL** — applicable and stale yes; irrelevant/uncertain as project material, not as delivered results |
| H3-VALUE | measurable value over strong baselines | **NOT ESTABLISHED** — native baseline equal/better and cheaper |
| H3-RELIABILITY | honest failure/repeat/capability handling | **PARTIALLY SUPPORTED** — honest refusals, existing duplicate/interrupted/new-basis tests; no live interrupted delivery |

## 10. Preserved negative findings

- The native DSH subagent produced the strongest risk analysis in the campaign, at half Palimpsest's
  cost, and the principal used it.
- The single-file baseline was nearly as good at about one-ninth the token cost.
- The delegated finding was not the sole cause of the plan change; the principal also searched the web.
- The campaign exceeded its pre-registered token cap; F is truncated; P-minus is missing.
- S and F never faced the update, so the currentness success is not a comparative claim.

## 11. Limits and what would change the conclusion

- One run per condition; no statistical claim; one evaluator and model family; no blinding.
- F is a partial run; P-minus is absent; the F/P cost comparison is therefore not a clean trial.
- The principal used web tools; the causal contribution of the finding is not isolated.
- The session token counts are model usage, not a billing statement.

A later stage would need a task class where the raw material cannot fit one context, more than one
run per condition, a blinded evaluator, a matched no-delegation control, and ideally a delivery
ablation that does not remove the branch itself. Until then the honest conclusion is the one above.

## 12. Evidence

- `research-evidence/cog3/scores.json` — per-item scores and quotes
- `research-evidence/cog3/verification.json` — build, architecture, tests, the broad failure and its diagnostic
- `research-evidence/cog3/capability-matrix.json` — composition matrix
- `research-evidence/cog3/manifest.json` — every artifact with SHA-256
- `research-evidence/cog3/runs/{P1,S1,F1,MECH1,MECH2,MECH3}/`
- `research-evidence/cog3/sessions/`
