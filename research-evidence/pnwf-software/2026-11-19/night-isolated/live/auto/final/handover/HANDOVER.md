# Overnight dispatch handover — Fleet rehearsal

**Prepared for:** morning release owner and next shift
**Status:** both field captures preserved; replay distinguishes the P inversion from the S
suppression; scheduling proposal dry-run feasible
**Authority:** no traffic, trial, or production change has been made or approved by this handover.
Production approval belongs to the release owner.

## 1. Bottom line

Platform's "delivery green" is a statement about RPC outcomes, not display freshness. All archived
ingress attempts returned `grpc_status: 0`, and `bench/check.mjs` sees zero `grpc_error` values and
prints `continue`. That check does not inspect the terminal paint order or the Birch/2 console upload.

There are **two separate recorded field cases**, P and S. They share the same ingress retry and the
same 22:03:17 timestamp/request, but their terminal records differ and neither is a correction of
the other:

- **P capture:** live Birch panel p17 painted sequence 40, then 41, then painted the stale retry of
  sequence 40 again at 22:03:17. This is an actual live display inversion. The cause is the
  successful retry of `req-a` (attempt 2, still sequence 40) being painted after `req-b` sequence 41
  had already painted.
- **S capture:** live Birch panel p17 painted sequence 40, then 41, and then **suppressed** the same
  stale sequence-40 delivery. In that separate case no live inversion occurred; the `S` row is a
  suppression event, not a paint.

The P case is a reproduced live inversion, and adding or reading S does not make it go away. The
replay must not merge the two captures or use the S suppression to rewrite the P paint. The adjacent
training simulator p71 painted a lower number (39) at 22:03:16 in both captures, but it is not live
traffic and is not the cause of the live P inversion.

This is **not** evidence of a service data regression and does not justify changing the approved
service. It is a live display/commit-order problem in the P field case. The field notebook note is
consistent with the same time window but cannot distinguish p17 from the simulator; the ingress and
terminal records make the live diagnosis.

**Morning recommendation:** keep Alder live, park Birch (honest holding badge, no trusted live
number), reserve Cedar's existing REST overflow lane, and leave Dune on REST. Do not widen the gRPC
cohort or reverse the hold until the Birch panel/retry path is shown to reject or de-duplicate an
older sequence in the P case as well as the S case. The scheduling proposal is a dry run only; it is
not a traffic switch.

## 2. The two captures

Both captures are preserved byte-for-byte in `handover/evidence/` and are identified by SHA-256:

| Case | Preserved copy | Contract SHA-256 | Final p17 event |
| --- | --- | --- | --- |
| P | `handover/evidence/P.tsv` | `c76bb857f8877413ffa91cbd9d736a09053c09ba94afb3ed1fe7bd500b8bc68a` | `22:03:17 p17 B 40 req-a P` |
| S | `handover/evidence/S.tsv` | `77f6d9a53429c6c081d51aef62b5bfd68fd23bfac5df1ff9208997812d5caa5e` | `22:03:17 p17 B 40 req-a S` |

`handover/evidence/terminal.tsv` is the working checkout's P capture. `terminal-P.tsv` and
`terminal-S.tsv` are convenience copies of the same two captures. The replay reads exactly one
capture per invocation; it never concatenates, intersects, or de-duplicates P and S.

A matching timestamp or request ID across the cases does not make either one authoritative. In
particular, the S `S` row is not evidence that the P `P` row did not commit, and the P paint is not
evidence that the S suppression failed to happen in its own case.

## 3. What happened in the P capture

All times are UTC from the archived ingress/terminal traces. Archive order is the event order; wall
clocks are shown for reading convenience only.

