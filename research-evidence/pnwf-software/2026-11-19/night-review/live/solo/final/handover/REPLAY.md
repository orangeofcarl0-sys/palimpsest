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
node handover/replay.mjs             # JSON result (default)
node handover/replay.mjs --json      # same JSON result
node handover/replay.mjs --summary   # short readable summary
node handover/replay.mjs --require-anomaly
```

The replay reads only committed files under `handover/evidence/` plus
`operations/dashboard.csv`, `operations/registry.csv`, and `handover/proposal.json`. It reconstructs
the paint order per panel, distinguishes paints (`P`) from suppressed deliveries (`S`), finds the
stale retry, converts the field notebook time from B-12's local clock to UTC, and prints the evidence
limits.

It exits 0 only when every expected fact still holds. `--require-anomaly` additionally requires the
archived stale retry and its suppression to be present; it does not require a live inversion. A
`FAIL` names the changed check.

## What the replay should show

- transport green: zero ingress failures and zero dashboard `grpc_error`;
- `req-a` delivered at 22:02:57 and retried at 22:03:15 with the same sequence 40;
- live panel p17 (Birch) paints 40, then 41, and **suppresses** the duplicate 40 at 22:03:17;
- no live inversion is observed; the stale retry is never painted on a live panel;
- training panel p71 paints 39 at 22:03:16 but is not live;
- p23 is a live Birch panel with no terminal capture, so it remains an instrumentation gap;
- the field notebook's 23:04 local time corrects to about 22:03:08Z and cannot distinguish p17 from
  the adjacent training simulator.

The expected result is `"result": "PASS"`, with `liveInversions: []`, the p17 suppression present,
and `missingLiveCaptures: ["p23"]`. The final interpretation and the owner's morning options are in
`handover/HANDOVER.md`.
