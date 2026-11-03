# R1-R — STOCHASTIC COMPOUNDING REPLICATION: RESULTS

> **Verdict: `R1 STOCHASTIC WORKER COMPOUNDING: NO_REPLICATION`.**
> Branch `r1-r-stochastic-replication`, base `dc5679d` (R1-L). The parent R1 protocol is unmodified;
> [`R1-PROTOCOL-AMENDMENT-A1.md`](./R1-PROTOCOL-AMENDMENT-A1.md) authorises the matrix.
> The build and run method is in [`R1-R-STOCHASTIC-REPLICATION-MATRIX.md`](./R1-R-STOCHASTIC-REPLICATION-MATRIX.md).
> The numbers live in `research-evidence/r1-r/analysis.json`; this document interprets them.

---

## 1. What was run

30 primary stochastic trials: 2 scenarios × 3 conditions × 5 repetitions, in the parent protocol's
frozen randomized blocks, one process per trial, real DSH worker (`deepseek-flash`), no adaptive
retries. Calibration ran separately beforehand and is not counted here.

`30/30 accounted for`, `0` confounded blocks, `0` excluded trials, `0` host failures, `0` timeouts,
`0` manual interventions.

## 2. The headline result

```
                       C0            C1            C2
B  final solved       4/5           2/5           1/5
B  known-failure      0/5           0/5           0/5
C  final solved       0/5           0/5           1/5
C  known-failure      4/5           5/5           4/5
```

Neither scenario shows directional capital benefit. On Scenario B the ordering runs the WRONG way
(C0 > C1 > C2). On Scenario C, C2's one solved trial is not accompanied by less recurrence, and C2
recurred the pre-paid mistake 4/5 times — the same as C0.

`0/30` trials pulled any capital body, in any condition, including C2 where all three handles were
visible. So the mechanism is not in doubt: **the capital was offered and not taken.**

## 3. Why this is a valid negative result, not a broken experiment

The parent protocol says a negative result is a valid R1 result, and R1-L's whole purpose was to make
that true — before R1-L, a negative result would have been uninterpretable, because the conditions were
byte-identical to the worker and the "no effect" would have been an artifact of the harness. R1-L closed
that, and this stage's own GATE A re-verified it.

Four independent checks establish that the comparison was validly formed:

1. **The treatment was applied.** The model-visible index carried 0 / 2 / 3 handles in C0 / C1 / C2,
   exactly as designed, and the pull tool was delivered in every condition including C0. The ordinary
   task text and the worker capability set were identical across conditions within every block.
2. **The capital was reachable.** `gate:r1-l-live` proved accessibility by unguessable nonce, and this
   stage's C2 prompt shows all three handles rendered with the pull instruction.
3. **The tasks were not trivially solved.** C0 solved 4/5 on B and 0/5 on C, so there was headroom for
   an improvement to show up.
4. **No worker was blocked.** Every trial reached `FINISHED` with a `READY_FOR_SETTLEMENT` report, no
   host failure, no timeout, no escalation, and no worker edited the oracle (30/30 unmodified).

## 4. The finding, stated precisely

**A capable stochastic worker given a visible, pullable, task-relevant index of governed capital does
not pull it, and does not need it to reach its own answer.**

This is the `KNOWLEDGE_NOT_USED` outcome the protocol anticipated, and it is stronger than "capital did
not help": the workers did not even look. On Scenario B the workers wrote their own ordering method from
the stated goal and the visible oracle, and their independent solutions happened to be *better* than the
C1/C2 groups' — a difference with no mechanism behind it, which is why it must not be read as
"capital hurt".

## 5. Counter-evidence and honest limits

**The result is one model, one host, one configuration.** `deepseek-flash` on DSH `0.1.7-rc.2`, 5
repetitions per cell. The parent protocol forbids ranking models and this stage studied exactly one, so
nothing here says another model would behave the same way. A model that pulls when a body would help is
not excluded by this evidence.

