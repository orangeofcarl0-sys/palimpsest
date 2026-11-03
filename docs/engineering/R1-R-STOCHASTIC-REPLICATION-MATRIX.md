# R1-R — STOCHASTIC COMPOUNDING REPLICATION MATRIX

> **Status: see `research-evidence/r1-r/analysis.json` for the verdict this stage reached.**
> Branch `r1-r-stochastic-replication`, whose base is `dc5679d` (the R1-L closure). The parent R1
> protocol is **not edited**: this stage appends
> [`R1-PROTOCOL-AMENDMENT-A1.md`](./R1-PROTOCOL-AMENDMENT-A1.md), which is what authorises the matrix to
> run at all.

This document explains **how the matrix was built and run**, so the result can be read as a measurement
rather than as a claim. The result itself is in the evidence directory; the numbers are not duplicated
here, because a number copied into prose is a number that can drift from the artifact that measured it.

---

## 1. Why an amendment was required

R1 registered the primary matrix as **BLOCKED** and R1-L closed the blocker. Two facts then had to be
recorded before any trial could run, and neither could be recorded by editing the frozen protocol:

1. **The blocker was closed**, so the matrix could finally be formed.
2. **Scenario A's C0 control already scored 8/8** (measured during R1's probe), so Scenario A cannot
   discriminate between conditions — a ceiling, not a replication.

Amendment A1 records both, demotes Scenario A to a **secondary probe**, and registers two replacement
primary scenarios. Its digest is recomputed from its own bytes by `scripts/r1r/amendment.mjs`, and that
module also **re-verifies the parent protocol's digest** — so an "amendment" that had actually rewritten
the protocol it amends would fail rather than pass.

## 2. The two primary scenarios

Both are built so that **the hidden contract is non-obvious but the task is solvable by exploration**,
which is the regime §11 of the parent protocol asks for: rediscovery possible, rediscovery costly.

| | Scenario B | Scenario C |
|---|---|---|
| project | versioned config migration | replay-safe event reducer |
| export | `migrateConfig(input)` | `applyEventStream(state, events)` |
| pre-paid mistake | transform/default before legacy ambiguity validation | mutate/reduce before replay/sequence validity is established |
| hidden invariants | normalize before comparing; refuse normalized-key collisions; validate the legacy document before any default; validate the v2 result before return | establish replay validity before any mutation so a refusal leaves the caller's state untouched; derive state from the log's own sequence; refuse gaps and two different events at one position; exact replay idempotent; a tombstone dominates an older write |

**The black-box acceptance is mechanically black-box.** The authoritative oracle
(`fixtures/<scenario>/acceptance.mjs`) is never copied into a worker's world, and
`assertOracleInaccessible` proves that by CONTENT rather than by path: it fails if the oracle's
distinctive source bytes appear anywhere under the world. A test asserts this for both scenarios.

**The visible oracle covers basic behaviour; the hidden acceptance covers the non-obvious invariants.**
This split is the experiment, not a detail of the fixture:

- `node test/check.js` runs inside the world and reports one line per case with a NAMED failure class
  (`REJECTED_BUT_SHOULD_ACCEPT`, `WRONG_OUTPUT`, `ACCEPTED_BUT_SHOULD_REJECT`, `WRONG_STATE`,
  `ACCEPTED_INVALID_HISTORY`). It exercises the straightforward contract an engineer would implement
  from the README alone.
- The **hidden** acceptance additionally exercises the invariants the visible set does not: for B, the
  upper range bounds, cross-spelling ambiguity, normalized-key collisions, and an explicitly present but
  unusable optional setting; for C, canonical sequence order, sequence gaps, conflicting identity,
  replay idempotence and tombstone dominance.

A test asserts the asymmetry directly: the H0 starting implementation FAILS the hidden acceptance, and
each hidden set contains at least one invariant the visible set never exercises.

**Passing the visible oracle is necessary and not sufficient.** The visible and hidden case lists share
no input, no id, and no answer: a candidate that memorises every visible answer scores strictly worse on
the hidden acceptance than one that derived the method. A test asserts exactly that.

### Why the split had to be rebuilt three times

Three earlier versions of this stage got the fixture wrong, and calibration rejected them each time —
which is what calibration is for (§11: "If rejected: replace the fixture BEFORE primary trials").

1. **The invariant names leaked the method.** The worker-visible `test/cases.json` carried an
   `invariant` field. The names (`new-format-defaults`, `required-fields-validated`,
   `aliases-normalized-before-comparison`) spelled out the ordering the experiment exists to measure, and
   C0 passed the hidden acceptance on its first candidate with no known-failure recurrence.
2. **The visible oracle was as strong as the hidden one.** Even after the names were removed, every
   hidden invariant was also exercised by a visible case, so a worker could iterate against the oracle
   until the method was fully revealed — and C0 again reached 15–16/16 with recurrence false.
