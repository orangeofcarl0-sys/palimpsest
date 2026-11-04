# ALHS-C repeat-core — offline session analysis

Source: `offline-session-analysis.json`, replayed from the real repeat session streams. No model call.

## After the first 7/7 package

| Session | Tokens | Calls after | Composition |
|---|---:|---:|---|
| F-2b | 2,370,233 | 106 | 51 edit_package, 6 read_package, 8 verify, 12 state_query, 8 search, 15 read_other, 4 shell, 2 coordination |
| A-2b | 596,311 | 33 | 3 read_package, 7 verify, 3 edit_package, 5 shell, 3 search, 7 read_other, 1 pulse, 1 conclude |

F-1b had already produced a valid package before the token-milestone kill; its 9 post-valid calls
were all package edits. A-1b had 12 post-valid calls (2 package reads, 1 verify, 6 other reads, 2
searches, 1 coordination) before the kill.

## Reading

- **A-2b** ran a verification-heavy pass (7 verify commands, 3 package reads, 3 searches) with only
  3 edits, then recorded `DELIVER`. It also committed the package (`f38f084`), and the product’s new
  provenance check recorded `tracked=true, committed=true`.
- **F-2b** made 51 further package edits, 6 re-reads and 12 `list_agents`/job state queries; the guard
  stopped it at the soft ceiling. There is no stopping state in the F path.
- The pattern matches the core pair: A converges after a bounded check; F keeps polishing and
  querying until the budget ends.

## Limits

- The classifier is mechanical (tool name/path/command heuristics), not a judgement of each edit.
- One pair; no statistical claim.
- The repeat used the product version with provenance and the token-milestone kill, so it is not a
  clean ablation against the core.
