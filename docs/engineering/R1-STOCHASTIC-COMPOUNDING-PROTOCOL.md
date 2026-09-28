# R1 — STOCHASTIC WORKER COMPOUNDING: PRE-REGISTERED PROTOCOL

> **Status: FROZEN before the first trial of the pre-registered matrix.**
> Frozen at branch `r1-stochastic-compounding`, whose base is `main @ 044330b`
> (`Merge pull request #215`, the E0→R0 landing; full SHA `044330b2e55198542d545edc42ed9c36e7ce896b`).
> Digest of this document is recorded in `research-evidence/r1/protocol.json`; the protocol parser in
> `scripts/r1/protocol.mjs` recomputes it, so a silent edit is detectable.
>
> **Disclosed ordering caveat.** The *precondition probe* of §0 necessarily ran BEFORE this document
> existed: it is what discovered the blocker the document registers. So the honest statement is
> "frozen before the first **matrix** trial", not "before the first model call" — the probe invoked
> the stochastic worker three times (once per condition, one run each) and is fully disclosed in
> `research-evidence/r1/`. The matrix itself has no runs, so there is no outcome for a post-hoc
> protocol to have been fitted to. No outcome-driven prompt tuning occurred (§6).

This document exists so that R1's outcome cannot be defined after seeing the data. It is written
BEFORE any stochastic trial, and §6 of the ruling forbids outcome-driven prompt tuning.

---

## 0. Why the primary experiment is pre-registered as BLOCKED, not as a result

The ruling asks R1 to test whether durable project capital improves a later **stochastic** worker's
observable behaviour. Before registering trials, R1 ran a **delivery probe**
(`scripts/r1/probe-capital-delivery.mjs`) whose only purpose was to confirm the experimental
precondition: that capital selected into an attempt can reach the worker being measured.

It cannot. The probe is recorded in `research-evidence/r1/` and is reported in full in the results
document. Registering a 30-trial matrix whose three conditions provably produce **byte-identical
model inputs** would produce 30 meaningless runs and a fabricated comparison, so the primary matrix is
pre-registered as **NOT RUN — R1 SEMANTIC BLOCKER**, with the machine evidence that establishes it.

**The secondary experiment (§26–§29 relevance pressure) is NOT blocked** — it involves no worker and
no model — so it is pre-registered normally below and was run.

---

## 1. Frozen inputs

| input | value |
|---|---|
| Palimpsest main SHA (branch base) | `044330b2e55198542d545edc42ed9c36e7ce896b` |
| R1 branch | `r1-stochastic-compounding` |
| Host | DSH `0.1.7-rc.2` (resolved via `scripts/gates/env.mjs`) |
| Provider / model | `deepseek-official` / `deepseek-flash` (fixed for every run; ONE profile) |
| Worker seam | `dshSubprocessWorkWorkerPort` (the shipped production seam D2/D4/D5 exercise) |
| Ordarium version | pinned by `package.json` to the `ordarium-v1.3.1` release tarballs |

Model metadata that the host does not expose is recorded as UNKNOWN rather than inferred (§5).

---

## 2. Scenarios (frozen)

**Scenario A — DAG Planner.** The corrected contract from E-LIVE/R0. Every trial starts from the SAME
pre-task state: the naive implementation, measured **4 PASS / 4 FAIL** (independently re-measured in
R1; the obsolete 0/8 Generation-0 figure is not used). The task is to finish the planner so it
satisfies the adopted contract, including cyclic input. Acceptance is the project's own suite,
`test/acceptance.test.ts`, unchanged for every condition.

**Scenario B — config migration.** A second, independent TypeScript project
(`migrateConfig(input): V2Config`) whose legacy contract contains at least one non-obvious failure
mode, with the same experimental structure and a different domain solution. **Not built in this run**,
because the primary matrix was blocked at the precondition — see §6 LIMITATION. Its contract is
registered here so a later stage cannot quietly redefine it.

---

## 3. Conditions (frozen)

For the SAME project intent, repository bytes and task:

| condition | ProjectIR | Proof | Reasoning | Procedure | authority |
|---|---|---|---|---|---|
| **C0** | current | — | — | — | unchanged |
| **C1** | current | relevant | relevant | — | unchanged |
| **C2** | current | same | same | ACTIVE relevant | unchanged |

Only the selected capital differs. No authority differs between C0/C1/C2 (§25).

---

## 4. Trial discipline (frozen)

- **N**: 5 per condition per scenario (30 runs); minimum acceptable exploratory matrix 3 per
  condition per scenario, with an explicit confidence downgrade and no silent reduction.
- **Order**: fixed pre-registered randomized blocks, one C0 + one C1 + one C2 per block, ordering from
  one fixed protocol seed (recorded in `protocol.json`). Never all-C0-then-all-C1-then-all-C2.
- **Each trial**: fresh install, fresh worker process, fresh attempt, seeded durable state, no
  conversation or transcript reuse, no manually-written handoff, every ref re-derived by durable-owner
  query (§17). No retry inside a trial because the result is poor (§16).
- **Paired-state proof**: within a block, C0/C1/C2 must share the ProjectIR digest, repository HEAD,
  target source bytes, task objective, envelope semantics, acceptance-suite digest, DSH profile, model
  identity/config, worker adapter and policy. Any difference ⇒ `CONFOUNDED_TRIAL`, excluded from the
  primary comparison and retained in raw evidence (§13).

