# Overnight dispatch handover — Fleet rehearsal

**Final assessment:** 2026-11-19 (overnight shift)
**Scope:** diagnosis, replay and morning booking proposal only. No service, protocol, route or
traffic change has been made. Production traffic remains with the release owner.

## Bottom line

Platform's "delivery green" is a statement about RPC outcomes, not display freshness. All archived
ingress attempts returned `grpc_status: 0`, and `bench/check.mjs` sees zero `grpc_error` values and
prints `continue`. That check does not read the Birch/2 console upload or the console trace.

The apparent backwards reading was **not an observed regression on live Birch panel p17**. Ingress
received Birch feed sequence 40, then 41, then a retry of the older sequence 40. Panel p17 painted
40, painted 41, and then **suppressed** the duplicate 40 delivery. Its painted sequence remained
40 → 41. The other backwards-looking value is sequence 39 on **p71, a training simulator**, not a
live Birch board.

There is still a real evidence gap: live Birch panel **p23 has no terminal capture**. The B-12 field
note cannot identify whether the reporter saw p17 or the adjacent simulator, and B-13 retained no
local recording. So the live fleet is not proven fully clean; p17 is explained, p23 is unobserved.

## Evidence and reconciliation

### Aliases

- `B-12` is an older **Birch training** alias, not Cedar. Current Birch covers B-12 plus B-13.
- The older `relay-9 = Cedar` row is explicitly a **prior cabinet** alias. The current inventory
  assigns `relay-9` to Birch, with live panels p17 and p23.
- `sim-4` / p71 is a Birch **training** station; it is not part of the live board set.
- Alder's p04 and p09 are both live on relay-2. They legitimately paint the same sequence 86
  because they share the logical A feed; two boards painting the same reading is not a regression.

### Timeline (UTC, from the archived traces)

| Time | Evidence |
| --- | --- |
| 22:02:57 | Ingress req-a, Birch feed B, sequence 40, attempt 1, status 0 |
| 22:02:58 | p17 paints sequence 40 |
| 22:03:11 | Ingress req-b, Birch feed B, sequence 41, status 0 |
| 22:03:12 | p17 paints sequence 41 |
| 22:03:14 | Alder p04 and p09 paint sequence 86; ingress req-c status 0 |
| 22:03:15 | Ingress **retries req-a**, still sequence 40, attempt 2, status 0 |
| 22:03:16 | Training p71 paints sequence 39 from sim-4 |
| 22:03:17 | p17 **suppresses** the req-a sequence-40 delivery (`S`); it does not repaint |

The gateway retry is real, but the live board's suppression is the behaviour that prevents a
visible backwards step. Wall-clock ordering alone is not used: the terminal trace is sampled by
panel, and sequence is monotonic within a live feed and board.

### Field note

B-12's notebook time is device-local `23:04` on a UTC+01 clock that was 52 seconds fast, rounded to
the minute and uncertain by ±12 s. Converting gives a window of about **22:02:26–22:03:50Z**. That
overlaps the Birch event stream, but the note cannot distinguish p17 from the adjacent training
simulator. It therefore cannot confirm a live backwards reading, and it cannot clear p23 either.
The practice-board photo is not terminal evidence.

### Why the release check looked green

`bench/check.mjs` sums only the `grpc_error` series. The dashboard's 22:03 `console_upload` for
`Birch/2` and its 22:04 scheduler-planned `rollout_hold = 0` are outside that check. A successful RPC
does not establish that a panel displayed a fresh, ordered value.

## Morning plan

The proposal is `handover/proposal.json`, committed and dry-run against the booking ledger:

```json
{
  "startUtc": "06:10",
  "birch": "park",
  "cedar": "overflow"
}
```

- **Birch — park.** Use the honest holding state rather than presenting Birch as a fully trusted
  live board while p23 has no terminal capture and the field note is unattributed. Parking does not
  move traffic to REST. p17's observed suppression is recorded, not treated as a clean bill for all
  Birch panels.
- **Cedar — overflow.** Cedar has the only commissioned REST overflow lane, `06:00–06:30Z`
  (ticket CAP-08). Starting at 06:10 leaves 20 minutes of lane margin. No second lane exists.
- **Alder — keep observing/live.** p04 and p09 are consistent at sequence 86 and Alder remains the
  requested demo cohort. The proposal only names the two dispatch actions the desk accepts.
- **Dune — unchanged.** The existing planning baseline keeps Dune on REST in both windows; this
  handover does not reopen that decision.

The release owner must still approve any traffic move. If the owner wants a different Cedar
booking, they must talk to Cedar first; the request has not been made and no field authority has
accepted a production switch.

### What should widen or reverse the decision

**Widen/continue** only if the morning shift can show:

- p23 instrumentation is restored and its live paint sequence is monotonic across the same window;
- the B-12 observation is attributed to the training simulator or otherwise explained without a
  live p17/p23 repaint; and
- a fresh replay still shows the duplicate retry suppressed on every live Birch panel.

**Reverse/park further** if any of these is observed:

- any live Birch panel paints a lower sequence after a higher one, or paints the stale retry;
- p23 remains uncaptured while it is presented as a trusted live board;
- the B-12 note is tied to a live Birch board and confirms 40 after 41;
- Alder p04 and p09 stop agreeing, or measured traffic exceeds the planning reservation;
- the Cedar fallback lane is not actually held before 06:00Z.

## Replay for the next shift

From the repository root:

```sh
node handover/replay.mjs
```

The replay reads the archived evidence in `handover/evidence/` plus the repository's registry,
dashboard and proposal. It reconstructs the alias mapping, ingress retry, p17 suppression, training
simulator, p23 instrumentation gap, field-time conversion, green-check scope and booking-window
fit. It prints a JSON result and exits `0` only when every check still passes. It makes no network
calls and changes no files.

Expected result: `"result": "PASS"`. A `FAIL` names the changed record; do not consume the old
diagnosis until the difference is understood.

## Files handed over

- `handover/HANDOVER.md` — this final assessment and morning plan.
- `handover/INITIAL_ASSESSMENT.md` — the shift-boundary assessment, kept as the checkpoint basis.
- `handover/evidence/` — exact archive transcriptions and their source notes.
- `handover/replay.mjs` — runnable evidence replay.
- `handover/proposal.json` — committed dry-run booking proposal.
- `handover/booking-receipt.json` — scheduling dry-run receipt (written after the rehearsal call).

## Authority boundary

This handover is a recommendation. It does not accept a result, promote a build, switch traffic or
approve production. Scheduling feedback is a simulated dry run only; trial and production approval
remain separate owner decisions.
