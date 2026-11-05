#!/usr/bin/env bash
# PSVR-B deterministic Windows-host scenario — the cross-domain deployment decision package.
#
#   T0  the repository holds sources and a real consistency checker; no deliverables.
#   T1  worker 1 writes the technical assessment and the compliance record from the sources; the
#       principal settles, the operator verifies and promotes.
#   T2  a FIELD SURVEY arrives untracked: the measured corridor is 1,050 mm, superseding the 1,250 mm
#       drawing the technical assessment used.
#   T3  worker 2 pulls the survey through `@ctx/input/...`, writes that exact text into the package as
#       its basis, REVISES the Harbor Flats selection and rebuilds the cost model and schedule from
#       the measured value; it commits and exits without reporting.
#   T4  the principal finalizes with the acknowledgement; the operator verifies and promotes.
#   T5  worker 3 writes the risk review and the integrated recommendation over the revised package.
#   T6  operator acceptance; a later session records DELIVER.
#   T7  the harness runs `node check.mjs --final` on the accepted head.
set -euo pipefail

REPO="${REPO:-/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${PSVR_BASE:-$HOME/psvr}"
RUN="$BASE/b"
OUT="$RUN/out"
WORLD="$RUN/world"
STATE="$RUN/state"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/psvr-b-host"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai"
DSH_BIN="/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js"
MockKey="psvr-mock-key"
MockPort=18194
INPUT_REL="updates/2026-11-04/corridor-survey.md"

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin not found at $DSH_BIN" >&2; exit 2; fi
if [ ! -d "$REPO/node_modules" ]; then echo "the repository node_modules is missing at $REPO" >&2; exit 2; fi

mkdir -p "$BASE" "$OUT" "$RUN/tmp"
node "$REPO/scripts/psvr/prepare_psvr_b.mjs" --run="$RUN" --repo="$REPO" > "$OUT/prepare.json"
node "$REPO/scripts/psvr/build_mock_b.mjs" --out="$RUN/mock-scripts.json" > "$OUT/mock-scripts-built.json"

rm -rf "$PROFILE" "$HOME_RUN/profiles/node_modules"
mkdir -p "$PROFILE" "$HOME_RUN/profiles/node_modules"
cp -r "$REPO/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
cmd //c mklink //J "$(cygpath -w "$HOME_RUN/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-psvr-b-host",
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
      node "$DSH_BIN" --profile psvr-b-host --once "$prompt"
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

stop_host() { powershell -NoProfile -ExecutionPolicy Bypass -File "$REPO/scripts/psvr/stop_hosts.ps1" -Marker "PSVR_B_PRINCIPAL_$1" >/dev/null 2>&1 || true; }

cleanup_all() {
  for name in P1 P2 P3 P4; do stop_host "$name"; done
  taskkill //PID "${MOCK_PID:-0}" //T //F >/dev/null 2>&1 || true
}
trap cleanup_all EXIT

task_state() {
  node -e 'const {DatabaseSync}=require("node:sqlite");const db=new DatabaseSync(process.argv[1]);const r=db.prepare("SELECT state FROM tasks WHERE task_id=? LIMIT 1").get(process.argv[2]);process.stdout.write(r===undefined?"MISSING":String(r.state));' "$STATE/palimpsest.sqlite" "$1"
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
promote() {
  local task="$1"
  node "$REPO/scripts/psvr/accept.mjs" --run="$RUN" --task="$task" --label="$task" --project=psvr-b --command="node check.mjs" \
    > "$OUT/promote-$task.json" 2> "$OUT/promote-$task.err" || true
  wait_task_state "$task" SATISFIED
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/promoted-$task-at.txt"
}

# ── T1: technical ────────────────────────────────────────────────────────────────────────────────
start_host P1 "PSVR_B_PRINCIPAL_P1 You are the principal of a governed deployment-package project. Read the pulse, delegate the technical task, and settle the worker's result through the product."
wait_host P1
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/technical-settled-at.txt"
promote technical

# ── T2: the field survey arrives untracked ───────────────────────────────────────────────────────
mkdir -p "$WORLD/updates/2026-11-04"
cat > "$WORLD/$INPUT_REL" <<'MD'
# Harbor Flats service corridor — field survey 2026-11-04

Measured corridor width: 1050 mm (clear width at both ends, after the cable tray installation).

This supersedes drawing HF-A-114 (2024), which showed 1,250 mm. The drawing predates the cable tray;
the measured clear width is the value in force.

Surveyed by: field engineering team, 2026-11-04.
MD
sha256sum "$WORLD/$INPUT_REL" > "$OUT/input-sha256.txt"
git -C "$WORLD" status --porcelain > "$OUT/canonical-status-after-input.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/survey-arrived-at.txt"

# ── T3–T4: commercial revision, settlement, acceptance ──────────────────────────────────────────
start_host P2 "PSVR_B_PRINCIPAL_P2 You are the principal. Delegate the commercial task and settle its result; the package must agree with the current sources."
wait_host P2
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/commercial-settled-at.txt"
promote commercial

# ── T5–T6: recommendation, settlement, acceptance ───────────────────────────────────────────────
start_host P3 "PSVR_B_PRINCIPAL_P3 You are the principal. Delegate the recommendation task, settle it, and record the operator handoff."
wait_host P3
date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/recommendation-settled-at.txt"
promote recommendation

# ── T7: delivery ────────────────────────────────────────────────────────────────────────────────
start_host P4 "PSVR_B_PRINCIPAL_P4 You are a new session. Read the pulse and record the episode's DELIVER conclusion over the accepted package."
wait_host P4

# ── T8: independent verification on the accepted head ───────────────────────────────────────────
CANON_HEAD="$(git -C "$WORLD" rev-parse HEAD)"
echo "$CANON_HEAD" > "$OUT/canonical-head.txt"
git -C "$WORLD" log --oneline -20 > "$OUT/canonical-log.txt"
( cd "$WORLD" && node check.mjs --final ) > "$OUT/canonical-check.log" 2>&1
echo "$?" > "$OUT/canonical-check-exit.txt"
cat "$OUT/canonical-check.log"

mkdir -p "$OUT/session"
for stream in "$HOME_RUN"/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$OUT/session/"; fi
done
cp "$RUN/mock-scripts.json" "$OUT/mock-scripts.json"
cp "$RUN/seed.json" "$OUT/seed.json"
cp "$RUN/deployment.json" "$OUT/deployment.json"