---

## 5. Outcomes (pre-registered, never collapsed to one score)

Recorded per trial (§19): final acceptance pass/fail; first-submitted pass/fail; failed validation
iterations; known-invalid approach attempted (yes/no); known prerequisite rediscovered
(yes/no/unknown); Proof / Reasoning / Procedure actually pulled (yes/no); Procedure content
behaviourally reflected (yes/no/unknown); attempt count; worker/tool action count if observable;
elapsed wall time; input/output tokens if observable; host/manual interventions. **Unknown stays
UNKNOWN.**

**Scenario-specific known-failure marker (§20).** Scenario A: ordering attempted without handling
cycles first. Scenario B: defaults injected before legacy alias ambiguity is validated. Detected from
submitted source, test failures and tool-visible behaviour — never from private reasoning.

**Procedure-usage evidence (§21).** A C2 worker holding a handle is insufficient. Evidence is
externally visible: the implementation follows the ordered method clauses, validation occurs at the
Procedure-prescribed boundary, the known failure is avoided before the first failing test, the worker
fetches the body, or the source structure reflects the method.

**Textbook effect (§22).** Strong evidence requires BOTH less repeated known failure/rediscovery AND
an equal-or-better mechanical outcome. More verbose output does not count.

---

## 6. Verdict rule (frozen)

- **PASS** — both independent scenarios show directional textbook-effect replication under C2, and
  Procedure use is observably load-bearing in at least one.
- **PARTIAL** — exactly one scenario shows the effect, or replication is too noisy/small-N for both.
- **NO_REPLICATION** — neither scenario shows meaningful behavioural inheritance.

Plus the blocking outcome defined in §0, which is a statement about the HARNESS, not about the
product's semantics:

- **BLOCKED** — the primary comparison cannot be formed because the conditions are not distinguishable
  to the worker. This is not PASS, PARTIAL or NO_REPLICATION, and must not be reported as any of them.

**No PASS may be redefined after observing data.** No p-value is required; exact counts are reported,
with confidence intervals as descriptive statistics only (§23).

---

## 7. Failure taxonomy (experiment-only, NOT canonical ontology — §24)

`KNOWLEDGE_NOT_SELECTED` · `KNOWLEDGE_NOT_USED` · `PROCEDURE_NOT_SELECTED` · `PROCEDURE_NOT_USED` ·
`RELEVANT_ASSET_MISSED` · `IRRELEVANT_ASSET_DISTRACTION` · `KNOWN_FAILURE_REPEATED` ·
`IMPLEMENTATION_ERROR` · `VALIDATION_ERROR` · `MODEL_NONCOMPLIANCE` · `HOST_ERROR` · `TIMEOUT` ·
`CONFOUNDED_TRIAL`

---

## 8. Secondary experiment — relevance pressure (frozen, and RUN)

Independent of the primary matrix, and deliberately involving no model. For the SAME project intent:

- **Pools**: N ∈ {5, 25, 100} project-associated assets.
- **Relevant count FIXED at 3** (one Proof, one Reasoning, one Procedure). The other N−3 are
  legitimate, admitted, project-associated assets — never malformed junk (§26).
- **Measured per N** (§27): associated assets enumerated; candidate refs inspected; asset
  bodies/metadata fetched; operations required before the relevant refs are selected; wall time;
  mistaken inclusion; relevant asset missed. The relevant refs are **never** hard-coded across a cold
  restart; each round rediscovers them from durable state.
- **Classification** (§28): `ADEQUATE` | `UX_FRICTION` | `SCALING_FRICTION` | `SEMANTIC_BLOCKER`,
  where only `SEMANTIC_BLOCKER` may justify an immediate semantic stage.
- **Remedy is NOT implemented** (§29); options B (deterministic relation-based) and C (advisory
  semantic) remain hypotheses, and which observed failures each could solve is recorded.

---

## 9. Firewalls in force (§3)

`Stochastic improvement ≠ proof of general intelligence` · `One successful run ≠ replication` ·
`Final pass ≠ textbook effect` · `Knowledge available ≠ knowledge used` · `Procedure available ≠
Procedure used` · `Model summary ≠ private chain-of-thought` · `Selection friction ≠ semantic gap` ·
`Better outcome ≠ wider authority`, plus the standing architectural firewalls
`Knowledge ≠ Authority` · `Procedure ≠ Authority` · `Commitment ≠ WorkOwnership` · `Fulfillment ≠
Truth` · `HistoricalKnowledge ≠ CurrentAuthority`.

## 10. Evidence discipline (§18, §34)

No private chain-of-thought is persisted. Permitted evidence: worker-visible messages, tool/command
actions, file changes, git commits, attempt reports, Context handles pulled, test executions,
acceptance results, and latency/token metadata when exposed. Raw host logs are sanitized to
externally observable fields. No secrets are committed.

## 11. PROTOCOL AMENDMENTS

*(Append-only. A correction after the first stochastic run must state its reason and which runs
occurred before it. No outcome-driven prompt tuning.)*

*None.* The protocol was frozen before the delivery probe and was not amended afterwards.
