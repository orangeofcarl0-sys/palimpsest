# G10-GC2-I — Genuine P1→P2 E2E & Crash Recovery

## The genuine end-to-end proof

`test/gc2i_genuine_e2e.test.ts` supersedes the GC8 fixture (which changed Work without any
linked Project). It uses a **real** Campaign-linked P1 with a file-backed store.

| Step | Assertion |
|---|---|
| 1–2 | Institution-grounded Campaign; a ghost institution is refused |
| 3 | H1 → Q1 SUPPORTED; refresh |
| 4 | P1 `{projectId:"P1", revision:3, digest:1…}` admitted; `PROJECT_ADMITTED(P1)` exists |
| 5 | Intervention I1 registered against the exact P1 targeting H1 |
| 7 | WAIT via the production golden path; checkpoint `knownProjectRefs == [P1]`, E1 |
| 8 | Store close/reopen: checkpoint and P1 ref replay unchanged |
| 9–10 | E1→E2, Q1 changes, P1 Work standing changes, a real watch triggers |
| 11 | `DORMANT → WAKING`; a second `beginWake` yields no W2 |
| 12–14 | Disabled / unknown Work and unknown Evidence block reconciliation with ZERO writes |
| 15 | Snapshot carries E2, Q1 standing, exact P1 ref + changed standing, the triggering watch |
| 16–17 | R1 `previous`/`resulting` belief digests equal the canonical before/after digests |
| 18 | Unchanged refresh is a zero-write no-op |
| 20 | Historical P1 cannot satisfy W1 (refused) |
| 21 | K1 bound to W1/R1/basis/belief |
| 22–24 | Crash after Work admission recovers the SAME P2; exactly one `PROJECT_ADMITTED(P2)` and one causally linked completion |
| 25 | ACTIVE only after the bound completion |
| 26 | P1 remains a historical linked Project |
| 27–30 | Second cycle: WAIT → DORMANT → W2 → R2 → compiler chooses WAIT; a historical WAIT admission cannot complete W2; a NEW `WaitAdmission` bound to K2/W2/R2 commits the new dormancy with new watches and a new checkpoint |

Asserted end-to-end: `P1 ≠ P2`; the exact P1 ref survived the checkpoint and restart; the
P1 Work change was observed during the wake; old P1 cannot satisfy W1; old WAIT cannot
satisfy W2; `W1→R1→K1→P2` and `W2→R2→K2→Q2` causal chains are complete.

## Crash matrix

`test/gc2h_crash_matrix.test.ts` wraps the store with a one-shot crash seam and injects a
failure before and after each durable commit boundary:

| Injection | Recovery |
|---|---|
| before `WAKE_STARTED` | retry starts exactly one cycle; zero cycles stored before |
| after `WAKE_STARTED` | retry reports `wake_already_in_progress`; one cycle |
| before `RECONCILIATION_COMMITTED` | zero writes; retry reconciles once |
| after `RECONCILIATION_COMMITTED` | retry returns the existing report; one reconciliation |
| before `PROJECT_ADMITTED` | retry recovers through the idempotent Work port; one link |
| after `PROJECT_ADMITTED` | retry finds the admission; one link |
| before `WAKE_CYCLE_COMPLETED` | retry completes once |
| after `WAKE_CYCLE_COMPLETED` | retry is an idempotent no-op; one completion |

Every retry converges or fails closed; no duplicate Project, reconciliation, or completion
is ever produced.
