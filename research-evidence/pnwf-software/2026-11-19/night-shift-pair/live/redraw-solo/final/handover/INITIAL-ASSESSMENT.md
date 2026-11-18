# Initial overnight assessment — Fleet rehearsal

**Status:** working assessment at the start of the overnight dispatch shift. This is not a
production change, an acceptance, or a traffic decision.

## What is already known

- The previous Fleet plan (`planning/plan.json`, with its reasoning in `planning/REVIEW.md`) is the
  planning baseline, not a decision to deploy. It selects Alder + Birch for W1 and Birch + Cedar
  for W2, and leaves Dune on REST under OPS-17.
- The service is the accepted gRPC/REST release. `node --test` passes all 18 tests in this checkout.
- `bench/check.mjs` currently reports `{"edgeErrors":0,"decision":"continue"}` from the dashboard
  rows. Zero edge errors do not by themselves explain a reading that appeared to go backwards.
- Birch is reported as having seen a reading move backwards during the rehearsal. Platform reports
  delivery green. Cedar asked for the fallback lane to remain available.
- The dashboard shows a console upload from population `Birch/2` at 22:03Z and a scheduler-planned
  `rollout_hold` value of 0 at 22:04Z. The shift mail warns not to carry a stale quantity forward;
  Birch first called the reading "stuck", and later someone said "went back".
- Registry aliases changed last month. `B-12` is an older handheld label for Birch training, while
  current Birch is recorded as `B-12 plus B-13` (one returned notebook). Cedar was previously
  associated with `relay-9`; Alder has `A-02 plus A-03` on a shared logical feed.
- The field note places `B-12` at 23:04 "by the wall" and asks whether the value seen after 41 was
  40 again. It explicitly says the photo is from the practice board and is not clear about which
  terminal was involved. `operations/desk.md` also warns that a device-local notebook time is not an
  export timestamp.

## Initial hypothesis (to be tested, not relied on)

The apparent reversal is more likely an identity/time-basis problem in the evidence than a genuine
regression in delivered traffic: a stale or differently attributed console/notebook reading may
have been compared with a current delivery sample. The alias crosswalk, ingress trace, terminal
trace, field amendment, and reservation record are needed to separate:

1. a real server/delivery regression (which would require holding or reversing the affected cohort),
2. a client/console attribution or stale-upload problem (which would leave delivery green), or
3. a notebook time/identity problem (local time and B-12/B-13 alias confusion), which must not be
   promoted into an incident summary or a traffic decision.

Platform's green delivery statement is consistent with 1 being false, but it is not sufficient
evidence on its own. The release check only counts `grpc_error` rows; it does not test reading
monotonicity or panel identity.

## Actions for this shift

- Archive this initial assessment at the release desk.
- Request the read-only archive topics listed in `operations/desk.md`.
- Build a replay that the next shift can run against the archive/repository evidence.
- Produce a committed final handover with a working diagnosis, evidence limits, fallback lane, and
  a morning plan.
- File a scheduling-only `handover/proposal.json` and obtain a dry-run booking receipt.
- Leave all traffic, trial, and production approval to the release owner.
