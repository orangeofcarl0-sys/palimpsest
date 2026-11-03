#!/usr/bin/env bash
# APS-A/B real-host deterministic run.
#
# The REAL DSH host runs the REAL Palimpsest product over a seeded Git world. The model is a
# deterministic Messages stand-in, so every record is labelled MOCK_MODEL. The native DSH subagent
# is a real child session; only its scripted content is deterministic.
#
# No provider credential is used and no paid model is called.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${APS_BASE:-$HOME/aps}"
RUN="$BASE/run"
OUT="$RUN/out"
PRODUCT="$BASE/product"
DSH="${APS_DSH:-$HOME/c6r/dsh/node_modules/.bin/dsh}"
DSH_MODULES="$HOME/c6r/dsh/node_modules/@deepseek-ai"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/aps-host"
MockKey="aps-mock-key"

if [ ! -x "$DSH" ]; then
  echo "DSH is not installed at $DSH" >&2
  exit 2
fi
if [ ! -d "$HOME/c6r/product/node_modules" ]; then
  echo "the staged Linux product is missing at $HOME/c6r/product" >&2
  exit 2
fi

mkdir -p "$BASE" "$RUN" "$OUT"
rm -rf "$PRODUCT"
cp -r "$HOME/c6r/product" "$PRODUCT"
rm -rf "$PRODUCT/dist" "$PRODUCT/host" "$PRODUCT/scripts/aps"
cp -r "$REPO/dist" "$PRODUCT/dist"
cp -r "$REPO/host" "$PRODUCT/host"
mkdir -p "$PRODUCT/scripts/aps"
cp "$REPO"/scripts/aps/*.mjs "$PRODUCT/scripts/aps/"
cp "$REPO/scripts/c6r/net_bridge.mjs" "$BASE/net_bridge.mjs"
cp "$REPO/scripts/c6r/provider_proxy.mjs" "$BASE/provider_proxy.mjs"
cp "$REPO/scripts/c6r/egress_policy.mjs" "$BASE/egress_policy.mjs"
cp "$REPO/scripts/c6r/upstream_retry.mjs" "$BASE/upstream_retry.mjs"
cp "$REPO/scripts/aps/mock_llm.mjs" "$BASE/mock_llm.mjs"

node "$PRODUCT/scripts/aps/prepare_run.mjs" --run="$RUN" > "$OUT/prepare.json"

rm -rf "$HOME_RUN"
mkdir -p "$OUT" "$HOME_RUN/profiles/node_modules" "$PROFILE"
cp -r "$PRODUCT/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
ln -s "$DSH_MODULES" "$HOME_RUN/profiles/node_modules/@deepseek-ai"

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-aps-host",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } }
}
JSON

cat > "$PROFILE/cordis.patch.yml" <<'YAML'
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:18080
    apiKeyEnv: APS_MOCK_KEY
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

cp "$PROFILE/cordis.patch.yml" "$OUT/profile.patch.yml"
cp "$PROFILE/package.json" "$OUT/profile.package.json"
cp "$RUN/deployment.json" "$OUT/deployment.json"

DSH_HOME="$HOME_RUN" "$DSH" --profile aps-host --patch "$PROFILE/cordis.patch.yml" --dump-config \
  > "$OUT/dump-config.txt" 2> "$OUT/dump-config.err" || true

APS_MOCK_PORT=18080 APS_MOCK_KEY="$MockKey" APS_MOCK_SCRIPT="$RUN/mock-scripts.json" APS_MOCK_LOG="$OUT/mock.jsonl" \
  node "$BASE/mock_llm.mjs" > "$OUT/mock.log" 2>&1 &
MOCK_PID=$!
C6R_PROVIDER_KIND=anthropic C6R_PROXY_SOCKET="$OUT/provider.sock" C6R_UPSTREAM="http://127.0.0.1:18080" \
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
  if curl -fsS "http://127.0.0.1:18080/health" >/dev/null 2>&1; then break; fi
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

run_session() {
  local n="$1"
  local prompt="$2"
  local session_out="$OUT/session-$n"
  mkdir -p "$session_out"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$session_out/started-at.txt"
  set +e
  bwrap \
    --ro-bind /usr /usr --ro-bind /lib /lib --ro-bind /lib64 /lib64 \
    --ro-bind /bin /bin --ro-bind /sbin /sbin --ro-bind /etc /etc \
    --ro-bind "$HOME/c6r/dsh" /dsh \
    --ro-bind "$PRODUCT/dist" /product/dist \
    --ro-bind "$PRODUCT/host" /product/host \
    --ro-bind "$PRODUCT/node_modules" /product/node_modules \
    --ro-bind "$PRODUCT/package.json" /product/package.json \
    --ro-bind "$PROFILE/cordis.patch.yml" /qual/patch.yml \
    --ro-bind "$BASE/net_bridge.mjs" /net_bridge.mjs \
    --bind "$OUT/provider.sock" /run/c6r-provider.sock \
    --bind "$RUN/world" /run/aps/world \
    --bind "$RUN/state" /run/aps/state \
    --ro-bind "$RUN/deployment.json" /run/aps/deployment.json \
    --bind "$HOME_RUN" /dsh-home \
    --proc /proc --dev /dev --tmpfs /tmp \
    --tmpfs /mnt --tmpfs /home --tmpfs /root --tmpfs /media --tmpfs /srv \
    --unshare-pid --unshare-net --die-with-parent --chdir /run/aps/world \
    env -i HOME=/dsh-home DSH_HOME=/dsh-home TMPDIR=/tmp PATH=/usr/local/bin:/usr/bin:/bin \
      APS_MOCK_KEY="$MockKey" \
      C6R_PROXY_SOCKET=/run/c6r-provider.sock C6R_BRIDGE_PORT=18080 \
      bash -c 'node /net_bridge.mjs > /dsh-home/bridge.log 2>&1 & BRIDGE=$!; sleep 0.4; /usr/bin/timeout -s KILL 900 /dsh/node_modules/.bin/dsh --profile aps-host --once "$1"; STATUS=$?; kill "$BRIDGE" 2>/dev/null || true; exit "$STATUS"' _ "$prompt" \
    > "$session_out/run.log" 2> "$session_out/run.err"
  local code=$?
  set -e
  echo "$code" > "$session_out/exit-code.txt"
  echo "session $n exit=$code"
}

run_session 1 "APS_PRINCIPAL_SESSION_1 You are the principal agent continuing an existing project. Call palimpsest_continuity action=pulse first. Then use the native subagent tool for one independent check of the declared source, and record its finding through the project contribution mechanism. Do not invent a read you did not do. Work only inside /run/aps/world."
run_session 2 "APS_PRINCIPAL_SESSION_2 You are a NEW principal session on the same project. Call palimpsest_continuity action=pulse first. Assess the recorded contribution. If it is justified, apply the actual plan change through the contribution decision, then start and complete one governed task and leave its artifact. Work only inside /run/aps/world."
run_session 3 "APS_PRINCIPAL_SESSION_3 You are another NEW principal session on the same project. Call palimpsest_continuity action=pulse and report what changed, which contribution is now tied to which plan revision, and what is pending. Do not edit anything."

node "$PRODUCT/scripts/aps/final_pulse.mjs" --run="$RUN" > "$OUT/final-pulse-command.json"

find "$HOME_RUN/sessions" -type f -printf "%p %s\n" > "$OUT/session-files.txt" 2>/dev/null || true
mkdir -p "$OUT/session"
for stream in "$HOME_RUN"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
cp "$RUN/final-pulse.json" "$OUT/final-pulse.json" 2>/dev/null || true
cp "$RUN/seed.json" "$OUT/seed.json"

echo "--- mock requests ---"
cat "$OUT/mock.jsonl" 2>/dev/null | head -40 || true
echo "--- final pulse summary ---"
node -e 'const p=require(process.argv[1]); console.log(JSON.stringify({revision:p.project.revision,tasks:p.status.tasks,contributions:p.pulse.contributions.map(c=>({id:c.record.contributionId,status:c.status,basisState:c.basisState,plan:c.downstream.planRevision,added:c.downstream.addedTaskIds,accepted:c.downstream.acceptedTaskIds})),decisionQueue:p.pulse.decisionQueue,mechanical:p.pulse.nextActions.mechanical},null,2));' "$RUN/final-pulse.json"
