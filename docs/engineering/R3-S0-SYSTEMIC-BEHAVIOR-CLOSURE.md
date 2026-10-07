# R3-S0 — SYSTEMIC BEHAVIOR CLOSURE & MECHANISM WITNESS

Stage: R3-S0
Baseline: `03a47a44ab12a68e4a6fcfdc52024f6f38929b24`
Status: **COMPLETE** — `SYSTEM_VALID = true`

---

# 1. What this stage established

Palimpsest's graph, loops and runtime semantics are **mechanically correct independent of any model's ability to
compensate for defects**. Every proof below is deterministic: no model was called, no benchmark was solved, and
no task outcome was used as a closure criterion.

```text
SYSTEMIC GRAPH:      CLOSED
PRIMARY LOOPS:       CLOSED
RUNTIME CONFORMANCE: CLOSED
MUTATION RESISTANCE: CLOSED
HISTORICAL DEFECTS:  ALL CAUGHT
SYSTEM_VALID:        YES
R3 BEHAVIORAL EXPERIMENTS: AUTHORIZED
```

---

# 2. Constitutional law, frozen before execution

```text
Task Success != System Correctness
Outcome Success Cannot Repair an Invalid Mechanism Trace
```

Both are frozen as data in `scripts/r3s0/contract.mjs` with their consequences attached, so a report cannot
restate them loosely and no behavioural experiment may support a mechanism claim while `SYSTEM_VALID` is false.

**Four truth layers** are declared separately — `G_C` canonical, `G_R` runtime, `G_E` evidence, `Y` behavioural
outcome — and the **forbidden inference directions are data**: `Y` may not be used to infer the correctness of
`G_C`, `G_R` or `G_E`, and `G_R` may not be used to infer `G_C`. A test asserts each forbidden direction.

**Consumer-boundary law**: `Consumer Boundary Is the Authoritative Observation Boundary`, with all four
mechanisms the ruling names, each stating the producer-side claim that is **insufficient** and the consumer-side
observation that is **required**.

---

# 3. Naming honesty — a load-bearing finding

**The ruling's lineage vocabulary is conceptual, not code.** `SovereignRemoteWorkRef`, `LocalAdoption`,
`LocalContinuation`, `RevisionReceipt`, `AuthorityDecision`, `CognitiveCandidate` and `FutureSelection` **do not
exist as identifiers** anywhere in this repository. Rather than invent them, the contract records both names:

* for `SovereignRemoteWorkRef`, `LocalAdoption` and `LocalContinuation`, the contract states explicitly that
  **no such type exists** and records what actually implements the node. Their absence **is** the mechanism:
  the remote peer's Work stays in the peer's own ledger; adoption is an explicit local journal entry plus a
  local promotion; continuation is ordinary local Work. A test asserts those three notes exist.
* for `CognitiveCandidate`, `Admission`, `AssetRevision`, `AuthorityDecision` and `RevisionReceipt`, the concept
  is realized by **several owners**, so each identifier carries **its own owner** rather than pretending one
  module owns all of them.

The audit **falsified this contract four times** during authoring, and each finding was fixed in the contract
rather than in the check:

| finding | fix |
|---|---|
| the Collaboration lineage omitted the need **ground** | added `ProjectReality`, because `NEED_GROUND_KINDS` makes it a required predecessor |
| two authority strings were too vague to be auditable | rewrote them to name the real decision, currentness assessment and digest binding |
| six identifiers were assigned to the wrong owner | added per-identifier owners |
| the audit itself read only runtime exports and only barrels | fixed to read declaration files and whole owner subtrees |

The fourth was an **audit** defect, and saying so matters: an audit that reports a missing owner for a type that
is genuinely owned is a broken instrument, not a finding.

---

# 4. GATE S1 — structural graph (10/10 invariants PASS)

Reported **one row per invariant, with no aggregate architecture score**, as the ruling requires.

| invariant | result |
|---|---|
| required owner | PASS — 25 nodes across 4 lineages, every identifier resolved against its own owner |
| required project scope | PASS — 22 project-scoped; every unscoped node states why |
| required basis/authority | PASS — 11 authority-bearing nodes, each naming a real mechanism |
| orphan durable objects | PASS — 7 event families, all owned |
| illegal missing predecessor | PASS — each lineage is a linear chain; every authority-bearing node has a predecessor |
| ambiguous ownership | PASS — no node declared twice or owned twice within a lineage |
| mutation without receipt | PASS — every receipt-bearing mutation is ordered after its receipt |
| registry agreement | PASS — 37 orchestration types and 21 coordination parsers, all declared types present |
| producer/consumer completeness | PASS — every family names producer, consumer and retry rule |
| no invented event types | PASS — the contract invents nothing |

