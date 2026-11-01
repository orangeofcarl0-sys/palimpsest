# COG-4.3 — Comparative Results

**Comparison:** P (same native DSH cognition + Palimpsest project continuity) versus F (same native DSH
cognition + Git/Markdown project history).

**Result:** **the P condition is complete; the matched F condition is BLOCKED by the provider's
`QUOTA: Insufficient Balance` before its first model turn. No comparative value is established.** The
single P note scores 16/16, but one run against no valid baseline does not establish H4-V.

---

## 1. What ran

| condition | agent | continuity | sessions | tokens | wall clock | note |
| --- | --- | --- | --- | --- | --- | --- |
| **P** | shipped Palimpsest host, **new** DSH home/Session | ProjectIR + journal + Work ledger + evidence + promotion + ordinary files | 1 | 1,277,909 | 210 s | **9,819 B**, 16/16 |
| **F (clean)** | same DSH cognition, **new** DSH home/Session | `HANDOFF.md` + Git history + deliverables | 1 attempted | **0** | 7.7 s | **none — BLOCKED** |
| F (contaminated diagnostic) | same as F, but the first clone contained the P note | contaminated | 1 | 587,430 | 76 s | identical to P; **INVALID**, excluded |

The clean F session reached the provider and was refused:

```text
dsh: QUOTA: Insufficient Balance (request_id: 9d18c396-e78f-4228-bec3-4be035c93940)
```

No model turn, no assistant message, no note. The condition is **BLOCKED**, not a negative result. The
provider failure is external to the campaign budget: the campaign used 3 sessions / 1,865,339 reported
tokens against 12 sessions / 12M / 8M, and the blocked session used 0 tokens.

The first F run is preserved as a labelled diagnostic only. Its F world was cloned from the live P
repository after the P Agent committed its note, so its note is a copy/echo of the P note. It is not
independent evidence and is not scored.

---

## 2. The comparison was matched in design, not in execution

Both conditions were prepared with:

- the same project objective, source facts, prior conclusions and update sequence;
- a new DSH home and a new Session (no `--resume`, no previous transcript);
- the same model family and runtime;
- the same task prompt and `continuation-note.md` shape;
- native DSH collaboration enabled;
- the same 8-minute wall-clock and 8M/12M token controls.

F received the native continuity mechanism: a Git clone of the same repository up to the mechanism head,
`.palimpsest/` removed, plus `HANDOFF.md` and the original technical-fit file. P received the durable
ProjectIR/journal/Work state and ordinary files, with no `HANDOFF.md`. This is the intended comparison of
native mechanisms, not an attempt to equalize every artifact.

The execution did **not** match because F never produced a model turn. The P result is a single-run
observation, not a comparative measurement.

---

## 3. Primary outcome metrics

Only P has measured values. They are reported separately and not collapsed into a score.

| metric | P | F |
| --- | --- | --- |
| unsafe acceptance | **0** — refuses the invalid Site B selection | not measured |
| safe reuse | **1** — cost result preserved with a dependency caveat | not measured |
| unnecessary rework | **0** — does not discard the cost result | not measured |
| fresh-Agent recovery | accepted result, unpromoted result + content, journal, both updates, open question, head divergence | not measured |
| final decision quality | 16/16 on the pre-registered rubric; dependency-ordered actions | not measured |
| human coordination | one process stop; no explanation/restart/correction needed | not measured |
| resource cost | 1.28M reported tokens; 210 s; 1 Session; 35 tool calls; 9.8 KB note | 0 tokens; no note |

The P note's quality is real but not comparative. It is one run, one evaluator, one model family; the
condition labels were not fully blinded because the note names Palimpsest identities.

---

## 4. What the P result does and does not establish

**Established for this run:**

- a completely fresh Session inherited the durable project state without the previous conversation;
- it discovered an accepted result, an unpromoted result and its execution world, the journal, and two
  external updates;
- it correctly refused a result invalidated by a changed source fact;
- it preserved an unaffected result without unnecessary rework;
- it ignored an irrelevant control;
- it distinguished a proposal from an authority it does not hold;
- it produced a dependency-ordered next action that avoids an unsafe order.

**Not established:**

- any advantage over F, because F is blocked;
- statistical superiority or repeatability;
- that the product's own continuation assessment was used — it was not model-facing; the Agent reasoned
  from the Work state, the journal and ordinary files;
- that a governed rework executed on the current basis — it was reopened but refused at
  `HEAD_BASIS_MISMATCH`;
- that a structured Project Intent revision was proposed or accepted — no model tool, no normal-host
  admission authority, no `PROJECT_REVISED`;
- that the result generalizes beyond one fictional scenario, one model family and one evaluator.

---

## 5. Cost and coordination

P's 1.28M tokens are almost entirely cache-read (1.219M); the non-cached input/output is 58,837 tokens.
The wall clock is 3.5 minutes. The single Session stayed well inside the 8-minute bound and the 8M launch
stop. The note is 9.8 KB and commit `0076fc5`.

The P Agent needed one process stop after it completed its turn; it did not need a restart, a correction,
or a manual explanation. That is a positive coordination observation, but it is one run.

The contaminated F diagnostic cost 0.59M tokens and is excluded. The clean F attempt cost 0 because the
provider refused before any model turn.

---

## 6. C4-G5 verdict

**C4-G5 — Matched comparison: BLOCKED.**

The design was pre-registered and the environments were prepared, but the F condition has no valid model
run. The provider quota is an external limitation, not a Palimpsest result and not a reason to fabricate a
baseline. No superiority, equivalence or cost-ratio claim is made. The P note is preserved as a single-run
observation and the F condition is reported as blocked, with the exact provider error and the preserved
zero-token session.

**H4-V — Incremental product value: NOT ESTABLISHED.** The comparative evidence does not exist. The
deterministic mechanism evidence supports a *missing seam* finding, not a value finding.