3. **Scenario C's contract was cosmetic rather than observable.** With a pure `reduce(events)` signature
   the ordering mistake showed up only as a wrong return value, which a capable worker got right by
   reasoning about the goal alone. Scenario C was rebuilt around a CALLER-OWNED `state` object, so an
   implementation that validates as it applies leaves the caller's object partly mutated after reporting
   failure — a mistake that is observable from outside rather than merely inferable.

The lesson is the one §5 already states: the visible tests are for **basic behaviour**, and the
non-obvious invariants belong in the hidden acceptance precisely so that rediscovery is possible but
costly (§11). A regression test now fails if an invariant name reappears in the worker-visible file, and
a second fails if the visible oracle stops being strictly weaker than the hidden acceptance.

The `invariant` field is still present in the fixture MODULE, because the §8 teacher exploration and the
harness tests need to know which property a failure exercised. It is stripped by `materializeVisible`
before anything is written into a world.

## 3. Teacher capital, and why it is not authored

§8 of the ruling forbids writing "the perfect Procedure" from the scenario specification. So the
Procedure is not written; it is **derived**:

```
generation B0 → oracle failures observed → clause forced by those failures
generation B1 → oracle failures observed → clause forced by those failures
...
```

`scripts/r1r/teacher-exploration.mjs` runs a deterministic ladder of plausible implementations against
the REAL oracle and records each generation's actual failure classes, failed invariants and detail
strings. `scripts/r1r/capital.mjs` maps the failed invariants to clauses and **asserts traceability**:
every clause must name a generation the exploration actually ran, and the final generation must have
stopped failing. A clause with no forcing generation is an authored clause, and the module throws.

The Procedure encodes **method, not source**: a test rejects any clause containing code syntax, and a
second test rejects any clause that could widen authority (`allow`, `permit`, `authorize`, `grant`,
`disable`, `ignore the scope`).

## 4. Conditions, and what is held constant

```
C0   no selected Proof, Reasoning or Procedure      (index empty; the SAME pull tool)
C1   Proof + Reasoning                              (Procedure absent)
C2   same Proof, same Reasoning, ACTIVE Procedure
```

No authority differs between conditions, and no condition's worker-private tool catalogue differs: the
`palimpsest_worker_context_pull` tool is delivered to every condition, including C0.

§14's paired-state proof is enforced per block. Within a block the three conditions must share the
scenario identity, task semantic digest, **starting tree digest**, target-source digest, visible-test
digest, hidden-oracle digest, ordinary-task digest and capability-set digest — and their context index
must **differ**, because an index that is identical across C0/C1/C2 means the treatment was never
applied. A block that violates either direction is marked `CONFOUNDED` and excluded from the primary
comparison while remaining in raw evidence.

The raw per-trial `repositoryHead` is recorded for inspection but deliberately **excluded** from the
comparison: each trial builds its own `git init`, so comparing SHAs would report every block as
confounded for a reason that has nothing to do with the experiment. The starting **tree** digest is the
comparable identity.

## 5. Trial discipline

- **30 trials**: 2 scenarios × 3 conditions × 5 repetitions.
- **Blocked ordering** from the parent protocol's own frozen seed, read from `scripts/r1/protocol.mjs`
  rather than re-implemented: `b0[C2,C0,C1] b1[C0,C1,C2] b2[C1,C0,C2] b3[C0,C1,C2] b4[C2,C0,C1]`.
  Never all-C0-then-all-C2.
- **One process per trial**: fresh world, fresh install, cold restart, fresh worker, fresh attempt.
- **No adaptive retries.** A worker that made a bad choice, declined to pull, or failed the hidden
  acceptance is DATA. Nothing restarts a trial because its result was poor.
- **Calibration is not part of the result.** Its runs are recorded separately and are never counted
  among the 30.

### Calibration outcome, and a limitation that must be read with the result

Both scenarios passed the §11 gate (`PRIMARY_ELIGIBLE`: neither ceiling nor floor), and the raw numbers
are in `research-evidence/r1-r/calibration/`.

**The limitation is Scenario B's sensitivity on the primary measure.** In calibration, 3 of 3 C0 runs
avoided the pre-paid mistake (`transform/default before legacy ambiguity validation`) on their first
submitted candidate. Scenario B therefore passes §11's ceiling test — which requires ALL 3 runs to solve
the FULL hidden contract on the first candidate — while having little headroom on the recurrence measure
specifically. A `C2 < C0` recurrence difference on Scenario B would be weak evidence, because C0 was
already not recurring.

