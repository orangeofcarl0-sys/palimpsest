#!/usr/bin/env bash
# PNWF direct-host scenario — a REAL Windows DSH host with NO formal Task and NO worker.
#
#   P0  writes an uncommitted draft and exits.
#   P1  reads the draft, finishes and commits the direct outcome through native Git, inspects the
#       product's guidance, and records DELIVER.
#   P2  a new session reads the pulse and reports the conclusion and the artifact's actual commit.
#
# The model content is a labelled deterministic Messages stand-in; the host, tools, Git, SQLite,
# ProjectIR, ProjectWorkspace, Continuity, Episode and status/guidance are the real product.
set -euo pipefail

REPO="${REPO:-/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="${PNWF_BASE:-$HOME/pnwf-direct}"
RUN="$BASE/run"
WORLD="$RUN/world"
STATE="$RUN/state"
OUT="$RUN/out"
HOME_RUN="$RUN/home"
PROFILE="$HOME_RUN/profiles/pnwf-host"
DSH_HOME_REAL="$HOME/.dsh"
DSH_MODULES="${PNWF_DSH_MODULES:-$DSH_HOME_REAL/profiles/node_modules/@deepseek-ai}"
DSH_BIN="${PNWF_DSH_BIN:-/c/Users/66494/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/lib/bin.js}"
MOCK_PORT="${PNWF_MOCK_PORT:-18195}"
MOCK_KEY="pnwf-mock-key"

if [ ! -f "$DSH_BIN" ]; then echo "DSH bin not found at $DSH_BIN" >&2; exit 2; fi
if [ ! -d "$REPO/node_modules" ]; then echo "the repository node_modules is missing at $REPO" >&2; exit 2; fi

mkdir -p "$BASE" "$OUT" "$RUN/tmp"
node "$REPO/scripts/pnwf/prepare_direct.mjs" --run="$RUN" --repo="$REPO" > "$OUT/prepare.json"

rm -rf "$PROFILE" "$HOME_RUN/profiles/node_modules"
mkdir -p "$PROFILE" "$HOME_RUN/profiles/node_modules"
cp -r "$REPO/host/dsh" "$HOME_RUN/profiles/node_modules/palimpsest-dsh-host"
cp -r "$REPO/host/deployment" "$HOME_RUN/profiles/node_modules/palimpsest-host-deployment"
cmd //c mklink //J "$(cygpath -w "$HOME_RUN/profiles/node_modules/@deepseek-ai")" "$(cygpath -w "$DSH_MODULES")" >/dev/null

cat > "$PROFILE/package.json" <<'JSON'
{
  "name": "dsh-profile-pnwf-host",
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
    apiKeyEnv: PNWF_MOCK_KEY
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
      PNWF_MOCK_KEY="$MOCK_KEY" \
      node "$DSH_BIN" --profile pnwf-host --once "$(cat "$RUN/prompts/$name.txt")"
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

HEAD_SUBJECT="$(git -C "$WORLD" log -1 --format=%s)"
HEAD_COMMIT="$(git -C "$WORLD" rev-parse HEAD)"
STATUS="$(git -C "$WORLD" status --porcelain)"
( cd "$WORLD" && node --test ) > "$OUT/canonical-tests.log" 2>&1
TESTS_EXIT=$?

node - "$STATE" "$HEAD_COMMIT" "$HEAD_SUBJECT" "$TESTS_EXIT" <<'NODE' > "$OUT/result.json"
const { DatabaseSync } = require("node:sqlite");
const { readFileSync } = require("node:fs");
const [state, head, subject, testsExit] = process.argv.slice(2);
const db = new DatabaseSync(`${state}/palimpsest.sqlite`);
const tasks = db.prepare("SELECT COUNT(*) AS n FROM tasks").get();
const attempts = db.prepare("SELECT COUNT(*) AS n FROM attempts").get();
const promotions = db.prepare("SELECT COUNT(*) AS n FROM promotions").get();
const journal = new DatabaseSync(`${state}/journal.sqlite`);
const entries = journal.prepare("SELECT type, payload_json FROM project_journal_events ORDER BY seq DESC LIMIT 12").all();
const deliver = entries.find((entry) => /DELIVER/u.test(String(entry.payload_json))) ?? null;
const result = {
  schema: "pnwf-direct-host/v1",
  head,
  subject,
  testsExit: Number(testsExit),
  tasks: Number(tasks.n),
  attempts: Number(attempts.n),
  promotions: Number(promotions.n),
  deliverRecorded: deliver !== null,
  deliverBody: deliver === null ? null : String(deliver.payload_json).slice(0, 1600),
  journalEntries: entries.map((entry) => `${String(entry.type)}:${String(entry.payload_json).slice(0, 80)}`),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
NODE

cat "$OUT/result.json"
if [ "$(node -e 'const r=require(process.argv[1]);process.stdout.write(String(r.tasks))' "$OUT/result.json")" != "0" ] || \
   [ "$(node -e 'const r=require(process.argv[1]);process.stdout.write(String(r.attempts))' "$OUT/result.json")" != "0" ] || \
   [ "$(node -e 'const r=require(process.argv[1]);process.stdout.write(String(r.promotions))' "$OUT/result.json")" != "0" ] || \
   [ "$(node -e 'const r=require(process.argv[1]);process.stdout.write(String(r.deliverRecorded))' "$OUT/result.json")" != "true" ]; then
  echo "PNWF direct-host assertions failed" >&2
  exit 9
fi
echo "PNWF direct-host PASS"
