# CI3-A1 — Source-level evidence, authority and identity audit

**Stage:** `Palimpsest-CI3 — Evidence Identity, Staleness & Revision-Scoped Authority`
**Baseline:** CI2 Evidence Freeze `eac1c2d` (tree `e3f95303d20d4856a8e05729c6ecc522265e326b`)
**Method:** read the shipped source at the baseline. No behavior is inferred from a name or from a
previous report; every claim below cites a path and a line range that exists at `eac1c2d`.

This document exists to establish the *actual* enforcement points before any production change. Its
conclusions are used by §5 (identity adjudication), §7 (staleness), §11 (promotion authority) and by
the choice of the smallest correction.

---

## 1. Path A — evidence creation

| # | Link | Source | Identity in / out | Persistent state | Boundary | Failure |
|---|---|---|---|---|---|---|
| A1 | delegated settlement decides to settle | `src/work/attempt_execution.ts:369-430` | attempt id → `AttemptResultObservation` | none | none (reads only) | `NOT_READY` with a typed reason |
| A2 | candidate export | `attempt_execution.ts:451-468` → `controller.exportResultCommit` (`controller.ts:1050-1054`) | world commit → canonical object | canonical git odb | **cross-system** (git) | `RESULT_NOT_EXPORTED` |
| A3 | contract derivation | `controller.ts:3643-3661` → `deriveAttemptCompletionContract` (`src/domain/completion_contract.ts:154-258`) | envelope + standard → `mechanical[]`, `basisDigest` | none (pure) | none | throws when no standard is confirmed |
| A4 | evaluation | `src/work/completion_evaluation.ts` via `attachCompletionEvidence` (`src/tools/work_evidence.ts:275-342`) | candidate + workDir + changedFiles → `observations[]` | none (reads the world) | none | `FAILED` / `NOT_EVALUABLE` |
| A5 | convergence decision | `work_evidence.ts:301-324` | `existing(predicate)` → `dependency_digest \| null` | none | **none** — every predicate is classified before the first write | `CANDIDATE_CONFLICT` |
| A6 | durable atom | `work_evidence.ts:90-229` → `EventStore.append` | `actionKey("evidence-v1", {project, attempt, predicate, command})` → `stableEntityId` | `events` + `evidence` projection | the store's own transaction | `IdempotencyConflict` |

**Where the authority actually sits.** The atom is durable only as an `EVIDENCE_ADDED` event; the
projector writes one `evidence` row (`src/state/projector.ts:447-470`) and `status` starts `active`.
Nothing else can create gate authority — `GateEngine` reads that table and nothing else.

---

## 2. Path B — replay and convergence

Two *different* lookups exist, and they read different things. This is the single most important
finding of the audit.

```
recordCommandEvidence / recordObservedEvidence
  findExisting(key)  ──► SELECT event_id FROM events WHERE idempotency_key = ?     (work_evidence.ts:74-87)
                         reads the EVENT LOG, ignores projection status

attachCompletionEvidence
  existing(predicate) ──► SELECT dependency_digest FROM evidence
                          WHERE … predicate=? AND status='active'                   (controller.ts:1076-1083)
                         reads the PROJECTION, requires status='active'
```

| | Event-log lookup | Projection lookup |
|---|---|---|
| Performed by | the writer (`findExisting`) | the delegated route (`existing`) |
| Keyed by | the computed idempotency key | `(attempt, predicate, status='active')` |
| Sees a stale atom | **yes** | **no** |
| Decides | converge / raise | converge / conflict / write |

**Consequence, stated exactly.** After a stale revocation, `existing()` reports "nothing recorded",
so the route proceeds to write; the writer's `findExisting` then finds the *same key* in the log and
returns the **stale** event as if the qualification had just been recorded. The route reports
`PASSED` with `evidenceRecorded` naming predicates whose atoms are `stale`. This is a **liveness and
honesty** defect, not a promotion-authority defect: the Gate still reads `status='active'` and so
still refuses. §10 CI3-B3 measures both halves separately.

**Idempotency key construction.**

```ts
actionKey("evidence-v1", { project_id, attempt_id, predicate, command })
actionKey("evidence-observed-v1", { project_id, attempt_id, predicate })
```

The key therefore carries **no candidate, no contract, no revision**. Candidate identity rides in
`dependency_digest` and in `value`; contract identity (`basisDigest`) is **not recorded at all**.

