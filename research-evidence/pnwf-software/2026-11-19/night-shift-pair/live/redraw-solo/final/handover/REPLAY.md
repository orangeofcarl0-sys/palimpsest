# Replay guide

The replay is read-only. It does not start a server, move traffic, or call the release desk.

## One command

```sh
./handover/replay.sh
```

That runs, from the repository root:

1. `node --test` — the accepted REST/gRPC service release (18 tests).
2. `node bench/check.mjs` — the existing aggregate release check, which only counts `grpc_error`.
3. `node handover/replay.mjs --require-anomaly` — the archived evidence replay.

If the shell script is not executable in your checkout, run `bash handover/replay.sh`.

## Evidence-only replay

```sh
node handover/replay.mjs          # readable summary
node handover/replay.mjs --json   # machine-readable result
```

The replay reads only committed files under `handover/evidence/` plus
`operations/dashboard.csv` and `operations/registry.csv`. It reconstructs the paint order per panel,
finds the stale retry, converts the field notebook time from B-12's local clock to UTC, and prints
the evidence limits. It exits 0 when the evidence is parsed; with `--require-anomaly` it exits 1 if
the live inversion is absent.

## What the replay should show

- transport green: zero ingress failures and zero dashboard `grpc_error`;
- `req-a` attempted at 22:02:57 and again at 22:03:15 with the same sequence 40;
- live panel p17 (Birch) paints 40, then 41, then 40 again at 22:03:17;
- training panel p71 paints 39 at 22:03:16 but is not live;
- the field notebook's 23:04 local time corrects to about 22:03:08Z and cannot distinguish p17 from
  the adjacent training simulator.

The final interpretation and the owner's morning options are in `handover/HANDOVER.md`.
