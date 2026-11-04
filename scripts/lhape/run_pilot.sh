#!/usr/bin/env bash
# LHAPE-C bounded real-model F/L/G pilot.
#
# Real DeepSeek provider via the owner's DSH credential store. The cohort gate refuses without the
# exact authorization; each condition is capped at 2.5M tokens (7.5M aggregate). The measured
# constraint is injected while each session is running.
set -euo pipefail

REPO="$(pwd)"
BASE="${LHAPE_BASE:-$HOME/lhape}"
RUN="$BASE/pilot-2026-11-04"
COHORT="lhape-c-pilot-2026-11-04"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
SEAM="$BASE/seam"
CODE_FREEZE="$(git -C "$REPO" rev-parse HEAD)"

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin missing at $DSH_BIN" >&2; exit 2; fi
if [ ! -f "$DSH_HOME_REAL/.credentials.yaml" ]; then echo "owner credential store missing" >&2; exit 2; fi
if [ ! -d "$SEAM/node_modules/@deepseek-ai/dsh-win32-process" ]; then
  mkdir -p "$SEAM"
  npm install --prefix "$SEAM" @deepseek-ai/dsh-win32-process@0.2.1-rc.5 --no-save --no-package-lock >/dev/null 2>&1
fi

node "$REPO/scripts/lhape/prepare_pilot.mjs" --run="$RUN" --cohort="$COHORT" --codeFreeze="$CODE_FREEZE" > "$BASE/prepare-pilot.json"

for condition in F L G; do
  HOME_COND="$RUN/home-$condition"
  PROFILE_DIR="$HOME_COND/profiles/lhape-pilot"
  rm -rf "$HOME_COND"
  mkdir -p "$HOME_COND/profiles/node_modules" "$PROFILE_DIR" "$RUN/tmp"
  cp "$DSH_HOME_REAL/.credentials.yaml" "$HOME_COND/.credentials.yaml"
  cat > "$HOME_COND/settings.yaml" <<'YAML'
agent-default-model:
  provider: deepseek-official
  model: deepseek-flash
YAML
  cmd //c mklink //J "$(cygpath -w "$HOME_COND/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null
  cp -r "$REPO/host/dsh" "$HOME_COND/profiles/node_modules/palimpsest-dsh-host"
  cp -r "$REPO/host/deployment" "$HOME_COND/profiles/node_modules/palimpsest-host-deployment"
  if [ "$condition" = "F" ]; then
    cat > "$PROFILE_DIR/package.json" <<'JSON'
{ "name": "dsh-profile-lhape-f", "private": true, "dependencies": {}, "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base"], "patchReload": "startup" } } }
JSON
    cat > "$PROFILE_DIR/cordis.patch.yml" <<'YAML'
- id: llm-pi-ai
  disabled: true
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
  else
    cat > "$PROFILE_DIR/package.json" <<'JSON'
{ "name": "dsh-profile-lhape-pilot", "private": true, "dependencies": {}, "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } } }
JSON
    cat > "$PROFILE_DIR/cordis.patch.yml" <<YAML
- id: llm-pi-ai
  disabled: true
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
  fi
done

cat > "$RUN/authorization.json" <<JSON
{
  "schema": "lhape-spend-authorization/v1",
  "authorized": true,
  "owner": "Owner (authorized 2026-11-04)",
  "cohortId": "$COHORT",
  "authorizedAt": "2026-11-04T00:00:00.000Z",
  "expiresAt": "2026-11-11T00:00:00.000Z",
  "provider": { "id": "deepseek-official", "model": "deepseek-flash" },
  "maxTokens": 7500000,
  "conditions": ["F", "L", "G"],
  "note": "Bounded LHAPE-C pilot: 3 conditions, 2.5M tokens each, 7.5M aggregate. The APS pilot authorization is not reused."
}
JSON

export LHAPE_DSH_BIN="$(cygpath -w "$DSH_BIN")"
export LHAPE_DSH_ROOT="$(cygpath -w "$SEAM")"

if [ "${LHAPE_SETUP_ONLY:-0}" = "1" ]; then
  echo "setup-only: profiles written; no model session started"
  exit 0
fi

node "$REPO/scripts/lhape/run_cohort.mjs" \
  --cohort="$RUN/cohort.json" \
  --authorization="$RUN/authorization.json" \
  --execute=true \
  > "$RUN/out/cohort-run.json" 2> "$RUN/out/cohort-run.err" || true

node "$REPO/scripts/lhape/pilot_accept_G.mjs" --run="$RUN" > "$RUN/out/G/operator-acceptance.json" 2> "$RUN/out/G/operator-acceptance.err" || true
node "$REPO/scripts/lhape/score_pilot.mjs" --run="$RUN" > "$RUN/out/score-summary.json" 2> "$RUN/out/score.err" || true

echo "cohort:"; cat "$RUN/out/cohort-run.json" 2>/dev/null || true
echo "score:"; cat "$RUN/out/score-summary.json" 2>/dev/null || true
