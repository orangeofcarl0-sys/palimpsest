# R1 — PROTOCOL AMENDMENT A1

> **Status: FROZEN before the first R1-R primary trial.**
> This is an APPEND-ONLY amendment to
> [`R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md`](./R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md). The parent
> document is **not edited** by this amendment and its digest is **not** recomputed: the parent's
> frozen bytes remain the parent's frozen bytes.
>
> Amendment digest is recorded in `research-evidence/r1/protocol-amendment-a1.json` and recomputed by
> `scripts/r1r/amendment.mjs`, so a silent edit to THIS document is detectable in the same way.

---

## 1. Parent protocol

| field | value |
|---|---|
| parent document | `docs/engineering/R1-STOCHASTIC-COMPOUNDING-PROTOCOL.md` |
| parent digest (unchanged) | `2d1dfecaf7feecc55601a00f0760cec7e95b667f2972ad34bb831740b006feca` |
| parent status at amendment time | `primaryMatrixStatus = BLOCKED_R1_SEMANTIC_BLOCKER`, `trialsRun = 0` |
| amendment type | append-only; the parent is not modified |

The parent protocol registered a **BLOCKED** primary matrix and explicitly required, in its own
`§11 PROTOCOL AMENDMENTS`, that "a correction after the first stochastic run must state its reason and
which runs occurred before it". No primary trial has ever run. The only stochastic invocations that
occurred before this amendment are:

```text id="a1pre"
R1  delivery probe       3 worker invocations (1 per condition, disclosed in research-evidence/r1/)
R1-L nonce gate          3 worker invocations (research-evidence/r1-l/)
R1-R calibration         none yet (this amendment precedes calibration)
```

None of those is a primary trial, so no outcome exists for this amendment to be fitted to. The
amendment is written from **infrastructure facts measured by R1-L**, not from any experimental result.

---

## 2. Reason for the amendment

**The R1 semantic blocker was closed by R1-L.**

R1's blocker was that the three conditions were not distinguishable to the worker: the host rendered
neither `compiled.boot` nor `compiled.handles` into the model-visible prompt, and every inherited
`palimpsest_*` tool was denied to a worker, so selected capital could neither be seen nor pulled. The
R1 delivery probe recorded three **byte-identical** model-visible prompts for C0/C1/C2, which is why
registering 30 trials would have produced 30 meaningless runs.

R1-L closed that last mile and proved it **by accessibility, not by performance**: each selected body
carried an unguessable per-run nonce that existed nowhere else, and the gate recorded that C0 obtained
none of them while C1 and C2 each obtained exactly the markers for the handles they were given
(`gate:r1-l-live`, 17/17 PASS). Pull telemetry was `[]` / 2 / 3 handles.

The precondition the parent protocol was blocked on therefore no longer holds, and the primary matrix
can now be formed. This amendment exists so that resuming the matrix is a **pre-registered decision
with a recorded reason**, not a silent reinterpretation of a frozen document.

---

## 3. New measurement fact

**Scenario A's C0 control already reaches 8/8.**

R1-L §28 recorded, from the blocked R1 probe, that Scenario A's C0 worker — `deepseek-flash`, given
**no capital at all** — scored **8/8** on the acceptance oracle. A control that already passes the
correctness bar on its own cannot discriminate between conditions.

This is **historical evidence and is not tuned away**: the naive fixture, the acceptance suite and the
8/8 observation all stand exactly as measured. What changes is the *role* Scenario A plays in the
matrix.

---

## 4. Consequence

**Scenario A is demoted from primary correctness discriminator to a SECONDARY probe.**

Scenario A may still measure channel-use and efficiency quantities:

```text id="a1sec"
context-index visibility
pull behavior
capital use
known-prerequisite rediscovery
number of test/oracle invocations
wall time
token use if available
```

Scenario A **must not** be used as:

```text id="a1not"
8/8 final pass as evidence distinguishing C0 / C1 / C2
```

and it may not rescue a failed primary matrix (parent §26).

---

## 5. Primary matrix — two replacement scenarios

The primary correctness discriminators are **replaced** by two scenarios whose hidden contracts are
non-obvious enough that a no-capital control is not expected to saturate them. Both are registered
here BEFORE any trial.

### 5.1 Scenario B — Versioned Config Migration

A TypeScript project exporting `migrateConfig(input): V2Config`.

- The worker-visible task states the **broad product goal** and does **not** enumerate the edge-case
  rules.
- Acceptance is a **black-box mechanical oracle**. The worker may run `node test/check.js`; it may
  **not** read the hidden acceptance implementation.
- The ordinary repository **does** contain visible unit tests for basic behaviour.
- Hidden acceptance exercises non-obvious invariants equivalent to:

```text id="a1b"
legacy aliases must be normalized before comparison
two aliases that disagree after normalization are ambiguous
legacy semantic consistency is validated BEFORE defaults
migration happens only after legacy validation
new-format defaults are applied only after crossing the migration boundary
final V2 representation is validated before return
```

These exact rules are **not** placed verbatim in the Work objective.

