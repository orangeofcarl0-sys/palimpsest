# COG-5 — Baseline and Architecture

**Branch:** `palimpsest-cog5-trustworthy-continuation`
**Incoming HEAD:** `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` / tree `1b451532aa07da1f8035fe9f5855b6e62fd5781c`
**Incoming stage:** COG-4 (`palimpsest-cog4-state-synthesis`)
**Status:** C5-0 architecture checkpoint. Written before any production change.

The two architecture rulings are the operative decisions:

- [`COG5-READ-DEPENDENCY-RULING.md`](./COG5-READ-DEPENDENCY-RULING.md)
- [`COG5-SOURCE-INTAKE-RULING.md`](./COG5-SOURCE-INTAKE-RULING.md)

This report records the verified baseline, the audited incoming evidence, the real composition, the affected
consumer map, and the engineering decision for the rest of the stage.

---

## 1. Read-only preflight (exact)

Preserved in `research-evidence/cog5/preflight.txt`. The table is the verification result, not a target.

| check | observed | required | verdict |
| --- | --- | --- | --- |
| `git status --short` | empty before branch creation | clean | **PASS** |
| `git branch --show-current` (before) | `palimpsest-cog4-state-synthesis` | COG-4 branch | **PASS** |
| `git rev-parse HEAD` | `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` | same | **PASS** |
| `git rev-parse HEAD^{tree}` | `1b451532aa07da1f8035fe9f5855b6e62fd5781c` | same | **PASS** |
| `git rev-parse origin/main` | `044330b2e55198542d545edc42ed9c36e7ce896b` | same | **PASS** |
| `git rev-parse origin/palimpsest-cog4-state-synthesis` | `924d30414ffd2a7b5f8f6aa297b8a29c9065c8aa` | same | **PASS** |
| `git rev-list --left-right --count origin/main...HEAD` | `0	365` | 0 behind / 365 ahead | **PASS** |
| local COG-5 branch | absent | free | **PASS** |
| remote COG-5 branch | absent | free | **PASS** |
| worktree registrations | **95** | 95 | **PASS** |
| locked worktrees | **2** | 2 | **PASS** |
| gate roots (`~/.palimpsest-gates`) | **19** | 19 | **PASS** |
| evidence trees (`research-evidence/*/`) | **72** before `cog5`; `cog5` is the 73rd | 72 + this stage | **PASS** |
| stashes | **0** | 0 | **PASS** |
| COG-4 Code Freeze | `0e04becff68c68118bf99c7c9d6bac3c77dd0f33` / tree `4f6c0677a13c96961c3a1f501372f5f2110f0d72` | matches COG-4 evidence | **PASS** |
| COG-4 evidence manifest | 30 artifacts + 8 reports, 0 mismatches | intact | **PASS** |

The branch was created **after** this verification, from the exact COG-4 final commit, with
`git switch -c palimpsest-cog5-trustworthy-continuation 924d304...`. No reset, rebase, prune, clean, or
force-push was used.

### 1.1 Protected resources, stated precisely

The 95 worktree registrations include 90 `prunable` entries (gitdir files pointing at non-existent
locations). That is a **fact**, not authorization to prune. The two locks are untouched. The 19 gate roots and
72 pre-existing evidence trees are untouched. `research-evidence/cog5/` is the only new evidence tree.

---

## 2. Incoming COG-4 evidence audit

The COG-4 findings are treated as **historical observations**, not goals to reproduce artificially.

| COG-4 fact | verified in the incoming tree | COG-5 consequence |
| --- | --- | --- |
| Two genuine `ATTEMPT_RESULT`s with captured bases, result commits, evidence | `research-evidence/cog4/scores.json`, `runs/mechanism/run.json` | reuse the mechanism, not the exact scenario |
| Normal promotion of cost-schedule, resulting head `95b395b` | `run.json`, `COG4-CROSS-BASIS-RESULTS.md` | the same-base promotion rule is the constraint to respect |
| Packaged face `EXACT`/`INCOMPATIBLE` only; `wholeRepositoryRead()` | `src/composition/continuation.ts:373-379`, pinned tests | the read blocker is real; do not change the policy without a ruling |
| Expert `COMPATIBLE` with a test-owned instrumented read set | COG-4 expert harness | usable as a labelled diagnostic, never as production authority |
| Rework permit minted, task reopened, D2 refused `HEAD_BASIS_MISMATCH` | `run.json`, `COG4-CROSS-BASIS-RESULTS.md` | the positive route must create a lawful canonical basis, not bypass the guard |
| Fresh P Session inherited durable state; F blocked by provider quota | `runs/P1`, `runs/F1-blocked` | model comparison remains optional and is not assumed available |
| Broad tests partial; 18 targeted files / 244 tests pass | `verification.json` | the COG-5 verification scope must be declared and executed; no broad pass will be claimed unless it finishes |

