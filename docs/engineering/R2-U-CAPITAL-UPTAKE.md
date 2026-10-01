# R2-U — CAPITAL UPTAKE & AFFORDANCE

Baseline: `c023a633f2caf747aee539b029fba37a3a7fca48` · Branch: `r2-u-capital-uptake` · Stage type: EXPERIMENTAL

---

## 0. What this stage is, and what it deliberately is not

R2-U measures TWO distinct questions:

```
UPTAKE     does a stochastic worker CHOOSE to consume inherited capital?
EFFICACY   when an affordance causes capital consumption, does task behaviour improve?
```

**Uptake is the primary outcome.** R2-U does not require an efficacy win to succeed. That ordering is not a
preference — it follows from what R1-R already measured: capital was visible and pullable in all 30 trials
and was pulled in **0/30**. A stage that demanded an efficacy result from an affordance whose uptake was
still zero would have no measurement to stand on.

Expected canonical semantic changes: **NONE**. Security/backend semantics are frozen; no R1-H* work was
reopened.

---

## 1. The frozen prior evidence

R1-R's 30 trials are carried forward verbatim as the **passive-affordance baseline**:

```
capital visible      yes, every trial
capital pullable     yes, every trial
governed pulls       0/30
```

They are NOT rerun and NOT reinterpreted as if they had used the R2-U affordance. A trial run under a
different presentation arm is a different treatment, and pooling them would erase the factor.

---

## 2. The design

A 2 × 2 factorial, in five randomized blocks per scenario:

| Factor | Level | Meaning |
| --- | --- | --- |
| K | K0 | no selected inherited capital |
| K | K1 | full relevant capital selected — Proof + Reasoning + Procedure |
| A | A0 | PASSIVE — the current production presentation |
| A | A1 | EXPLICIT REVIEW — the one frozen clause is appended |

Cells: `K0A0` · `K1A0` · `K0A1` · `K1A1`. The primary comparison is **K1A0 vs K1A1**; **K0A0 vs K0A1** is
the placebo/control, because the same sentence is used in both A1 cells and only the presence of relevant
handles differs.

### 2.1 The frozen wording

```
Before implementation, review the inherited project-context section. If it contains handles relevant to
this task, inspect those handles through the governed context-pull capability before deciding on the
implementation. If the section is empty or not relevant, proceed normally.
```

The clause is **kind-agnostic and content-blind**: it names no handle kind, reveals no body, and routes the
read through the governed capability rather than the filesystem, so it cannot be read as "read the file".
It is an AFFORDANCE, not forced compliance — the worker may still ignore it, and that is exactly what the
experiment measures.

### 2.2 The presentation seam

`host/dsh/lib/affordance.js` holds the clause and the mode resolution; `host/dsh/lib/runner.js` applies it
to the composed prompt. The contract is **additive**:

```
default / absent mode   →  applyAffordance returns its INPUT UNCHANGED (same string, not a copy)
explicit-review mode    →  the input plus exactly one clause
```

The mode comes from one environment value, `PALIMPSEST_R2U_AFFORDANCE`, and resolution is **fail-safe
toward production**: an unset, empty or unrecognized value yields `off`. A typo cannot turn every ordinary
deployment into a trial arm.

No Task objective, no ProjectIR, no Project setting and no canonical event/store/schema was touched. The
uptake wording is HOST PRESENTATION, and that is the whole of the change.

---

## 3. Prompt isolation

Within one randomized block, the following are proven identical across the four cells:

```
ProjectIR digest · task digest · repo tree digest · visible tests · hidden oracle
worker profile · model · policy · ordinary task text · capability catalogue
```

Only two things may differ: **the capital index presence** (the K factor) and **the uptake-affordance
clause presence** (the A factor).

The components are digested **separately** rather than as one whole-prompt digest, because a single digest
changes both when the index appears and when the clause appears — it therefore cannot show that only one
of them moved. `ordinaryTaskDigest`, `indexSectionDigest` and `affordanceClauseDigest` are recorded
independently per trial, and `scripts/r2u/analyse.mjs`'s `isolationCheck` verifies per block that the
invariant fields match and that each factor moved exactly as designed.

---

## 4. Scenarios

### 4.1 Scenario C — reused, not redesigned

Scenario C's contract, fixture and hidden acceptance are **R1-R's own files, imported rather than copied**,
so a later edit to the R1-R fixture is a visible change here rather than a silent divergence between two
fixtures claiming to be the same one. Its previous C0 results provide real headroom (H0 scores 5/15 on the
hidden acceptance).