| UTC | Evidence | Interpretation |
| --- | --- | --- |
| 22:02:57 | `req-a` on relay-9, feed B, sequence 40, attempt 1, status 0 | First delivery of the older reading |
| 22:02:58 | p17 paints `req-a` / 40 | Live Birch board shows 40 |
| 22:03:11 | `req-b` on relay-9, feed B, sequence 41, attempt 1, status 0 | Newer reading delivered |
| 22:03:12 | p17 paints `req-b` / 41 | Live Birch board moves to 41 |
| 22:03:14 | `req-c` on relay-2, feed A, sequence 86, status 0 | Alder feed delivered once |
| 22:03:14 | p04 and p09 paint `req-c` / 86 | Both Alder live panels agree; no reversal |
| 22:03:15 | `req-a` retried on relay-9, attempt 2, still sequence 40, status 0 | A stale request is successfully replayed |
| 22:03:16 | p71 paints `req-d` / 39 | Training simulator, not live traffic |
| 22:03:17 | **P:** p17 paints `req-a` / 40 again | Live board regresses from 41 to 40 |

The S capture is identical through 22:03:16. At 22:03:17 its p17 row is `S`, so the stale duplicate
is suppressed and that capture has no live inversion. Both facts can be replayed independently.

Inventory at 22:00 identifies p17 and p23 as Birch `live` panels on relay-9, p04 and p09 as Alder
`live` panels on relay-2, and p71 as Birch `training` on sim-4. The registry aliases are a trap:
`relay-9` is listed under the older export as Cedar's prior cabinet but is a Birch live connection in
the current inventory; `B-12` is an older Birch handheld label, and current Birch is `B-12 plus B-13`.
B-13's uploader was unplugged for the whole rehearsal and kept no local recording.

## 4. Why Platform was green

The archive shows zero ingress failures and the dashboard shows zero `grpc_error` calls. The dashboard
also shows 480 and 482 `grpc_completed` calls at 22:02 and 22:03, one `console_upload` for population
`Birch/2` at 22:03, and a scheduler-planned `rollout_hold` of 0 at 22:04.

Those facts establish transport success, not correctness of the last paint on a panel. In the P case a
retry that replays sequence 40 after sequence 41 is a successful delivery. `bench/check.mjs` only
sums `grpc_error`; it cannot detect this. The `rollout_hold: 0` row is a scheduler-planned value, not
proof that an operational hold was in force.

## 5. Field note and time basis

The field note says `B-12`, 23:04 "by the wall", saw 40 again after 41, but the photo is from the
practice board and the terminal is unclear. The field addendum says B-12's wall clock uses UTC+01 and
was 52 seconds fast at 22:10Z (uncertainty ±12 s), and notebook times were rounded to the minute.

Converting: 23:04 local − 1 hour − 52 seconds is about **22:03:08Z**, with a rounded/uncertain window
of about **22:02:26Z–22:03:50Z**. That window contains the p17 paint at 22:03:12, the p17
paint/suppression at 22:03:17, and the p71 training paint at 22:03:16. The note therefore corroborates
the time but cannot identify the board by itself. It must not be used by itself to name the reporter,
the terminal, or an incident cause.

## 6. Evidence limits

- P and S are separate field cases. Neither capture corrects the other, and the replay must not merge
  them into one trace.
- The terminal trace is sampled by panel, not by request. p23 is a live Birch panel but has no
  terminal row in either capture, so it is not cleared and not implicated.
- B-13's uploader was unplugged and retained no local recording.
- The field note is minute-rounded, clock-skewed, and ambiguous between p17 and p71.
- No maximum stale-data duration was agreed, so this replay can establish ordering but not a
  freshness SLO. The shift should not invent one.
- The dashboard is aggregate; it cannot detect a successful duplicate or an out-of-order paint.
- The previous Fleet plan is a planning baseline. The old proto comment and the registry's
  "Dune after W1" line are not current behaviour/order; the dated Fleet correction and OPS-17 govern.

## 7. Morning plan (owner decision, not executed here)

The scheduling proposal is committed at `handover/proposal.json`:

```json
{
  "startUtc": "06:10",
  "birch": "park",
  "cedar": "overflow"
}
```

Its dry-run result is `booking: "feasible"`, `reasons: []`, `productionApproval: "unissued"` (see
`handover/booking-receipt.json`). This is scheduling feedback only.

