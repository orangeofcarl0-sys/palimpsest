#!/usr/bin/env bash
# C6-R A2 — qualify the OpenAI-compatible `opencode/deepseek-v4.1-flash` route.
#
# This is a MOCK_MODEL qualification: the real DSH pi-ai adapter, the real provider proxy, the
# isolated bwrap view and the real tool path run, but a local OpenAI Chat Completions stand-in
# answers. It spends no provider token. The real probe uses the same profile with the real upstream.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="$HOME/c6r"

mkdir -p "$BASE"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/c6r/egress_policy.mjs" "$BASE/egress_policy.mjs"
cp "$REPO/scripts/c6r/upstream_retry.mjs" "$BASE/upstream_retry.mjs"
DSH="$BASE/dsh/node_modules/.bin/dsh"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK="$BASE/opencode/$STAMP"
OUT="$WORK/out"
EVIDENCE="${C6R_OPENCODE_EVIDENCE:-$REPO/research-evidence/c6r/opencode-route/$STAMP}"

rm -rf "$WORK"
mkdir -p "$WORK/home" "$WORK/workspace" "$OUT" "$EVIDENCE"
cp "$REPO/scripts/c6r/mock_openai.mjs" "$BASE/mock_openai.mjs"
cp "$REPO/scripts/c6r/net_bridge.mjs" "$BASE/net_bridge.mjs"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/c6r/egress_policy.mjs" "$BASE/egress_policy.mjs"

cat > "$WORK/patch.yml" <<'YAML'
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
    workspaceRoot: /workspace
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

cat > "$WORK/script.json" <<'JSON'
{
  "turns": [
    { "tool_calls": [ { "id": "call_pwd", "name": "bash", "arguments": { "command": "pwd && echo OPENAI_ROUTE_TOOL_OK", "description": "qualification probe" } } ] },
    { "text": "OPENAI_ROUTE_OK" }
  ]
}
JSON

C6R_MOCK_PORT=18081 C6R_MOCK_KEY=c6r-mock-key C6R_MOCK_MODEL=deepseek-v4.1-flash \
  C6R_MOCK_SCRIPT="$WORK/script.json" node "$BASE/mock_openai.mjs" > "$OUT/mock.log" 2>&1 &
MOCK_PID=$!
C6R_PROVIDER_KIND=openai C6R_PROXY_SOCKET="$WORK/provider.sock" C6R_UPSTREAM="http://127.0.0.1:18081/v1" \
  C6R_REAL_KEY=c6r-mock-key C6R_PROXY_LOG="$OUT/proxy.jsonl" \
  C6R_UPSTREAM_HEADERS='{"x-opencode-session":"zcode-5c7f8d75-20260913"}' \
  node "$BASE/provider_proxy.mjs" > "$OUT/proxy.log" 2>&1 &
PROXY_PID=$!
trap 'kill "$MOCK_PID" "$PROXY_PID" 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do
  if curl -fsS "http://127.0.0.1:18081/health" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
for _ in $(seq 1 50); do
  if [ -S "$WORK/provider.sock" ]; then break; fi
  sleep 0.1
done

set +e
bwrap \
  --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
  --ro-bind /bin /bin --ro-bind /sbin /sbin --ro-bind /etc /etc \
  --ro-bind "$BASE/dsh" /dsh \
  --ro-bind "$WORK/patch.yml" /qual/patch.yml \
  --ro-bind "$BASE/net_bridge.mjs" /net_bridge.mjs \
  --bind "$WORK/provider.sock" /run/c6r-provider.sock \
  --bind "$WORK/workspace" /workspace \
  --bind "$WORK/home" /dsh-home \
  --proc /proc --dev /dev --tmpfs /tmp \
  --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
  --unshare-pid --unshare-net --die-with-parent --chdir /workspace \
  env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
    C6R_PLACEHOLDER=c6r-placeholder-not-a-credential \
    C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT=18080 \
    bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /dsh/node_modules/.bin/dsh --profile headless --patch /qual/patch.yml "Qualification: use bash to run pwd, then report the result."; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' \
  > "$OUT/run.log" 2> "$OUT/run.err"
RUN_EXIT=$?
set -e
kill "$MOCK_PID" "$PROXY_PID" 2>/dev/null || true
wait "$MOCK_PID" 2>/dev/null || true
wait "$PROXY_PID" 2>/dev/null || true
trap - EXIT

cp "$WORK/patch.yml" "$EVIDENCE/"
cp "$WORK/script.json" "$EVIDENCE/"
for name in run.log run.err mock.log proxy.log proxy.jsonl; do
  if [ -f "$OUT/$name" ]; then cp "$OUT/$name" "$EVIDENCE/"; fi
done
if [ -f "$WORK/home/bridge.log" ]; then cp "$WORK/home/bridge.log" "$EVIDENCE/"; fi
mkdir -p "$EVIDENCE/session"
for stream in "$WORK"/home/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$EVIDENCE/session/"; fi
done
find "$WORK/home/sessions" -type f -printf "%p %s\n" > "$EVIDENCE/session-files.txt" 2>/dev/null || true

echo "exit=$RUN_EXIT"
echo "--- run.log ---"; tail -30 "$OUT/run.log"
echo "--- run.err ---"; tail -20 "$OUT/run.err"
echo "--- mock ---"; tail -5 "$OUT/mock.log"
echo "--- proxy ---"; cat "$OUT/proxy.jsonl"
