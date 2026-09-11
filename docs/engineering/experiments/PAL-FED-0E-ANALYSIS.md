# PAL-FED-0E Analysis

Status: EXPERIMENTAL / BEHAVIORAL EVIDENCE / NOT UAS FROZEN.

Design: 8 pre-registered primary scenarios (3 D1 clear cross-project dependency,
3 D0 clearly local, 2 DA ambiguous) × 2 treatment arms (C0 = §41 criterion
absent, C1 = present) × 2 replicates = **32 primary runs**, plus a 2-scenario
directional-symmetry probe (O as focal) under both arms. **36/36 valid, 0
invalid.** Treatment isolation mechanically verified (control plane differs
only in `federation/dsh/instructions.*`; only the `pal-fed:peer-collaboration`
prompt section differs, tools identical). Run order randomized (seed 20260911),
manifest frozen before runs.

## Primary table (autonomous initiation)

| Dependency | Criterion | n | contact | rate | Wilson 95% CI |
| --- | --- | ---: | ---: | ---: | --- |
| D1 | C0 | 6 | 6 | 100% | 100% [61%, 100%] |
| D1 | C1 | 6 | 6 | 100% | 100% [61%, 100%] |
| D0 | C0 | 6 | 3 | 50% | 50% [19%, 81%] |
| D0 | C1 | 6 | 4 | 67% | 67% [30%, 90%] |
| DA | C0 | 4 | 4 | 100% | 100% [51%, 100%] |
| DA | C1 | 4 | 3 | 75% | 75% [30%, 95%] |
| D1-symmetry (O→P) | C0 | 1 | 1 | 100% | 100% [21%, 100%] |
| D1-symmetry (O→P) | C1 | 1 | 1 | 100% | 100% [21%, 100%] |
| D0-symmetry (O-local) | C0 | 1 | 0 | 0% | 0% [0%, 79%] |
| D0-symmetry (O-local) | C1 | 1 | 1 | 100% | 100% [21%, 100%] |

**D1 contrast Δ = 0.00** (C1 100% vs C0 100%); exploratory Fisher exact
**p = 1.0000**. DA is reported separately and never pooled.

## Secondary metrics

| Metric | n | value |
| --- | ---: | --- |
| autonomous receipt (contacted) | 29 | 100% |
| autonomous response (contacted) | 29 | 93% |
| reply delivery (contacted) | 29 | 90% |
| ack rate (contacted) | 29 | 24% |
| pending after idle (contacted) | 29 | 72% |
| contract touched (contacted) | 29 | 59% (17/29) |
| contract bilaterally agreed | 29 | 0% (0/29); max accepts in any run = 1 |
| event count mean / median / max | 36 | 1.56 / 2 / 3 |
| event kinds used | 36 | decision 34, proposal 11, question 5, need 4, blocker 2; **constraint / change_ready / evidence = 0** |
| `collab_thread` usage (contacted) | 29 | 86% |
| event bodies > 2000 chars | 36 | 21 runs (max 3670 chars) |
| status-chatter / pure-ack events | 36 | 0 / 0 |

Latency (from durable DSH session-log timestamps): change→wake median **977 ms**
(n=29, 48–1963), wake→inbox-read median **1104 ms** (760–3220), change→response
median **28.3 s** (8.7–89.3 s) — model latency dominates, not the 2 s poll.

## Scenario-level (C0 / C1 contact vectors)

| Scenario | Class | Focal | C0 | C1 |
| --- | --- | --- | --- | --- |
| D0-canvas-policy | D0 | palimpsest.main | 1,1 | 1,1 |
| D0-cli-flag | D0 | palimpsest.main | 0,0 | 1,1 |
| D0-test-layout | D0 | palimpsest.main | 1,0 | 0,0 |
| D1-cursor-stability | D1 | palimpsest.main | 1,1 | 1,1 |
| D1-error-taxonomy | D1 | palimpsest.main | 1,1 | 1,1 |
| D1-peer-wake | D1 | palimpsest.main | 1,1 | 1,1 |
| DA-indirect-shape | DA | palimpsest.main | 1,1 | 1,1 |
| DA-public-evidence | DA | palimpsest.main | 1,1 | 1,0 |
| S-O-dependency | D1-symmetry | ordarium.main | 1 | 1 |
| S-O-local | D0-symmetry | ordarium.main | 0 | 1 |

The effect is **scenario-dependent, not criterion-dependent**: D1 contact is
saturated in both arms across all three distinct D1 scenarios, while D0 contact
varies by scenario and arm with no consistent direction.

## Hypothesis outcomes

- **H1 (dependency sensitivity) — NOT supported.** With clear dependencies,
  contact was 6/6 in C0 and 6/6 in C1. The criterion added nothing measurable;
  clear dependency already produced contact without it.
- **H2 (selectivity) — FAILED.** For clearly local decisions, contact was 3/6
  (C0) and 4/6 (C1): the criterion did **not** suppress unnecessary contact.
  Observed unnecessary contacts are explicit: for the local CLI-naming decision
  the agent wrote *"Boundary check before I record anything… That CLI is mine,
  so the naming itself is my call"* and posted anyway.
