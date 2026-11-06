#!/usr/bin/env bash
# PNWF-CQ-H — real Windows DSH host: Direct → Governed basis boundary.
#
# P0 commits a direct outcome C with native Git (no formal Work).
# P1 inspects status, asks the product to delegate the existing formal task, receives the product's
#    HEAD_BASIS_MISMATCH refusal, and records CHECKPOINT.
# P2 reads the pulse/status from a new session and reports the canonical head and relation.
#
# The model content is a labelled deterministic Messages stand-in. Host, Git, SQLite, ProjectIR,
# Work, Continuity and the normal tool are the real product. No paid model session.
set -euo pipefail

REPO="${REPO:-/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${PNWF_CQ_BASE:-$HOME/pnwf-direct-governed}"
RUN="$BASE/run"
WORLD="$RUN/world"
STATE="$RUN/state"
OUT="$RUN/out"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/pnwf-dg-host"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="${PNWF_DSH_MODULES:-$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai}"
DSH_BIN="${PNWF_DSH_BIN:-/c/Windows/TEMP/dsh-021/node_modules/@deepseek-ai/dsh/lib/bin.js}"
MOCK_PORT="${PNWF_DG_MOCK_PORT:-18196}"
MOCK_KEY="pnwf-dg-mock-key"

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin not found at $DSH_BIN" >&2; exit 2; fi
if [ ! -d "$REPO/node_modules" ]; then echo "the repository node_modules is missing at $REPO" >&2; exit 2; fi

mkdir -p "$BASE" "$OUT" "$RUN/tmp"
node "$REPO/scripts/pnwf/prepare_direct_governed.mjs" --run="$RUN" --repo="$REPO" > "$OUT/prepare.json"

rm -rf "$PROFILE" "$HOME_RUN/profiles/node_modules"
mkdir -p "$PROFILE" "$HOME_RUN/profiles/node_modules"
cp -r "$REPO/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
cmd //c mklink //J "$(cygpath -w "$HOME_RUN/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-pnwf-dg-host",
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
    baseURL: http://127.0.0.1:${MOCK_PORT}
    apiKeyEnv: PNWF_DG_MOCK_KEY
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

if netstat -ano | grep LISTENING | grep -q ":${MOCK_PORT} "; then
  for pid in $(netstat -ano | grep LISTENING | grep ":${MOCK_PORT} " | awk '{print $5}' | sort -u); do
    taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true
  done
  sleep 1
fi
LHAPE_MOCK_PORT="$MOCK_PORT" LHAPE_MOCK_KEY="$MOCK_KEY" LHAPE_MOCK_SCRIPT="$RUN/mock-scripts.json" LHAPE_MOCK_LOG="$OUT/mock.jsonl" \
  node "$REPO/scripts/lhape/mock_llm.mjs" > "$OUT/mock.log" 2>&1 &
MOCK_PID=$!
cleanup() {
  taskkill //PID "$MOCK_PID" //T //F >/dev/null 2>&1 || true
}
trap cleanup EXIT
for _ in $(seq 1 100); do
  if curl -fsS "http://127.0.0.1:${MOCK_PORT}/health" >/dev/null 2>&1; then break; fi
  sleep 0.1
done
if ! curl -fsS "http://127.0.0.1:${MOCK_PORT}/health" >/dev/null 2>&1; then
  echo "the mock server did not start" >&2; cat "$OUT/mock.log" >&2 || true; exit 7
fi

start_host() {
  local name="$1"
  local log="$OUT/session-$name"
  mkdir -p "$log"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$log/started-at.txt"
  (
    cd "$WORLD"
    env DSH_HOME="$HOME_RUN" \
      PALIMPSEST_DSH_BIN="$(cygpath -w "$REPO/scripts/lhape/worker_tee.mjs")" \
      LHAPE_REAL_DSH_BIN="$(cygpath -w "$DSH_BIN")" \
      PALIMPSEST_DSH_ROOT="$(cygpath -w "$BASE/seam")" \
      PALIMPSEST_HOST_CAPACITY_ROOT="$(cygpath -w "$RUN/capacity-$name")" \
      TMP="$(cygpath -w "$RUN/tmp")" TEMP="$(cygpath -w "$RUN/tmp")" TMPDIR="$(cygpath -w "$RUN/tmp")" \
      PNWF_DG_MOCK_KEY="$MOCK_KEY" \
      node "$DSH_BIN" --profile pnwf-dg-host --once "$(cat "$RUN/prompts/$name.txt")"
  ) > "$log/run.log" 2> "$log/run.err" &
  echo "$!" > "$log/pid.txt"
}