| Site | Morning posture | Reason |
| --- | --- | --- |
| Alder | Keep live / observe | p04 and p09 both painted the same sequence 86 once; no inversion |
| Birch | **Park** | P capture has a live p17 regression after a stale retry; S suppression does not remove that case; p23 is unsampled; no trusted live number |
| Cedar | **Overflow** / keep REST fallback | CAP-08 gives Cedar the only REST overflow lane, 06:00–06:30Z; no second lane exists |
| Dune | REST, no change | R1 remains ineligible under OPS-17; planned upgrade is after W2 |

A park is a hold, not a traffic move. Birch cannot be sent to a REST overflow lane because none is
commissioned for it. Cedar's overflow lane is not a second gRPC lane and does not add gRPC capacity.
Alder's two live panels are the confident boards for the morning demo; the goal of two confidently
live boards is met without showing a Birch number that cannot be trusted.

### What would widen the decision

Only after evidence, and only with release-owner approval:

- If p17 and p23 both replay monotonically over a clean observation window and the client/panel
  rejects or de-duplicates an older retry in the P case as well as the S case, restore the baseline
  W1 set (Alder + Birch) and proceed toward the planned W2 set (Birch + Cedar).
- If Birch must stay parked but the owner wants a second gRPC cohort, the precomputed baseline
  alternative for W1 is Alder + Cedar: 5 + 4 = 9 of 10 units, priority 19. This is feasible on
  paper, but it is a traffic change, needs Cedar/owner agreement, and should not be confused with
  Cedar's REST overflow reservation.
- If the same stale-retry inversion appears on another live feed or panel, widen the hold rather
  than the rollout; keep REST available and escalate. Do not cancel the whole rehearsal solely
  because one cohort is parked.

### What would reverse the decision

- If an authoritative corrected P capture or terminal instrumentation shows the 22:03:17 P row was
  never painted on a live board, unpark Birch and restore the baseline. The preserved S capture by
  itself is **not** such a correction; it is a separate field case.
- If a client/panel fix is demonstrated by replay to suppress the older sequence in the P case and a
  clean p17/p23 observation window follows, unpark Birch and restore the baseline.
- If the retry is shown to be an intentional idempotent replay that the panel is required to ignore,
  the remaining defect is still a display/commit-order defect in P; do not treat "delivery green" as
  sufficient to unpark.

### What should stop the morning plan

- A second live panel/feed inversion, or p23 failing a clean observation, should broaden the hold.
- No agreed stale-data threshold means the owner should not promise a freshness number tonight.
- Any request to move traffic, change the service, or approve the fallback in production is outside
  this handover and belongs to the release owner. Field operations owns site actions.

## 8. Replay

Run from the repository root:

```sh
./handover/replay.sh
```

or replay the captures individually:

```sh
node handover/replay.mjs --capture P --json
node handover/replay.mjs --capture S --json
node handover/replay.mjs --capture P --require-anomaly   # exit 0, reproduced true
node handover/replay.mjs --capture S --require-anomaly   # exit 1, reproduced false
```

The replay is read-only. It re-runs the accepted service tests and aggregate release check in the
shell wrapper, then reconstructs one capture at a time. It identifies the capture by SHA-256, treats
only `P` rows as paints, treats `S` rows as suppressions, and never merges P with S. See
`handover/REPLAY.md` for details.

## 9. Artifacts and authorities

- `handover/INITIAL-ASSESSMENT.md` — assessment archived at the shift-boundary checkpoint
  (commit `72ccf4147a91dd8550662ca62eef6f09299f6f77`).
- `handover/evidence/P.tsv` and `handover/evidence/S.tsv` — preserved field captures.
- `handover/evidence/terminal.tsv` — working-checkout P capture; `terminal-P.tsv` and
  `terminal-S.tsv` are the same two captures under capture-oriented names.
- `handover/evidence/` — read-only archive bodies used by the replay.
- `handover/replay.mjs`, `handover/replay.sh`, `handover/REPLAY.md` — runnable replay.
- `handover/proposal.json` — scheduling-only morning proposal.
- `handover/booking-receipt.json` — dry-run scheduling reply; production approval unissued.
- `planning/plan.json` and `planning/REVIEW.md` — previous Fleet planning baseline, not changed.
- `service/`, `proto/`, and `test/` — accepted release, not changed.

No service code, protocol field number, REST route, or traffic assignment was changed by this shift.
