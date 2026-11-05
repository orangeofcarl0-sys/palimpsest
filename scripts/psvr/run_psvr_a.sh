#!/usr/bin/env bash
# PSVR-A deterministic Windows-host scenario — the REST→gRPC migration project.
#
# The REAL Windows DSH host runs the REAL Palimpsest product on a REAL runnable repository. Model
# content is a labelled deterministic Messages stand-in; every file, test run and commit is produced
# by the worker session inside its execution world.
#
#   T0  the project is seeded from the REST baseline (three dependent tasks, no migration code).
#   T1  worker 1 writes and commits the proto contract + wire codec; the principal settles it as
#       MECHANICAL_FINALIZATION; the operator promotes it (canonical head moves).
#   T2  worker 2 starts the server task, commits a UNARY BATCH server, and parks; the host is KILLED
#       with the attempt RUNNING and its world retained.
#   T3  the fleet compatibility note arrives as an UNTRACKED project path the attempt's basis never
#       contained; it requires a server-streaming RPC and forbids the batch shape.
#   T4  a NEW principal closes the attempt as a SUCCESSOR and starts a NEW attempt, whose compiled
#       context binds the note. The worker pulls it through `@ctx/input/...`, rewrites the contract,
#       codec, server and tests, runs the suite and commits; it exits without reporting.
#   T5  the principal reads readiness, finalizes with the acknowledgement, and the operator accepts.
#   T6  worker 3 delivers the client, the integration test and the migration notes; principal and
#       operator close it the same way.
#   T7  a later session records DELIVER over the accepted assets.
#   T8  the harness runs the suite on the accepted canonical head (independent verification).
set -euo pipefail

REPO="${REPO:-/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${PSVR_BASE:-$HOME/psvr}"
RUN="$BASE/a"
OUT="$RUN/out"
WORLD="$RUN/world"
STATE="$RUN/state"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/psvr-host"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
MockKey="psvr-mock-key"
MockPort=18193
INPUT_REL="updates/2026-11-03/compat-streaming.md"

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin not found at $DSH_BIN" >&2; exit 2; fi
if [ ! -d "$REPO/node_modules" ]; then echo "the repository node_modules is missing at $REPO" >&2; exit 2; fi

mkdir -p "$BASE" "$OUT" "$RUN/tmp"
node "$REPO/scripts/psvr/prepare_psvr_a.mjs" --run="$RUN" --repo="$REPO" > "$OUT/prepare.json"
node "$REPO/scripts/psvr/build_mock_a.mjs" --out="$RUN/mock-scripts.json" > "$OUT/mock-scripts-built.json"

rm -rf "$PROFILE" "$HOME_RUN/profiles/node_modules"
mkdir -p "$PROFILE" "$HOME_RUN/profiles/node_modules"
cp -r "$REPO/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
cmd //c mklink //J "$(cygpath -w "$HOME_RUN/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-psvr-host",
  "private": true,
  "dependencies": {},
  "dsh": { "profile": { "bundles": ["@deepseek-ai/dsh-base", "palimpsest-dsh-host"], "patchReload": "startup" } }
}
JSON

REPO_WIN="$(cygpath -w "$REPO" | sed 's|\\|/|g')"
WORLD_WIN="$(cygpath -w "$WORLD" | sed 's|\\|/|g')"
RUN_WIN="$(cygpath -w "$RUN" | sed 's|\\|/|g')"
cat > "$PROFILE/cordis.patch.yml" <<YAML
- id: llm-deepseek
  config:
    baseURL: http://127.0.0.1:${MockPort}
    apiKeyEnv: PSVR_MOCK_KEY
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
    workspaceRoot: '${WORLD_WIN}'
- id: session-title-llm
  disabled: true
- id: tool-web
  disabled: true
- id: palimpsest-tools
  config:
    palimpsestEntry: '${REPO_WIN}/dist/src/advanced.js'
    deploymentProfile: '${RUN_WIN}/deployment.json'
    serve: false
    openDashboard: false
YAML

if [ ! -d "$BASE/seam/node_modules/@deepseek-ai/dsh-win32-process" ]; then
  mkdir -p "$BASE/seam"
  npm install --prefix "$BASE/seam" @deepseek-ai/dsh-win32-process@0.2.1-rc.5 --no-save --no-package-lock > "$OUT/seam-install.log" 2>&1
fi

# A previous run of THIS scenario may have left its mock behind; the port is dedicated, so the
# listener is ours and is stopped rather than reported as a conflict.
if netstat -ano | grep LISTENING | grep -q ":${MockPort} "; then
  for pid in $(netstat -ano | grep LISTENING | grep ":${MockPort} " | awk '{print $5}' | sort -u); do
    taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
  done
  sleep 1
fi
if netstat -ano | grep LISTENING | grep -q ":${MockPort} "; then
  echo "a process is already listening on port ${MockPort}; stop it before this run" >&2
  exit 7