The lineage shapes are asserted as **orderings**, which is where the semantics live: Work's `Promotion` after
`Verification`; Knowledge's `ProjectAssetAssociation` after `Admission`; Collaboration's `LocalAdoption` after
`Fulfillment`; Evolution's `RevisionReceipt` after `AuthorityDecision`.

---

# 5. Durable event producer/consumer audit (5/5 checks PASS)

Seven load-bearing families — orchestration ledger, project workspace, proof plane, reasoning plane,
coordination/federation, boundary memory, project journal — each with owner, producer, consumer,
retry/reconciliation behaviour and restart survival.

**None of the four defect flags applies**: no `WRITE_ONLY_EVENT`, no `UNCONSUMED_RECEIPT`, no
`CONSUMER_WITHOUT_OWNER`, no `ORPHANED_RUNTIME_PROJECTION`. The flags are computed **mechanically** from the
declaration rather than asserted, and each family's cited producer/consumer is verified to name something that
**actually exists** in the compiled tree or a real registry — an audit row citing a function nobody wrote fails.

---

# 6. The four loop matrices — 28 cells, zero load-bearing failures

Cells are `PASS` / `FAIL` / `NOT_APPLICABLE` / `NOT_EXERCISED`, **never collapsed into one score**. A
`NOT_APPLICABLE` cell carries its reason, which is what makes it auditable.

## Work loop — 6/6 paths PASS

| path | evidence |
|---|---|
| happy | attempt COMPLETED, promotion **eligible**, `PROMOTION_COMMITTED` present, canonical HEAD moved |
| rejection | the independent gate FAILED, so eligibility was false, HEAD did not move, zero promotions |
| stale | settlement returned **`BASE_DRIFT`**, not a silent acceptance |
| crash | an orphaned RUNNING attempt stayed unresolved across a process boundary; not fabricated into SATISFIED |
| cold restart | a **different OS process** read goal, revision and task states from durable truth |
| next generation | a later attempt ran and moved canonical HEAD again |

## Knowledge loop — 5/5 paths PASS (crash reasoned NOT_APPLICABLE)

Happy, rejection (**with a positive control**: an associated claim compiles, an unassociated one is refused with
`KNOWLEDGE_NOT_PROJECT_ASSOCIATED`), stale (the compile-time binding is immutable), cold restart, next
generation.

## Collaboration loop — 5/5 paths PASS (crash reasoned NOT_APPLICABLE)

Includes both mechanical proofs the ruling demands, each measured on canonical state:

* **remote Work ownership does not become local Work ownership** — B's task is `COMPLETED` in B's ledger and
  **never appears** in A's task states.
* **Fulfillment without Adoption does not change local canonical truth** — A's ProjectIR is byte-identical
  before and after an admitted fulfillment, measured **before** any adoption act so the comparison cannot
  conflate the two.

The authority separation is exercised in both directions: a rejecting authority admitted nothing, and an
**absent** authority produced `authority_unresolved` with zero writes rather than an accidental approval.

## Evolution loop — 5/5 paths PASS (crash reasoned NOT_APPLICABLE)

Happy (one `PROJECT_REVISED`, the receipt present, the requirement actually changed), rejection (**zero
revisions written** by a rejecting or unresolved authority), stale (absent authority means `UNRESOLVED`), cold
restart (the revised intent and its receipt re-resolved by a different process), next generation.

---

# 7. Cross-loop closures — all three load-bearing seams

| seam | result |
|---|---|
| **Work → Knowledge → Future Work** | a promoted, verified result became admitted capital that a **different OS process** consumed through the governed pull, resolving the body |
| **Collaboration → Local Work** | proven inside the Collaboration loop's next-generation path, and the record **says so** rather than leaving the reader to infer |
| **Evolution → Future Work** | a later attempt received `latency <= 20 ms` and the old `10 ms` bound was **gone** |

---

# 8. Cold-restart discipline — a REAL process boundary

The ruling is explicit: *"No JS object, model transcript, session-local id or in-memory cache from generation N
may be required by generation N+1."*

The existing gates perform a cold restart by disposing an installation and composing a new one **in the same
process**. That is a real *store* boundary but **not** a real *process* boundary, so this stage's restarts are
**child Node processes**: the child is handed only the durable paths, re-attaches by path, re-resolves its own
references and reports what it found. Every restart cell records the **child pid against the parent's**.