**Request digest.** `EventStore.append` computes `request_digest` over the serialized event, which
includes `created_at`. A repeat is therefore *never* byte-identical, which is precisely why the CI2
convergence rule had to be added in the writer rather than left to the store.

---

## 3. Path C — staleness

| Step | Source | Fact |
|---|---|---|
| trigger | `controller.ts:1447-1620` (`planReconciled`) | a revision that **retires a task** — by removal from the new ProjectIR or by typed invalidation — revokes that task's evidence |
| scope | `src/evidence/invalidation.ts:237-288` | `(subject_type, subject_id)` exact pair; `attempt` subjects whose attempt belongs to a retired task; **`commit` subjects are explicitly excluded** (`excludedBySubjectType`) |
| plan compiled | `controller.ts:1920-1969` | **before** the batch opens, from the pre-mutation projection |
| events appended | `controller.ts:1590-1612` | **inside** the same `appendAtomic` batch, before `PROJECT_REVISED` |
| admission | `src/domain/aggregate.ts:558-585` | requires the target evidence to exist and to be `active`; re-revoking is not a transition |
| projection | `src/state/projector.ts:472-487` | `UPDATE evidence SET status='stale'` — the `evidence_json` blob is **not rewritten** |
| current view | `src/evidence/gate_dsl.ts:52-84` | filters `status === "active"` after reading every row for the subject |

**What this means for CI3.** Historical truth is preserved *by construction*: the atom's bytes are
immutable, only a projection column moves, and the `EVIDENCE_STALE` event records the reason, the
revision pair and the change class. Current applicability is likewise real, because the Gate's query
excludes stale rows.

**The gap this creates.** A revised project cannot *re-express* the same qualification through the
same attempt: the attempt belongs to a retired task, and the task is `STALE` — a terminal state with
no path back to `READY`. Requalification therefore must go through a **new task and a new attempt**,
which is the only route the product offers. §10 CI3-D tests whether that route works, rather than
assuming it.

**What does *not* trigger staleness.** A revision that retires no task emits no `EVIDENCE_STALE`.
The head advance path (`trusted.headAdvance`) is head-only and meaning-preserving. So "the project
revision changed" is **not** equivalent to "the evidence is inapplicable" — determinacy comes from
task retirement, not from the revision number.

---

## 4. Path D — Gate

| Step | Source | Fact |
|---|---|---|
| subject query | `gate_dsl.ts:52-84` | `subject_type` + `subject_id` from `evidence_json`, then `status === "active"` |
| clause match | `src/domain/gate_clause.ts:209-216` | `view.value[key] === expected` — the atom's open `value` map is the only `where` surface |
| three-valued | `gate_dsl.ts:147-154` | `FAIL` only when a clause definitively failed; missing evidence is `INCOMPLETE` |
| release gate | `controller.ts:1283-1300`, `src/domain/standard.ts:54-77` | declared at genesis from the operator's confirmed standard |
| gate → promotion | `controller.ts:3991-4017` | `promoteWhenGatePasses` evaluates, then delegates to `promote` |
| gate → effect | `src/effects/promotion.ts:358-380` | `assessEligibility` re-evaluates the gate **inside** the promotion manager |

**`evidence_used` is every active atom for the subject**, not only the atoms a clause consumed
(`gate_dsl.ts:156`). A gate with one clause reports all atoms; the CI2 acceptance test asserts this
and it must not be mistaken for "every atom was required".

**`subject_digest` is not read by any consumer.** The query scopes by `subject_id` alone. Two atoms
for one attempt with different digests are both returned. This is safe *only* because the attempt
lifecycle permits one candidate; §5 Q1 records where that is enforced.

---

## 5. Path E — promotion

| Step | Source | Fact |
|---|---|---|
| replay | `promotion.ts:448-452` | a terminal promotion answers from history before any authority question |
| current authority | `promotion.ts:455-461` → `assessPromotionEligibility` (`src/domain/promotion_eligibility.ts:262-430`) | attempt state, current batch, input world, head, gate |
| envelope source | `src/domain/promotion_eligibility_read.ts:180-215` | reads the **task projection's** `envelope_json`, not the attempt's authorization |
| input world | `promotion_eligibility.ts:206-253` | envelope revision/digest/base **and** the report's input world must equal the current project |
| same-base rule | `promotion_eligibility.ts:356-372` | `cross_revision_promotion_not_supported` when envelope base ≠ canonical expected head |
| source commit | `promotion.ts:463-472` | must equal `AttemptReport.result_commit`; the caller cannot choose |
| expected head | `promotion.ts:473-480` | must equal `canonicalExpectedHeadSync()`; the caller cannot choose |
| intent | `promotion.ts:482` → `#appendPrepared` | `PROMOTION_PREPARED` validated again by the aggregate (`aggregate.ts:588-640`) |
| effect | `promotion.ts:492-505` | `git.promote` with the proven head |

