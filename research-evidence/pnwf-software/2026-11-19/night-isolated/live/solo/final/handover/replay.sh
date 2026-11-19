#!/usr/bin/env bash
# One-command replay for the next shift.
#
# 1. Re-run the accepted service and replay-contract tests (no production change).
# 2. Re-run the existing aggregate release check, to show what "green" covers.
# 3. Replay the archived ingress/terminal evidence and require the live inversion.
#
# Use `node handover/replay.mjs` alone for the evidence-only replay.
# Extra arguments are passed through, e.g. `./handover/replay.sh --capture S --json`.
# Capture S correctly exits 1 under --require-anomaly because it has no live inversion.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/3 service and replay-contract tests =="
node --test

echo
echo "== 2/3 existing aggregate release check =="
node bench/check.mjs

echo
echo "== 3/3 archived reading-order replay =="
node handover/replay.mjs --require-anomaly "$@"

echo
echo "Replay complete. This script did not change traffic, service code, or production state."
