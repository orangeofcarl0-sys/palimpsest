# R2-V — UTILITY-CALIBRATED CAPITAL VALUE

Stage: R2-V
Branch: `r2-v-utility-calibration`
Baseline: `bcfae7efcb217b300623706216a637a124b97a64`
Verdict: recorded in `research-evidence/r2-v/analysis.json` (see §6 of this document)

---

# 1. What this stage asked

R2-S established **routing**, not **utility**. It showed that item-level decision metadata changes WHICH
capital a worker retrieves, measured against the experiment's **predeclared provenance labels**
(`TARGET` = same task lineage, `DISTRACTOR` = an independent bundle). It did not show that the skipped
`DISTRACTOR` items have zero or negative task utility.

R2-V asks the calibration question:

```text
Does the TARGET / DISTRACTOR labelling correspond to ACTUAL MARGINAL TASK UTILITY?
```

The distinction this stage must keep is:

```text
PROVENANCE RELEVANCE  = the capital came from the same task lineage
EMPIRICAL UTILITY     = consuming the capital changes measurable task behaviour
```

The first does not imply the second, and R2-V tests rather than assumes the implication.

---

# 2. Scenario D is the primary scenario

Scenario C is **saturated** (15/15 solved in both R2-S arms), so it cannot discriminate. D carries the
useful ambiguity. Its identity is **byte-frozen** and not tuned: the same task, repo, visible tests, hidden
oracle, known-failure detector and target D capital as R2-S.

---

# 3. The four arms

Voluntary retrieval is removed from the causal question (§8). Every arm runs under the R2-E
**HOST_MEDIATED_PREWORK** seam: the host invokes the same attempt-bound resolver on the selected handles
before the first engineering turn and renders the bodies into the labelled section. There is no optional
choice to make.

```text
V0   D target bundle only
V1   D + B          (config-migration bundle)
V2   D + C          (event-log replay bundle)
V3   D + B + C      (both non-target bundles)
```

Every arm includes D, so the comparison isolates the **marginal** value of what is added. §9 keeps the arms
at the **bundle** level; splitting Proof / Reasoning / Procedure is deferred to a later stage, permitted
only if a bundle shows a stable marginal effect.

All bundles are existing mature capital from recorded explorations. §7 forbids any new hand-authored capital
or synthetic "bad distractor".

---

# 4. Design and measurement

```text
4 arms × 5 stochastic repetitions = 20 Scenario-D trials
randomized blocks containing ALL FOUR arms, order derived from seed 0x52560301
no adaptive stopping; no behavioural pilot on D (dummy-fixture plumbing proof only)
```

Across all four arms the task, repo, visible tests, hidden oracle, model/profile, runtime, tool surface,
authority and write scope are **identical**; only the consumed bundle set differs. Body digests are recorded
per arm.

Primary outcomes are first-candidate hidden acceptance, final hidden acceptance and known-failure
recurrence. Model self-report is **never** utility ground truth.

§14 forbids fake p-values at n = 5: the marginal comparisons report **raw counts and direction only**:

```text
B marginal value:   V1 vs V0
C marginal value:   V2 vs V0
B+C combined:       V3 vs V0
```

§15 classifies each bundle descriptively — `POSITIVE_SIGNAL`, `NO_CLEAR_SIGNAL`, `ADVERSE_SIGNAL` — with the
tested scope stated. These are signals about this scope, not universal classifications and not a binary
useful/useless.

---

# 5. Consumption proof

Every analysed trial must prove, before the first engineering turn, that all intended handles resolved, all
intended bodies were delivered, and no unintended body was delivered. The proof combines the governed-pull
telemetry (handle identities and body **digests**, never bodies) with the durable session artifact. A
treatment-not-applied run is invalid and is excluded from the analysis while remaining in the raw evidence.

---

# 6. Result and calibration

See `research-evidence/r2-v/analysis.json` for the per-arm outcomes, the three marginal comparisons and the
R2-S calibration.

§16 compares the two axes:

```text
Did S1 skip bundles with positive utility signal?
Did it retrieve bundles with no clear utility signal?
Does metadata routing correlate with actual measured utility?
```

§17: R2-S's `TARGET`/`DISTRACTOR` labels are **provenance** labels, predeclared and never rewritten. R2-V
adds **empirical utility** as a new axis; it does not relabel.

---

# 7. The host-prefetch cost caveat (§18)

R2-S's metadata preview required host-side body materialization for **all** candidate items. R2-S therefore
did **not** establish owner-side retrieval-cost savings, and R2-V does not solve that problem. No
end-to-end cost benefit is claimed by this stage.

---

# 8. Append-only records made before the experiment (§2–§3)

`research-evidence/r2-v/R2S-INTERPRETATION-RECORD.md` and `r2s-interpretation.json` append, without amending
`bcfae7e`:

- the R2-S clarification that its proven claim is selectivity against **provenance** labels, and that it did
  **not** prove skipped distractors have zero or negative utility;
- the wording correction that `D S0 3/5 vs S1 0/5` is a **randomized-arm** secondary difference, too small
  and too secondary to support a harm claim;
- the accounting correction for the **aborted pre-primary run**, where pull events rather than distinct
  handles were counted (allowing Target Recall > 1), the run was discarded, the counter was corrected, and
  the whole primary matrix was restarted.

---

# 9. What this stage did NOT do

```text
No cross-model replication.
No productization of the M1 metadata.
No change to the R2-S renderer, preview budget or metadata.
No kind-splitting (§9 defers it).
No canonical Context change. No new owner. No architecture:write.
No tuning of Scenario D.
```