**Scenario B was sensitivity-limited from the start.** Calibration already measured C0 avoiding the
pre-paid mistake in 3/3 runs, so B's recurrence column was expected to be near-zero for every condition
— and it was (0/5 everywhere). B's contribution is therefore weak evidence in both directions, as the
matrix document says. It is reported because omitting it would be selective.

**The 5-repetition cells are small.** A single trial moves a cell by 20%. The counts are reported raw
and no p-values are used, per the protocol.

**"Did not pull" is not "could not pull".** The index was visible and the tool was registered in all 30
trials; the workers chose other means. The experiment measures behaviour, not capability, and the
capability was established separately by R1-L's nonce gate.

**One measurement defect was found and corrected after the matrix, and it did not change the verdict.**
`oracleFileUnmodified` was recorded as `false` for all 30 trials because the harness's `git` helper trims
its output and dropped the oracle's trailing newline. Recomputing it against the raw bytes shows 30/30
unmodified. The fix is in `trial.mjs`, the corrected values are in the trial records with a note, and
the verdict is unaffected — but a reader should know the field was wrong when first written.

**A second defect was found by the §32 regression run, and it is the more interesting one.** The
TypeScript build needs a `.d.mts` declaration beside each acceptance module so the tests can import the
`.mjs` under `noImplicitAny`. That declaration names `migrateConfigReference` /
`applyEventStreamReference`, and the world-building copy was not excluding it — so the reference
implementation's IDENTITY was being copied into the worker's world. The accessibility check caught it
because that check is by CONTENT, not by filename: it failed with
`§5 VIOLATION: the hidden acceptance is reachable from the world at acceptance.d.mts:migrateConfigReference`.

The leak was introduced *after* the matrix ran (it came from the declaration files added while fixing the
build), so it did not affect these trials — the 30 worlds were built before the declarations existed.
It is recorded because it is exactly the class of leak §5 exists to prevent, and because the check
finding it without being told is the evidence that the check is real. A regression test now pins the
exclusion.

**No private chain-of-thought was captured**, no credentials or tokens were recorded, token counts are
recorded as UNKNOWN because the DSH seam does not expose them, and pulled bodies never entered general
telemetry.

**A third finding, from the §32 gate re-run, bounds what R1-L's nonce gate can claim.** Re-running
`gate:r1-l-live` produced a C0 worker that reported all three protected markers having pulled NOTHING
and been offered NO handles. The mechanism is that the host sandbox confines **writes**, not reads: the
worker traversed out of its execution world (`..\..\..\..\state`) and read the proof blob directly.

Two consequences, both recorded rather than smoothed over:

1. **R1-L's C0 assertion was overclaiming.** "C0: protected values NOT obtainable" is not a property
   that gate can establish. It is now split into what the gate actually controls — C0 was offered no
   handles and pulled nothing — plus an explicit `obtained WITHOUT pulling (out-of-band read)`
   observation. The C1/C2 accessibility proof is unaffected: those conditions pulled their handles,
   which is the evidence R1-L was built on.
2. **R1-R's matrix is not contaminated by it.** A worker could only have benefited from an out-of-band
   read by using the capital's text, and a scan of all 30 final sources, first sources, transcripts and
   reports for the capital's distinctive phrasing returns **0 hits**. The hidden acceptance the trials
   are judged by is in the repository, not in the durable store, so reading the store would not have
   helped a worker pass it in any case. The NO_REPLICATION verdict is unaffected.

The escape path existed during the R1-R trials too, so this is a real property of the rig, not an
artifact of the re-run. It is a **host-sandbox limitation, not a product defect**: R1-L changed how
selected capital reaches a worker, and made no claim about confining a worker's reads of the host
filesystem.

## 6. What this licenses, and what it does not

It does **not** license removing the context-pull capability, weakening the index, or concluding that
governed capital is worthless. The capability works and was proven by accessibility; what this stage
measured is that a worker with a solved-looking task did not reach for it.

