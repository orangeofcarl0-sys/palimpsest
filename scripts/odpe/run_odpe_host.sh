#!/usr/bin/env bash
# ODPE-C deterministic Windows-host scenario (cross-domain: software migration).
#
# The REAL Windows DSH host runs the REAL Palimpsest product. A real worker writes and commits a
# partial migration plan in its own execution world, then parks; the host tree is KILLED, leaving a
# RUNNING attempt and a retained world. A measured payload fact then arrives as an UNTRACKED path
# the original basis never contained. A NEW principal:
#
#   - observes the retained attempt and the input fact;
#   - closes the unproven attempt as a successor and starts a NEW attempt;
#   - the new worker receives the measured fact ONLY through the product's context pull
#     (`@ctx/input/...`), writes the plan from those bytes and commits it;
#   - the worker exits WITHOUT reporting (the missing-settlement shape);
#   - the principal reads `readiness`, `finalize`s the observed candidate, and concludes
#     WAIT_FOR_OPERATOR.
#
# The operator then promotes the candidate through the existing path, and a later session records
# DELIVER. Model content is a deterministic Messages stand-in (labelled MOCK_MODEL): this verifies
# the REAL HOST ENGINEERING path, not autonomous model behaviour.
set -euo pipefail

REPO="${REPO:-/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${ODPE_BASE:-$HOME/odpe}"
RUN="$BASE/host-1"
OUT="$RUN/out"
WORLD="$RUN/world"
STATE="$RUN/state"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/odpe-host"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
MockKey="odpe-mock-key"
MockPort=18191
INPUT_REL="updates/2026-11-03/payload-measurement.md"

if [ ! -f "$DSH_BIN" ]; then
  echo "DSH bin not found at $DSH_BIN" >&2
  exit 2
fi
if [ ! -d "$REPO/node_modules" ]; then
  echo "the repository node_modules is missing at $REPO" >&2
  exit 2
fi

mkdir -p "$BASE"
node "$REPO/scripts/odpe/prepare_odpe.mjs" --run="$RUN" > "$BASE/prepare-odpe.json"
mkdir -p "$OUT" "$HOME_RUN/profiles/node_modules" "$PROFILE" "$RUN/tmp"
rm -rf "$PROFILE" "$HOME_RUN/profiles/node_modules"
mkdir -p "$HOME_RUN/profiles/node_modules" "$PROFILE"

cp -r "$REPO/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
cmd //c mklink //J "$(cygpath -w "$HOME_RUN/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-odpe-host",
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
    apiKeyEnv: ODPE_MOCK_KEY
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
  echo "the mock server did not start" >&2
  cat "$OUT/mock.log" >&2 || true
  exit 7
fi

start_host() {
  local name="$1"
  local prompt="$2"
  local capacity="$3"
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
      ODPE_MOCK_KEY="$MockKey" \
      node "$DSH_BIN" --profile odpe-host --once "$prompt"
  ) > "$log/run.log" 2> "$log/run.err" &
  echo "$!" > "$log/pid.txt"
}

wait_host() {
  local name="$1"
  local pid
  pid="$(cat "$OUT/session-$name/pid.txt")"
  local deadline=$((SECONDS + 600))
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$SECONDS" -gt "$deadline" ]; then
      taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
      break
    fi
    sleep 1
  done
  set +e
  wait "$pid" 2>/dev/null
  local code=$?
  set -e
  echo "$code" > "$OUT/session-$name/exit-code.txt"
  echo "session $name exit=$code"
}

# A Git Bash subshell is NOT a separate Windows process: its "pid" cannot be handed to taskkill
# (that killed the scenario itself once). The host is identified by its own command line instead.
stop_host() {
  powershell -NoProfile -ExecutionPolicy Bypass -File "$REPO/scripts/odpe/stop_hosts.ps1" -Marker "ODPE_PRINCIPAL_$1" >/dev/null 2>&1 || true
}

cleanup_all() {
  local name
  for name in P1 P2 P3; do stop_host "$name"; done
  taskkill //PID "${MOCK_PID:-0}" //T //F >/dev/null 2>&1 || true
}
trap cleanup_all EXIT

kill_host_tree() {
  local name="$1"
  local pid
  pid="$(cat "$OUT/session-$name/pid.txt")"
  stop_host "$name"
  sleep 1
  set +e
  wait "$pid" 2>/dev/null
  local code=$?
  set -e
  echo "$code" > "$OUT/session-$name/exit-code.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/session-$name/killed-at.txt"
  echo "session $name KILLED (exit=$code)"
}

task_state() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT state FROM tasks WHERE task_id=? LIMIT 1").get(process.argv[2]);process.stdout.write(r===undefined?"MISSING":String(r.state));' "$STATE/palimpsest.sqlite" "$1"
}

latest_attempt_state() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT state FROM attempts WHERE task_id=? ORDER BY last_event_id DESC LIMIT 1").get(process.argv[2]);process.stdout.write(r===undefined?"MISSING":String(r.state));' "$STATE/palimpsest.sqlite" "$1"
}

wait_task_state() {
  local task="$1"
  local wanted="$2"
  for _ in $(seq 1 300); do
    if [ "$(task_state "$task")" = "$wanted" ]; then return 0; fi
    sleep 0.2
  done
  echo "timed out waiting for task $task state $wanted (now $(task_state "$task"))" >&2
  return 1
}

