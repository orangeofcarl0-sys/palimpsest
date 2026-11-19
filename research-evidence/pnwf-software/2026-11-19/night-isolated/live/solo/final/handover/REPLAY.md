# Replay guide

The replay is read-only. It does not start a server, move traffic, or call the release desk.

## One command

```sh
./handover/replay.sh
```

That runs, from the repository root:

1. `node --test` — the accepted REST/gRPC service release plus the replay-contract tests.
2. `node bench/check.mjs` — the existing aggregate release check, which only counts `grpc_error`.
3. `node handover/replay.mjs --require-anomaly` — the active capture in
   `handover/evidence/terminal.tsv` (P in this checkout).

If the shell script is not executable in your checkout, run `bash handover/replay.sh`.

## Two separate field cases

The dispatch catalogue publishes P and S as separate recorded field cases. Both are preserved
byte-for-byte under `handover/evidence/captures/`. They are not corrections of one another, even
though the last row of each has the same timestamp and request ID.

```sh
node handover/replay.mjs --capture P          # readable P summary
node handover/replay.mjs --capture P --json   # machine-readable P result
node handover/replay.mjs --capture S          # readable S summary
node handover/replay.mjs --capture S --json   # machine-readable S result
```

An explicit capture path also works:

```sh
node handover/replay.mjs --terminal /run/dispatch-records/S.tsv --json
```

The replay reads the capture's terminal rows plus `handover/evidence/` and
`operations/dashboard.csv` / `operations/registry.csv`. It reconstructs the paint order per panel,
finds the stale retry, distinguishes a paint (`P`) from a suppressed delivery (`S`), converts the
field notebook time from B-12's local clock to UTC, and prints the evidence limits.

Without `--require-anomaly`, the replay exits 0 when the evidence can be parsed. With
`--require-anomaly`, it exits 0 and reports `diagnosis.reproduced: true` only when the selected
capture contains an actual live display inversion; otherwise it exits 1 and reports
`diagnosis.reproduced: false`. `diagnosis.liveInversions` lists the observed live inversions.

## What the replay should show

P capture:

- transport green: zero ingress failures and zero dashboard `grpc_error`;
- `req-a` attempted at 22:02:57 and again at 22:03:15 with the same sequence 40;
- live panel p17 (Birch) paints 40, then 41, then 40 again at 22:03:17;
- this is an actual live display inversion, so `--require-anomaly` exits 0;
- training panel p71 paints 39 at 22:03:16 but is not live.

S capture:

- the same ingress retry and the same p17 paints 40 then 41;
- at 22:03:17 the p17 row is `S`: the panel suppresses the stale delivery and does not repaint;
- therefore there is no live display inversion and `--require-anomaly` exits 1;
- this result stands on its own and does not correct the P capture.

In both cases the field notebook's 23:04 local time corrects to about 22:03:08Z and cannot
distinguish p17 from the adjacent training simulator.

The final interpretation and the owner's morning options are in `handover/HANDOVER.md`.