**The revision defence is the input-world check plus the same-base rule, not the Gate.** A gate PASS
computed before a revision is *re-evaluated* inside `assessEligibility`, so a stale atom cannot
authorize an effect even if a caller cached an earlier verdict. This is the mechanism §11 CI3-C2 P1
exercises.

**`promoteWhenGatePasses` is not the only entrance, and is not the authority.** It is a convenience
wrapper; `promote` and `promoteAttempt` both re-run the full assessment. No caller-supplied head is
trusted anywhere.

---

## 6. The ten identity questions (§5)

| # | Question | Answer, from source | Enforced by |
|---|---|---|---|
| 1 | Can one attempt produce multiple candidates? | Not through the delegated route: `settle` returns the world's observed head, and a second settlement re-observes the same world | `attempt_execution.ts:492-510`; the write-scope + settlement ladder |
| 2 | Where is that invariant enforced? | In the settlement ladder, **not** in the writer. The writer's key omits the candidate on purpose | `attempt_execution.ts` |
| 3 | Can one attempt be evaluated under different contracts? | Yes in principle — `#completionContractForEnvelope` derives from the attempt's recorded envelope and the installed standard; the envelope is frozen at authorization, but the *standard* is an install option and can differ between processes | `controller.ts:3643-3661`, `controller.ts:1117` |
| 4 | Can the same predicate/command be evaluated more than once? | Yes: `gate()`, `finish()` and the delegated route all reach the same writer. Convergence is by key, and the exit code must match | `work_evidence.ts:184-192` |
| 5 | What distinguishes replay from new evaluation? | The idempotency key (attempt + predicate + command) plus the recorded exit code. Timestamp and route are excluded | `work_evidence.ts:164-192` |
| 6 | What must match before `findExisting` returns a record? | **Only the key.** It does not compare candidate, contract or exit code — the *caller* compares the exit code | `work_evidence.ts:74-87, 184-192` |
| 7 | Is an existing record still eligible after being marked stale? | **The writer says yes; the route says no.** The two lookups disagree — see §2 | — |
| 8 | Same key, different exit code? | Throws, naming both observations | `work_evidence.ts:186-190` |
| 9 | Candidate or contract identity differs? | Candidate: `CANDIDATE_CONFLICT` at the route. Contract: **undetected** — `basisDigest` is never written into the atom | `work_evidence.ts:306-322` |
| 10 | Is the Gate protected from stale/mismatched evidence? | Stale: yes, by `status`. Mismatched candidate: **only** by the attempt lifecycle, since the query ignores `subject_digest` | `gate_dsl.ts:52-84` |

**Proven invariants versus conventions.** Q1/Q2 and Q10's candidate half are *lifecycle* invariants,
not writer invariants. CI3 must therefore test the combined production path, and must not add
redundant key fields merely because the writer alone would permit the case (§5's explicit
instruction). Q9's contract half is the one place where no layer checks anything.

---

## 7. Findings that bound CI3's scope

- **F1 — two lookups with different semantics.** The stale-atom re-record asymmetry of §2. Narrow,
  measured, and fixable at one point; it does not require a new registry.
- **F2 — contract identity is unrecorded.** `basisDigest` exists and is normative
  (`completion_contract.ts:238-252`) but never reaches the atom. A contract change is therefore
  invisible to both the writer and the Gate. Whether that is exploitable depends on whether the
  standard can change while an envelope stays frozen — which the install-option reading (Q3) says it
  can.
- **F3 — no route from `STALE` back to `READY`.** Requalification must use a new task. This is the
  product's policy, not a defect, but §12's mandatory positive capability depends on it working.
- **F4 — `subject_digest` is written and never read.** Not exploitable while one attempt holds one
  candidate; recorded so a later stage does not assume it is load-bearing.
- **F5 — stale status is projection-only.** `evidence_json` keeps `status: "active"` while the
  column says `stale`. Any consumer that reads the blob instead of the column would see active
  authority. Today's consumers read the column; this is a latent trap worth stating.

No production change is justified until these are measured. The next section of CI3 turns each
finding into a falsifier.
