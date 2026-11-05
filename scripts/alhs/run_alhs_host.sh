#!/usr/bin/env bash
# ALHS deterministic Windows-host scenario.
#
# The REAL Windows DSH host runs the REAL Palimpsest product. A real worker subprocess writes and
# commits the baseline cost model, then parks before reporting. A measured constraint retires the
# baseline plan; a replacement worker changes the world; a NEW principal inspects the late result,
# sees the path-level reuse facts, writes a governed task that reuses the valid pricing, and runs it.
# The episode concludes WAIT_FOR_OPERATOR, the operator promotes, and a later session records DELIVER
# and exits naturally.
#
# The model content is a deterministic Messages stand-in (labelled MOCK_MODEL); no cognitive, quality
# or comparative claim is made from this run.
set -euo pipefail

REPO="${REPO:-/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${ALHS_BASE:-$HOME/alhs}"
RUN="$BASE/host-1"
OUT="$RUN/out"
WORLD="$RUN/world"
STATE="$RUN/state"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/alhs-host"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
MockKey="alhs-mock-key"
MockPort=18086

if [ ! -f "$DSH_BIN" ]; then
  echo "DSH bin not found at $DSH_BIN" >&2
  exit 2
fi
if [ ! -d "$REPO/node_modules" ]; then
  echo "the repository node_modules is missing at $REPO" >&2
  exit 2
fi

mkdir -p "$BASE"
node "$REPO/scripts/alhs/prepare_alhs.mjs" --run="$RUN" > "$BASE/prepare-alhs.json"
mkdir -p "$OUT" "$HOME_RUN/profiles/node_modules" "$PROFILE" "$RUN/tmp"
rm -rf "$PROFILE" "$HOME_RUN/profiles/node_modules"
mkdir -p "$HOME_RUN/profiles/node_modules" "$PROFILE"

cp -r "$REPO/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
cmd //c mklink //J "$(cygpath -w "$HOME_RUN/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-alhs-host",
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
      node "$DSH_BIN" --profile alhs-host --once "$prompt"
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

wait_attempt_state() {
  local task="$1"
  local wanted="$2"
  for _ in $(seq 1 450); do
    if [ "$(latest_attempt_state "$task")" = "$wanted" ]; then return 0; fi
    sleep 0.2
  done
  echo "timed out waiting for latest attempt on $task to be $wanted (now $(latest_attempt_state "$task"))" >&2
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

run_promote() {
  local project="$1"
  local task="$2"
  local label="$3"
  node "$REPO/scripts/lhape/operator_promote.mjs" --run="$RUN" --project="$project" --task="$task" --label="$label" \
    > "$OUT/promote-$label.json" 2> "$OUT/promote-$label.err"
}

start_host A1 "ALHS_PRINCIPAL_A1 You are the principal. Read the pulse, start the baseline cost work through a real worker, and keep this host alive. Work only inside the project world." capacity-a1
wait_attempt_state cost RUNNING
wait_world_commit "write cost baseline"
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/baseline-committed-at.txt"

mkdir -p "$WORLD/.palimpsest/inputs"
cat > "$WORLD/.palimpsest/inputs/corridor-measurement.md" <<'MD'
# Measured site-B corridor

Measured width: 700 mm (survey performed 2026-11-03).

The earlier 1200 mm corridor value was an assumption, not a measurement. It is superseded.
The 900 mm unit is NOT admissible at site B.
MD
git -C "$WORLD" status --short > /dev/null
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/constraint-arrived-at.txt"

start_host A2 "ALHS_PRINCIPAL_A2 You are a NEW principal host. Read the pulse and the measured constraint, retire the invalid baseline plan, and start the revised capacity worker." capacity-a2
wait_attempt_state capacity-v2 RUNNING
wait_world_commit "write revised capacity"
wait_attempt_state capacity-v2 COMPLETED

# The parked baseline worker reports while the project head is still the head its world was cut
# from, so its late result can settle on the retired task; the promotion below moves the world AFTER
# that, which is what makes the result stale for the later reuse inspection.
node -e 'require("node:fs").writeFileSync(process.argv[1], "released\n")' "$WORLD/.palimpsest/release-cost"
wait_attempt_state cost COMPLETED
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/late-result-at.txt"

node -e 'require("node:fs").writeFileSync(process.argv[1], "released\n")' "$WORLD/.palimpsest/release-host-a1"
node -e 'require("node:fs").writeFileSync(process.argv[1], "released\n")' "$WORLD/.palimpsest/release-host-a2"
wait_host A1
wait_host A2

run_promote alhs capacity-v2 capacity-v2
wait_task_state capacity-v2 SATISFIED
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/capacity-promoted-at.txt"

start_host A3 "ALHS_PRINCIPAL_A3 You are a NEW principal host. Read the pulse and the late result, inspect which paths are still reusable, write a governed reuse task, run it, and conclude the episode for operator acceptance." capacity-a3
wait_attempt_state cost-v2 RUNNING
wait_world_commit "write reused cost model"
wait_attempt_state cost-v2 COMPLETED
node -e 'require("node:fs").writeFileSync(process.argv[1], "released\n")' "$WORLD/.palimpsest/release-host-a3"
wait_host A3
run_promote alhs cost-v2 cost-v2
wait_task_state cost-v2 SATISFIED
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/cost-v2-promoted-at.txt"

start_host A4 "ALHS_PRINCIPAL_A4 You are a NEW principal session. Read the pulse and record the final episode conclusion if the package is complete." capacity-a4
wait_host A4

node "$REPO/scripts/alhs/summarize_alhs.mjs" --run="$RUN" > "$OUT/summarize.json"
find "$HOME_RUN/sessions" -type f -printf "%p %s\n" > "$OUT/session-files.txt" 2>/dev/null || true
mkdir -p "$OUT/session"
for stream in "$HOME_RUN"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
cp "$RUN/mock-scripts.json" "$OUT/mock-scripts.json"
cp "$RUN/seed.json" "$OUT/seed.json"

echo "--- ALHS summary ---"
node -e 'const s=require(process.argv[1]);console.log(JSON.stringify({episode:s.episode.state,current:s.episode.current,intent:s.episode.conclusion?.intent,tasks:s.tasks,promotions:s.promotions.map(p=>p.taskId),reuse:s.reuse,artifact:s.costV2,naturalExit:s.naturalExit},null,2));' "$RUN/alhs-summary.json"