### 5.2 Scenario C — Replay-Safe Event Reducer

An independent TypeScript project exporting `applyEventStream(state, events)`.

- Broad worker-visible goal: *apply an event log to the store's current state, so that replicas holding
  the same log agree*.
- Acceptance is an **unreadable black-box acceptance oracle**, same discipline as B.
- The caller OWNS the `state` object it passes in and keeps using it afterwards, which is what makes
  the ordering contract observable rather than cosmetic: an implementation that validates as it applies
  leaves that object partly mutated after reporting failure.
- Non-obvious invariants are a coherent subset equivalent to:

```text id="a1c"
replay validity is established before any mutation, so a refused log leaves the caller's state untouched
state is derived from the log's own sequence, not from the order the array arrived in
a log whose positions are not continuous from zero is refused
two different events claiming one position are refused, while an exact replay is idempotent
a tombstone dominates an older write, and is not undone by an older write applied later
```

The hidden method is **not** spelled out in the task prompt, and the task remains solvable by
exploration.

### 5.3 Why black-box acceptance is permitted

This is not a secret-answer trick (parent §7). The worker can edit, run the oracle, observe **named
failure classes**, and iterate. C0 may rediscover the method. The difference the experiment measures is
that C1/C2 may inherit what prior generations already paid to discover — which is exactly the
textbook-effect hypothesis.

Frozen across all conditions:

```text id="a1freeze"
same oracle
same visibility
same repository
same task
```

---

## 6. Trial count

**Unchanged.** The matrix remains:

```text id="a1count"
Scenario B:  C0 x 5, C1 x 5, C2 x 5
Scenario C:  C0 x 5, C1 x 5, C2 x 5
total:       2 x 3 x 5 = 30 primary stochastic trials
```

Conditions (C0 / C1 / C2), the randomized blocked ordering, the no-adaptive-retry rule, the
paired-state requirement and the outcome list are exactly as the parent protocol registered them. This
amendment changes **which scenarios** occupy the two primary slots; it does not change the design.

```text id="a1cond"
C0  zero selected Proof, zero selected Reasoning, zero selected Procedure (index empty; the SAME pull tool)
C1  Proof + Reasoning selected, Procedure absent
C2  same Proof, same Reasoning, ACTIVE Procedure selected
```

No authority differs between conditions, and no condition's worker-private tool catalogue differs.

---

## 7. What this amendment does NOT change

```text id="a1unchanged"
the parent document's bytes and digest
the three conditions and their authority equality
the trial count, the blocked ordering and the protocol seed
the verdict vocabulary PASS / PARTIAL / NO_REPLICATION (BLOCKED only for a NEW blocker)
the firewalls, including Knowledge != Authority and Procedure != Authority
the CoT discipline: no private reasoning is persisted
the relevance-pressure deferral (SCALING_FRICTION, not SEMANTIC_BLOCKER)
```

Scenario A's original registration is **not deleted**. It remains in the parent protocol as historical
record and in this amendment as a demoted secondary probe.

---

## 8. Pre-registered primary measures for the replacement scenarios

Carried forward verbatim from the parent's §20/§21/§22, with the two scenario-specific pre-paid
mistakes named:

| scenario | pre-paid cognitive mistake measured for recurrence |
|---|---|
| B | transform/default before legacy ambiguity validation |
| C | mutate/reduce before replay/sequence validity is established |

The core comparison remains `C0 recurrence vs C1 recurrence vs C2 recurrence`, and the
Procedure-added-value test (`C2` vs `C1`) is first-class: a Procedure handle merely being visible is
insufficient evidence of procedural value.

---

## 9. Disclosure: this amendment was revised during calibration, before any primary trial

The amendment's digest is computed from this document's bytes, and those bytes changed once. The change
is disclosed here rather than left for a reader to notice.

**What happened.** The first draft of §5.2 described Scenario C as a reducer over a caller-supplied
array. Calibration (§11 of the parent protocol) then measured that a capable worker solved that fixture's
hidden contract on its first submitted candidate in 3 of 3 C0 runs — a CEILING, which §11 requires to be
rejected. §11's remedy is explicit: "If rejected: replace the fixture BEFORE primary trials."

**What changed.** Scenario C was rebuilt around a caller-owned `state` object, so the ordering contract
is observable rather than cosmetic: an implementation that validates as it applies leaves the caller's
object partly mutated after reporting failure. §5.2 above describes the rebuilt fixture. The pre-paid
mistake it measures is UNCHANGED.

**Why this is not outcome-driven tuning.** No primary trial had run, and none has run now. The revision
was driven by the calibration criterion the parent protocol fixed in advance (reject a ceiling), not by
any experimental result. Calibration trials are recorded separately and are never counted among the 30
primary trials. Scenario B's design and both scenarios' conditions, trial count, ordering and verdict
criteria are untouched.

**Digest.** The digest recorded in `research-evidence/r1-r/protocol-amendment-a1.json` is the digest of
THIS document, recomputed by `scripts/r1r/amendment.mjs` at freeze time. The parent protocol's digest is
re-verified on every parse and has never changed.