fi
LHAPE_MOCK_PORT="$MockPort" LHAPE_MOCK_KEY="$MockKey" LHAPE_MOCK_SCRIPT="$RUN/mock-scripts.json" LHAPE_MOCK_LOG="$OUT/mock.jsonl" \
  node "$REPO/scripts/lhape/mock_llm.mjs" > "$OUT/mock.log" 2>&1 &
MOCK_PID=$!
for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:${MockPort}/health" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
if ! curl -fsS "http://127.0.0.1:${MockPort}/health" >/dev/null 2>&1; then
  echo "the mock server did not start" >&2; cat "$OUT/mock.log" >&2 || true; exit 7
fi

start_host() {
  local name="$1"; local prompt="$2"
  local log="$OUT/session-$name"
  mkdir -p "$log"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$log/started-at.txt"
  (
    cd "$WORLD"
    env DSH_HOME="$HOME_RUN" \
      PALIMPSEST_DSH_BIN="$(cygpath -w "$REPO/scripts/lhape/worker_tee.mjs")" \
      LHAPE_REAL_DSH_BIN="$(cygpath -w "$DSH_BIN")" \
      LHAPE_WORKER_LOG_DIR="$(cygpath -w "$RUN/worker-logs")" \
      PALIMPSEST_DSH_ROOT="$(cygpath -w "$BASE/seam")" \
      PALIMPSEST_HOST_CAPACITY_ROOT="$(cygpath -w "$RUN/capacity-$name")" \
      TMP="$(cygpath -w "$RUN/tmp")" TEMP="$(cygpath -w "$RUN/tmp")" TMPDIR="$(cygpath -w "$RUN/tmp")" \
      PSVR_MOCK_KEY="$MockKey" \
      node "$DSH_BIN" --profile psvr-host --once "$prompt"
  ) > "$log/run.log" 2> "$log/run.err" &
  echo "$!" > "$log/pid.txt"
}

wait_host() {
  local name="$1"; local pid; pid="$(cat "$OUT/session-$name/pid.txt")"
  local deadline=$((SECONDS + 900))
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$SECONDS" -gt "$deadline" ]; then taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; break; fi
    sleep 1
  done
  set +e; wait "$pid" 2>/dev/null; local code=$?; set -e
  echo "$code" > "$OUT/session-$name/exit-code.txt"
  echo "session $name exit=$code"
}

stop_host() {
  powershell -NoProfile -ExecutionPolicy Bypass -File "$REPO/scripts/psvr/stop_hosts.ps1" -Marker "PSVR_PRINCIPAL_$1" >/dev/null 2>&1 || true
}

kill_host_tree() {
  local name="$1"; local pid; pid="$(cat "$OUT/session-$name/pid.txt")"
  stop_host "$name"
  sleep 1
  set +e; wait "$pid" 2>/dev/null; local code=$?; set -e
  echo "$code" > "$OUT/session-$name/exit-code.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/session-$name/killed-at.txt"
  echo "session $name KILLED (exit=$code)"
}

cleanup_all() {
  for name in P1 P2 CLOSE CONTINUE P4 P5; do stop_host "$name"; done
  taskkill //PID "${MOCK_PID:-0}" //T //F >/dev/null 2>&1 || true
}
trap cleanup_all EXIT

task_state() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT state FROM tasks WHERE task_id=? LIMIT 1").get(process.argv[2]);process.stdout.write(r===undefined?"MISSING":String(r.state));' "$STATE/palimpsest.sqlite" "$1"
}
latest_attempt_state() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT state FROM attempts WHERE task_id=? ORDER BY last_event_id DESC LIMIT 1").get(process.argv[2]);process.stdout.write(r===undefined?"MISSING":String(r.state));' "$STATE/palimpsest.sqlite" "$1"
}
wait_task_state() {
  local task="$1"; local wanted="$2"
  for _ in $(seq 1 600); do
    if [ "$(task_state "$task")" = "$wanted" ]; then return 0; fi
    sleep 0.2
  done
  echo "timed out waiting for task $task state $wanted (now $(task_state "$task"))" >&2
  return 1
}
wait_world_commit() {
  local subject="$1"
  for _ in $(seq 1 900); do
    for dir in "$WORLD/.palimpsest/worlds"/attempt-*; do
      [ -d "$dir" ] || continue
      if git -C "$dir" log -1 --format=%s 2>/dev/null | grep -q "$subject"; then return 0; fi
    done
    sleep 0.2
  done
  echo "timed out waiting for a worker commit containing: $subject" >&2
  return 1
}
promote() {
  local task="$1"
  node "$REPO/scripts/psvr/accept.mjs" --run="$RUN" --task="$task" --label="$task" > "$OUT/promote-$task.json" 2> "$OUT/promote-$task.err" || true
  wait_task_state "$task" SATISFIED
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/promoted-$task-at.txt"
}

