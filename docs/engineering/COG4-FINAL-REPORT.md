# COG-4 — Final Report

**Question:** when a long-running project evolves across multiple agents, execution lifetimes and project
versions, can Palimpsest preserve and correctly reuse valid work, refuse unsafe or unproven reuse, and
enable a fresh agent to continue productively — more reliably or efficiently than a strong native DSH +
Git/Markdown workflow?

**Answer:** **partially, and not comparatively.** The existing product produces a real Work Result,
captures its basis, promotes it, and a genuinely new DSH Session inherits the durable project state and
makes a strong, correct continuation decision. The **expert D3 kernel** distinguishes `EXACT`,
`COMPATIBLE`, `INCOMPATIBLE` and `UNKNOWN` from real observations. But the **packaged continuation face**
cannot produce a positive compatibility certificate for any source change (its read footprint is the whole
repository), has no model-facing tool, and cannot execute a rework after an external source update because
the live head is ahead of the canonical head. The matched native baseline was **blocked by the provider's
own quota**, so no value comparison was obtained.

**Stage label:** `COG-4: PARTIAL — REAL WORK RESULT AND FRESH-AGENT INHERITANCE; PACKAGED CONTINUATION
INACCESSIBLE; COMPARISON BLOCKED`.

**Gates:** G0 **ESTABLISHED**, G1 **ESTABLISHED**, G2 **PARTIAL**, G3 **ESTABLISHED (P)**, G4 **PARTIAL**,
G5 **BLOCKED**, G6 **ESTABLISHED with disclosed deviations**.

---

## 1. Executive summary

- **A real governed Work Result exists.** Two tasks were driven through the real D2-d work delegation over
  a test-owned world. Each produced an `ATTEMPT_RESULT` with a captured source-bound basis, a result
  commit, observed changed files, recorded completion evidence and a canonical Work state. The
  deterministic worker is labelled as such; it is not a model.
- **Normal Promotion works.** The cost/schedule result was promoted (`PROMOTION_COMMITTED`, resulting head
  `95b395b`), the task reached `TASK_SATISFIED`, and a duplicate promotion returned the same terminal
  event.
- **The expert kernel distinguishes all four outcomes.** `EXACT` before any change; `COMPATIBLE` for the
  cost result's external changes since its own result (8 disjointness proofs, admission `ADMITTED`);
  `INCOMPATIBLE` for the technical result whose read file changed; `UNKNOWN` for the technical result with
  an unavailable project-semantic premise (`INSUFFICIENT_PROOF`).
- **The packaged face does not.** It reports `EXACT` and `INCOMPATIBLE`; after any source change both
  results are `INCOMPATIBLE`, because `wholeRepositoryRead()` overlaps every source path. It cannot
  distinguish the genuinely affected technical result from the provably unaffected cost result. It has no
  model-facing tool.
- **A governed rework is authorized but cannot execute.** The service minted the rework permit itself,
  reopened the technical task (`TASK_READY`), and started the D2 job. The job refused with
  `HEAD_BASIS_MISMATCH`: the live repository was at `9972619` (the external updates), the canonical head at
  `95b395b`. No worker was started on a basis the product does not consider current.
- **A fresh P Session inherits the project.** A new DSH home and a new Session with an empty session store
  discovered the accepted cost result, the unpromoted technical attempt and its execution world, the three
  journal entries, both external updates, the certificate question and the head divergence. It produced a
  **16/16** continuation note, refused the invalid Site B selection, preserved the unaffected cost result,
  ignored the newsletter, and chose a dependency-ordered next action.
- **The comparison is blocked.** The clean F trial reached the provider and was refused with
  `QUOTA: Insufficient Balance` before its first model turn. The first F run was contaminated by the P note
  and is preserved as an invalid diagnostic. No F baseline exists; no superiority or cost-ratio claim is
  made.
- **The budget was controlled.** 3 sessions and 1,865,339 reported tokens against 12 sessions / 12M / 8M.
  The provider quota, not the budget monitor, stopped the F condition.

---

## 2. A. Git and resource integrity

