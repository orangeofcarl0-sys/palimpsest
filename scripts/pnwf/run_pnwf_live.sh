#!/usr/bin/env bash
# PNWF continuation cohort — two real-model sessions on copies of the recorded PSVR-C A-2 states.
#
# This script does not create a new task or re-run the original work. It resumes the recorded project
# (direct commit + ACTIVE task + RUNNING attempt) under the PNWF build, with the exact PSVR-C A2
# continuation prompt. The fail-closed gate requires research-evidence/pnwf/live/authorization-
# pnwf-continuation.json before any provider call.
#
# PNWF-CQ-F: a paid run now also requires an EVALUATION_ISOLATION_QUALIFIED record whose
# principalRuntime is "container". Set PNWF_ISOLATION_RECORD to that record. The current host launch
# below is NOT containerized, so without a containerized adapter this script fails closed at the gate.
set -euo pipefail

REPO="$(pwd)"
BASE="${PNWF_LIVE_BASE:-$HOME/pnwf-live}"
RUN="$BASE/run"
COHORT_FILE="$REPO/research-evidence/pnwf/live/cohort-pnwf-continuation.json"
AUTH="$REPO/research-evidence/pnwf/live/authorization-pnwf-continuation.json"
CODE_FREEZE="$(git -C "$REPO" rev-parse HEAD)"
DSH_BIN="${PNWF_DSH_BIN:-/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js}"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="${PNWF_DSH_MODULES:-$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai}"
SEAM="$BASE/seam"
PROXY_PORT="${PNWF_PROXY_PORT:-18091}"

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin missing at $DSH_BIN" >&2; exit 2; fi
if [ ! -f "$DSH_HOME_REAL/.credentials.yaml" ]; then echo "owner credential store missing" >&2; exit 2; fi
if [ ! -f "$COHORT_FILE" ]; then echo "cohort missing at $COHORT_FILE" >&2; exit 2; fi
if [ ! -f "$AUTH" ]; then echo "authorization missing at $AUTH" >&2; exit 2; fi
if [ ! -d "$SEAM/node_modules/@deepseek-ai/dsh-win32-process" ]; then
  mkdir -p "$SEAM"
  npm install --prefix "$SEAM" @deepseek-ai/dsh-win32-process@0.2.1-rc.5 --no-save --no-package-lock >/dev/null 2>&1
fi

node "$REPO/scripts/pnwf/prepare_continuation.mjs" --run="$RUN" --repo="$REPO" > "$BASE/prepare.json"
mkdir -p "$RUN/out/gate"