The COG-4 measurement debt (the 6,000-token arithmetic, the `git add -A` update commit, duplicate turn
summaries, Python environment) is preserved forward-only and is not re-litigated here. The COG-4 freeze is not
amended.

---

## 3. The capability graph as it actually is

### 3.1 Work to authorized effect

```text
DSH Host (host/dsh/lib/index.js)
  → loadDeploymentProfile
  → launchDeployment(profile, { host })
       → installPalimpsest
            core: EventStore, GitCliPort, ProjectController, ProjectWorld basis runtime
            cognition: project workspace, journal, advisor, attention
            governance: verification, management
            execution-association: work worker port, Trajectory recorder
            continuation:
              ObservationAuthority + git source observer + conservative recorder
              CompatibilityIssuer
              CrossBasisAdmissionRuntime
              RematerializationRuntime
              firstPartyResultResolver
              WorkDelegationService (only with a worker port)
              ResultContinuationService
  → Work: controller.start / palimpsest_begin / WorkDelegationService.start
  → Result: completion evaluation → ATTEMPT_COMPLETED → result commit → evidence
  → ProjectWorld: basis capture at claim; currentness re-resolution; certificate issuance
  → Continuation: inspect / rematerialize / startRework
  → Authorized effect: PromotionManager.promote (operator) or governed D2 rework
```

### 3.2 Where the read boundary really is

```text
TaskEnvelope.read_paths        → semantic digest only; not enforced
execution world                → whole repository at the envelope base
worker process                 → cwd = world; no source-scoped file sandbox
host read fence                → protects <repo>/.palimpsest, extra roots, DSH home
                                 NOT the canonical source tree
tool classes                   → read/grep/glob guarded only for protected roots;
                                 bash/pwsh/run_code are confined children but may read
                                 any unprotected path
network_policy                 → may add inputs outside the resource model
```

The packaged `wholeRepositoryRead()` is therefore the honest first-party source read bound. The full reasoning
and the semantic decision are in the read-dependency ruling.

### 3.3 Head authority

```text
ProjectIR.head_commit
  + committed PROMOTION_COMMITTED facts
  → deriveProjectHeadStatus() → contiguous chain → proven effect head
  → compileProjectHeadReconciliation() (quiescence + backing fact)
  → reconcileProjectHead() → planReconciled({ headAdvance })
  → TASK_REAUTHORIZED for retained READY/BLOCKED tasks
  → D2 prepare: live HEAD = project head = proven effect head = envelope base
```

`reconcileProjectHead()` never adopts an arbitrary ambient `git HEAD`. The guard is preserved. The lawful
adoption route is an operator-authored Work task applied in an isolated world and promoted normally; see the
source-intake ruling.

### 3.4 Persistent assets to a fresh Session

```text
ProjectIR + journal + Work ledger + evidence + promotion history + result commits
  → a new DSH home with an empty session store
  → the shipped host reads the same durable databases and repository
  → model-facing tools: palimpsest_project, palimpsest_manage, palimpsest_status,
    palimpsest_begin/finish, palimpsest_delegate, ordinary read/glob/grep/bash/git
  → the model's next decision
```

The continuation assessment and Project Intent service are composed but not model-facing. COG-4's P Session
proved the durable-state path; COG-5 does not need to repeat the model trial to test the mechanism.

---

## 4. Affected consumer map

The production change considered in C5-A is the **post-promotion change anchor**. The map below is the
complete set of consumers whose interpretation could be affected.

| consumer | file | reads | effect of the anchor change |
| --- | --- | --- | --- |
| packaged certificate | `src/composition/continuation.ts:335-395` | origin source, current source, result commit, observation authority | the `source` change premise uses the verified promotion resulting head for a promoted result; unpromoted results keep the origin; unproven lineage becomes `UNAVAILABLE` |
| Compatibility Assessment | `src/project_world/compatibility.ts` | change + read + write footprints | unchanged logic; the observed change set is different for promoted results |
| Compatibility Issuance | `src/project_world/issuance.ts` | observation refs | unchanged; `changeFootprintDigest` binds the new interval |
| Continuation Assessment | `src/continuation/assessment.ts` | outcome + currentness | unchanged; a promoted result may move from `INCOMPATIBLE` to `UNKNOWN`, which changes `moreCouldHelp` and the offered route, not the safety rule |
| Rematerialization | `src/result/rematerialization.ts` | admission + certificate | unchanged; still refused for `INCOMPATIBLE`/`UNKNOWN` |
| Governed Rework | `src/continuation/service.ts` | outcome + task state | unchanged; a result that was falsely `INCOMPATIBLE` may now be `UNKNOWN`; both permit rework, and the reason is recorded honestly |
| Promotion eligibility | `src/domain/promotion_eligibility.ts` | Work evidence | unaffected |
| Head reconciliation | `src/work/head.ts`, `src/domain/project_head.ts` | promotion facts | unchanged; the anchor reads the same facts, it does not advance anything |
| Trajectory currentness | `src/trajectory/**` | basis currentness | unaffected |
| Tests | `test/lean_compatibility*`, `lean_d5a*`, `lean_d5d*`, `lean_cross_basis*`, `lean_d3d*` | pinned semantics | must still pass; new RED/GREEN tests cover the anchor |