| item | value |
| --- | --- |
| Incoming baseline | `ef9d8e3ac1ee4cb21750749e0b526291c527fe65` / tree `d08a2ab53c670941138dc23437c2e073216c51c0` |
| Development branch | `palimpsest-cog4-state-synthesis` |
| Code Freeze | `0e04becff68c68118bf99c7c9d6bac3c77dd0f33` / tree `4f6c0677a13c96961c3a1f501372f5f2110f0d72` |
| Evidence Freeze | the commit adding this report and `research-evidence/cog4`; its SHA is reported forward because a commit cannot contain its own SHA |
| Final HEAD | the Evidence Freeze (or a later documentation-only erratum), reported in the answer |
| Commits | one Code Freeze; one Evidence Freeze; no production-code commit |
| Executable files changed | **no production executable**; new experiment scripts under `scripts/cog4/`; no `test/` or `src/` change |
| Production source change | **none** |
| Historical refs | `origin/main` `044330b`, local `main` `67b29c9`, COG-3 branch/freezes `ef9d8e3`/`bf21110`/`a38d0b2` — unchanged |
| Protected resources | 95 worktrees, 2 locks, 19 gate roots, 72 evidence trees (71 + `cog4`), 0 stashes |
| Working tree | clean at the Evidence Freeze except the docs/evidence it commits |

**Deliberately not done:** no PR, no merge, no `main` move, no force-push, no branch deletion, no worktree
prune or lock removal, no `gc --prune=now`, no `clean -fdx`, no historical freeze amendment, no evidence
rewrite, no new dependency, no new runtime/store/scheduler/authority. The one-off evidence collector was
run after the Code Freeze, copied and hashed immutable artifacts only, and was removed before the Evidence
Freeze.

---

## 3. B. COG-3 measurement debt

**The 6,000-token discrepancy is arithmetic.** The immutable P streams sum to **16,215,721** (principal
16,194,148 + branch 21,573). `run-two.json` records exactly that. `scores.json` records 16,221,721, which
is 6,000 higher. The streams end at `turn/end` with no duplicate sequence numbers and no later append. The
corrected campaign total is **27,125,380** against 25,000,000: the overrun remains **2,125,380**. The COG-3
freeze is not rewritten; the finding is forward-only.

**The update commit captured the generated plan.** COG-3 used `git add -A`. The immutable phase-1
`git status --short` shows only `?? deliverables/`, and the only observed write is
`deliverables/plan.md` (57,636 bytes). The update commit therefore captured the intended update file **and**
the generated deliverable. The exact full path set is not recoverable because the world was removed;
COG-4 stages only explicit paths and verifies the staged list.

**The duplicate Turn Summary records are an observation overlap.** The principal stream has three turns
(56, 8, 36 steps); the branch has one. The two run-one records were emitted 3 ms apart, both end with turn
2's text, and their tool-entry ranges overlap (128 calls and 110 calls). No fourth model turn occurred. The
cause is `printTurn()` running after `whenIdle()` had also waited for the delivery turn.

**Budget controls are stronger and tested.** The monitor was proven 11/11 against simulated records
(duplicate, delayed, resumed, child, cache-read, launch refusal, hard stop, unavailable, completed-once,
wall clock). It observed the real sessions: 3 sessions / 1,865,339 tokens, no overrun. The F condition was
stopped by the provider quota, not the monitor.

**Python is verified.** `python` is absent from the default PATH; `py` is 3.14.7; an Anaconda Python 3.13.9
exists. The broad run used `PATH=/d/ProgramData/anaconda3:$PATH` after verifying the executable. The COG-3
failure remains visible and is not reclassified.

**Unresolved:** the exact COG-3 update-commit path set; the COG-2 concurrent tests remain unattributed; the
provider balance is exhausted for this campaign.

---

## 4. C. Product composition

**Available through the normal shipped host:** Work (`palimpsest_begin`/`finish`, `palimpsest_manage`
step/run), ProjectWorld basis capture and currentness, the packaged continuation service (composed, not
model-facing), cross-basis admission, rematerialization, operator promotion, the journal
(`palimpsest_project`), project management, a fresh DSH Session, and native DSH collaboration.

**Internal/expert-only:** `ResultContinuationService.inspect/rematerialize/startRework`; the D3 expert
diagnostic; `ProjectIntentService.prepare/assess/apply`; the Trajectory read models.

**Missing or unusable in the normal path:**

- no model-facing continuation tool;
- the packaged read footprint is the whole repository, so `COMPATIBLE` is unreachable for a source change;
- the packaged face has no clean `UNKNOWN` for a promoted result (its own output is in the
  origin-to-current diff);
- no Project Intent model tool and no normal-host admission authority;
- the result content is not a model field; the P Agent read the execution world on disk;
- the live external head and the canonical head can diverge; a rework refuses at `HEAD_BASIS_MISMATCH`;
- `reconcileProjectHead` does not adopt an arbitrary external commit and can be blocked by quiescence.

