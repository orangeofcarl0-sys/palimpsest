#!/usr/bin/env bash
# APS-C bounded real-model pilot — F/L/G, one session each, hard token guard.
#
# This is a PILOT, not the full APS-C long-horizon cohort. It uses the real DeepSeek provider via
# the owner's DSH credential store and the Windows CONNECT proxy. The cohort runner refuses without
# the exact authorization file, and the budget guard terminates a session above 2.5M reported tokens.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${APS_BASE:-$HOME/aps}"
RUN="$BASE/pilot"
EVIDENCE="$REPO/research-evidence/aps/live/aps-pilot-2026-11-03"
PRODUCT="$BASE/product"
DSH="$HOME/c6r/dsh/node_modules/.bin/dsh"
CREDENTIAL_FILE="/mnt/c/Users/66494/.dsh/.credentials.yaml"
PROXY_AGENT="/home/admini/c6r/dsh/node_modules/https-proxy-agent/dist/index.js"

if [ ! -x "$DSH" ]; then
  echo "DSH is not installed at $DSH" >&2
  exit 2
fi
if [ ! -f "$CREDENTIAL_FILE" ]; then
  echo "the owner credential store is not available at $CREDENTIAL_FILE" >&2
  exit 2
fi

mkdir -p "$BASE" "$RUN/out" "$EVIDENCE"
rm -rf "$PRODUCT"
cp -r "$HOME/c6r/product" "$PRODUCT"
rm -rf "$PRODUCT/dist" "$PRODUCT/host" "$PRODUCT/scripts/aps"
cp -r "$REPO/dist" "$PRODUCT/dist"
cp -r "$REPO/host" "$PRODUCT/host"
mkdir -p "$PRODUCT/scripts/aps"
cp "$REPO"/scripts/aps/*.mjs "$PRODUCT/scripts/aps/"
cp "$REPO/scripts/c6r/net_bridge.mjs" "$RUN/out/net_bridge.mjs"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/aps/session_pilot.sh" "$BASE/session_pilot.sh"

CODE_FREEZE=$(git -C "$REPO" rev-parse HEAD)
node "$PRODUCT/scripts/aps/prepare_pilot.mjs" --run="$RUN" --repo="$REPO" --codeFreeze="$CODE_FREEZE" > "$RUN/out/prepare.json"

C6R_PROVIDER_KIND=anthropic C6R_PROXY_SOCKET="$RUN/out/provider.sock" \
  C6R_UPSTREAM="https://api.deepseek.com/anthropic" \
  C6R_UPSTREAM_PROXY="http://127.0.0.1:7890" C6R_UPSTREAM_PROXY_AGENT="$PROXY_AGENT" \
  C6R_CREDENTIAL_FILE="$CREDENTIAL_FILE" C6R_PROXY_LOG="$RUN/out/proxy.jsonl" \
  node "$BASE/provider_proxy.mjs" > "$RUN/out/proxy.log" 2>&1 &
PROXY_PID=$!
cleanup() {
  kill "$PROXY_PID" 2>/dev/null || true
  wait "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 100); do
  if [ -S "$RUN/out/provider.sock" ]; then break; fi
  sleep 0.1
done
if [ ! -S "$RUN/out/provider.sock" ]; then
  echo "the provider proxy socket did not appear" >&2
  exit 5
fi

set +e
node "$REPO/scripts/aps/run_cohort.mjs" \
  --cohort="$RUN/cohort.json" \
  --authorization="$RUN/authorization.json" \
  --execute=true \
  > "$RUN/out/cohort-run.json" 2> "$RUN/out/cohort-run.err"
RUN_STATUS=$?
set -e

node "$REPO/scripts/aps/score_pilot.mjs" --run="$RUN" --evidence="$EVIDENCE" > "$RUN/out/score-summary.json" 2> "$RUN/out/score.err" || true
cp "$RUN/cohort.json" "$RUN/authorization.json" "$RUN/pilot.json" "$EVIDENCE/"
cp "$RUN/out/cohort-run.json" "$RUN/out/cohort-run.err" "$RUN/out/proxy.jsonl" "$RUN/out/proxy.log" "$EVIDENCE/" 2>/dev/null || true
cp "$RUN/out/score-summary.json" "$RUN/out/score.err" "$EVIDENCE/" 2>/dev/null || true
for condition in F L G; do
  cp "$RUN/out/$condition/run.log" "$EVIDENCE/$condition-run.log" 2>/dev/null || true
  cp "$RUN/out/$condition/run.err" "$EVIDENCE/$condition-run.err" 2>/dev/null || true
  cp "$RUN/out/$condition/exit-code.txt" "$EVIDENCE/$condition-exit-code.txt" 2>/dev/null || true
  cp "$RUN/worlds/$condition/deliverables/selection.md" "$EVIDENCE/$condition-selection.md" 2>/dev/null || true
done

echo "cohort status=$RUN_STATUS"
cat "$RUN/out/score-summary.json" 2>/dev/null || true
exit "$RUN_STATUS"
