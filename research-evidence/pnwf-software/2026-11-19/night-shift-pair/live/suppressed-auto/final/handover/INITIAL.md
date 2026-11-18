# Overnight dispatch — initial written assessment

Status: working diagnosis before the shift-boundary archive requests. This is not a production
approval and it does not move traffic.

## What is established from the repository at this shift boundary

- The current release tests pass: `node --test` reports 18/18 passing, covering REST compatibility,
  the five-byte gRPC frame, `GetReading`, `StreamReadings`, the Fleet zero/omitted default of three,
  source order, and unknown-site errors.
- `bench/check.mjs` reads `operations/dashboard.csv` and sums only the `grpc_error` series. It reports
  `edgeErrors: 0` and `decision: "continue"`. That check does **not** evaluate the `console_upload`
  or `rollout_hold` rows, nor does it test ordering, freshness, or a backwards reading.
- The 22:02/22:03 edge counters are 480 and 482 completed calls with zero errors. The same minute
  records one console panel upload (`Birch/2`) and a scheduler-planned `rollout_hold` of 0 sites.
- The current Fleet planning baseline (`planning/plan.json`) selects Alder + Birch for W1 and
  Birch + Cedar for W2, with Dune on REST in both windows. The plan is a planning baseline, not a
  deployment.
- The released service behaviour is the 2026-11-10 correction: an omitted or zero `StreamReadings`
  limit means the first three readings in source order. The old comment in `proto/energy.proto` is
  stale by explicit design; the proto file is deliberately unchanged.

## Working diagnosis (to be checked against the archive)

The report is not yet evidence of a service-side backwards reading. "Stuck" and "went back" are
operator descriptions, and the only supporting note is a field-notebook entry tied to the older
handheld label `B-12`, from a practice board, at a device-local time. The current registry maps
`Birch` to `B-12` plus `B-13` and records one returned notebook. A display/console or alias/timestamp
explanation is at least as plausible as a server regression, and the existing release check cannot
distinguish them because it ignores the console-upload and hold rows.

The unresolved question is whether a monotonicity/freshness expectation was actually agreed. The
dispatch note says no maximum stale interval was agreed tonight, so "went backwards" cannot be
turned into a specific freshness failure without a source record.

## What must not happen before the evidence is read

- Do not widen the rollout on the strength of the green edge error count.
- Do not carry the "stuck"/"went back" quantity onto the morning board as a measured value.
- Do not change service code, protocol field numbers, REST routes, or traffic. Only the release
  owner can move traffic.
- Do not use the field note's author's name in an incident summary until the terminal/alias is
  confirmed.

## Next evidence to request

The release desk archive is the authoritative next read: inventory (alias crosswalk), ingress
(gateway trace), terminal (operator-console trace), field (calibration and ticket amendment), and
reservation (fallback booking). The final handover will record which archive items were read, what
they established, and what remains an instrumentation gap.