**Narrowest complete real path:** DSH Host → profile → `installPalimpsest` → D2 work delegation →
execution world → completion evaluation → `ATTEMPT_RESULT` → packaged inspect (`EXACT`/`INCOMPATIBLE`) →
operator promotion → fresh Session reads durable state + files. The expert kernel is the only place all
four compatibility outcomes are actually distinguished, and it is not a product surface.

---

## 5. D. Cross-basis results

**Did an actual `ATTEMPT_RESULT` get produced?** Yes, two:

| task | attempt | result commit | origin basis | evidence | endpoint |
| --- | --- | --- | --- | --- | --- |
| technical-fit | `attempt-d16532bd0851cae20310d8e0ad0fb9f4` | `4f0eec5781fe47716bba6deb5f8eb10d635fabb7` | seed `5f6002d` | `write_scope_valid`, `expected_files_exist` | `TASK_READY` after governed reopening |
| cost-schedule | `attempt-baaf963c5b6bd004409fcfe013219440` | `fcc199899414c586485628f3a6d3149bc029df75` | seed `5f6002d` | same | `TASK_SATISFIED` after normal promotion |

**What changed:** `sources/vendor-capabilities.csv` (V3 minimum -10 °C → 0 °C) at `31cfc25`;
`sources/newsletter.md` at `9972619`. Each update staged exactly one path and verified the staged list.

**Which compatibility outcomes were observed?**

- **EXACT:** both results before any change (packaged and expert).
- **COMPATIBLE:** the cost result's external changes since its own result (expert; 8 disjointness proofs;
  `ADMITTED`). Not reachable through the packaged face.
- **INCOMPATIBLE:** the technical result for the vendor change (packaged and expert; conflict on
  `sources/vendor-capabilities.csv`); the cost result also reports `INCOMPATIBLE` in the packaged face,
  because of the whole-repository read.
- **UNKNOWN:** the technical result with an unavailable project-semantic premise (expert; no conflict,
  `change_coverage` gaps; `INSUFFICIENT_PROOF`). The packaged face did not reach it.

**Were positive certificates supported by actual owner observations?** The expert `COMPATIBLE` certificate
used a real Git source change plus a test-owned instrumented read set recorded through a registered
observer; the admission was `ADMITTED`. It is a kernel diagnostic, not the packaged first-party footprint.
No hand-built certificate was used and no certificate was accepted from another target.

**Was anything incorrectly treated as compatible?** No. The packaged face is conservative; the expert
diagnostic proved disjointness only where the observed selectors support it. The `UNKNOWN` case remained
`UNKNOWN`, not `COMPATIBLE`.

**Was any valid reusable work unnecessarily discarded?** The technical result was correctly refused.
The cost result was preserved by the Operator and by the P Agent. The packaged face reports the cost
result `INCOMPATIBLE` after the vendor change; for a `VERIFYING` unaffected result it would offer rework
(the technical task shows `rework: true` under the same policy). In this run the cost result had already
been promoted, so no unnecessary rework was executed. The limitation is real even though the effect was
not.

**Which legal continuation actions were actually executed?** Exact reuse/promotion; rematerialization
refused; rework permit minted and task reopened; D2 execution refused at `HEAD_BASIS_MISMATCH`; more
evidence identified but not executed; unsupported actions refused. The highest reachable lifecycle is
`TASK_SATISFIED` for cost and `TASK_READY` for technical.

**Did any result reach normal Promotion?** Yes, `promotion-09839e1c4ec5124fa819bace5a8ca836` for the cost
result; `TASK_SATISFIED`. No model tool promoted anything.

---

## 6. E. Fresh-Agent continuity

**Was the new Agent a genuinely new Session?** Yes. A new DSH home, an empty session store, a new session
`session-9482000b-8b15-451a-8cbc-edd128487cd2`, `mode: create`. No old Session was resumed or read; no old
transcript, reconstructed prompt or evaluator oracle was provided.

**Did it access the old Session or only allowed project state?** Only the durable project state and the
repository/execution world. It used `palimpsest_project` (3), `palimpsest_manage` (2), `palimpsest_status`
(1), `palimpsest_graph` (1), `bash` (21), `read` (3), `write`/`edit` (4).

**What history did it discover?** The promoted cost result and its promotion ID; the unpromoted technical
attempt, its commit `4f0eec5` and its execution world; the three journal entries (2023 V2 failure, V3
certificate open question, grant conditions); the vendor update `31cfc25`; the newsletter `9972619`; the
absence of `deliverables/technical-fit.md` from the main tree; and the live/project head divergence
(`9972619` vs `95b395b`).

