#!/usr/bin/env bash
# C6-R A2 — scored P1 discovery session against the neutral world, using opencode/deepseek-v4.1-flash.
#
# The real Palimpsest host, the real provider route, the real sandbox and the frozen prompt. A NEW
# DSH home is used, so the qualification transcript is absent. No mock is present.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="$HOME/c6r"

mkdir -p "$BASE"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/c6r/egress_policy.mjs" "$BASE/egress_policy.mjs"
cp "$REPO/scripts/c6r/upstream_retry.mjs" "$BASE/upstream_retry.mjs"
PRODUCT="$BASE/product"
DSH="$BASE/dsh/node_modules/.bin/dsh"
RUN="${C6R_P1_RUN:-$BASE/runs/qual-p1}"
P1="$RUN/p1"
HOST="$P1/scored/home"
OUT="$P1/scored/out"
PROVIDER_CONFIG="/mnt/c/Users/66494/.zcode/v2/provider_config.json"
PROVIDER_ID="5c7f8d75-e85e-4de5-9b27-e2b59eab1c7a"
UPSTREAM="https://opencode.ai/zen/go/v1"
SESSION_HEADER='{"x-opencode-session":"zcode-5c7f8d75-20260913"}'
PROMPT='You are the planning agent for the Sablewick community battery programme. This is a historical project-state replay: the programme is being observed as of 2026-02-10 09:05 UTC. The programme repository is at /run/p1/world. The programme inbox is at /run/p1/inbox. Continue the programme from the state and information available at that observation time. Examine relevant new information, determine whether the existing plan remains justified, and identify the next useful actions. Respect the programme authorization and acceptance requirements. Record your conclusions and proposed actions through the available project mechanisms. Work only inside the programme repository and the programme inbox.'

if [ ! -f "$P1/deployment.json" ]; then
  echo "P1 world is not seeded at $P1" >&2
  exit 2
fi
rm -rf "$HOST" "$OUT"
mkdir -p "$OUT" "$HOST/profiles/node_modules" "$HOST/profiles/c6r-p1"
cp -r "$PRODUCT/host/dsh" "$HOST/profiles/node_modules/palimpsest-dsh-host"
ln -s "$BASE/dsh/node_modules/@deepseek-ai" "$HOST/profiles/node_modules/@deepseek-ai"

cat > "$HOST/profiles/c6r-p1/package.json" <<'JSON'
{
  "name": "dsh-profile-c6r-p1-opencode",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } }
}
JSON

cat > "$HOST/profiles/c6r-p1/cordis.patch.yml" <<'YAML'
- id: llm-deepseek
  disabled: true
- id: llm-pi-ai
  config:
    providers:
      opencode:
        displayName: OpenCode Go
        api: openai-completions
        baseURL: http://127.0.0.1:18080/v1
        apiKeyEnv: C6R_PLACEHOLDER
        headers:
          x-opencode-session: zcode-5c7f8d75-20260913
        compat:
          thinkingFormat: deepseek
        defaultContextWindow: 1000000
        defaultMaxTokens: 262144
        reasoning: high
        models:
          - id: deepseek-v4.1-flash
            name: DeepSeek V4.1 Flash
            reasoningEfforts:
              off:
              high: high
- id: agent-default-model
  config:
    provider: opencode
    model: deepseek-v4.1-flash
- id: palimpsest-tools
  config:
    palimpsestEntry: '/product/dist/src/advanced.js'
    deploymentProfile: '/run/p1/deployment.json'
    serve: false
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
    workspaceRoot: /run/p1/world
- id: session-title-llm
  disabled: true
- id: tool-subagent
  disabled: true
- id: tool-subagent-control
  disabled: true
- id: tool-workflow
  disabled: true
- id: subagent
  disabled: true
- id: subagent-spawn-in-process
  disabled: true
- id: subagent-fork-in-process
  disabled: true
- id: workflow-ptc
  disabled: true
- id: tool-web
  disabled: true
YAML

cp "$HOST/profiles/c6r-p1/cordis.patch.yml" "$OUT/p1-profile.patch.yml"
cp "$HOST/profiles/c6r-p1/package.json" "$OUT/p1-profile.package.json"

C6R_PROVIDER_KIND=openai C6R_PROXY_SOCKET="$OUT/provider.sock" C6R_UPSTREAM="$UPSTREAM" \
  C6R_PROVIDER_CONFIG_FILE="$PROVIDER_CONFIG" C6R_PROVIDER_ID="$PROVIDER_ID" \
  C6R_UPSTREAM_HEADERS="$SESSION_HEADER" C6R_PROXY_LOG="$OUT/proxy.jsonl" \
  node "$BASE/provider_proxy.mjs" > "$OUT/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  if [ -S "$OUT/provider.sock" ]; then break; fi
  sleep 0.1
done
if [ ! -S "$OUT/provider.sock" ]; then
  kill "$PROXY_PID" 2>/dev/null || true
  echo "proxy unavailable" >&2
  exit 5
fi

date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/started-at.txt"
set +e
bwrap \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin --ro-bind /sbin /sbin --ro-bind /etc /etc \
  --ro-bind "$BASE/dsh" /dsh \
  --ro-bind "$PRODUCT/dist" /product/dist \
  --ro-bind "$PRODUCT/host" /product/host \
  --ro-bind "$PRODUCT/node_modules" /product/node_modules \
  --ro-bind "$PRODUCT/package.json" /product/package.json \
  --ro-bind "$HOST/profiles/c6r-p1/cordis.patch.yml" /qual/patch.yml \
  --ro-bind "$BASE/net_bridge.mjs" /net_bridge.mjs \
  --bind "$OUT/provider.sock" /run/c6r-provider.sock \
  --bind "$P1" /run/p1 \
  --bind "$HOST" /dsh-home \
  --proc /proc --dev /dev --tmpfs /tmp \
  --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
  --unshare-pid --unshare-net --die-with-parent --chdir /run/p1/world \
  env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
    C6R_PLACEHOLDER=c6r-placeholder-not-a-credential \
    C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT=18080 \
    bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /usr/bin/timeout -s KILL 900 /dsh/node_modules/.bin/dsh --profile c6r-p1 --once "$1"; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' _ "$PROMPT" \
  > "$OUT/run.log" 2> "$OUT/run.err"
EXIT_CODE=$?
set -e
kill "$PROXY_PID" 2>/dev/null || true
wait "$PROXY_PID" 2>/dev/null || true
trap - EXIT
echo "$EXIT_CODE" > "$OUT/exit-code.txt"

cp "$P1/deployment.json" "$OUT/deployment.json"
cp "$P1/initial-state.json" "$OUT/initial-state.json" 2>/dev/null || true
git -C "$P1/world" log --oneline > "$OUT/world-log.txt" 2>/dev/null || true
git -C "$P1/world" status --porcelain > "$OUT/world-status.txt" 2>/dev/null || true
find "$HOST/sessions" -type f -printf "%p %s\n" > "$OUT/session-files.txt" 2>/dev/null || true
mkdir -p "$OUT/session"
for stream in "$HOST"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
echo "exit=$EXIT_CODE"
echo "--- run.log ---"; tail -40 "$OUT/run.log"
echo "--- run.err ---"; tail -20 "$OUT/run.err"
echo "--- proxy ---"; cat "$OUT/proxy.jsonl"
