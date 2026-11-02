#!/usr/bin/env bash
# PC1 — matched field-study live session (P or F) through the DeepSeek official channel.
# Usage: PC1_RUN=<run dir> PC1_CONDITION=P|F PC1_STAGE=T1|T2 bash session_field_wsl.sh
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="$HOME/c6r"
PRODUCT="$BASE/product"
DSH="$BASE/dsh/node_modules/.bin/dsh"
RUN="${PC1_RUN:?PC1_RUN is required}"
COND="${PC1_CONDITION:?PC1_CONDITION must be P or F}"
STAGE="${PC1_STAGE:?PC1_STAGE must be T1 or T2}"
if [ "$COND" = "P" ]; then
  MOUNT=/run/fs-p
  WORK="$RUN/p1"
  PROFILE_ID=pc1-fs-p
  BUNDLES='["@deepseek-ai/dsh-base", "palimpsest-dsh-host"]'
  ONCE="--once"
  if [ "$STAGE" = "T1" ]; then
    PROMPT='You are the planning agent for the Riverton three-site PM2.5 observation study. This is a historical project-state replay observed at 2026-03-02 09:00 UTC. The project workspace is /run/fs-p/world; the inbox is /run/fs-p/inbox. Continue from the available project state. Distinguish observed sources, manufacturer claims, candidates, accepted facts and open questions. Record conclusions and proposed actions through the available project mechanisms. You may investigate, propose and plan; you may not accept an external source, change the binding requirements or approved budget, or approve your own proposal. Work only inside the workspace and the inbox.'
  else
    PROMPT='You are the planning agent for the Riverton three-site PM2.5 observation study. This is a later historical project-state replay observed at 2026-03-09 09:10 UTC. The project workspace is /run/fs-p/world; the inbox is /run/fs-p/inbox. Continue from the project state you find. New items may have arrived since the earlier session, and a late design from the earlier observation may be present. Do not treat a file or a late report as accepted authority. Distinguish source standing, candidates, accepted facts, negative findings and open questions; record conclusions and proposed actions through the project mechanisms. Work only inside the workspace and the inbox.'
  fi
else
  MOUNT=/run/fs-f
  WORK="$RUN/f1"
  PROFILE_ID=pc1-fs-f
  BUNDLES='["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-headless"]'
  ONCE=""
  if [ "$STAGE" = "T1" ]; then
    PROMPT='You are the planning agent for the Riverton three-site PM2.5 observation study. This is a historical project-state replay observed at 2026-03-02 09:00 UTC. The workspace is /run/fs-f/world; read HANDOFF.md first. The inbox is /run/fs-f/inbox. Continue from the available state. Distinguish observed sources, manufacturer claims, candidates, accepted facts and open questions. Record conclusions and proposed actions as Markdown/Git. Work only inside the workspace and the inbox.'
  else
    PROMPT='You are the planning agent for the Riverton three-site PM2.5 observation study. This is a later historical project-state replay observed at 2026-03-09 09:10 UTC. The workspace is /run/fs-f/world; read HANDOFF.md first. The inbox is /run/fs-f/inbox. Continue from the state you find. New items may have arrived since the earlier session, and a late design from the earlier observation may be present. Do not treat a file or a late report as accepted authority. Record conclusions and proposed actions as Markdown/Git. Work only inside the workspace and the inbox.'
  fi
fi
HOST="$WORK/scored-$STAGE/home"
OUT="$WORK/scored-$STAGE/out"
STAGE_LC=$(printf %s "$STAGE" | tr "[:upper:]" "[:lower:]")
INBOX="$WORK/inbox-$STAGE_LC"
CREDENTIAL_FILE="/mnt/c/Users/66494/.dsh/.credentials.yaml"
PROXY_URL="http://127.0.0.1:7890"
PROXY_AGENT="/home/admini/c6r/dsh/node_modules/https-proxy-agent/dist/index.js"
UPSTREAM="https://api.deepseek.com/anthropic"