This is reported rather than tuned away, and the reason is a protocol rule: the parent protocol forbids
outcome-driven tuning, and the only lever that would raise Scenario B's headroom is making its hidden
contract harder to reason about from the stated goal. Every such edit I tried made the fixture worse in a
different way — it either demanded a magic number the worker could not derive from anything it could run
(an unguessable secret, not a discoverable method), or it re-revealed the ordering through the visible
oracle. Three fixture rebuilds already happened for exactly those reasons (§2 above). Further edits would
be fitting the fixture to the outcome, which is the one thing calibration exists to prevent.

**Scenario C carries the primary measure.** There, 3 of 3 C0 runs DID recur the pre-paid mistake
(`mutate/reduce before replay/sequence validity is established`), on both their first and their final
candidate, scoring 10–12 of 15 against a 15/15 reference. So the headline comparison is well-posed on
Scenario C, and Scenario B contributes a secondary, sensitivity-limited reading.

The verdict rule is unchanged and is applied as frozen. A reader should weigh Scenario B's contribution
knowing that its control was already non-recurring at baseline.

## 6. Measurement, and its limits

Recorded per trial (§20), never collapsed into one score: final hidden acceptance; first-submitted
candidate acceptance; hidden- and visible-oracle invocation counts; known-failure recurrence; selected
handles; pulled handles and pull order; whether the Procedure was pulled; implementation revisions;
elapsed time; host failure / timeout; manual interventions.

Three measurement decisions are worth stating because each one could have flattered the result:

- **First candidate means the worker's first submission.** Resolving it to the world's starting commit
  would have reported the H0 baseline's score (8/16) as the worker's first attempt — a different
  measurement, and one that made every condition look equally bad at the start.
- **A worker that submitted nothing is recorded as having submitted nothing**, not as a score of 0.
- **Token counts are recorded as UNKNOWN.** The DSH seam does not expose them, and the parent protocol
  forbids inferring metadata the host does not expose.

**Known-failure recurrence is detected behaviourally**, not from private reasoning: a narrow diagnostic
probe separates "this implementation has the ordering wrong" from "this implementation failed some
case". The probes are not in either case list, so they cannot be answered by memorising the oracle.

**No private chain-of-thought is captured.** The worker's recorded summary is its self-report through
`palimpsest_worker_result`; nothing reads its reasoning. Pulled BODIES are never written into general
telemetry — only handle ids, order and result kind.

## 7. Verdict criteria, unchanged

From the parent protocol §6, applied to the amendment's two scenarios:

```
PASS             both primary scenarios show directional capital benefit,
                 AND at least one shows C2 > C1 on a pre-registered procedural outcome
                 with observed Procedure pull
PARTIAL          exactly one scenario replicates, or both trend but small-N prevents a claim
NO_REPLICATION   neither scenario shows meaningful inherited-capital benefit
BLOCKED          allowed ONLY for a NEW infrastructure/semantic blocker
```

The Procedure-added-value test (C2 vs C1) is first-class: a Procedure handle merely being VISIBLE is
insufficient evidence of procedural value, and a directional benefit without an observed Procedure pull
cannot be PASS.

## 8. Files

| path | what it is |
|---|---|
| `scripts/r1r/amendment.mjs` | parses amendment A1, re-derives its digest, re-verifies the parent's |
| `scripts/r1r/fixtures/scenario-{b,c}/` | the projects, their visible oracles, their hidden acceptance |
| `scripts/r1r/teacher-exploration.mjs` | the generation ladder and its recorded observations |
| `scripts/r1r/capital.mjs` | the capital derived from those observations, with traceability assertions |
| `scripts/r1r/known-failure.mjs` | the behavioural detectors for the two pre-paid mistakes |
| `scripts/r1r/scenarios.mjs` | world construction, oracle inaccessibility, paired-state digests |
| `scripts/r1r/trial.mjs` | ONE trial, in its own process |
| `scripts/r1r/calibrate.mjs` | the calibration phase (§11) |
| `scripts/r1r/matrix.mjs` | the 30-trial matrix, in frozen randomized blocks |
| `scripts/r1r/analyse.mjs` | normalization, paired-state check, the frozen comparisons |
| `scripts/r1r/gate-a.mjs` | GATE A — amendment + calibration preconditions |
| `scripts/r1r/evidence.mjs` | writes the sanitized evidence artifacts (§29) |
| `research-evidence/r1-r/` | the evidence |

## 9. What this stage does NOT do

- It does **not** implement relevance selection. Relevance remains deferred as `SCALING_FRICTION`, not a
  `SEMANTIC_BLOCKER`.
- It does **not** rewrite any historical result. R1's BLOCKED measurement and R1-L's closure stand
  exactly as recorded.
- It does **not** make a stochastic outcome a CI expectation. The harness tests assert on the FIXTURES
  and the DETECTORS — things that are deterministic — never on "the model must succeed 4/5 times".
- It does **not** widen the worker's capability boundary, and nothing in the Procedure can.