wait_host() {
  local name="$1"; local pid; pid="$(cat "$OUT/session-$name/pid.txt")"
  local deadline=$((SECONDS + 600))
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$SECONDS" -gt "$deadline" ]; then taskkill //PID "$pid" //T //F >/dev/null 2>&1 || true; break; fi
    sleep 1
  done
  set +e; wait "$pid" 2>/dev/null; local code=$?; set -e
  echo "$code" > "$OUT/session-$name/exit-code.txt"
  date -u +%Y-%m-%dT%H:%M:%SZ > "$OUT/session-$name/ended-at.txt"
  echo "session $name exit=$code"
  return "$code"
}

for name in P0 P1 P2; do
  start_host "$name"
  wait_host "$name"
done

BASE_HEAD="$(node -e 'process.stdout.write(require(process.argv[1]).head)' "$RUN/core.json")"
WORLD_HEAD="$(git -C "$WORLD" rev-parse HEAD)"
DIRECT_HEAD="$(git -C "$WORLD" log -1 --format=%H)"
REFUSAL="$(grep -c 'HEAD_BASIS_MISMATCH' "$OUT/mock.jsonl" 2>/dev/null || true)"

REFUSAL="$REFUSAL" node - "$STATE" "$BASE_HEAD" "$WORLD_HEAD" <<'NODE' > "$OUT/result.json"
const { DatabaseSync } = require("node:sqlite");
const [state, baseHead, worldHead] = process.argv.slice(2);
const db = new DatabaseSync(`${state}/palimpsest.sqlite`);
const tasks = db.prepare("SELECT task_id, state FROM tasks ORDER BY task_id").all();
const attempts = db.prepare("SELECT COUNT(*) AS n FROM attempts").get();
const promotions = db.prepare("SELECT COUNT(*) AS n FROM promotions").get();
const types = new Set(db.prepare("SELECT DISTINCT event_type FROM events").all().map((row) => row.event_type));
const journal = new DatabaseSync(`${state}/journal.sqlite`);
const entries = journal.prepare("SELECT payload_json FROM project_journal_events ORDER BY seq DESC LIMIT 12").all();
const checkpoint = entries.find((entry) => /CHECKPOINT/u.test(String(entry.payload_json))) ?? null;
const result = {
  schema: "pnwf-direct-governed-host/v1",
  baseHead,
  worldHead,
  tasks,
  attempts: Number(attempts.n),
  promotions: Number(promotions.n),
  attemptStarted: types.has("ATTEMPT_STARTED"),
  promotionCommitted: types.has("PROMOTION_COMMITTED"),
  checkpointRecorded: checkpoint !== null,
  directRefusalObserved: process.env.REFUSAL === "0" ? false : true,
  journalEntries: entries.map((entry) => String(entry.payload_json).slice(0, 120)),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
NODE

node - "$OUT/result.json" "$STATE" "$BASE_HEAD" "$WORLD_HEAD" <<'NODE'
const { DatabaseSync } = require("node:sqlite");
const { readFileSync } = require("node:fs");
const [resultPath, state, baseHead, worldHead] = process.argv.slice(2);
const result = JSON.parse(readFileSync(resultPath, "utf8"));
const db = new DatabaseSync(`${state}/palimpsest.sqlite`);
const project = db.prepare("SELECT state_json FROM projects ORDER BY revision DESC LIMIT 1").get();
const canonical = JSON.parse(Buffer.from(project.state_json).toString("utf8")).head_commit;
const failures = [];
if (canonical !== baseHead) failures.push(`canonical head ${canonical} != base ${baseHead}`);
if (worldHead === baseHead) failures.push("the direct commit did not move the world");
if (result.attempts !== 0) failures.push(`attempts=${result.attempts}`);
if (result.promotions !== 0) failures.push(`promotions=${result.promotions}`);
if (result.attemptStarted) failures.push("ATTEMPT_STARTED was fabricated");
if (result.promotionCommitted) failures.push("PROMOTION_COMMITTED was fabricated");
if (!result.checkpointRecorded) failures.push("no CHECKPOINT conclusion");
if (!result.directRefusalObserved) failures.push("the product did not refuse HEAD_BASIS_MISMATCH");
if (failures.length > 0) {
  process.stderr.write(`PNWF-CQ direct-governed assertions failed:\n- ${failures.join("\n- ")}\n`);
  process.exit(9);
}
process.stdout.write("PNWF-CQ direct-governed PASS\n");
NODE
