#!/usr/bin/env bash
# LHAPE real-host deterministic scenario.
#
# The REAL DSH host runs the REAL Palimpsest product over a seeded Git world. Two REAL worker
# subprocesses are started through the normal product path, in their own execution worlds. The model
# content is a deterministic Messages stand-in, so every record is labelled MOCK_MODEL.
#
# Usage: run_host.sh [main|interrupt]
set -euo pipefail

SCENARIO="${1:-main}"
REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${LHAPE_BASE:-$HOME/lhape}"
RUN="$BASE/$SCENARIO"
OUT="$RUN/out"
PRODUCT="$BASE/product"
DSH="${LHAPE_DSH:-$HOME/c6r/dsh/node_modules/.bin/dsh}"
DSH_MODULES="$HOME/c6r/dsh/node_modules/@deepseek-ai"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/lhape-host"
MockKey="lhape-mock-key"
MockPort=18082

if [ ! -x "$DSH" ]; then
  echo "DSH is not installed at $DSH" >&2
  exit 2
fi
if [ ! -d "$HOME/c6r/product/node_modules" ]; then
  echo "the staged Linux product is missing at $HOME/c6r/product" >&2
  exit 2
fi

mkdir -p "$BASE"
rm -rf "$PRODUCT"
cp -r "$HOME/c6r/product" "$PRODUCT"
rm -rf "$PRODUCT/dist" "$PRODUCT/host" "$PRODUCT/scripts/lhape"
cp -r "$REPO/dist" "$PRODUCT/dist"
cp -r "$REPO/host" "$PRODUCT/host"
mkdir -p "$PRODUCT/scripts/lhape"
cp "$REPO"/scripts/lhape/*.mjs "$PRODUCT/scripts/lhape/"
cp "$REPO/scripts/c6r/net_bridge.mjs" "$BASE/net_bridge.mjs"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/c6r/egress_policy.mjs" "$BASE/egress_policy.mjs"
cp "$REPO/scripts/c6r/upstream_retry.mjs" "$BASE/upstream_retry.mjs"
cp "$REPO/scripts/lhape/mock_llm.mjs" "$BASE/mock_llm.mjs"

node "$PRODUCT/scripts/lhape/prepare_run.mjs" --run="$RUN" --scenario="$SCENARIO" > "$BASE/prepare-$SCENARIO.json"
mkdir -p "$OUT" "$HOME_RUN/profiles/node_modules" "$PROFILE"

cp -r "$PRODUCT/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$PRODUCT/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
ln -s "$DSH_MODULES" "$HOME_RUN/profiles/node_modules/@deepseek-ai"

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-lhape-host",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } }
}
JSON

cat > "$PROFILE/cordis.patch.yml" <<YAML
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:${MockPort}
    apiKeyEnv: LHAPE_MOCK_KEY
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
    workspaceRoot: /run/lhape/world
- id: session-title-llm
  disabled: true
- id: tool-web
  disabled: true
- id: palimpsest-tools
  config:
    palimpsestEntry: '/product/dist/src/advanced.js'
    deploymentProfile: '/run/lhape/deployment.json'
    serve: false
    openDashboard: false
YAML

cp "$PROFILE/cordis.patch.yml" "$OUT/profile.patch.yml"
cp "$PROFILE/package.json" "$OUT/profile.package.json"
cp "$RUN/deployment.json" "$OUT/deployment.json"

DSH_HOME="$HOME_RUN" "$DSH" --profile lhape-host --patch "$PROFILE/cordis.patch.yml" --dump-config \
  > "$OUT/dump-config.txt" 2> "$OUT/dump-config.err" || true

LHAPE_MOCK_PORT="$MockPort" LHAPE_MOCK_KEY="$MockKey" LHAPE_MOCK_SCRIPT="$RUN/mock-scripts.json" LHAPE_MOCK_LOG="$OUT/mock.jsonl" \
  node "$BASE/mock_llm.mjs" > "$OUT/mock.log" 2>&1 &
MOCK_PID=$!
C6R_PROVIDER_KIND=anthropic C6R_PROXY_SOCKET="$OUT/provider.sock" C6R_UPSTREAM="http://127.0.0.1:${MockPort}" \
  C6R_REAL_KEY="$MockKey" C6R_PROXY_LOG="$OUT/proxy.jsonl" \
  node "$BASE/provider_proxy.mjs" > "$OUT/proxy.log" 2>&1 &
PROXY_PID=$!
cleanup() {
  kill "$MOCK_PID" "$PROXY_PID" 2>/dev/null || true
  wait "$MOCK_PID" 2>/dev/null || true
  wait "$PROXY_PID" 2>/dev/null || true
}
trap cleanup EXIT
for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:${MockPort}/health" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
for _ in $(seq 1 100); do
  if [ -S "$OUT/provider.sock" ]; then break; fi
  sleep 0.1
done
if [ ! -S "$OUT/provider.sock" ]; then
  echo "provider proxy socket did not appear" >&2
  exit 5
fi

start_session() {
  local n="$1"
  local prompt="$2"
  local session_out="$OUT/session-$n"
  mkdir -p "$session_out"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$session_out/started-at.txt"
  setsid bwrap \
    --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
    --ro-bind /bin /bin --ro-bind /sbin /sbin --ro-bind /etc /etc \
    --ro-bind "$HOME/c6r/dsh" /dsh \
    --ro-bind "$PRODUCT/dist" /product/dist \
    --ro-bind "$PRODUCT/host" /product/host \
    --ro-bind "$PRODUCT/scripts" /product/scripts \
    --ro-bind "$PRODUCT/node_modules" /product/node_modules \
    --ro-bind "$PRODUCT/package.json" /product/package.json \
    --ro-bind "$PROFILE/cordis.patch.yml" /qual/patch.yml \
    --ro-bind "$BASE/net_bridge.mjs" /net_bridge.mjs \
    --bind "$OUT/provider.sock" /run/c6r-provider.sock \
    --bind "$RUN/world" /run/lhape/world \
    --bind "$RUN/state" /run/lhape/state \
    --ro-bind "$RUN/deployment.json" /run/lhape/deployment.json \
    --bind "$HOME_RUN" /dsh-home \
    --proc /proc --dev /dev --tmpfs /tmp \
    --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
    --unshare-pid --unshare-net --die-with-parent --chdir /run/lhape/world \
    env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
      PALIMPSEST_DSH_BIN=/product/scripts/lhape/worker_tee.mjs \
      LHAPE_REAL_DSH_BIN=/dsh/node_modules/.bin/dsh \
      LHAPE_WORKER_LOG_DIR=/dsh-home/worker-logs \
      LHAPE_MOCK_KEY="$MockKey" \
      C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT="${MockPort}" \
      bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /usr/bin/timeout -s KILL 900 /dsh/node_modules/.bin/dsh --profile lhape-host --once "$1"; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' _ "$prompt" \
    > "$session_out/run.log" 2> "$session_out/run.err" &
  echo "$!" > "$session_out/pid.txt"
}

wait_session() {
  local n="$1"
  local pid
  pid="$(cat "$OUT/session-$n/pid.txt")"
  set +e
  wait "$pid"
  local code=$?
  set -e
  echo "$code" > "$OUT/session-$n/exit-code.txt"
  echo "session $n exit=$code"
  return "$code"
}

wait_for_file() {
  local path="$1"
  local label="$2"
  for _ in $(seq 1 300); do
    if [ -f "$path" ]; then return 0; fi
    sleep 0.2
  done
  echo "timed out waiting for $label ($path)" >&2
  return 1
}

wait_for_world_marker() {
  local name="$1"
  for _ in $(seq 1 300); do
    if find "$RUN/world/.palimpsest/worlds" -name "$name" -print -quit 2>/dev/null | grep -q .; then return 0; fi
    sleep 0.2
  done
  echo "timed out waiting for worker marker $name" >&2
  return 1
}

run_promote() {
  local project="$1"
  local task="$2"
  local label="$3"
  node "$PRODUCT/scripts/lhape/operator_promote.mjs" --run="$RUN" --project="$project" --task="$task" --label="$label" \
    > "$OUT/promote-$label.json" 2> "$OUT/promote-$label.err"
}

if [ "$SCENARIO" = "main" ]; then
  start_session 1 "LHAPE_PRINCIPAL_S1 You are the principal agent for a newly started project. Read the project pulse, then start real workers for the existing tasks. Work only inside /run/lhape/world."
  wait_for_world_marker w2-started
  cat > "$RUN/world/.palimpsest/inputs/constraint-update.md" <<'MD'
# Measured site-B corridor

Measured width: 700 mm (survey performed 2026-11-03).

The earlier 1200 mm corridor value was an assumption, not a measurement. It is superseded.
The 900 mm unit is NOT admissible at site B.
MD
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/constraint-arrived-at.txt"
  wait_session 1

  run_promote lhape capacity-v2 capacity-v2
  start_session 2 "LHAPE_PRINCIPAL_S2 You are a NEW principal session. Read the project pulse and the late result, then choose a safe continuation route. Work only inside /run/lhape/world."
  wait_session 2

  run_promote lhape cost-v2 cost-v2
  start_session 3 "LHAPE_PRINCIPAL_S3 You are another NEW principal session. Read the project pulse and run the remaining integration work. Work only inside /run/lhape/world."
  wait_session 3

  run_promote lhape integration integration
  node "$PRODUCT/scripts/lhape/final_pulse.mjs" --run="$RUN" --project=lhape --scenario=main > "$OUT/final-pulse-command.json"
elif [ "$SCENARIO" = "interrupt" ]; then
  start_session 1 "LHAPE_PRINCIPAL_IR1 You are the principal. Start the existing task through a real worker, then keep this host alive. Work only inside /run/lhape/world."
  wait_for_world_marker w7-committed
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/kill-at.txt"
  HOST_PID="$(cat "$OUT/session-1/pid.txt")"
  kill -9 -- "-$HOST_PID" 2>/dev/null || kill -9 "$HOST_PID" 2>/dev/null || true
  sleep 1
  wait_session 1 || true
  start_session 2 "LHAPE_PRINCIPAL_IR2 You are a NEW host session after a kill. Read the pulse and execution state, then recover the committed work without re-running it. Work only inside /run/lhape/world."
  wait_session 2
  run_promote lhape-interrupt interrupted-write interrupted-write
  node "$PRODUCT/scripts/lhape/final_pulse.mjs" --run="$RUN" --project=lhape-interrupt --scenario=interrupt > "$OUT/final-pulse-command.json"
else
  echo "unknown scenario $SCENARIO" >&2
  exit 2
fi

node "$PRODUCT/scripts/lhape/summarize_run.mjs" --run="$RUN" --scenario="$SCENARIO" --codeFreeze="${LHAPE_CODE_FREEZE:-}" > "$OUT/summarize.json"

find "$HOME_RUN/sessions" -type f -printf "%p %s\n" > "$OUT/session-files.txt" 2>/dev/null || true
mkdir -p "$OUT/session"
for stream in "$HOME_RUN"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
cp "$RUN/final-pulse.json" "$OUT/final-pulse.json" 2>/dev/null || true
cp "$RUN/seed.json" "$OUT/seed.json"
cp "$RUN/mock-scripts.json" "$OUT/mock-scripts.json"

echo "--- final pulse ---"
node -e 'const p=require(process.argv[1]); console.log(JSON.stringify({scenario:p.scenario,revision:p.project.revision,head:p.project.headCommit,tasks:p.status.tasks,artifacts:p.artifacts.map(a=>({path:a.path,present:a.present,sha256:a.sha256})),execution:p.workers,results:p.results},null,2));' "$RUN/final-pulse.json"