mkdir -p "$BASE"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/c6r/egress_policy.mjs" "$BASE/egress_policy.mjs"
cp "$REPO/scripts/c6r/upstream_retry.mjs" "$BASE/upstream_retry.mjs"
if [ ! -d "$WORK/world" ]; then echo "world missing at $WORK/world" >&2; exit 2; fi
if [ ! -d "$INBOX" ]; then echo "inbox missing at $INBOX" >&2; exit 2; fi
rm -rf "$HOST" "$OUT"
mkdir -p "$OUT" "$HOST/profiles/node_modules" "$HOST/profiles/$PROFILE_ID"
ln -s "$BASE/dsh/node_modules/@deepseek-ai" "$HOST/profiles/node_modules/@deepseek-ai"
if [ "$COND" = "P" ]; then
  cp -r "$PRODUCT/host/dsh" "$HOST/profiles/node_modules/palimpsest-dsh-host"
fi

cat > "$HOST/profiles/$PROFILE_ID/package.json" <<JSON
{
  "name": "dsh-profile-$PROFILE_ID",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": $BUNDLES, "patchReload": "startup" } }
}
JSON

cat > "$HOST/profiles/$PROFILE_ID/cordis.patch.yml" <<YAML
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
    workspaceRoot: $MOUNT/world
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

if [ "$COND" = "P" ]; then
  cat >> "$HOST/profiles/$PROFILE_ID/cordis.patch.yml" <<YAML
- id: palimpsest-tools
  config:
    palimpsestEntry: '/product/dist/src/advanced.js'
    deploymentProfile: '$MOUNT/deployment.json'
    serve: false
YAML
fi

cp "$HOST/profiles/$PROFILE_ID/cordis.patch.yml" "$OUT/$PROFILE_ID.patch.yml"
cp "$HOST/profiles/$PROFILE_ID/package.json" "$OUT/$PROFILE_ID.package.json"

C6R_PROVIDER_KIND=anthropic C6R_PROXY_SOCKET="$OUT/provider.sock" C6R_UPSTREAM="$UPSTREAM" \
  C6R_UPSTREAM_PROXY="$PROXY_URL" C6R_UPSTREAM_PROXY_AGENT="$PROXY_AGENT" \
  C6R_CREDENTIAL_FILE="$CREDENTIAL_FILE" C6R_PROXY_LOG="$OUT/proxy.jsonl" \
  node "$BASE/provider_proxy.mjs" > "$OUT/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do if [ -S "$OUT/provider.sock" ]; then break; fi; sleep 0.1; done
if [ ! -S "$OUT/provider.sock" ]; then kill "$PROXY_PID" 2>/dev/null || true; echo "proxy unavailable" >&2; exit 5; fi

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
  --ro-bind "$BASE/net_bridge.mjs" /net_bridge.mjs \
  --bind "$OUT/provider.sock" /run/c6r-provider.sock \
  --bind "$WORK" "$MOUNT" \
  --bind "$INBOX" "$MOUNT/inbox" \
  --bind "$HOST" /dsh-home \
  --proc /proc --dev /dev --tmpfs /tmp \
  --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
  --unshare-pid --unshare-net --die-with-parent --chdir "$MOUNT/world" \
  env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
    C6R_PLACEHOLDER=c6r-placeholder-not-a-credential ONCE="$ONCE" \
    C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT=18080 \
    bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /usr/bin/timeout -s KILL 900 /dsh/node_modules/.bin/dsh --profile "$0" $ONCE "$1"; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' "$PROFILE_ID" "$PROMPT" \
  > "$OUT/run.log" 2> "$OUT/run.err"
EXIT_CODE=$?
set -e
kill "$PROXY_PID" 2>/dev/null || true
wait "$PROXY_PID" 2>/dev/null || true
trap - EXIT
echo "$EXIT_CODE" > "$OUT/exit-code.txt"
cp "$WORK/initial-state.json" "$OUT/initial-state.json" 2>/dev/null || true
cp "$WORK/deployment.json" "$OUT/deployment.json" 2>/dev/null || true
git -C "$WORK/world" log --oneline > "$OUT/world-log.txt" 2>/dev/null || true
git -C "$WORK/world" status --porcelain > "$OUT/world-status.txt" 2>/dev/null || true
find "$HOST/sessions" -type f -printf "%p %s\n" > "$OUT/session-files.txt" 2>/dev/null || true
mkdir -p "$OUT/session"
for stream in "$HOST"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
echo "exit=$EXIT_CODE"
echo "--- run.log ---"; tail -40 "$OUT/run.log"
echo "--- run.err ---"; tail -20 "$OUT/run.err"
echo "--- proxy ---"; cat "$OUT/proxy.jsonl"