- **H3 (boundary discipline) — PARTIALLY supported.** Messages stayed
  boundary-sized (mean 1.56 events/run, no status chatter, no plan dumps), but
  21/36 runs contained an event over 2000 chars (max ~3.7 KB): moderate
  verbosity rather than terse deltas.
- **H4 (delivery behavior) — ack discipline is poor.** Receipt 100% and
  redelivery protection held (no loss observed), but only **24%** of contacted
  runs acknowledged, and **72%** left a pending batch after idle. Handling and
  acking are decoupled in practice.
- **H5 (contract naturalness) — used but unfinished.** Contracts were
  spontaneously touched in 59% of contacted runs, yet **never** reached
  `agreed` (max one acceptance). The acceptance ceremony appears heavier than
  the need it served.

## Correction to PAL-FED-0D

PAL-FED-0D inferred from one open-prompt run (attempt 1: no contact) versus one
criterion run (attempt 3: contact) that the criterion enabled initiation. 0E
does not support that inference: with a decision-style open prompt and **no**
criterion, D1/C0 contacted in 6/6 runs. The 0D difference is better explained by
prompt wording and uncontrolled sampling variation, exactly the confound §1
warned about. The 0D claim should be read as "initiation was observed under the
criterion", not "the criterion caused initiation".

## Confounds and limitations (must qualify every claim)

1. **Ambient-guidance confound.** C0 removes only the §41 criterion; every arm
   still carries the checkpoint list and the full peer-collaboration section.
   C0 is therefore *not* "collaboration absent", and much of the D0 over-contact
   may come from that framing rather than from the criterion.
2. **Prompt cue.** Every prompt ends "…and record your conclusion", which may
   itself cue a durable `collab_post`. This is a scenario-construction defect
   (reported post-hoc per §34; the frozen manifest was not rewritten). D0
   over-contact rates should be read with this in mind.
3. **No repository tools.** The minimal DSH host exposes only the collaboration
   tools, so focal agents decide from the prompt alone; they cannot inspect the
   owned interface they are asked to reason about.
4. **Small n.** 2 replicates per cell (Wilson intervals are wide); one model
   (`deepseek-official/deepseek-flash`), stochastic and without an honored seed;
   one DSH version; one host topology.
5. **Symmetry probe n=1 per cell** — directional evidence only, not a rate.

## §61 Promotion levels (evidence-based)

- **Level A — strongly observed behavioral principle: NOT established.**
  "Contact follows owned-boundary dependency" is contradicted by substantial D0
  over-contact in both arms.
- **Level B — mechanically useful patterns (retain).** Pending-batch + ack
  prevented loss (receipt 100%, redelivery worked); DSH-native wake delivered
  reliably (change→wake ≈1 s, wake→inbox ≈1.1 s); agent-scoped peer authority
  holds (FED-DSH-A01).
- **Level C — promising but insufficiently evidenced.** `BoundaryContract`
  schema (touched 59%, agreed 0%), the event-kind taxonomy (only 5 of 8 kinds
  ever used; `decision` dominates), and `Thread` (used in 86% of contacted runs,
  but only as a read view — clean, not load-bearing yet).
- **Level D — rejected/unnecessary: none confirmed.** The ack gap is a missing
  discipline, not a concept to delete.

## §60 Main architectural question

> Does observed collaboration support
> `RuntimeDependency → PeerContact → CollaborationRelation` rather than
> `PredefinedAgentGraph → RequiredCommunicationEdge`?

**Partially, but not as a selective rule.** The evidence supports the *formable*
half: two persistent peers did form and use a collaboration relation at runtime
with no central planner, no predefined edge, and no human bus (receipt 100%,
response 93%, delivery 90%). It does **not** support the *selective* half:
contact was not gated by real dependency (D0 50–67% over-contact; D1 saturated
without the criterion). So edges can emerge from runtime need — but under the
tested conditions they also emerge without need, so dependency is not yet a
discriminating cause.

## §75 Verdict

**Verdict 3 — revise/reject the current contact criterion** (retain the
mechanical federation unchanged). The criterion produced no D1 initiation gain
(saturated) and no D0 selectivity gain, while unnecessary contact remained
substantial. This is a successful negative result. The confounds above mean the
criterion is not yet *fairly* rejected — a follow-up would need to (a) remove
the ambient collaboration framing from C0, (b) drop the "record" cue from local
scenarios, and (c) give agents read access to the owned interface.

## Consequences for the ack and polling gates (§66/§68)

- **Ack (§66):** handled-but-unacked is **frequent** (ack 24%, pending-after-idle
  72%). Recorded candidate mitigation: a **DSH turn-stopping pending-batch
  guard** that reminds/steers the agent to ack if handled or deliberately leave
  pending. **Not implemented** in 0E.
- **Polling (§68):** **adequate**. 2 s polling contributed ~1 s wake latency and
  ~1.1 s wake→read; end-to-end latency was model-dominated (~28 s). Do not
  request a new Ordarium primitive on this evidence.
