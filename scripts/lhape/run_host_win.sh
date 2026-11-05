#!/usr/bin/env bash
# LHAPE authoritative Windows-host scenario.
#
# The REAL Windows DSH host runs the REAL Palimpsest product. Real worker subprocesses are admitted
# through the Windows read fence, run PTC programs, write files, commit them, and settle through the
# product. The model content is a deterministic Messages stand-in (labelled MOCK_MODEL).
#
# The Windows backend admits ONE active read-fenced worker per HOST, while the project declares
# concurrency 2. The scenario therefore uses TWO independent hosts with distinct capacity roots for
# the two overlapping workers, and further hosts for the replan, rework and integration sessions.
#
# Usage: run_host_win.sh [main|interrupt]
set -euo pipefail

SCENARIO="${1:-main}"
REPO="${REPO:-/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${LHAPE_BASE:-$HOME/lhape}"
RUN="$BASE/$SCENARIO"
OUT="$RUN/out"
WORLD="$RUN/world"
STATE="$RUN/state"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/lhape-host"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
MockKey="lhape-mock-key"
MockPort=18084

if [ ! -f "$DSH_BIN" ]; then
  echo "DSH bin not found at $DSH_BIN" >&2
  exit 2
fi
if [ ! -d "$REPO/node_modules" ]; then
  echo "the repository node_modules is missing at $REPO" >&2
  exit 2
fi

mkdir -p "$BASE"
node "$REPO/scripts/lhape/prepare_run.mjs" --run="$RUN" --scenario="$SCENARIO" > "$BASE/prepare-$SCENARIO.json"
mkdir -p "$OUT" "$HOME_RUN/profiles/node_modules" "$PROFILE" "$RUN/tmp"
rm -rf "$PROFILE" "$HOME_RUN/profiles/node_modules"
mkdir -p "$HOME_RUN/profiles/node_modules" "$PROFILE"

cp -r "$REPO/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
cmd //c mklink //J "$(cygpath -w "$HOME_RUN/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-lhape-host",
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

# The fence is qualified against rc.5; install the exact seam in a run-owned root.
if [ ! -d "$BASE/seam/node_modules/@deepseek-ai/dsh-win32-process" ]; then
  mkdir -p "$BASE/seam"
  npm install --prefix "$BASE/seam" @deepseek-ai/dsh-win32-process@0.2.1-rc.5 --no-save --no-package-lock > "$OUT/seam-install.log" 2>&1
fi

if curl -fsS --max-time 2 "http://127.0.0.1:${MockPort}/health" >/dev/null 2>&1; then
  echo "a stale mock server is already listening on port ${MockPort}; stop it before this run" >&2
  exit 7
fi
LHAPE_MOCK_PORT="$MockPort" LHAPE_MOCK_KEY="$MockKey" LHAPE_MOCK_SCRIPT="$RUN/mock-scripts.json" LHAPE_MOCK_LOG="$OUT/mock.jsonl" \
  node "$REPO/scripts/lhape/mock_llm.mjs" > "$OUT/mock.log" 2>&1 &
MOCK_PID=$!
trap 'taskkill //PID "$MOCK_PID" //T //F >/dev/null 2>&1 || true' EXIT
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
      LHAPE_MOCK_KEY="$MockKey" \
      node "$DSH_BIN" --profile lhape-host --once "$prompt"
  ) > "$log/run.log" 2> "$log/run.err" &
  echo "$!" > "$log/pid.txt"
}

wait_host() {
  local name="$1"
  local pid
  pid="$(cat "$OUT/session-$name/pid.txt")"
  local deadline=$((SECONDS + 300))
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

task_state() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT state FROM tasks WHERE task_id=? LIMIT 1").get(process.argv[2]);process.stdout.write(r===undefined?"MISSING":String(r.state));' "$STATE/palimpsest.sqlite" "$1"
}

latest_attempt_state() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT state FROM attempts WHERE task_id=? ORDER BY last_event_id DESC LIMIT 1").get(process.argv[2]);process.stdout.write(r===undefined?"MISSING":String(r.state));' "$STATE/palimpsest.sqlite" "$1"
}

attempt_count() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT COUNT(*) AS c FROM attempts WHERE task_id=?").get(process.argv[2]);process.stdout.write(String(r.c));' "$STATE/palimpsest.sqlite" "$1"
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

wait_attempt_state() {
  local task="$1"
  local wanted="$2"
  for _ in $(seq 1 300); do
    if [ "$(latest_attempt_state "$task")" = "$wanted" ]; then return 0; fi
    sleep 0.2
  done
  echo "timed out waiting for latest attempt on $task to be $wanted (now $(latest_attempt_state "$task"))" >&2
  return 1
}

wait_world_commit() {
  local subject="$1"
  for _ in $(seq 1 300); do
    for dir in "$WORLD/.palimpsest/worlds"/attempt-*; do
      [ -d "$dir" ] || continue
      if git -C "$dir" log -1 --format=%s 2>/dev/null | grep -q "$subject"; then return 0; fi
    done
    sleep 0.2
  done
  echo "timed out waiting for a worker commit containing: $subject" >&2
  return 1
}

run_promote() {
  local project="$1"
  local task="$2"
  local label="$3"
  node "$REPO/scripts/lhape/operator_promote.mjs" --run="$RUN" --project="$project" --task="$task" --label="$label" \
    > "$OUT/promote-$label.json" 2> "$OUT/promote-$label.err"
}

