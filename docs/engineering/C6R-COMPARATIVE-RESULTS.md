# C6-R — Comparative Results

**Question:** does Palimpsest provide meaningful incremental project-level value over a competent
native DSH + Git/Markdown workflow on matched phases?

**Answer: NOT EXERCISED — BLOCKED.** The P and F worlds are matched with zero confounders, but no
model ran in either condition. There is no matched pair, no decision-quality comparison, no
coordination-cost measurement and no superiority or efficiency claim.

**Gate R7: BLOCKED.**
**Hypothesis H6-V: NOT EXERCISED.**

---

## 1. What is genuinely matched

The mechanical equivalence audit (`research-evidence/c6r/f1-host/equivalence.json`) compares eight
dimensions and reports 8/8 identical, 0 confounders:

| dimension | P | F | same |
| --- | --- | --- | --- |
| goal | ProjectIR goal | `HANDOFF.md` goal | yes |
| requirements | five binding requirements | the same five | yes |
| historical deliverables | two accepted files, digests `98fc7f27…` / `4ffe9bd7…` | byte-identical copies | yes |
| READY work | `technical-refresh`, its objective and write path | the same in the handoff | yes |
| journal facts | negative result, open question, dismissed opportunity | the same three sections | yes |
| inbox visible set | T1 digest `021b639d…` | T1 digest `021b639d…` | yes |
| source tree | same tree-digest function | same | yes |
| observation time | T1 | T1 | yes |

The representation differs — ProjectIR/Work/Journal versus Git/Markdown — and that is the treatment,
not a fact difference. Neither condition received the expected conclusion, the Site B invalidation,
Candidate B, the duplicate or the evaluator rubric.

## 2. The frozen comparison design that remains

- P1/F1: T1 discovery and proposal; P3/F2: T2 fresh continuation in new sessions and separate homes.
- Same model family, same prompts (observation time supplied), same budget, same approval policy,
  subagents and workflow disabled on both sides — a **Matched Single-Principal DSH Baseline**.
- Metrics recorded separately: discovery, false positives, proposal specificity, manual corrections,
  authority mistakes, premature acceptance, stale/duplicate handling, negative-result preservation,
  business-goal correctness, time to useful action, canonical transitions, redundant work, tokens,
  wall clock, tool calls, failures.
- No composite score. One matched pair cannot establish statistical superiority.

## 3. The blocker

No model turn reached either condition. The single provider probe was reset at the upstream TLS layer
before any response; see `C6R-MATCHED-DISCOVERY-RESULTS.md`. The comparative metric table is
therefore empty by construction, not by an unfavourable result.

## 4. The smallest decisive next test

1. Make the provider reachable from the isolated runtime (owner/environment action), preserving the
   same route `deepseek-official` / `deepseek-flash` and the same budget.
2. Under a **new Code Freeze** that fixes the probe's WSL identity read, run the single frozen
   availability probe again. If it is still blocked, stop and report.
3. If available, run **one** P1 discovery session against the frozen T1 world and score H6-D/H6-P/
   H6-A. If P1 does not discover or propose, preserve the failure and stop.
4. Only then run F1, then P3/F2 for the fresh-continuity and comparative questions.

No F arm should be manufactured from an invalid P run, and no P arm from an invalid F run.