**Which facts and decisions did it inherit?** The cost result is accepted; the technical result is
unpromoted and predates the vendor revision; the grant conditions; the V2 negative result; the V3
certificate is unverified.

**Did it correctly identify changed or unresolved information?** Yes: V3's 0 °C rating invalidates Site B;
no current vendor meets both -4 °C and the coastal warranty; the certificate is not on file; the cost
range is a vendor-price span, not a committed envelope; the A window and C lead time are at risk; the
newsletter is irrelevant.

**What was the first useful action?** It read the project/journal, then used the management/status and Git
state to locate the unpromoted attempt and its execution world, then wrote the continuation note.

**Did it independently recover the correct project objective?** Yes: select a compliant vendor per site and
produce a schedule/budget envelope within £120,000, respecting the grant conditions and the 30 June
deadline.

The note scored **16/16**. It is one run; no statistical claim. The F condition is blocked, so this is not
a comparative result.

---

## 7. F. Project intent and collaboration

**Did an Agent propose an actual grounded revision?** The Agent proposed a next-action sequence, not a
structured ProjectIR revision. It did not use a Project Intent tool (none exists).

**Was an Admission Authority available?** Not in the normal host. `installPalimpsest` composes Project
Intent only when the caller supplies `projectIntentAdmission`; the DSH host supplies none. The service's
absent-authority behavior is `authority_unresolved`, which is correct.

**Did any `PROJECT_REVISED` event occur?** No. No task was retired or invalidated by an intent revision.

**Did any independent Owner participate?** No. This was a single-tenant, same-Owner continuation.

**What distinguishes the observed path from ordinary DSH file collaboration?** The durable Work state,
journal, promotion history and head/project divergence were real and discoverable; the P Agent used them to
find the unpromoted result and its execution world. But the decisive content was read from ordinary files
and Git, and the product's own continuation assessment was not a model-facing surface. The product's
distinctive state helped discovery; it did not present its own applicability conclusion.

---

## 8. G. Comparative value

**Did a strong native DSH + Git/Markdown workflow solve the same problem?** **Unknown: the clean F run was
blocked by the provider quota before its first model turn.** No F note exists. The first F run was
contaminated by the P note and is excluded.

**Were the update sequence and fresh-Agent conditions matched?** They were matched in design: same
objective, sources, prior facts, updates, task, model/runtime, time/token limits and native DSH tools. They
were not matched in execution because F produced no model turn.

**Did Palimpsest reduce unsafe acceptance, redundant work or human coordination?** In the P run, unsafe
acceptance was 0, unnecessary rework was 0, and no human explanation was needed. There is no F comparison,
so no reduction is measured.

**Did it cost more?** P used 1,277,909 reported tokens (1,219,072 cache-read) and 210 seconds. The
contaminated F diagnostic used 587,430 tokens; the clean F used 0. No cost ratio is claimed.

**Were any benefits statistically established or merely observed once?** Observed once. No statistical
claim.

**What evidence supports the recommended product direction?** The expert kernel's four outcomes, the
packaged face's inability to produce `COMPATIBLE`, the absence of model-facing continuation/Intent tools,
the live/canonical head divergence blocking rework, and the P Agent's successful recovery through the Work
state and files.

---

## 9. H. Engineering verdict and deviations

**Capabilities implemented:** Work, ProjectWorld basis/currentness, compatibility, admission,
rematerialization, governed rework, promotion, journal, project management, Project Intent, Trajectory,
fresh Session inheritance.

**Capabilities actually composed in the normal host:** Work, ProjectWorld, packaged continuation,
admission, rematerialization, promotion (operator), journal, management, Project Intent (without an
authority), Trajectory (worker-facing). No model-facing continuation or Intent tool.

**Capabilities the Agent used:** journal, management/status, project/graph, ordinary read/bash/git/write.
It did not use a continuation assessment or Project Intent service.

**Effects actually applied to project state:** two `ATTEMPT_RESULT`s; one normal promotion
(`TASK_SATISFIED`); one governed reopening (`TASK_READY`); zero `PROJECT_REVISED`; zero duplicate
promotion effects; zero stale-inspection events.

**Measurable benefits over the baseline:** **none established** (F blocked).

**Protocol deviations, disclosed:**

1. The P Session ran before the Code Freeze commit. Its P path in `run_fresh.mjs` is unchanged by the later
   F-world fix; the product code is identical. The P evidence is retained.
2. The first F run was contaminated by the P note; it is preserved as `F1-contaminated` with `INVALID.json`
   and excluded. F was rerun once after the world was rebuilt from the mechanism head.