if [ "$SCENARIO" = "main" ]; then
  start_host S1A "LHAPE_PRINCIPAL_S1A You are one of two principal hosts for the same project. Start the capacity worker and keep this host alive. Work only inside the project world." capacity-a
  wait_attempt_state capacity RUNNING
  wait_world_commit "write deliverables/capacity.md"
  start_host S1B "LHAPE_PRINCIPAL_S1B You are the second principal host for the same project. Start the cost worker and keep this host alive. Work only inside the project world." capacity-b
  wait_attempt_state cost RUNNING
  wait_world_commit "write deliverables/cost.md"

  cat > "$WORLD/.palimpsest/inputs/constraint-update.md" <<'MD'
# Measured site-B corridor

Measured width: 700 mm (survey performed 2026-11-03).

The earlier 1200 mm corridor value was an assumption, not a measurement. It is superseded.
The 900 mm unit is NOT admissible at site B.
MD
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/constraint-arrived-at.txt"

  start_host S1C "LHAPE_PRINCIPAL_S1C You are a principal host on the same project. Read the measured constraint, record the contribution, revise the plan while the baseline workers are still alive, and start the revised capacity worker." capacity-c
  wait_task_state capacity STALE
  wait_attempt_state capacity-v2 RUNNING

  start_host S1D "LHAPE_PRINCIPAL_S1D You are a principal host on the same project. Start the revised cost worker and keep this host alive." capacity-d
  wait_attempt_state cost-v2 RUNNING

  # Release the two parked/old-basis workers AFTER the replan and the replacement workers exist.
  node -e 'require("node:fs").writeFileSync(process.argv[1], "released\n")' "$WORLD/.palimpsest/release-baseline"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/baseline-released-at.txt"

  wait_attempt_state capacity COMPLETED
  wait_attempt_state cost COMPLETED
  wait_attempt_state capacity-v2 COMPLETED
  wait_attempt_state cost-v2 COMPLETED
  run_promote lhape capacity-v2 capacity-v2

  COST_ATTEMPTS_BEFORE="$(attempt_count cost-v2)"
  start_host S2 "LHAPE_PRINCIPAL_S2 You are a NEW principal host. Read the pulse and the late result, inspect the stale cost result, and choose a safe continuation route." capacity-s2
  for _ in $(seq 1 300); do
    if [ "$(attempt_count cost-v2)" -gt "$COST_ATTEMPTS_BEFORE" ] && [ "$(latest_attempt_state cost-v2)" = "COMPLETED" ]; then break; fi
    sleep 0.2
  done
  if [ "$(latest_attempt_state cost-v2)" != "COMPLETED" ]; then
    echo "the rework attempt did not complete (latest $(latest_attempt_state cost-v2))" >&2
    exit 6
  fi
  sleep 2
  wait_host S2
  run_promote lhape cost-v2 cost-v2

  start_host S3 "LHAPE_PRINCIPAL_S3 You are another NEW principal host. Read the pulse and run the remaining integration work." capacity-s3
  wait_attempt_state integration COMPLETED
  sleep 2
  wait_host S3
  run_promote lhape integration integration

  wait_host S1A || true
  wait_host S1B || true
  wait_host S1C || true
  wait_host S1D || true
  node "$REPO/scripts/lhape/final_pulse.mjs" --run="$RUN" --project=lhape --scenario=main > "$OUT/final-pulse-command.json"
elif [ "$SCENARIO" = "interrupt" ]; then
  start_host IR1 "LHAPE_PRINCIPAL_IR1 You are the principal. Start the existing task through a real worker, then keep this host alive." capacity-ir1
  wait_world_commit "write interrupted artifact"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/kill-at.txt"
  # Kill the REAL Windows host process tree by its own command line. The Git-Bash `$!` is a
  # Cygwin PID, so `taskkill /PID $!` does not address the Node host; the measured result was a
  # host that kept sleeping and exited normally. This resolves the Windows PID first.
  WIN_HOST_PID="$(powershell -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'node.exe' -and \$_.CommandLine -like '*LHAPE_PRINCIPAL_IR1*' } | Select-Object -First 1).ProcessId" | tr -d '\r' | tr -d ' ')"
  if [ -z "$WIN_HOST_PID" ]; then
    echo "could not resolve the IR1 Windows host pid" >&2
    exit 8
  fi
  echo "$WIN_HOST_PID" > "$OUT/session-IR1/windows-pid.txt"
  taskkill //PID "$WIN_HOST_PID" //T //F >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! powershell -NoProfile -Command "if (Get-Process -Id $WIN_HOST_PID -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"; then
      sleep 0.2
    else
      break
    fi
  done
  REMAINING="$(powershell -NoProfile -Command "(Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'node.exe' -and \$_.CommandLine -like '*LHAPE_PRINCIPAL_IR1*' } | Measure-Object).Count" | tr -d '\r ')"
  if [ "$REMAINING" != "0" ]; then
    echo "the IR1 host process tree is still present after the kill (count $REMAINING)" >&2
    exit 8
  fi
  echo "killed host pid $WIN_HOST_PID" > "$OUT/kill-result.txt"
  sleep 2

  start_host IR2 "LHAPE_PRINCIPAL_IR2 You are a NEW host after a real kill. Read the pulse and execution state, then recover the committed work without re-running it." capacity-ir2
  wait_host IR2
  run_promote lhape-interrupt interrupted-write interrupted-write
  node "$REPO/scripts/lhape/final_pulse.mjs" --run="$RUN" --project=lhape-interrupt --scenario=interrupt > "$OUT/final-pulse-command.json"
else
  echo "unknown scenario $SCENARIO" >&2
  exit 2
fi

node "$REPO/scripts/lhape/summarize_run.mjs" --run="$RUN" --scenario="$SCENARIO" --codeFreeze="${LHAPE_CODE_FREEZE:-}" > "$OUT/summarize.json"

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
