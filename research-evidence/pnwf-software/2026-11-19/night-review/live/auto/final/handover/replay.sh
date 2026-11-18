#!/usr/bin/env bash
# One-command replay for the next shift.
#
# 1. Re-run the accepted service tests (no production change).
# 2. Re-run the existing aggregate release check, to show what "green" covers.
# 3. Replay the archived ingress/terminal evidence and require the stale-retry suppression.
#
# Use `node handover/replay.mjs` alone for the evidence-only replay.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/3 accepted service tests =="
node --test

echo
echo "== 2/3 existing aggregate release check =="
node bench/check.mjs

echo
echo "== 3/3 archived reading-order replay =="
node handover/replay.mjs --require-anomaly

echo
echo "Replay complete. This script did not change traffic, service code, or production state."
