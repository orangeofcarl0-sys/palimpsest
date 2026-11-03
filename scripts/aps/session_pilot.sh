#!/usr/bin/env bash
# APS-C pilot session — one real-model DSH session in one matched world.
#
# F uses the shipped headless profile and has NO Palimpsest tools.
# L/G use the Palimpsest host profile; G's world has a formal Work plan and standard.
# The provider proxy/socket is started by the outer run_pilot.sh; the budget guard is started by
# run_cohort.mjs. This script only composes the sandbox and runs the host.
set -euo pipefail

CONDITION="${1:?condition F|L|G is required}"
RUN="${APS_PILOT_RUN:?APS_PILOT_RUN is required}"
REPO="${APS_PILOT_REPO:?APS_PILOT_REPO is required}"
HOME_COND="$RUN/home-$CONDITION"
PROFILE="$HOME_COND/profiles/pilot"
WORLD="$RUN/worlds/$CONDITION"
STATE="$RUN/state-$CONDITION"
OUT="$RUN/out/$CONDITION"
DEPLOY="$RUN/deployments/$CONDITION.json"
PROMPT_FILE="$RUN/prompts/$CONDITION.txt"
SOCKET="$RUN/out/provider.sock"
DSH="$HOME/c6r/dsh/node_modules/.bin/dsh"
DSH_MODULES="$HOME/c6r/dsh/node_modules/@deepseek-ai"
PRODUCT="${APS_PILOT_PRODUCT:-$HOME/aps/product}"

if [ ! -S "$SOCKET" ]; then
  echo "provider socket is missing at $SOCKET" >&2
  exit 5
fi
if [ ! -f "$PROMPT_FILE" ]; then
  echo "prompt file is missing at $PROMPT_FILE" >&2
  exit 5
fi

mkdir -p "$OUT"
rm -rf "$HOME_COND"
mkdir -p "$HOME_COND/profiles/node_modules" "$PROFILE"
cp "$REPO/scripts/c6r/net_bridge.mjs" "$OUT/net_bridge.mjs"

if [ "$CONDITION" = "F" ]; then
  cat > "$OUT/patch.yml" <<'YAML'
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:18080
    apiKeyEnv: C6R_PLACEHOLDER
- id: llm-pi-ai
  disabled: true
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-flash
- id: approval
  config:
    policy: never
- id: permission
  config:
    presets:
      read-only:
        sandbox: read-only
        approval: never
      workspace-write:
        sandbox: workspace-write
        approval: never
      danger-full-access:
        sandbox: danger-full-access
        approval: never
    defaultPreset: workspace-write
- id: sandbox-policy
  config:
    mode: workspace-write
    workspaceRoot: /run/aps/world
- id: session-title-llm
  disabled: true
- id: tool-web
  disabled: true
YAML
  DSH_PROFILE="headless"
  DSH_EXTRA=()
else
  cp -r "$PRODUCT/host/dsh" "$HOME_COND/profiles/node_modules/palimpsest-dsh-host"
  ln -s "$DSH_MODULES" "$HOME_COND/profiles/node_modules/@deepseek-ai"
  cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-aps-pilot",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } }
}
JSON
  cat > "$PROFILE/cordis.patch.yml" <<'YAML'
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:18080
    apiKeyEnv: C6R_PLACEHOLDER
- id: llm-pi-ai
  disabled: true
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-flash
- id: approval
  config:
    policy: never
- id: permission
  config:
    presets:
      read-only:
        sandbox: read-only
        approval: never
      workspace-write:
        sandbox: workspace-write
        approval: never
      danger-full-access:
        sandbox: danger-full-access
        approval: never
    defaultPreset: workspace-write
- id: sandbox-policy
  config:
    mode: workspace-write
    workspaceRoot: /run/aps/world
- id: session-title-llm
  disabled: true
- id: tool-web
  disabled: true