### 4.2 Scenario D — the true holdout

An independent engineering scenario that was **NOT used to develop R1-R**, in a domain structurally
different from config migration and event replay: **incremental dependency/cache invalidation**.

```
invalidateCache(cache, changed) → Cache
```

A cache entry records the value it produced and the node ids it was computed from. When a source changes,
the affected set is a **closure**: the changed nodes, every entry whose dependency the cache does not hold,
and the transitive **dependents** of both.

The pre-paid cognitive mistake is:

```
invalidate the changed nodes before the affected closure is computed
```

It is observably destructive because it is **silent**: the returned cache is well-formed, every remaining
entry is individually consistent, and nothing about the object says which of its values are now derived
from changed input. It is also **irreversible in the caller's hands** — the caller keeps the same object, so
a deletion performed while walking destroys the dependency information needed to find the dependents.

Measured discrimination:

```
reference implementation   visible 5/5   hidden 14/14
H0 starting point          visible 5/5   hidden 2/14
```

H0 passing the visible oracle while failing the hidden acceptance is what gives C0 real headroom: the
mistake is not visible from inside the world.

### 4.3 Scenario D teacher capital

The capital is derived from a **deterministic prior-generation ladder** run against the real hidden
acceptance — never authored from the oracle specification. Each generation is a plausible next move for an
engineer who has just seen the previous generation's failure classes:

| Generation | Move | Observed result |
| --- | --- | --- |
| D0 | delete the entries whose source changed | 2/14 — dependents left stale |
| D1 | add shape validation, but after the deletions | 2/14 — and the caller's cache mutated before a refusal |
| D2 | compute a closure, but in both directions | 10/14 — ancestors that were still correct were discarded |
| D3 | walk descendants only | 12/14 — an entry with an unresolvable dependency survived |
| D4 | freeze the affected set, then delete | 14/14 |

Every durable capital clause names the generation whose **recorded failure** forced it, and
`deriveCapital` throws if a clause names a generation that failed nothing. A clause with no forcing
generation would be an authored clause, and there are none.

The capital carries Proof + Reasoning + Procedure and is associated through the **ordinary owners and
admission paths** — the same `ProofEvidenceStore`, `ReasoningCellStore`, `ProcedureStore` and
`ProjectAssetAssociationStore` the product already ships.

---

## 5. Calibration

Calibration is **C0 only**, and its trials are NEVER counted among the 40.

Scenario D: three fresh C0 workers. The fixture is rejected if it sits at either extreme:

```
CEILING   all three first submissions fully satisfy hidden acceptance
FLOOR     all three fail to make meaningful progress
```

"Meaningful progress" is pre-registered as a strict majority of hidden cases, stated **before** the runs so
the floor decision cannot be made after seeing which runs it would reject. Scenario D was not developed by
repeatedly tuning against the same five-trial primary distribution.

---

## 6. The matrix

```
2 scenarios × 4 cells × 5 independent repetitions = 40 stochastic primary trials
```

Order comes from ONE frozen seed (`0x52325501`) through a per-scenario xorshift32 stream, so the four cells
of a block are interleaved rather than grouped — the ruling's "do not run all affordance trials after all
passive trials" is checked as a property of the derived schedule.

**One ACTIVE confidential worker at all times.** The runner is strictly sequential because the Windows
confidential profile supports exactly one; there is no concurrency to configure.

---

## 7. Primary and secondary outcomes

Primary metric: `P(any relevant pull)` per cell. A pull counts only when the parent's attempt-bound
resolver returned `resolved`, so a refused or not-found handle never counts.

Recorded per trial:

```
capital handles visible            pull before first edit?
first context-pull timestamp/order pull before first visible test?
number of distinct handles pulled  pull before first hidden-oracle submission?
Proof / Reasoning / Procedure pulled?  worker completed? HOST_FAILURE?
```

Secondary: `P(Procedure pull)`, median relevant handles pulled, time-to-first-pull, tool actions before
first pull, and **capital shown but never used**. No private chain-of-thought is captured; the worker's own
summary is its self-report.

Ordering facts come from `PALIMPSEST_WORKER_ACTIONS`, which records tool **names and first-use ordinals
only** — no argument, no result, no reasoning — read from the same durable session artifact the host
already writes.

---

## 8. The verdict, defined before running

```
REPLICATED     both scenarios: K1A1 pull rate > K1A0 pull rate, with actual governed body pulls,
               and the effect is not explained by a comparable placebo shift in K0
PARTIAL        exactly one scenario shows a clear increase, or both show a weak/noisy directional increase
NOT_IMPROVED   the explicit affordance does not increase capital use in either scenario
```

