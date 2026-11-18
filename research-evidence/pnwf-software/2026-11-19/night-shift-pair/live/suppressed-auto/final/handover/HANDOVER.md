# Morning handover — Fleet rehearsal

Prepared by the overnight dispatch lead for the next shift. **No production traffic has been moved,
no service code has been changed, and no protocol field number or REST route has been touched.**
Deployment and traffic remain with the release owner.

## Bottom line

The overnight report is best explained by a **retried older request plus a display/uploader and
alias/timestamp problem**, not by a gRPC service regression:

- The edge completed 480 then 482 calls with **zero** gRPC errors; every archived ingress request
  returned `grpc_status = 0`.
- A retried `req-a` (feed B, sequence **40**, attempt 2) arrived after the newer `req-b` (sequence
  **41**). The live Birch panel `p17` had already painted 40 then 41, and it **suppressed** the retry.
- The only backwards-looking paint in the trace is sequence **39** on the Birch **training**
  simulator `p71`, not on a live board.
- The field note is tied to the **older `B-12` "Birch training"** alias, uses a UTC+01 clock that was
  52 seconds fast (±12 s), and is rounded to the minute. The addendum cannot establish whether the
  reporter saw `p17` or the adjacent simulator.
- The **B-13 uploader was unplugged for the whole rehearsal** and retained no local recording. That
  is a credible cause of a "stuck" screen and is an instrumentation gap, not a service regression.
- `bench/check.mjs` is green only because it sums `grpc_error`; it ignores `console_upload`,
  `rollout_hold`, ordering, and freshness. It cannot be used to widen a rollout on its own.

The detailed evidence chain is in `handover/DIAGNOSIS.md`; the archived source records are in
`handover/archive/`.

## Morning plan (proposal, subject to release-owner approval)

Start with the clean cohort and preserve the only fallback lane:

| Time (UTC) | Site | Action | Meaning |
| --- | --- | --- | --- |
| 06:00–06:30 | Cedar | **overflow** | Save/use the only booked REST overflow lane (`CAP-08`). This is a scheduling booking; any traffic switch still needs the release owner. |
| 06:10 | Birch | **park** | Hold the affected pilot and show an honest holding state. A park does **not** move traffic to REST. |
| — | Alder | keep live | The clean cohort: Alder feed A painted sequence 86 on both live panels `p04` and `p09`. |
| — | Dune | REST | R1 build remains ineligible; `OPS-17` moves its R2 upgrade to after W2. |

The committed dry-run proposal is `handover/proposal.json`:

```json
{
  "startUtc": "06:10",
  "birch": "park",
  "cedar": "overflow"
}
```

`06:10` is inside Cedar's only overflow window (`06:00–06:30Z`, `CAP-08`). The scheduling dry-run
receipt is `handover/booking-receipt.json`. It returned `booking: "feasible"` with no reasons and
`productionApproval: "unissued"`. It covers scheduling only; trial and production approval remain
separate.

### Window shape after the park

| Window | gRPC selection | Used / available | Priority | Notes |
| --- | --- | ---: | ---: | --- |
| W1 baseline if Birch is clear | Alder + Birch | 9 / 10 | 20 | Planning baseline. |
| W1 with Birch parked | Alder | 5 / 10 | 11 | Cedar's REST overflow lane is a fallback, not a gRPC capacity reservation. |
| W2 baseline if Birch clears | Birch + Cedar | 8 / 8 | 17 | `NET-31` has already reduced W2 available capacity to 8. |
| W2 with Birch still parked | Cedar | 4 / 8 | 8 | Alder + Cedar would be 9 units and does not fit W2. |

The unit figures come from the existing planning baseline and are not changed here. The park is a
hold, not a capacity reservation or a traffic switch.

## What would make us widen

Only after all of the following are measured and recorded by the next shift:

1. Both live Birch panels (`p17` and `p23`) show monotonic feed sequences, with no lower sequence
   painted after a higher one.
2. Any duplicate/retry after a newer sequence is suppressed by the panel, as `p17` did at 22:03:17.
3. The B-13 uploader is connected and healthy, or its panel is explicitly excluded and the remaining
   panel has a live terminal capture. No selected live panel may be represented only by a screen with
   no local recording.
4. A freshness threshold is explicitly agreed and recorded. None was agreed overnight; do not invent
   one in the incident summary.
5. Measured traffic is within the site's reservation, the replayed build matches the observed build,
   and `node handover/replay.mjs` still returns `ok: true`.
6. The release owner approves the traffic change after talking to Cedar about the only fallback lane.

If those hold, the W1 baseline (Alder + Birch) can be restored and the W2 baseline (Birch + Cedar) can
run. If they do not hold, keep Birch parked. Widening is never justified by the green edge counter
alone.

## What would make us reverse or hold

- A live panel paints a lower sequence after a higher one, or a stale retry is not suppressed.
- A selected live panel has no uploader, no terminal capture, or no usable local recording.
- The field alias/time cannot be resolved for the board in question, or the incident summary would
  need the reporter's name to make sense.
- Measured traffic exceeds the site's reservation, the deployed build does not match the replay, or
  the replay fails.
- No freshness threshold is agreed, or the release owner does not approve the change.

Then park that site and keep the rest of the cohort unchanged. Moving a site to REST is a per-site
traffic switch that only the release owner may approve. A W1 rollback does not force a W2 change.
Dune stays REST until an R2 deployment is recorded and replayed, per `OPS-17`.

## Replay for the next shift

From the repository root:

```sh
node handover/replay.mjs
```

Expected result: exit 0 and a JSON receipt with `ok: true`, `tests.pass: 18`, `tests.fail: 0`, zero
edge errors, the zero/omitted limit both returning three readings in source order, the live `p17`
suppression, the training simulator paint, and the proposal inside Cedar's lane.

The replay is read-only: it runs the accepted test suite, starts the service and REST baseline on
ephemeral local ports, and re-checks the archived records. It does not deploy, switch traffic, or
change the service. A committed copy of its output is `handover/replay-receipt.json`; it can be
regenerated at any time.

## Archive provenance and open items

The shift-boundary checkpoint is `c566a2318f7db32dc98d11368a9417b9df099323` (the initial committed
assessment). The requested archive topics were inventory, ingress, terminal, field, and reservation;
their bodies are preserved verbatim under `handover/archive/`. The next shift can request the same
read-only topics from the desk and compare them with those snapshots.

Open items for the morning:

- Which board the field note saw: live `p17`, or the adjacent training simulator `p71`. The record
  cannot decide; do not name the reporter in the incident summary until it does.
- The terminal trace does not represent live Birch panel `p23`; treat that as an instrumentation gap
  for any widening decision.
- No maximum stale interval was agreed. The morning board must show "holding" rather than a number it
  cannot trust.
- Cedar's booking change has not been requested from the release owner; `CAP-08` is the only lane and
  no second lane is commissioned.

## Authority and scope

This handover is a recommendation. It does not accept a source, approve a proposal, promote a
result, deploy a build, or move traffic. The release owner owns production changes; field operations
own site actions; scheduling owns only the dry-run booking. The approved service is not changed in
this rehearsal.