No canonical enum is added, removed or redefined. `DIRECT_COMPATIBILITY_POLICY_VERSION` is unchanged: the
proof rules are unchanged; only the observed interval is corrected. A stored certificate remains a record of
the change footprint it names (`changeFootprintDigest`); it is not reinterpreted.

---

## 5. Engineering decision

### 5.1 Implemented in C5-A

**One bounded production correction: verified post-promotion change anchor.**

- Inputs: the attempt's result commit, the committed `PROMOTION_COMMITTED` facts for that attempt, the observed
  current source revision, and a Git ancestry probe.
- Rule:
  - no source result → the origin interval (unchanged);
  - no committed promotion fact → the origin interval (unpromoted result, unchanged);
  - exactly one committed fact, `sourceCommit` = result commit, Git proves
    `resultCommit ⊆ resultingHead` and `resultingHead ⊆ currentSource` → use `resultingHead` as the change
    baseline;
  - any inconsistency, ambiguity or unproven ancestry → the source change premise is `UNAVAILABLE`
    (→ `UNKNOWN`), never the origin interval and never a fabricated conflict/compatibility.
- It does not change the assessor, the enums, the read footprint, the facets, the admission rule or promotion.

### 5.2 Explicitly not implemented

- No change to `INCOMPATIBLE`, `UNKNOWN`, `COMPATIBLE` or `EXACT`.
- No change to `wholeRepositoryRead()` or to the conservative read policy.
- No treatment of `TaskEnvelope.read_paths` as a proof.
- No substitution of empty sets for `UNAVAILABLE` asset/environment/semantic facets.
- No new sandbox, tracing framework, source-admission authority, head database, promotion ledger or result
  store.
- No model-facing continuation tool in C5-D: the packaged assessment is still `INCOMPATIBLE`/`UNKNOWN` for the
  cases that matter, so exposing it as a definitive verdict would amplify a conservative overlap. C5-D is
  reported `NOT EXERCISED` with the reason.
- No model comparison unless the provider is available and a matched, uncontaminated design is possible; the
  default is no model spend.

### 5.3 Experiments

- **C5-A** — observation assay: packaged vs expert outcomes before/after a lawful change; the post-promotion
  self-collision control; the four outcomes; facet honesty; authority integrity. Deterministic.
- **C5-B** — source-intake assay: an immutable external candidate applied by an operator-authored Work task,
  normal promotion, head reconciliation, new D2 execution on the accepted basis; the direct external-commit
  `HEAD_BASIS_MISMATCH` control; write-scope, duplicate, stale and rejection controls. Deterministic.
- **C5-C** — joined continuation: the unpromoted technical result is assessed after the lawful intake, the
  packaged service mints the rework permit, reopens the task, reconciles the head, reauthorizes the task onto
  the new base, and the new D2 attempt executes to completion, verification and promotion. Deterministic.
- **C5-D / model comparison** — optional, conditional, and not started without trustworthy assessment
  semantics and provider availability.

### 5.4 Freeze discipline

- All executable product and experiment code is committed at the Code Freeze.
- The Code Freeze SHA and tree are recorded; the Evidence Freeze commit and the final report cannot contain
  their own SHA.
- No executable change after the Code Freeze. Documentation-only errata are allowed and must be labelled.
- No force-push, `main` move, PR, branch deletion, worktree prune, lock removal, historical freeze amendment
  or evidence rewrite.

---

## 6. C5-0 verdict

**Baseline verified. Both architecture rulings complete. The read blocker is real and is preserved. The
source-intake route is available through existing Work + Promotion. One bounded correction is authorized: the
verified post-promotion change anchor. No new authority root is introduced.**

The stage proceeds to C5-A with the hearings above as its fixed premises.