All three are valid results. The placebo condition is part of the criterion rather than a footnote: an A1
arm that raises pulling in K0 as much as in K1 has not shown that the affordance helps a worker **use**
capital — it has shown that the instruction changes behaviour in general, which is a different claim.

---

## 9. Efficacy interpretation

Efficacy is **secondary** and is analysed only where actual governed pulls occurred. The analysis keeps
two views strictly apart:

```
intent-to-treat        every trial by RANDOMIZED cell assignment — the only causal comparison
observed-use           pullers vs non-pullers — SELF-SELECTED, an association, never an effect
```

The stage does not write "capital helps" merely because K1A1 outperformed K0A1. Pullers and non-pullers are
not randomized subgroups and are never treated as one.

---

## 10. Security discipline

Every stochastic trial runs under the **R1-HC confidential Windows profile** with `MAX ACTIVE worker = 1`,
and the trial record captures the worker's own telemetry for each:

```
capacity admission        boundary installed + roots verified
capability classification unknown capability → worker-start refusal
```

If an R1-HC confidentiality gate regresses, R2-U STOPS rather than continuing to collect trials under a
broken boundary. The preflight runs `gate:r1-l-live`, `gate:r1-h-conformance`, `gate:r1-h-live`,
`gate:r1-hr-conformance`, `gate:r1-hr-clean-env`, `gate:r1-hc-conformance` and `gate:r1-hc-live` before any
trial, and verifies `max ACTIVE worker = 1`.

---

## 11. Capacity-slot reliability

R2-U runs 40 sequential workers, each in its own host process, each taking the confidential-capacity slot.
The slot is host-local and noncanonical — it carries no semantics and no Work reads it — but it is
load-bearing for the experiment, so its crash contract is measured in separate OS processes BEFORE any
trial runs (`scripts/r2u/slot-preflight.mjs`):

```
a holder killed WITHOUT release leaves a stale record that a fresh host recovers
a LIVE recorded pid is NOT stolen
a malformed record does not block work forever
a record older than the staleness bound is recovered
```

The third and fourth matter because the failure they prevent is not "work stops" but "work is silently
refused as a capacity fact", which would look like a host problem rather than a measurement.

---

## 12. Host constraint discovered during the stage (measured, not assumed)

The PTC sandbox provisions a worker's write boundary by calling `SetNamedSecurityInfoW` on the workspace
directory, which requires `WRITE_DAC`. Measured on the reference machine: the user holds FullControl inside
their own profile but only Modify (inherited, no `WRITE_DAC`) on the `F:` volume. A trial rig placed next to
the repository therefore fails **inside the worker**, on every `run_code`, with:

```
SetNamedSecurityInfoW failed (Win32 5): grantWrite(<world>)
```

That is a property of the host, not of Palimpsest, and it is why `scripts/r2u/*` default their rigs inside
the user profile (`~/.palimpsest-r2u/`), matching the convention `scripts/gates/env.mjs` already documents
for the live gates. A worker that hits it reports `HOST_FAILURE` and the trial is recorded honestly rather
than being silently re-run.

---

## 13. Reproducing the stage

```sh
pnpm build
pnpm r2u:slot-preflight      # §2  the capacity slot's crash contract
pnpm r2u:isolation           # §7  default path byte-identical; A1 adds exactly the clause
pnpm r2u:gate-a              # §26 readiness — all preconditions, then continue automatically
pnpm r2u:calibrate --scenarios=D --runs=3   # §13 C0 calibration (never counted among the 40)
pnpm r2u:matrix              # §27 the 40 primary trials, sequential, one process each
pnpm r2u:analyse             # §28 the uptake verdict, then the efficacy observations, separately
pnpm r2u:evidence            # §24 the sanitized evidence directory
```

The matrix is resumable in the honest sense: `trials.partial.json` is flushed after every trial, so an
interrupted run leaves a trail showing exactly which trials exist rather than a gap that reads as a result.

---

## 14. What is explicitly out of scope

- **Relevance automation.** The stage does not implement it, and the index remains the attempt's own
  compiled handles with no inference.
- **A Procedure-vs-epistemic efficacy stage.** Not begun here. Within K1 the full capital set is available,
  and whether Procedure is pulled is RECORDED as a distinct future question rather than a factor.
- **The C1/C2 factorial.** Not reopened; the experiment is not changed mid-run.
- **Any canonical semantic change.** `src/` is untouched.
