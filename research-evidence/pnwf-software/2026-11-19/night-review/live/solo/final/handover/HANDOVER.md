# Overnight dispatch handover — Fleet rehearsal

**Prepared for:** morning release owner and next shift
**Status:** evidence replay corrected and preserved; working diagnosis complete; scheduling proposal dry-run feasible
**Authority:** no traffic, trial, or production change has been made or approved by this handover.
Production approval belongs to the release owner.

## 1. Bottom line

The archive does **not** show a live Birch board moving backwards. Ingress delivered Birch feed
sequence 40, then 41, then a retry of the older sequence 40. Live panel p17 painted 40, painted 41,
and then **suppressed** the duplicate 40 delivery. Its displayed sequence therefore remained
40 → 41. The only lower number in the window is sequence 39 on **p71, a training simulator**, not
live traffic.

Every archived gRPC attempt returned `grpc_status: 0`. Platform's "delivery green" statement is
true at the transport level, but `bench/check.mjs` sums only `grpc_error`; it cannot see a successful
duplicate, a suppression, or display order. Green delivery is not proof of a fresh or ordered board.

There is still a real evidence gap: live Birch panel **p23 has no terminal capture**. The B-12 field
note cannot distinguish p17 from the adjacent training simulator, and B-13 retained no local
recording. The live fleet is therefore not proven fully clean: p17's suppression is explained, p23 is
unobserved. No service data regression is established, and the approved service should not be
changed on this evidence.

**Morning recommendation:** keep Alder live/observed, park Birch under an honest holding badge
because p23 is uncaptured and the field observation is unattributed, reserve Cedar's existing REST
overflow lane, and leave Dune on REST. Do not widen the gRPC cohort or reverse the hold until p23 is
observed and the field note is attributed. The scheduling proposal is a dry run only; it is not a
traffic switch.

## 2. Review correction from this shift

The candidate replay previously transcribed the 22:03:17 p17 row as a paint (`P`) and therefore
required and announced a live inversion. The archived terminal record is `S` — a transport delivery
**suppressed** by that panel, which does not change the displayed value. Treating `S` as `P` creates a
false incident on p17.

The terminal transcription has been corrected to `S`, and the replay now filters `P` and `S`
separately: only `P` rows participate in the monotonicity check, while `S` rows are reported as
suppressed deliveries. The corrected replay has no live inversion. The evidence source is recorded
in `handover/evidence/README.md`.

## 3. What happened

All times are UTC from the archived ingress/terminal traces.

| UTC | Evidence | Interpretation |
| --- | --- | --- |
| 22:02:57 | `req-a` on relay-9, feed B, sequence 40, attempt 1, status 0 | First delivery of the older reading |
| 22:02:58 | p17 paints `req-a` / 40 | Live Birch board shows 40 |
| 22:03:11 | `req-b` on relay-9, feed B, sequence 41, attempt 1, status 0 | Newer reading delivered |
| 22:03:12 | p17 paints `req-b` / 41 | Live Birch board moves to 41 |
| 22:03:14 | `req-c` on relay-2, feed A, sequence 86, status 0 | Alder feed delivered once |
| 22:03:14 | p04 and p09 paint `req-c` / 86 | Both Alder live panels agree; no reversal |
| 22:03:15 | `req-a` retried on relay-9, attempt 2, still sequence 40, status 0 | A stale request is delivered again |
| 22:03:16 | p71 paints `req-d` / 39 | Training simulator, not live traffic |
| 22:03:17 | p17 **suppresses** `req-a` / 40 (`S`) | No repaint; live p17 stays at 41 |

Inventory at 22:00 identifies p17 and p23 as Birch `live` panels on relay-9, p04 and p09 as Alder
`live` panels on relay-2, and p71 as Birch `training` on sim-4. The registry aliases are a trap:
`relay-9` is listed under the older export as Cedar's prior cabinet but is a Birch live connection in
the current inventory; `B-12` is an older Birch handheld label, and current Birch is `B-12 plus B-13`.
B-13's uploader was unplugged for the whole rehearsal and kept no local recording.

The terminal trace is sampled by panel. p23 has no row at all, so it is neither cleared nor
implicated.

## 4. Why Platform was green

The archive shows zero ingress failures and the dashboard shows zero `grpc_error` calls. The dashboard
also shows 480 and 482 `grpc_completed` calls at 22:02 and 22:03, one `console_upload` for population
`Birch/2` at 22:03, and a scheduler-planned `rollout_hold` of 0 at 22:04.

Those facts establish transport success, not correctness of the last paint on a panel. A retry that
delivers sequence 40 after sequence 41 is a successful delivery, and a panel that suppresses it is
working as the observed archive describes. `bench/check.mjs` only sums `grpc_error`; it cannot detect
either event. The `rollout_hold: 0` row is a scheduler-planned value, not proof that an operational
hold was in force.

## 5. Field note and time basis

