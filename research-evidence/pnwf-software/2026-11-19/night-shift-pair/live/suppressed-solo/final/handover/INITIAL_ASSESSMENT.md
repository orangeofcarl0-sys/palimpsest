# Initial overnight assessment — Fleet rehearsal

Written at the shift boundary from the repository and the 21:55–22:17 shift mail only. The
archive topics in `operations/desk.md` had not yet been requested when this assessment was
committed.

## What is known

- The rehearsal dashboard reports zero edge gRPC errors at 22:02 and 22:03. `bench/check.mjs`
  therefore prints `{"edgeErrors":0,"decision":"continue"}`. That check only sums the
  `grpc_error` series; it does not read `console_upload` or `rollout_hold`.
- The dashboard separately records one `console_upload` for panel `Birch/2` at 22:03 and a
  scheduler-planned `rollout_hold` of zero sites at 22:04.
- Birch reports a reading that was "stuck" and later "went back"; the dispatcher explicitly warns
  against carrying a stale quantity onto the morning board.
- The field note is for B-12 at 23:04 by the wall: "Saw 40 again after 41?" It is a device-local
  notebook time, the photo is from a practice board, and the terminal is not identified. The
  registry shows that B-12 was an older alias for Birch training; current Birch covers B-12 plus
  B-13.
- Cedar asked scheduling to preserve the fallback path. The old calendar says the fallback is
  available, but the booking desk has not closed it.
- Alder is requested for the morning demo. Dispatch prefers an honest holding state to an
  untrusted live number, and states that only the release owner may move traffic.

## Working hypothesis (not yet a conclusion)

The green edge check may be true but incomplete: an absence of gRPC errors does not establish that
the console displayed a fresh, ordered reading. The Birch/2 console upload and the field note could
describe the same backwards/stale observation after alias and timestamp reconciliation. The morning
plan should keep Birch observable or parked rather than present it as a trusted live board until
the ingress, terminal, field, inventory and reservation records are cross-checked.

## Questions to resolve from the archived evidence

1. Does the Birch/2 edge/console trace show a stale value, a repeated value, or a genuinely
   out-of-order timestamp, and at what UTC instant?
2. Does B-12 map to Birch, and does the field note's 23:04 device-local time fall before or after
   the console observation once converted to UTC?
3. Is the Cedar fallback lane still bookable, or does the old calendar conflict with the ledger?
4. Is there a missing terminal capture (an instrumentation gap) that prevents attributing the
   console value to a specific terminal?

## Boundaries

No service, protocol, route or traffic change is made here. Any morning traffic action remains
with the release owner; scheduling feedback is a dry run only.
