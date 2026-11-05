# ALHS-C diagnostic L/G — offline session analysis

Source: `offline-session-analysis.json`, replayed from the real diagnostic session streams. No model
call.

## After the first 7/7 package

| Session | Tokens | Calls after | Composition |
|---|---:|---:|---|
| L-1 | 470,926 | 6 | 4 edit_package, 2 read_package |
| L-2 | 1,287,008 | 59 | 30 edit_package, 6 read_package, 4 verify, 4 search, 8 read_other, 2 shell, 1 pulse, 1 work, 2 conclude |
| G-1 | 402,516 | 0 | the worker had not produced a valid package before the kill |
| G-2 | 525,665 | 9 | 4 verify, 1 search, 2 work (complete + results), 1 pulse, 1 conclude |

## Reading

- **L** kept polishing after the package was already valid: 30 further edits, 6 re-reads, 4 verify
  commands. It concluded with `DELIVER` after a second `conclude` attempt; the final state is
  DELIVERED. This is closer to the F pattern than to A’s bounded convergence.
- **G-2** wrote the package in the recovered attempt world, committed it, and then spent only 9 calls:
  four verifications, `complete`, `results`, a pulse and `conclude WAIT_FOR_OPERATOR`. It made no
  post-valid edits. The governed path’s stopping state worked; the work itself was done by the
  continuation principal, not the killed worker.
- The L/G token difference is not a matched comparison: L produced a 39 KB package with 30 edits;
  G produced a 21 KB candidate with no post-valid edits and stopped for operator acceptance.

## Limits

- One pair per condition.
- G’s candidate was written by the principal in the attempt world; the worker was killed before it
  committed.
- The classifier is mechanical; it does not judge whether each edit was valuable.