# ── T0–T1: contract ───────────────────────────────────────────────────────────────────────────────
start_host P1 "PSVR_PRINCIPAL_P1 You are the principal of a governed migration project. Read the pulse, delegate the contract task, and settle the worker's result through the product."
wait_host P1
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/contract-settled-at.txt"
promote contract

# ── T2: server task, unary batch, then kill ───────────────────────────────────────────────────────
start_host P2 "PSVR_PRINCIPAL_P2 You are the principal. Delegate the server task and keep the host alive while the worker does its job."
wait_world_commit "server: unary batch GetReadings"
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/partial-committed-at.txt"
sleep 2
kill_host_tree P2
echo "$(latest_attempt_state server)" > "$OUT/attempt-state-after-kill.txt"
if [ "$(latest_attempt_state server)" != "RUNNING" ]; then
  echo "expected the killed worker's attempt to remain RUNNING, found $(latest_attempt_state server)" >&2
  exit 8
fi
for dir in "$WORLD/.palimpsest/worlds"/attempt-*; do
  [ -d "$dir" ] || continue
  git -C "$dir" log -1 --format=%s > "$OUT/retained-world-subject.txt" 2>/dev/null || true
  git -C "$dir" rev-parse HEAD > "$OUT/retained-world-head.txt" 2>/dev/null || true
done

# ── T3: the fleet compatibility fact arrives untracked ────────────────────────────────────────────
mkdir -p "$WORLD/updates/2026-11-03"
cat > "$WORLD/$INPUT_REL" <<'MD'
# Fleet client compatibility note — 2026-11-03

The fleet mobile client (v4.2) renders readings as they arrive over one long-lived connection. A
unary batch response is not admissible: the client cannot render a batch, and 30 readings at 12 KiB
each do not fit its 256 KiB buffer.

Required for the service interface:

- `StreamReadings` MUST be declared `returns (stream Reading)`.
- Each frame MUST carry exactly one Reading, and every frame MUST stay under 16 KiB.
- `GetReading` stays unary and keeps its current value.

The measured 12 KiB per reading comes from the fleet team's 2026-11-02 capture.
MD
sha256sum "$WORLD/$INPUT_REL" > "$OUT/input-sha256.txt"
git -C "$WORLD" status --porcelain > "$OUT/canonical-status-after-input.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/input-arrived-at.txt"

# ── T4–T5: successor, streaming server, settlement, acceptance ───────────────────────────────────
start_host CLOSE "PSVR_PRINCIPAL_CLOSE You are a NEW principal after a crash. Read the pulse and close the retained attempt as a successor; the next session starts the replacement."
wait_host CLOSE
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/successor-closed-at.txt"
start_host CONTINUE "PSVR_PRINCIPAL_CONTINUE You are the principal. Start the replacement attempt for the server task and settle it honestly."
wait_host CONTINUE
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/server-settled-at.txt"
promote server

# ── T6: client ───────────────────────────────────────────────────────────────────────────────────
start_host P4 "PSVR_PRINCIPAL_P4 You are the principal. Delegate the client task, settle the result, and record the operator handoff."
wait_host P4
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/client-settled-at.txt"
promote client

# ── T7: delivery ─────────────────────────────────────────────────────────────────────────────────
start_host P5 "PSVR_PRINCIPAL_P5 You are a new session. Read the pulse and record the episode's DELIVER conclusion over the accepted migration."
wait_host P5

# ── T8: independent verification on the accepted head ────────────────────────────────────────────
CANON_HEAD="$(git -C "$WORLD" rev-parse HEAD)"
echo "$CANON_HEAD" > "$OUT/canonical-head.txt"
git -C "$WORLD" log --oneline -20 > "$OUT/canonical-log.txt"
( cd "$WORLD" && node --test ) > "$OUT/canonical-tests.log" 2>&1
echo "$?" > "$OUT/canonical-tests-exit.txt"
grep -E "^(ℹ (tests|pass|fail)|# (tests|pass|fail))" "$OUT/canonical-tests.log" > "$OUT/canonical-tests-summary.txt" || true
node -e '
const fs=require("fs"),p=process.argv[1];
const t=fs.readFileSync(p+"/out/canonical-tests.log","utf8");
const n=(re)=>{const m=re.exec(t);return m?Number(m[1]):null};
const s={tests:n(/ℹ tests (\d+)/u),pass:n(/ℹ pass (\d+)/u),fail:n(/ℹ fail (\d+)/u),files:null};
fs.writeFileSync(p+"/out/canonical-tests.json",JSON.stringify(s,null,2)+"\n");
' "$RUN"

mkdir -p "$OUT/session"
for stream in "$HOME_RUN"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
cp "$RUN/mock-scripts.json" "$OUT/mock-scripts.json"
cp "$RUN/seed.json" "$OUT/seed.json"
cp "$RUN/deployment.json" "$OUT/deployment.json"

echo "--- PSVR-A summary ---"
node -e 'const s=require(process.argv[1]);console.log(JSON.stringify({canonicalHead:s.head,tests:s.tests},null,2));' "$RUN/out/canonical-tests.json"