profile() {
  local home="$1"; local deployment="$2"
  cat > "$home/profiles/alhs-core/package.json" <<'JSON'
{ "name": "dsh-profile-alhs-core", "private": true, "dependencies": {}, "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } } }
JSON
  cat > "$home/profiles/alhs-core/cordis.patch.yml" <<YAML
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:${PROXY_PORT}
    apiKeyEnv: C6R_PLACEHOLDER
- id: llm-pi-ai
  disabled: true
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-flash
- id: permission
  config:
    presets:
      read-only: { sandbox: read-only, approval: never }
      workspace-write: { sandbox: workspace-write, approval: never }
      danger-full-access: { sandbox: danger-full-access, approval: never }
    defaultPreset: workspace-write
- id: session-title-llm
  disabled: true
- id: tool-web
  disabled: true
- id: palimpsest-tools
  config:
    palimpsestEntry: '$(cygpath -w "$REPO/dist/src/advanced.js" | sed 's|\\|/|g')'
    deploymentProfile: '$(cygpath -w "$deployment" | sed 's|\\|/|g')'
    serve: false
    openDashboard: false
YAML
}

for stage in software energy; do
  HOME_SESSION="$RUN/home-$stage"
  rm -rf "$HOME_SESSION"
  mkdir -p "$HOME_SESSION/profiles/node_modules" "$HOME_SESSION/profiles/alhs-core" "$RUN/tmp" "$RUN/worker-logs"
  cp "$DSH_HOME_REAL/.credentials.yaml" "$HOME_SESSION/.credentials.yaml"
  cat > "$HOME_SESSION/settings.yaml" <<'YAML'
agent-default-model:
  provider: deepseek-official
  model: deepseek-flash
YAML
  cmd //c mklink //J "$(cygpath -w "$HOME_SESSION/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null
  cp -r "$REPO/host/dsh" "$HOME_SESSION/profiles/node_modules/palimpsest-dsh-host"
  cp -r "$REPO/host/deployment" "$HOME_SESSION/profiles/node_modules/palimpsest-host-deployment"
  profile "$HOME_SESSION" "$RUN/stages/$stage/deployment.json"
done

export ALHS_CORE_RUN="$RUN"
export ALHS_DSH_BIN="$(cygpath -w "$DSH_BIN")"
export ALHS_DSH_ROOT="$(cygpath -w "$SEAM")"
export ALHS_REPOSITORY="$REPO"
export C6R_PLACEHOLDER="c6r-placeholder-not-a-credential"

node "$REPO/scripts/pnwf/run_pnwf_live.mjs" --cohort="$COHORT_FILE" --out="$RUN/out/gate" > "$RUN/out/gate-plan.json" 2> "$RUN/out/gate-plan.err"

if [ "${PNWF_SETUP_ONLY:-0}" = "1" ]; then
  echo "setup-only: copied states, profiles and the fail-closed gate plan are ready; no model session started"
  exit 0
fi

for pid in $(powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*provider_proxy_tcp.mjs*' } | Select-Object -ExpandProperty ProcessId" | tr -d '\r'); do
  taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
done
sleep 1
if curl -s --max-time 2 "http://127.0.0.1:${PROXY_PORT}/" >/dev/null 2>&1; then
  echo "a stale proxy is already listening on ${PROXY_PORT}; stop it before this run" >&2
  exit 7
fi
C6R_PROVIDER_KIND=anthropic C6R_PROXY_PORT="$PROXY_PORT" \
  C6R_UPSTREAM="https://api.deepseek.com/anthropic" \
  C6R_CREDENTIAL_FILE="$DSH_HOME_REAL/.credentials.yaml" \
  C6R_PROXY_LOG="$RUN/out/proxy.jsonl" \
  node "$REPO/scripts/lhape/provider_proxy_tcp.mjs" > "$RUN/out/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'taskkill //PID "$PROXY_PID" //T //F >/dev/null 2>&1 || true' EXIT
for _ in $(seq 1 100); do
  if curl -s --max-time 1 "http://127.0.0.1:${PROXY_PORT}/" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
if ! kill -0 "$PROXY_PID" 2>/dev/null; then
  echo "the provider proxy did not start" >&2; cat "$RUN/out/proxy.log" >&2 || true; exit 5
fi

for stage in software energy; do
  ISOLATION_ARGS=()
  if [ -n "${PNWF_ISOLATION_RECORD:-}" ]; then ISOLATION_ARGS=(--isolation="$PNWF_ISOLATION_RECORD"); fi
  node "$REPO/scripts/pnwf/run_pnwf_live.mjs" \
    --cohort="$COHORT_FILE" \
    --authorization="$AUTH" \
    --out="$RUN/out/gate" \
    --adapter="$REPO/scripts/psvr/adapter.mjs" \
    ${ISOLATION_ARGS[@]+"${ISOLATION_ARGS[@]}"} \
    --execute \
    --session="$stage" \
    >> "$RUN/out/cohort-run.json" 2>> "$RUN/out/cohort-run.err" || true
done

node "$REPO/scripts/pnwf/score_continuation.mjs" --run="$RUN" --cohort="$COHORT_FILE" > "$RUN/out/score.json" 2> "$RUN/out/score.err" || true
echo "score:"; cat "$RUN/out/score.json" 2>/dev/null || true
