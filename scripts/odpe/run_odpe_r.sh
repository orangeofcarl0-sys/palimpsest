#!/usr/bin/env bash
# ODPE-R cohort — interrupted work: native F+Finish vs the adaptive product A.
#
# The fail-closed gate refuses without research-evidence/odpe/live/authorization-odpe-r.json.
# The credential is read only from the external DSH store; the local proxy injects it and logs only
# request metadata. Nothing here scores or reads evaluator material during a session.
set -euo pipefail

REPO="$(pwd)"
BASE="${ODPE_BASE:-$HOME/odpe-r}"
RUN="$BASE/run-2026-11-05"
COHORT="odpe-r-2026-11-05"
COHORT_STAGE="odpe-r"
COHORT_FILE="$REPO/research-evidence/odpe/live/cohort-odpe-r.json"
AUTH="$REPO/research-evidence/odpe/live/authorization-odpe-r.json"
CODE_FREEZE="$(git -C "$REPO" rev-parse HEAD)"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
SEAM="$BASE/seam"
PROXY_PORT=18088

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin missing at $DSH_BIN" >&2; exit 2; fi
if [ ! -f "$DSH_HOME_REAL/.credentials.yaml" ]; then echo "owner credential store missing" >&2; exit 2; fi
if [ ! -d "$SEAM/node_modules/@deepseek-ai/dsh-win32-process" ]; then
  mkdir -p "$SEAM"
  npm install --prefix "$SEAM" @deepseek-ai/dsh-win32-process@0.2.1-rc.5 --no-save --no-package-lock >/dev/null 2>&1
fi

node "$REPO/scripts/odpe/prepare_odpe_r.mjs" --run="$RUN" --cohort="$COHORT" --codeFreeze="$CODE_FREEZE" > "$BASE/prepare.json"
mkdir -p "$RUN/out"

PROFILE_PATCH_F() {
  local home="$1"
  cat > "$home/profiles/alhs-core/package.json" <<'JSON'
{ "name": "dsh-profile-alhs-core", "private": true, "dependencies": {}, "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base"], "patchReload": "startup" } } }
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
YAML
}

PROFILE_PATCH_PAL() {
  local home="$1"
  local condition="$2"
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
    deploymentProfile: '$(cygpath -w "$RUN/deployments/$condition.json" | sed 's|\\|/|g')'
    serve: false
    openDashboard: false
YAML
}

IDS="F-1 F-2 A-1 A-2"
for id in $IDS; do
  HOME_SESSION="$RUN/home-$id"
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
  case "$id" in
    F-*) PROFILE_PATCH_F "$HOME_SESSION" ;;
    A-*) PROFILE_PATCH_PAL "$HOME_SESSION" "A" ;;
  esac
done

export ALHS_CORE_RUN="$RUN"
export ALHS_DSH_BIN="$(cygpath -w "$DSH_BIN")"
export ALHS_DSH_ROOT="$(cygpath -w "$SEAM")"
export ALHS_REPOSITORY="$REPO"
export C6R_PLACEHOLDER="c6r-placeholder-not-a-credential"

if [ "${ODPE_SETUP_ONLY:-0}" = "1" ]; then
  node "$REPO/scripts/alhs/run_cohort.mjs" --cohort="$COHORT_FILE" --stage="$COHORT_STAGE" --out="$RUN/out/gate" > "$RUN/out/gate-plan.json" 2> "$RUN/out/gate-plan.err"
  echo "setup-only: worlds, profiles and the fail-closed gate plan are ready; no model session started"
  exit 0
fi
if [ ! -f "$AUTH" ]; then echo "PWRS-R authorization missing at $AUTH" >&2; exit 2; fi

for pid in $(powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*provider_proxy_tcp.mjs*' } | Select-Object -ExpandProperty ProcessId" | tr -d '\r'); do
  echo "stopping stale provider proxy $pid"
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
  echo "the provider proxy did not start" >&2
  cat "$RUN/out/proxy.log" >&2 || true
  exit 5
fi

node "$REPO/scripts/alhs/run_cohort.mjs" \
  --cohort="$COHORT_FILE" \
  --authorization="$AUTH" \
  --stage="$COHORT_STAGE" \
  --out="$RUN/out/gate" \
  --adapter="$REPO/scripts/pwrs/interruption_adapter.mjs" \
  --execute \
  > "$RUN/out/cohort-run.json" 2> "$RUN/out/cohort-run.err" || true

if [ -s "$RUN/out/gate/run-state.json" ]; then
  node "$REPO/scripts/pwrs/score_pwrs_r.mjs" --run="$RUN" > "$RUN/out/score.json" 2> "$RUN/out/score.err" || true
else
  echo "no run-state.json: the cohort did not start any session; score skipped" > "$RUN/out/score.err"
fi

echo "cohort:"; cat "$RUN/out/cohort-run.json" 2>/dev/null || true
echo "score:"; cat "$RUN/out/score.json" 2>/dev/null || true