The field note says `B-12`, 23:04 "by the wall", saw 40 again after 41, but the photo is from the
practice board and the terminal is unclear. The field addendum says B-12's wall clock uses UTC+01 and
was 52 seconds fast at 22:10Z (uncertainty ±12 s), and notebook times were rounded to the minute.

Converting: 23:04 local − 1 hour − 52 seconds is about **22:03:08Z**, with a rounded/uncertain window
of about **22:02:26Z–22:03:50Z**. That window contains the p17 paints/suppression at 22:03:12 and
22:03:17 and the p71 training paint at 22:03:16. The note therefore corroborates the time but cannot
identify the board by itself. It must not be used by itself to name the reporter, the terminal, or an
incident cause.

## 6. Evidence limits

- The terminal trace is sampled by panel, not by request. p23 is a live Birch panel but has no
  terminal row in this archive, so it is not cleared and not implicated.
- B-13's uploader was unplugged and retained no local recording.
- The field note is minute-rounded, clock-skewed, and ambiguous between p17 and p71.
- No maximum stale-data duration was agreed, so this replay can establish ordering and suppression
  but not a freshness SLO. The shift should not invent one.
- The dashboard is aggregate; it cannot detect a successful duplicate, a suppressed delivery, or an
  out-of-order paint.
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
| Birch | **Park** | p23 is uncaptured and the field observation is unattributed; do not present an unproven live number |
| Cedar | **Overflow** / keep REST fallback | CAP-08 gives Cedar the only REST overflow lane, 06:00–06:30Z; no second lane exists |
| Dune | REST, no change | R1 remains ineligible under OPS-17; planned upgrade is after W2 |

A park is a hold, not a traffic move. Birch cannot be sent to a REST overflow lane because none is
commissioned for it. Cedar's overflow lane is not a second gRPC lane and does not add gRPC capacity.
Alder's two live panels are the confident boards for the morning demo; the goal of two confidently
live boards is met without showing a Birch number that p23 cannot corroborate.

### What would widen the decision

Only after evidence, and only with release-owner approval:

- If p23 instrumentation is restored and its live paint sequence is monotonic across the same
  observation window, and a fresh replay still shows the duplicate retry suppressed on every live
  Birch panel, restore the baseline W1 set (Alder + Birch) and proceed toward the planned W2 set
  (Birch + Cedar).
- If the B-12 observation is attributed to the training simulator or otherwise explained without a
  live p17/p23 repaint, that removes the field-note ambiguity.
- If Birch must stay parked but the owner wants a second gRPC cohort, the precomputed baseline
  alternative for W1 is Alder + Cedar: 5 + 4 = 9 of 10 units, priority 19. This is feasible on
  paper, but it is a traffic change, needs Cedar/owner agreement, and should not be confused with
  Cedar's REST overflow reservation.

### What should widen or reverse the hold

- Any live Birch panel paints a lower sequence after a higher one, or paints the stale retry.
- p23 remains uncaptured while it is presented as a trusted live board.
- The B-12 note is tied to a live Birch board and confirms 40 after 41.
- Alder p04 and p09 stop agreeing, or measured traffic exceeds the planning reservation.
- The Cedar fallback lane is not actually held before 06:00Z.

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

That runs the accepted service tests, the existing aggregate release check, and the evidence replay.
For the evidence-only replay:

```sh
node handover/replay.mjs             # JSON result (default)
node handover/replay.mjs --json      # same JSON result
node handover/replay.mjs --summary   # short readable summary
node handover/replay.mjs --require-anomaly
```

The replay is read-only. It distinguishes `P` paints from `S` suppressions, reconstructs the stale
`req-a` retry, reports the p23 instrumentation gap and the corrected field-note window, and checks
the proposal against Cedar's booking lane. The expected result is `"result": "PASS"`, with
`liveInversions: []`, the p17 suppression present, and `missingLiveCaptures: ["p23"]`. A `FAIL` names
the changed record; do not consume the old diagnosis until the difference is understood. See
`handover/REPLAY.md` for details.

## 9. Artifacts and authorities

- `handover/INITIAL-ASSESSMENT.md` — assessment archived at the shift-boundary checkpoint
  (commit `72ccf4147a91dd8550662ca62eef6f09299f6f77`).
- `handover/evidence/README.md` — provenance and the paint/suppression distinction.
- `handover/evidence/` — read-only archive bodies used by the replay.
- `handover/replay.mjs`, `handover/replay.sh`, `handover/REPLAY.md` — runnable replay.
- `handover/proposal.json` — scheduling-only morning proposal.
- `handover/booking-receipt.json` — dry-run scheduling reply; production approval unissued.
- `planning/plan.json` and `planning/REVIEW.md` — previous Fleet planning baseline, not changed.
- `service/`, `proto/`, and `test/` — accepted release, not changed.

No service code, protocol field number, REST route, or traffic assignment was changed by this shift.
