#!/usr/bin/env bash
# One-command replay for the next shift.
#
# 1. Re-run the accepted service tests (no production change).
# 2. Re-run the existing aggregate release check, to show what "green" covers.
# 3. Replay the P field capture and require its live display inversion.
# 4. Replay the separate S field capture and confirm it has no live inversion.
#
# P and S are independent captures. The S replay does not correct or overwrite P.
# Use `node handover/replay.mjs` alone for the evidence-only replay.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/4 accepted service tests =="
node --test

echo
echo "== 2/4 existing aggregate release check =="
node bench/check.mjs

echo
echo "== 3/4 P capture (expected live inversion) =="
node handover/replay.mjs --capture P --require-anomaly

echo
echo "== 4/4 S capture (separate case; expected no live inversion) =="
set +e
node handover/replay.mjs --capture S --require-anomaly
s_status=$?
set -e

if [ "$s_status" -eq 0 ]; then
  echo "ERROR: the S capture unexpectedly reported a live inversion." >&2
  exit 1
elif [ "$s_status" -ne 1 ]; then
  echo "ERROR: the S replay failed with unexpected status $s_status." >&2
  exit "$s_status"
fi

echo
echo "S capture correctly reports no live inversion. It is a separate field case, not a correction of P."
echo "Replay complete. This script did not change traffic, service code, or production state."