The natural next question is therefore not "does compounding work" but **"under what task conditions
does a worker reach for inherited capital at all"** — for example when the visible oracle does not name
its own failure classes, or when the hidden contract is not inferable from the stated goal. That is a
different experiment, and this stage does not run it.

Relevance selection remains deferred (`SCALING_FRICTION`, not `SEMANTIC_BLOCKER`) and no selection
automation was implemented.

## 7. Regressions

Run after the verdict was computed, on the frozen branch:

| check | result |
|---|---|
| `pnpm build` | PASS — 0 errors |
| `pnpm exec vitest run` | PASS — **3018 tests / 253 files**, 0 errors |
| `pnpm test:e2e` | PASS — 38 |
| `pnpm architecture:check` | PASS — 0 violations (9 accepted baseline exceptions) |
| `pnpm architecture:check-public-api` | PASS — missing 0 / changed kind 0 / added 0 |
| `gate:e1-k-live` … `gate:e-live`, `gate:r1-l-live` | PASS (7 gates) |
| `gate:d2-live`, `gate:d4-live`, `gate:d5-live` | PASS (3 gates) |

**Production semantic diff: ZERO.** No `src/` or `host/` file changed in this stage. Architecture
identity (`capturedFrom` / `capturedTree`) is unchanged and `architecture:write` was never run.

One unit test timed out in an early full-suite run (`test/lean_work_delegation_transport.test.ts`,
§D2-d "repeated followup changes nothing at all"). That file has no diff against `dc5679d`, passes in
isolation (10/10), and passed in the subsequent full run (3018/3018) — a load-induced timeout under
parallel execution, not a regression. It is recorded rather than quietly re-run.

`gate:r1-l-live` initially FAILED, and the failure was informative rather than incidental: its C0
assertion claimed an impossibility the gate cannot establish. That is finding three above; the gate was
corrected and re-run to PASS.

---

## 8. CORRECTION (appended by R1-S; the text above is NOT rewritten)

**§5's counter-evidence said R1-R's C0 exclusion "is not contaminated". R1-S measured that this was
right about the OUTCOME and wrong about the MECHANISM, and the difference matters.**

The correct statement is:

```
0 primary trials showed OBSERVED out-of-band capital access,
but C0 exclusion was NOT mechanically enforced.
```

Use:

```
0 OBSERVED CONTAMINATION
```

not:

```
structurally impossible contamination
```

**What was measured, and why the original sentence overstated.** The scan reported in §5 is still valid —
0 hits across all 30 trials' sources, transcripts and reports. But "not contaminated because no worker
used it" is a statement about observed behaviour, whereas §5's phrasing invited the reading that a worker
*could not* have used it. R1-S measured that it could: a worker with no handles and no pulls can read the
capital body straight out of the durable store, because the host sandbox confines writes and not reads.

**What this does and does not change for R1-R's result.**

- The **verdict is unaffected**: NO_REPLICATION stands, because the mechanism is `KNOWLEDGE_NOT_USED` —
  no worker pulled any capital, and 0/30 trials show the capital's text anywhere in their output.
- The **confidence interval around "C0 was clean" is wider than §5 implied**: C0 was clean in fact
  (observed), not clean by construction (enforced). A single C0 trial that had chosen to read the store
  would have been contaminated without any harness signal distinguishing it, because the read is a normal
  `readFileSync` from the worker's point of view.

**What would be needed to make the original wording true.** An enforceable read boundary for worker
execution. R1-S audited the installed host for one and found none usable:
[`R1-S-WORKER-CONFIDENTIALITY-AUDIT.md`](./R1-S-WORKER-CONFIDENTIALITY-AUDIT.md) records
`R1-S: BLOCKED AT HOST CAPABILITY`, with the probes behind that conclusion.

No measurement in §1–§4 and §6–§7 above is withdrawn: the counts, the pull telemetry, and the
`KNOWLEDGE_NOT_USED` mechanism all stand as recorded.