3. The clean F rerun was blocked by the provider's `QUOTA: Insufficient Balance` before any model turn. It
   is `BLOCKED`, not a negative result.
4. A one-off evidence collector ran after the Code Freeze, copied and hashed immutable artifacts, and was
   removed. It changed no product or experiment path.
5. The external source updates moved the live head ahead of the canonical head. The governed rework
   reopened the task but the D2 execution refused at `HEAD_BASIS_MISMATCH`; no current-basis rework was
   fabricated.
6. The expert `COMPATIBLE`/`UNKNOWN` outcomes use a test-owned instrumented read set, not the packaged
   first-party whole-repository footprint.
7. The broad test run was started with Python on the test PATH but was still running at the verification
   cutoff; it was stopped, its partial log is preserved, and no broad pass is claimed. The targeted 244-test
   run is the authoritative mechanism verification.

**Findings:**

| id | finding | status |
| --- | --- | --- |
| H4-R | reliable result applicability | **PARTIAL** — the expert kernel distinguishes all four outcomes; the packaged face only `EXACT`/`INCOMPATIBLE` |
| H4-E | economically useful continuation | **PARTIAL** — promotion worked; rework was authorized but the D2 execution refused; no rematerialization |
| H4-C | cross-session project continuity | **SUPPORTED (P)** — a new Session inherited the state without the old transcript |
| H4-I | intent/reality feedback | **NOT EXERCISED** — no model tool, no normal-host authority, no `PROJECT_REVISED` |
| H4-A | natural product accessibility | **PARTIAL** — the journal/management tools work; the continuation assessment and result content are not model-facing |
| H4-V | incremental product value | **NOT ESTABLISHED** — F is blocked; no comparative measurement |

**Preserved negative findings:**

- the packaged continuation cannot produce `COMPATIBLE` for a source change;
- it cannot distinguish an unaffected result from an affected one;
- it has no model-facing tool;
- the live external update and the canonical head diverge, and the governed rework refuses;
- the normal host has no Project Intent admission authority and no model tool;
- the P Agent recovered the unpromoted result through ordinary filesystem access, not through a
  continuation surface;
- the matched F baseline could not run because the provider balance is exhausted.

---

## 10. Recommendation

**B — Correct kernels, poor accessibility or observation.**

The evidence supports B, not A, C, D or E:

- **Not A:** the product's own mechanisms were not the reason the P Agent succeeded. The expert kernel is
  sound, but the packaged face was not used and is not model-facing; the Agent read files. A would require a
  demonstrated product-native advantage, which the blocked comparison cannot supply.
- **Not C:** the packaged face is conservative, but no cost/benefit comparison against F was obtained, so
  "reliability with substantial overhead" is not measured.
- **Not D:** F did not run. The absence of a comparison is not evidence that native DSH is equivalent.
- **Not E:** the existing result/basis/compatibility/rework abstractions represented this long-horizon work
  without a new ontology. The failures are access and observation seams, not an architectural mismatch.

The exact missing seams to target, in order:

1. **A model-facing continuation inspect** over the existing `ResultContinuationService` — one read-only
   tool that returns the currentness, compatibility, safe paths, blockers and the assessment digest. It adds
   no semantics and no new owner.
2. **A principled read-footprint policy.** The whole-repository read is honest but makes `COMPATIBLE`
   unreachable for a source change. The product should either obtain an enforced narrower read set from the
   execution path or present the limitation as a first-class "cannot prove" outcome rather than a conflict.
3. **An authorized path from an external source update to the execution base**, or an explicit statement
   that a rework requires a canonical head reconciliation and cannot run on an external head. The current
   `HEAD_BASIS_MISMATCH` is honest; the missing seam is the authorized adoption, not a new scheduler.
4. **A Project Intent tool/admission only if an Owner actually exists.** Do not invent an authority; an
   absent authority returning `authority_unresolved` is correct.

Do not add a new runtime, store, router, ticket database, scheduler, supervision layer or universal asset
ontology. The next stage should be a product-access and observation stage, not a new framework.

---

## 11. Limits

- One scored P run; F blocked; no comparative or statistical claim.
- The deterministic Work result is not a model result.
- The expert outcomes use a test-owned instrumented read set.
- The external updates are direct Git commits; the live/canonical divergence is reported, not repaired.
- The P Agent used ordinary filesystem access to the execution world.
- The provider balance is exhausted; the clean F condition cannot be completed in this campaign.
- The broad test result is preserved as-is; a nonzero exit is not a pass.
