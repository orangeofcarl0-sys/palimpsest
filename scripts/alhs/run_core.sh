#!/usr/bin/env bash
# ALHS-C core cohort — F and A, two real-model sessions each, 3M per session with a 150k reserve.
#
# The cohort gate refuses without research-evidence/alhs/live/authorization.json. The credential is
# read only from the external DSH store; the local proxy injects it, and only request metadata is
# logged. Nothing in this script scores or reads evaluator material during a session.
set -euo pipefail

REPO="$(pwd)"
BASE="${ALHS_BASE:-$HOME/alhs}"
STAGE="${ALHS_STAGE:-core}"
if [ "$STAGE" = "repeat" ]; then
  COHORT_STAGE="repeat-core"
  RUN="$BASE/repeat-core-2026-11-04"
  COHORT="alhs-c-repeat-2026-11-04"
  COHORT_FILE="$REPO/research-evidence/alhs/live/cohort-repeat-pre-registration.json"
  AUTH="$REPO/research-evidence/alhs/live/authorization-repeat.json"
else
  COHORT_STAGE="core"
  RUN="$BASE/core-2026-11-04"
  COHORT="alhs-c-2026-11-04"
  COHORT_FILE="$REPO/research-evidence/alhs/live/cohort-pre-registration.json"
  AUTH="$REPO/research-evidence/alhs/live/authorization.json"
fi
CODE_FREEZE="$(git -C "$REPO" rev-parse HEAD)"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
SEAM="$BASE/seam"
PROXY_PORT=18087

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin missing at $DSH_BIN" >&2; exit 2; fi
if [ ! -f "$DSH_HOME_REAL/.credentials.yaml" ]; then echo "owner credential store missing" >&2; exit 2; fi
if [ ! -d "$SEAM/node_modules/@deepseek-ai/dsh-win32-process" ]; then
  mkdir -p "$SEAM"
  npm install --prefix "$SEAM" @deepseek-ai/dsh-win32-process@0.2.1-rc.5 --no-save --no-package-lock >/dev/null 2>&1
fi

node "$REPO/scripts/alhs/prepare_core.mjs" --run="$RUN" --cohort="$COHORT" --stage="$STAGE" --codeFreeze="$CODE_FREEZE" > "$BASE/prepare-$STAGE.json"
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

PROFILE_PATCH_A() {
  local home="$1"
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
    deploymentProfile: '$(cygpath -w "$RUN/deployments/A.json" | sed 's|\\|/|g')'
    serve: false
    openDashboard: false
YAML
}

SUFFIX=""
[ "$STAGE" = "repeat" ] && SUFFIX="b"
for id in "F-1$SUFFIX" "F-2$SUFFIX" "A-1$SUFFIX" "A-2$SUFFIX"; do
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
    A-*) PROFILE_PATCH_A "$HOME_SESSION" ;;
  esac
done

export ALHS_CORE_RUN="$RUN"
export ALHS_DSH_BIN="$(cygpath -w "$DSH_BIN")"
export ALHS_DSH_ROOT="$(cygpath -w "$SEAM")"
export ALHS_REPOSITORY="$REPO"
export C6R_PLACEHOLDER="c6r-placeholder-not-a-credential"

if [ "${ALHS_SETUP_ONLY:-0}" = "1" ]; then
  echo "setup-only: worlds and profiles are ready; no model session started"
  exit 0
fi
if [ ! -f "$AUTH" ]; then echo "ALHS authorization missing at $AUTH" >&2; exit 2; fi

# A previous run can leave the dedicated provider proxy alive if the shell trap was skipped.
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
  --adapter="$REPO/scripts/alhs/run_core_session.mjs" \
  --execute \
  > "$RUN/out/cohort-run.json" 2> "$RUN/out/cohort-run.err" || true

if [ -s "$RUN/out/gate/run-state.json" ]; then
  node "$REPO/scripts/alhs/score_core.mjs" --run="$RUN" > "$RUN/out/score-summary.json" 2> "$RUN/out/score.err" || true
else
  echo "no run-state.json: the cohort did not start any session; score skipped" > "$RUN/out/score.err"
fi

echo "cohort:"; cat "$RUN/out/cohort-run.json" 2>/dev/null || true
echo "score:"; cat "$RUN/out/score-summary.json" 2>/dev/null || true
