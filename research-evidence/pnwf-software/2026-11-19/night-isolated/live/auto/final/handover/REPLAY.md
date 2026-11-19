# Replay guide

The replay is read-only. It does not start a server, move traffic, call the release desk, or edit
either capture.

## Two separate field cases

P and S are independent recorded field cases, not two versions of one trace and not corrections of
each other. A matching timestamp or request ID across the cases does not make either one authoritative
over the other. The replay always evaluates **one** capture at a time:

- `P` — p17 paints sequence 40, then 41, then paints the stale `req-a` sequence 40 again.
- `S` — p17 paints sequence 40, then 41, then suppresses the stale `req-a` sequence 40.

`S` is a suppression event (`S`), not a paint (`P`). It must never be merged into, subtracted from, or
used to rewrite the `P` trace.

Both captures are preserved byte-for-byte:

| Case | Preserved copy | Contract SHA-256 |
| --- | --- | --- |
| P | `handover/evidence/P.tsv` | `c76bb857…b8bc68a` |
| S | `handover/evidence/S.tsv` | `77f6d9a5…2d5caa5e` |

`handover/evidence/terminal.tsv` remains the working checkout's P capture. `terminal-P.tsv` and
`terminal-S.tsv` are convenience copies of the same two captures. The replay identifies a capture by
its SHA-256 as well as by the path supplied.

## One command

```sh
./handover/replay.sh
```

That runs, from the repository root:

1. `node --test` — the accepted REST/gRPC service release (18 tests).
2. `node bench/check.mjs` — the existing aggregate release check, which only counts `grpc_error`.
3. `node handover/replay.mjs --capture P --require-anomaly` — must exit 0 and report a live inversion.
4. `node handover/replay.mjs --capture S --require-anomaly` — must exit 1 and report no live inversion.

If the shell script is not executable in your checkout, run `bash handover/replay.sh`.

## Evidence-only replay

```sh
node handover/replay.mjs                      # working checkout capture (P), readable summary
node handover/replay.mjs --json               # machine-readable result for the P capture
node handover/replay.mjs --capture P --json   # preserved P capture
node handover/replay.mjs --capture S --json   # preserved S capture
node handover/replay.mjs --capture /run/dispatch-records/S.tsv --json
```

`--case`, `--input`, `--terminal`, `--trace`, `--source`, a positional capture path, and the
environment variables `DISPATCH_CAPTURE`, `CAPTURE` and `TERMINAL_CAPTURE` select the same input.
The existing `--json` interface is unchanged: stdout is one JSON object.

## `--require-anomaly`

In each capture, `--require-anomaly` requires an **actual live display inversion** in that capture:

- P: exit `0`, `diagnosis.reproduced: true`, and `diagnosis.liveInversions` contains the p17
  sequence-41 → sequence-40 paint at 22:03:17.
- S: exit `1`, `diagnosis.reproduced: false`, and `diagnosis.liveInversions` is empty.

A transport retry alone is not an inversion. A training-simulator paint is not live traffic. An `S`
row is not a paint.

## What each replay reconstructs

- transport green: zero ingress failures and zero dashboard `grpc_error`;
- `req-a` attempted at 22:02:57 and again at 22:03:15 with the same sequence 40;
- live p17 paints 40 then 41 in both cases;
- P then paints 40 again at 22:03:17, while S suppresses that delivery at 22:03:17;
- training panel p71 paints 39 at 22:03:16 but is not live;
- p23 has no terminal capture in either case (instrumentation gap);
- the field notebook's 23:04 local time corrects to about 22:03:08Z and cannot distinguish p17 from
  the adjacent training simulator.

The final interpretation and the owner's morning options are in `handover/HANDOVER.md`.