- id: palimpsest-tools
  config:
    palimpsestEntry: '/product/dist/src/advanced.js'
    deploymentProfile: '/run/aps/deployment.json'
    serve: false
YAML
  cp "$PROFILE/cordis.patch.yml" "$OUT/patch.yml"
  DSH_PROFILE="pilot"
  DSH_EXTRA=(--once)
fi

date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/started-at.txt"
set +e
if [ "$CONDITION" = "F" ]; then
  bwrap \
    --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
    --ro-bind /bin /bin --ro-bind /sbin /sbin --ro-bind /etc /etc \
    --ro-bind "$HOME/c6r/dsh" /dsh \
    --ro-bind "$PRODUCT/dist" /product/dist \
    --ro-bind "$PRODUCT/host" /product/host \
    --ro-bind "$PRODUCT/node_modules" /product/node_modules \
    --ro-bind "$PRODUCT/package.json" /product/package.json \
    --ro-bind "$OUT/patch.yml" /qual/patch.yml \
    --ro-bind "$OUT/net_bridge.mjs" /net_bridge.mjs \
    --bind "$SOCKET" /run/c6r-provider.sock \
    --bind "$WORLD" /run/aps/world \
    --bind "$HOME_COND" /dsh-home \
    --proc /proc --dev /dev --tmpfs /tmp \
    --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
    --unshare-pid --unshare-net --die-with-parent --chdir /run/aps/world \
    env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
      C6R_PLACEHOLDER=c6r-placeholder-not-a-credential \
      C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT=18080 \
      bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /usr/bin/timeout -s KILL 900 /dsh/node_modules/.bin/dsh --profile headless --patch /qual/patch.yml "$1"; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' _ "$(cat "$PROMPT_FILE")" \
    > "$OUT/run.log" 2> "$OUT/run.err"
else
  bwrap \
    --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
    --ro-bind /bin /bin --ro-bind /sbin /sbin --ro-bind /etc /etc \
    --ro-bind "$HOME/c6r/dsh" /dsh \
    --ro-bind "$PRODUCT/dist" /product/dist \
    --ro-bind "$PRODUCT/host" /product/host \
    --ro-bind "$PRODUCT/node_modules" /product/node_modules \
    --ro-bind "$PRODUCT/package.json" /product/package.json \
    --ro-bind "$PROFILE/cordis.patch.yml" /qual/patch.yml \
    --ro-bind "$OUT/net_bridge.mjs" /net_bridge.mjs \
    --bind "$SOCKET" /run/c6r-provider.sock \
    --bind "$WORLD" /run/aps/world \
    --bind "$STATE" /run/aps/state \
    --ro-bind "$DEPLOY" /run/aps/deployment.json \
    --bind "$HOME_COND" /dsh-home \
    --proc /proc --dev /dev --tmpfs /tmp \
    --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
    --unshare-pid --unshare-net --die-with-parent --chdir /run/aps/world \
    env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
      C6R_PLACEHOLDER=c6r-placeholder-not-a-credential \
      C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT=18080 \
      bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /usr/bin/timeout -s KILL 900 /dsh/node_modules/.bin/dsh --profile pilot --patch /qual/patch.yml --once "$1"; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' _ "$(cat "$PROMPT_FILE")" \
    > "$OUT/run.log" 2> "$OUT/run.err"
fi
CODE=$?
set -e
echo "$CODE" > "$OUT/exit-code.txt"
git -C "$WORLD" log --oneline > "$OUT/world-log.txt" 2>/dev/null || true
git -C "$WORLD" status --porcelain > "$OUT/world-status.txt" 2>/dev/null || true
find "$HOME_COND/sessions" -type f -printf "%p %s\n" > "$OUT/session-files.txt" 2>/dev/null || true
mkdir -p "$OUT/session"
for f in "$HOME_COND"/sessions/*/*/session.v4.jsonl.zstd; do
  if [ -f "$f" ]; then cp "$f" "$OUT/session/$(basename "$(dirname "$f")").zstd"; fi
done
exit "$CODE"