Three findings came out of building this, each a real semantics discovery:

1. A structural plan revision requires **quiescence** — the controller refuses `plan` while any task is ACTIVE.
2. A dependent task must be **re-authorized** after a promotion moves HEAD before it can be delegated.
3. A second generation's worker must make a **different** edit, or its commit is empty and `git commit` fails.

The collaboration restart initially used no child process at all; it was rebuilt to cross a real boundary once
the gap was found. That the harness could *tell* the difference is the point of building it this way.

---

# 9. Runtime conformance — 10/10 checks against the shipped runtime

```text
RUNTIME_PAYLOAD_BUILT       PASS   the shipped payload builder produced a payload
CONTEXT_INDEX_FORWARDED     PASS   contextIndexText present (294 bytes)
PULL_TOOL_PRESENT           PASS   palimpsest_worker_context_pull
RESULT_TOOL_PRESENT         PASS   palimpsest_worker_result
PULL_CHANNEL_DECLARED       PASS   palimpsest-worker-context-v1
ATTEMPT_BINDING             PASS   the attempt id is bound to the payload
OWNER_RESOLVER_BOUND        PASS   the host bound the canonical fetchContext read
DENIED_AUTHORITY_PREFIX     PASS   palimpsest_
DEFAULT_FLAGS_OFF           PASS   efficacy=unset index=unset
CONFIDENTIAL_PROFILE_AVAILABLE PASS host/deployment/runtime/confidential_profile.js
```

**No identity divergence was observed, so nothing is `INFRASTRUCTURE_INVALID`.** The context-index forwarding
check is the direct regression for the R1-L/R2-U historical defect.

---

# 10. Mutation resistance — 6/6 DETECTED, each with a green control

A mutation harness that only shows "the gate went red" is weak, because a gate red for an unrelated reason looks
like detection. **Each mutation is paired with a control**: the unmutated run must be GREEN and the mutated run
RED, and the mutation must change the specific fact the gate is about.

| mutation | caught by | control | mutant |
|---|---|---|---|
| M1 drop `contextIndexText` | consumer-boundary proof | 294 bytes, gate PASS | 0 bytes, gate FAIL |
| M2 bypass the attempt allowlist | `NO_UNLISTED_HANDLE_USE` | resolver refused the unlisted handle | a manifest-skipping resolver reaches the body |
| M3 promote without verification | Work rejection path | eligibility false | direct `promote` refused |
| M4 accept a stale result | Work stale path | `BASE_DRIFT` | forcing it through refused |
| M5 omit the association | Knowledge selection | associated claim compiles | `KNOWLEDGE_NOT_PROJECT_ASSOCIATED` |
| M6 receipt but old intent | Evolution→Work closure | delivered `20 ms` | old `10 ms` served while the receipt stands |

Two mutations **initially looked escaped**, and the reason is worth recording: a context manifest is compiled
**once per attempt and cached**, so the mutant's second compile was answered from the control's manifest. Giving
each arm its own project and its own durable stores made the two compiles genuinely independent. The mutation
was not escaping; the harness was measuring the wrong thing.

---

# 11. Forbidden-bypass witness — `KNOWN_BYPASSES_BLOCKED`, honestly

All six known bypasses are blocked, and the claim is deliberately limited.

**Two checks cannot be proven by this stage, and the record says so.** `NO_DIRECT_BACKING_STORE_READ` and
`NO_CONTROL_PAYLOAD_DISCOVERY` were probed from the **harness process**, which is the unconfined host — a
successful host-side read says nothing about what a worker inside its world could do. Rather than mark them
blocked on that evidence, the witness reads the verdicts from the gates that **actually measure confinement**:

* **R1-L** independently reports `the direct backing-store route is blocked (as the worker)` — the worker-side
  proof this stage could not make from the host.
* **R1-HC** (residual closure), **R1-H** (confinement) and **R1-HR** (host hardening) all PASS.

The witness claims only `KNOWN_BYPASSES_BLOCKED` and records `claimScope`: *known bypasses only; this is not a
proof that no unknown bypass exists.* A test asserts the stronger claim is refused.

---

# 12. Historical-defect regression — each defect CAUGHT by a named invariant

The ruling is explicit that the purpose is not merely to keep old tests green, so each mapping is shown by
**running the detector**:

