# Overnight dispatch handover — Fleet rehearsal

Status: final handover for the morning shift.
Scope: diagnosis and a suggested morning plan. No traffic switch, deployment or production change is
made or authorised by this document. Only the release owner can move traffic.
Evidence basis: release-desk captures in `handover/evidence/`, checkpointed at
`a48ad05c00f0f36a97df2750d606d64ed7ee0deb`; replay at `handover/replay.mjs`.

## Recommendation in one line

Hold Birch (park, honest "holding" badge), keep Alder live, and use Cedar's already-signed REST
overflow lane at 06:10Z. Do not widen the rollout until duplicate delivery is prevented and the
missing p23 capture is resolved.

## What happened

The accepted service is not the source of the backward reading. The service replay still returns
readings in source order, the zero/omitted-limit Fleet default of three, and the same values over
gRPC and REST. The platform's "delivery green" is also true as far as it goes: the edge recorded
480/482 completed calls and zero gRPC errors. But that metric counts transport success, not display
freshness or sequence order.

The live Birch board `p17/B` received this sequence:

| UTC | Request | Sequence | Outcome |
| --- | --- | ---: | --- |
| 22:02:57 | req-a, attempt 1 | 40 | delivered; p17 painted 40 |
| 22:03:11 | req-b | 41 | delivered; p17 painted 41 |
| 22:03:15 | req-a, attempt 2 | 40 | delivered again with grpc-status 0 |
| 22:03:17 | req-a, attempt 2 | 40 | p17 painted 40 again, after 41 |

That last paint is the reported "stuck" / "went back" reading: the board went 40 -> 41 -> 40. It is a
duplicate delivery of the same request (`req-a`, attempt 2) with the same sequence, not a new reading
and not a gRPC decode failure. The immediate cause is a terminal that repaints any delivered frame
without a monotonic-sequence/idempotency guard. The archive does **not** show why the client/gateway
retried `req-a`; that retry policy still needs to be inspected. Until it is, treat duplicate delivery
as an open recurrence risk.

## Why the field note is consistent but not independent proof

`B-12` uses a UTC+01 wall clock that was 52 seconds fast at 22:10Z (±12 s). The notebook time 23:04
was rounded to the minute, so it converts to roughly **22:02:26Z–22:03:50Z** (best estimate
22:03:08Z). That window overlaps the live p17 paints at 22:02:58, 22:03:12 and 22:03:17, so the note
corroborates the trace. It is not independent proof: the reporter could not establish whether the
board was p17 or the adjacent simulator, and the photo is from the practice board. The adjacent
training station `p71` (Birch/`sim-4`) painted sequence 39 at 22:03:16; training data must not be
mixed back into a live Birch board.

## Alias and instrumentation caveats

- Use the 22:00 inventory crosswalk, not the older registry labels. It records Birch live on
  `relay-9` panels `p17` and `p23`, Alder live on `relay-2` panels `p04` and `p09`, and Birch training
  on `sim-4`/`p71`. The older `B-12`/`relay-9` aliases were reassigned, so an old label is not a
  current site identity.
- The terminal trace has no rows for live Birch panel `p23`. That is an instrumentation gap, not
  evidence that p23 was clean. The field addendum also says the B-13 uploader was unplugged for the
  whole rehearsal and retained no local recording.
- Platform success does not fill either gap. Do not use the green edge count as a substitute for a
  fresh p23 capture.

## Morning plan (for scheduling dry run, not production approval)

Proposal committed at `8cf6648786ad4ef46ead93f36e64516e719fd094`:

```json
{
  "startUtc": "06:10",
  "birch": "park",
  "cedar": "overflow"
}
```

- **06:10Z — Birch: park.** Hold the affected pilot and show an honest holding badge. Do not present
  a live Birch number. Parking does not move traffic to REST.
- **Cedar: overflow.** Use the signed CAP-08 REST overflow lane, which is the only lane and runs
  06:00–06:30Z. No second lane exists. The release owner must confirm the booking with Cedar; the
  request has not been made by this handover.
- **Alder: keep live / observe.** The trace shows Alder feed A sequence 86 painted on both p04 and
  p09; two boards legitimately painting the same reading is not a regression. This is consistent with
  the demo host's request to keep Alder, subject to the owner's decision.
- **Dune: remain REST.** It is outside this morning cohort and still on the R1 build; the signed
  OPS-17 order keeps its upgrade after W2.

Scheduling replied `booking: "feasible"` with no reasons and `productionApproval: "unissued"`. The
exact dry-run receipt is `handover/booking-receipt.json`. Scheduling feedback is not trial or
production approval.

## What would make us widen

Widen beyond the parked cohort only when all of the following are true:

1. The retry source is identified, and duplicate delivery of `req-a` can no longer repaint an older
   sequence on a live board (for example, request idempotency plus a strictly increasing
   board/feed sequence guard, verified by the replay).
2. The replay still exits 0 and the accepted service tests still pass.
3. Live panel `p23` has a terminal capture, or the release owner explicitly accepts that the
   instrumentation gap is closed another way.
4. The B-13 uploader/screen gap is understood and does not hide another non-monotonic paint.
5. Measured traffic is within the site reservation and the release owner approves the traffic change.
6. A freshness/staleness rule is agreed. No maximum stale-data age was agreed tonight; do not invent
   one as policy.

## What would make us reverse or hold further

Reverse the morning cohort (or hold it entirely) if any of these appear:

- Another live board paints a lower sequence after a higher one, especially with grpc-status 0.
- The duplicate `req-a` pattern recurs, or the retry source cannot be bounded before the window.
- p23 remains uncaptured and cannot be attested, or B-13 reveals a conflicting board.
- The field note and terminal trace disagree after clock correction, or an old alias is used to
  reassign a board.
- Measured traffic exceeds the reservation, or the release owner/field operations do not approve the
  booking.
- Anyone proposes moving traffic without the release owner; that is outside this handover's
  authority.

## How to reproduce

From the repository root:

```sh
node handover/replay.mjs   # exits 0 when the recorded diagnosis reproduces
node bench/check.mjs       # existing release check: edgeErrors 0, "continue"
node --test                # 18 accepted service/REST tests pass
```

`node handover/replay.mjs` re-drives the committed gRPC/REST service and rebuilds the archive
timeline. It confirms the backward paint, the duplicate request, the field-clock overlap, the training
simulator separation, the p23 gap and the green edge metric in one run.

## Files left for the next shift

- `handover/ASSESSMENT.md` — preliminary working assessment written before the archive was opened.
- `handover/HANDOVER.md` — this final handover.
- `handover/replay.mjs` — runnable replay.
- `handover/evidence/` — read-only archive captures used by the replay.
- `handover/proposal.json` — committed morning booking proposal.
- `handover/booking-receipt.json` — dry-run scheduling receipt for that proposal.
