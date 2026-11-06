#!/usr/bin/env bash
# PNWF serial launcher. No credential copying, global proxy killing, or implicit paid smoke.
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
: "${ALHS_CORE_RUN:?set ALHS_CORE_RUN to a freshly prepared run}"
: "${PNWF_COHORT_FILE:?set PNWF_COHORT_FILE}"
: "${PNWF_BUDGET_DB:?set PNWF_BUDGET_DB to the initialized request ledger}"
: "${PNWF_PROVIDER_CONFIG:?set PNWF_PROVIDER_CONFIG to this mock instance}"
MODE="${PNWF_EXECUTION_MODE:-paid}"
for stage in software energy; do
  node "$REPO/scripts/pnwf/run_pnwf_live.mjs" \
    --cohort="$PNWF_COHORT_FILE" --mode="$MODE" \
    --out="$ALHS_CORE_RUN/out/gate" \
    --adapter="$REPO/scripts/pnwf/container_adapter.mjs" \
    --execute --session="$stage"
done