wait_world_commit() {
  local subject="$1"
  for _ in $(seq 1 450); do
    for dir in "$WORLD/.palimpsest/worlds"/attempt-*; do
      [ -d "$dir" ] || continue
      if git -C "$dir" log -1 --format=%s 2>/dev/null | grep -q "$subject"; then return 0; fi
    done
    sleep 0.2
  done
  echo "timed out waiting for a worker commit containing: $subject" >&2
  return 1
}

# ── T1–T3: a real worker commits a partial plan, then the host tree is killed ─────────────────────
start_host P1 "ODPE_PRINCIPAL_P1 You are the principal. Read the pulse, delegate the migration-plan task to a real worker, and keep this host alive." capacity-p1
wait_world_commit "write worker migration plan partial"
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/partial-committed-at.txt"
sleep 2
kill_host_tree P1
echo "$(latest_attempt_state billing-cutover)" > "$OUT/attempt-state-after-kill.txt"
if [ "$(latest_attempt_state billing-cutover)" != "RUNNING" ]; then
  echo "expected the killed worker's attempt to remain RUNNING, found $(latest_attempt_state billing-cutover)" >&2
  exit 8
fi
for dir in "$WORLD/.palimpsest/worlds"/attempt-*; do
  [ -d "$dir" ] || continue
  git -C "$dir" rev-parse HEAD > "$OUT/retained-world-head.txt" 2>/dev/null || true
  echo "$dir" > "$OUT/retained-world-path.txt"
  git -C "$dir" log -1 --format=%s > "$OUT/retained-world-subject.txt" 2>/dev/null || true
done

# ── T4: the measured payload fact arrives as an UNTRACKED project path ───────────────────────────
mkdir -p "$WORLD/updates/2026-11-03"
cat > "$WORLD/$INPUT_REL" <<'MD'
# Measured billing batch payload

The billing batch payload was measured on 2026-11-03.

- p50: 1.4 MiB
- p95: 2.1 MiB
- max: 3.4 MiB

The legacy gateway's 64 KiB unary limit is an assumption about the old REST path, not a property of
the batch data. A unary gRPC call is not admissible at the measured size; the batch path must stream.
MD
sha256sum "$WORLD/$INPUT_REL" > "$OUT/input-sha256.txt"
git -C "$WORLD" status --porcelain > "$OUT/canonical-status-after-input.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/constraint-arrived-at.txt"
# The fixture does NOT copy the input into any attempt world; the worker's only path to it is the
# product's compiled context + pull.

# ── T5–T9: a NEW principal succeeds the attempt, delegates, finalizes on the current basis ───────
start_host P2 "ODPE_PRINCIPAL_P2 You are a NEW principal host after a crash. Read the pulse, succeed the retained attempt, delegate a new attempt, and settle the candidate honestly." capacity-p2
wait_world_commit "measured basis"
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/measured-commit-at.txt"
wait_task_state billing-cutover VERIFYING
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/finalized-at.txt"
rm -f "$WORLD/$INPUT_REL"
rmdir "$WORLD/updates/2026-11-03" "$WORLD/updates" 2>/dev/null || true
node -e 'require("node:fs").writeFileSync(process.argv[1], "released\n")' "$WORLD/.palimpsest/release-host-p2"
wait_host P2

# ── T10: the operator promotes the candidate through the existing path ───────────────────────────
node "$REPO/scripts/pwrs/operator_accept.mjs" --run="$RUN" --state="$STATE" --world="$WORLD" --project=odpe --task=billing-cutover --label=odpe \
  > "$OUT/promote-odpe.json" 2> "$OUT/promote-odpe.err" || true
wait_task_state billing-cutover SATISFIED
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/promoted-at.txt"

# ── T11–T12: a later session reads the accepted asset and delivers naturally ─────────────────────
start_host P3 "ODPE_PRINCIPAL_P3 You are a NEW principal session. Read the pulse; if the accepted plan is complete, record the episode's DELIVER conclusion and stop." capacity-p3
wait_host P3

node "$REPO/scripts/odpe/summarize_odpe.mjs" --run="$RUN" > "$OUT/summarize.json"
cp "$OUT/summarize.json" "$RUN/odpe-summary.json"
find "$HOME_RUN/sessions" -type f -printf "%p %s\n" > "$OUT/session-files.txt" 2>/dev/null || true
mkdir -p "$OUT/session"
for stream in "$HOME_RUN"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
cp "$RUN/mock-scripts.json" "$OUT/mock-scripts.json"
cp "$RUN/seed.json" "$OUT/seed.json"
cp "$RUN/deployment.json" "$OUT/deployment.json"

echo "--- ODPE summary ---"
node -e 'const s=require(process.argv[1]);console.log(JSON.stringify({episode:s.episode.state,intent:s.episode.intent,artifact:s.canonicalArtifact,promotions:s.promotions.map(p=>p.taskId),attempts:s.attempts.map(a=>a.state),inputs:s.contextManifests.map(m=>m.inputPaths),pulls:s.workerPulls},null,2));' "$RUN/odpe-summary.json"