| historical defect | caught by | evidence |
|---|---|---|
| R1-L/R2-U missing worker index forwarding | consumer-boundary proof | control index 294 bytes vs mutant 0 bytes |
| vacuous `condition \|\| true` evidence gate | anti-vacuity scan | `R2-LR ANTI-VACUITY: PASS — 0 unconditional form(s)` |
| R3-A nested `classPass` integration error | evidence-correctness integration | the R3-AE engine suite passes driving the engine with **real nested records** |

---

# 13. Experimental evidence schemas

`ProjectBehaviorTrace` and `MechanismWitness` are **test/evidence infrastructure only**. The trace declares
`canonical: false` in the record itself, writes nothing durable and registers no owner. `MechanismWitness`
implements the law directly: a `TASK_SUCCESS` with an incomplete chain is `MECHANISM_NOT_DEMONSTRATED` and may
not support a mechanism claim.

**Evidence correctness**: every scenario carries a **complete** digest closure over the tested source bytes, the
canonical state, the runtime/session bytes, the acceptance module and the produced trace. The contract itself is
digested, so the run is bound to the contract it was judged against.

---

# 14. Gates S1–S4

```text
S1  GREEN  10/10 invariants PASS (no aggregate score)
S2  GREEN  28 cells; 0 load-bearing FAIL; 0 load-bearing NOT_EXERCISED; runtime PASS
S3  GREEN  6/6 mutations DETECTED; 0 open bypasses
S4  SYSTEM_VALID = true
    graph_integrity GREEN · loop_conformance GREEN · runtime_conformance GREEN
    authority_checks GREEN · evidence_chain_checks GREEN · forbidden_bypass_checks GREEN
```

---

# 15. Regression

```text
build                          PASS
unit                           3453/3453 across 265 files
e2e                            38/38
architecture:check             PASS  0 violations, 9 accepted baseline exceptions
public-api:check               PASS  missing 0 / changedKind 0 / added 0
anti-vacuity                   PASS  0 unconditional forms
R1-H conformance               PASS
R1-HR host-hardening           PASS  (disclosed limits HR-17, HR-39b, HR-33)
R1-HC residual closure         PASS  (disclosed limit HC-27)
R1-L consumer-boundary gate    PASS
E-live cross-generation gate   PASS
R3-S0 systemic suite           PASS  104 tests
```

No historical stochastic benchmark matrix was rerun.

---

# 16. Product, canonical and runtime semantics

```text
src/**            ZERO diff
host/**           ZERO diff
architecture      ZERO diff; no canonical owner added; architecture:write never run
```

Everything this stage added lives under `scripts/r3s0/`, `test/` and `research-evidence/r3-s0/`. It is
experimental harness and evidence code. **No Fusion, Council, SupervisorAgent or FusionAgent ontology was
introduced**, and a test asserts it.

---

# 17. Load-bearing NOT_EXERCISED paths and unresolved risks

**Load-bearing `NOT_EXERCISED`: none.** Every path the loop-matrix plan marks as applying was driven, and the
four `NOT_APPLICABLE` cells each carry a reason.

**Unresolved systemic risks**, stated rather than hidden:

1. **Worker-side confinement is consumed, not re-proven.** This stage reads R1-L/R1-H/R1-HR/R1-HC rather than
   duplicating them. If those gates were wrong, two bypass checks would be wrong with them.
2. **The bypass claim is bounded by construction.** `KNOWN_BYPASSES_BLOCKED` enumerates six known bypasses. It is
   not a proof about unknown ones, and it is not presented as one.
3. **`crash` is NOT_APPLICABLE for three loops.** The reasoning is recorded per loop, but it is a judgement: a
   crash mid-append is treated as a store concern rather than a loop path.
4. **The collaboration peer is a deterministic callback transport, not a real remote host.** Sovereignty is
   proven against a separate ledger and a separate install, not against a network boundary.
5. **Cold restarts are child processes on one machine.** They are genuine OS process boundaries and genuine
   store re-attachments, but they are not a distributed or multi-host restart.

---

# 18. Final

```text
SYSTEMIC GRAPH: CLOSED
PRIMARY LOOPS: CLOSED
RUNTIME CONFORMANCE: CLOSED
MUTATION RESISTANCE: CLOSED
SYSTEM_VALID: YES
R3 BEHAVIORAL EXPERIMENTS: AUTHORIZED
```

Only after this may future R3 behavioural benchmark stages support mechanism claims. This stage created no
F-C/F-D fixture, ran no capital-treatment matrix, ran no Kimi, and did not begin Fusion.
