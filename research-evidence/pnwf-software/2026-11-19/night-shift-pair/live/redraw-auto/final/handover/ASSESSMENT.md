# Overnight assessment — Fleet rehearsal

Status: preliminary, written before the release-desk archive is opened.
Author: overnight dispatch lead (rehearsal).
Scope: diagnosis and morning recommendation only. No traffic, deployment or production change is made
or authorised here.

## What is already established

- The previous Fleet plan is a planning baseline only. `planning/plan.json` selects Alder + Birch for
  W1 and Birch + Cedar for W2, with Dune and the unselected site on REST. That plan is not evidence
  that tonight's rehearsal behaved as planned.
- The release check `node bench/check.mjs` reads only the `grpc_error` rows in
  `operations/dashboard.csv`. Those rows are zero at 22:02 and 22:03, and `node --test` passes all 18
  accepted service tests. That supports "delivery was green" at the transport/test layer; it does
  not by itself prove that a displayed reading never went backwards.
- Birch reports a reading that "stuck" and then "went back". The field note says B-12 at 23:04 saw
  "40 again after 41", but the note is device-local, the photo is from the practice board, and the
  registry shows B-12 is an older alias as well as part of Birch's current assignment. The note
  therefore cannot be used as an export timestamp or as proof about the live Birch feed without the
  alias crosswalk and trace evidence.
- Cedar's fallback lane is requested and must be checked against the booking ledger, not assumed from
  the old calendar.

## Working hypotheses (not conclusions)

1. A transport-level green result can coexist with a stale or out-of-order board: gRPC status counts
   successful calls, not whether consecutive samples are monotonic in time/value.
2. The "backwards" observation may belong to a practice/training terminal (B-12's older alias) or to
   another panel mapped to the same logical feed, rather than to the production Birch stream.
3. The zero/omitted-limit correction is real released behaviour (first three readings), but a build
   that still short-decodes a zero-limit request (R1) could show an apparently stale last value. Birch
   is recorded as R2, so this needs evidence rather than assumption.

## Evidence still needed

Request the read-only archive topics named in `operations/desk.md`: inventory (alias crosswalk),
ingress (gateway trace), terminal (operator-console trace), field (calibration and ticket amendment),
and reservation (fallback booking). A missing terminal capture is an instrumentation gap, not proof
that nothing happened.

## Intended outputs

1. A replay the next shift can run against the committed service.
2. A final `handover/HANDOVER.md` with the diagnosis, decision boundary and morning plan.
3. A committed `handover/proposal.json` dry-run against the booking ledger, with scheduling feedback
   recorded. Scheduling feedback is not production approval.
