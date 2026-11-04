# ALHS-C core — offline session analysis

Source: `offline-session-analysis.json`, replayed from the real session streams. It makes no model
call and does not re-score the packages.

## What happened after the first 7/7 package

| Session | Tokens | After first 7/7 | Calls after | Composition of later calls |
|---|---:|---:|---:|---|
| F-2 | 2,899,572 | 2,825,465 | 84 | 27 edit_package, 12 read_package, 13 verify, 11 state_query, 7 read_other, 5 search, 5 shell, 3 coordination |
| A-1 | 1,292,562 | 1,010,376 | 29 | 22 edit_package, 2 search, 2 read_other, 1 read_package, 1 shell, 1 coordination |
| A-2 | 251,007 | 251,007 | 19 | 7 read_other, 3 search, 2 read_package, 2 edit_package, 1 verify, 1 pulse, 1 conclude |

F-1 had no valid package before its scenario kill; A-2 is the continuation session.

## Reading

- **F** kept returning to the same package: 27 further edits, 12 re-reads of `package.md`, 13
  verification commands and 11 `list_agents`/job state queries. The later work is not pure noise —
  it includes verification — but the loop has no stopping state; the guard stops it.
- **A-1** was still editing at the kill: 22 package edits after the first valid version. It had not
  converged when the host died.
- **A-2** did a bounded verification pass — two package reads, three searches, one verify command —
  then made two edits and called `conclude DELIVER`. It did not repeat the whole edit loop. This is
  the first real-model observation in the programme of a *checked* convergence, not a blind stop.

The 7-fact rubric saturated in both conditions, so this table is about **where the tokens went after
sufficiency**, not about package quality.

## Limits

- One pair per condition; the A-2 behavior cannot be generalised.
- The fixed 240s kill gave A-1 far more first-window work than F-1 (1.29M vs 166k); the later token
  totals are not a matched-work comparison.
- The classifier is mechanical (tool name + path/command heuristics), not a judgement that each edit
  was valuable or wasted.
- Both packages were left untracked; the new episode provenance facts (tracked/committed warnings)
  now report that, but this run predates them.
