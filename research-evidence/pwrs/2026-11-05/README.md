# PWRS deterministic real-host evidence — 2026-11-05

`scripts/pwrs/run_pwrs_host.sh` drove the real Windows DSH Host with the real Palimpsest product.
The model content is a deterministic Messages stand-in (labelled MOCK_MODEL). No paid model call was
made; the ALHS core/repeat/diagnostic authorizations do not transfer.

## What happened

| Event | Fact | File |
|---|---|---|
| P1 worker commits a partial package | `a056722 write worker pricing partial` | `artifacts/partial.md`, `out/partial-committed-at.txt` |
| host tree killed | attempt remains `RUNNING` | `out/attempt-state-after-kill.txt`, `sessions/P1/killed-at.txt` |
| retained world observed | head `a056722`, subject preserved | `out/retained-world-head.txt`, `out/retained-world-subject.txt` |
| measured constraint arrives | 700 mm corridor | `out/constraint-arrived-at.txt` |
| P2 synthesizes in the retained world | commit `167e5a0`, reuses pricing, drops the assumption | `artifacts/package.md`, `artifacts/canonical-git-log.txt` |
| relay takeover | `PRINCIPAL_RECOVERY`, `DECLARED_ABANDONED`, `workerInvocations=0`, `independenceEligible=false` | `journal-records.json`, `pwrs-summary.json` |
| episode | `WAIT_FOR_OPERATOR` with the artifact at `RESULT_COMMIT 167e5a0` | `journal-records.json` |
| operator promotion | `promotion-5a789d…` COMMITTED, task `SATISFIED` | `out/promote-package.json`, `out/promoted-at.txt` |
| later session | `DELIVER` with the artifact at `WORKTREE`, same blob digest `46ba8227…` | `journal-records.json` |

## Files

- `pwrs-summary.json` — the mechanical read: tasks, attempts, promotion, relay record, episodes,
  timeline, retained world, reuse facts, canonical Git.
- `score.json` — the same summary captured at run time (`out/summarize.json`).
- `journal-records.json` — the relay and episode records, parsed from the project journal.
- `artifacts/` — the exact retained partial, the accepted package, and the canonical Git log.
- `out/` — session timestamps, kill/constraint/promotion markers, mock scripts, deployment profile,
  promotion result and the provider-free request log.
- `sessions/` — the real DSH session streams (P1, P2, P3 and the worker), plus run logs/exit codes.

## What this evidence does not show

No model choice, no quality comparison, no cost advantage. It shows that the product can carry a
worker's unfinished work across a killed host, let a new principal synthesize on a new measured basis,
record the executor honestly (`PRINCIPAL_RECOVERY`, not worker production), and let the existing
operator path accept the result.
