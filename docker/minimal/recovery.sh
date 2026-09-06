#!/bin/sh
# Crash-recovery E2E (the production uncertain->reconcile case): a clean
# container, a real git repo, and a promote that is SIGKILLed while its
# Ordarium operation is mid-flight. The next process must recover the
# orphaned promotion through the reconcilable engine - exactly the evidence
# the proposition-two criterion 2 sub-item ("first real recovery case")
# asks for. No fault injector and no test double: the kill is real, the
# ledgers are the production shape, the recovery path is the shipped one.
set -eu

echo "== 0. runtime provisioning (stock node:24-bookworm) =="
command -v python >/dev/null 2>&1 || ln -sf /usr/bin/python3 /usr/local/bin/python
curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py >/dev/null 2>&1
python3 /tmp/get-pip.py --break-system-packages -q >/dev/null 2>&1
python3 -m pip install --break-system-packages -q pytest >/dev/null 2>&1

echo "== 1. clean consumer install (release-tarball channel) =="
TGZ=$(ls /workspace/palimpsest-dsh-*.tgz)
mkdir -p /clean && cd /clean
npm init -y >/dev/null 2>&1
cp /workspace/pnpm-workspace.yaml /clean/pnpm-workspace.yaml
npm install -g pnpm@11.21.0 >/dev/null 2>&1
pnpm add "$TGZ" >/dev/null 2>&1

echo "== 2. clean DSH home + real git repo =="
export DSH_HOME=/clean/dsh
DB=/clean/dsh/palimpsest/recovery.sqlite
OPS=/clean/dsh/ordarium/operations.sqlite
export DB OPS
PAL="/clean/node_modules/.bin/palimpsest --db $DB --ops $OPS --repo /clean/repo"
mkdir -p /clean/repo && cd /clean/repo
git init -q -b main
git config user.email rec@clean.test && git config user.name rec
printf 'def test_clean():\n    assert True\n' > test_clean.py
git add -A && git commit -qm "seed"

echo "== 3. drive to a gate-passed candidate =="
$PAL new proj-rec "crash recovery in the production ledger"
$PAL next
$PAL next
ATT=$($PAL status | node -e "const v=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(v.attempts[0].attempt_id)")
CLAIM=$($PAL claim "$ATT")
WT=$(echo "$CLAIM" | node -e "const v=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(v.worktreePath)")
cd "$WT"
# Fatten the attempt commit so the promote merge takes ~1s: that is the
# uncertain window the killer fires into.
mkdir -p payload
i=0
while [ "$i" -lt 8000 ]; do
  printf 'payload line for %s\n' "$i" > "payload/f_$(( i / 200 ))_file_$i.txt"
  i=$(( i + 1 ))
done
printf 'crash recovery change\n' > change.md
git add -A && git commit -qm "work: crash recovery change"
COMMIT=$(git rev-parse HEAD)
cd /clean/repo
printf '[{"gate_id":"gate-release","version":1,"subject_type":"attempt","require":{"all":[{"exists":{"predicate":"tests_pass"}}]}}]' > /clean/gates.json
$PAL gate "$ATT" tests_pass 0 --gate /clean/gates.json python -m pytest
$PAL report "$ATT" completed "crash recovery run" --commit "$COMMIT"

echo "== 4. SIGKILL promote mid-operation (real kill, no fault injector) =="
node /workspace/docker/minimal/killer.mjs "$OPS" \
  /clean/node_modules/.bin/palimpsest --db "$DB" --ops "$OPS" --repo /clean/repo \
  promote gate-release

echo "== 5. orphan state (pre-recovery evidence) =="
node -e "
const { DatabaseSync } = require('node:sqlite');
const ops = new DatabaseSync(process.env.OPS, { readOnly: true });
const pal = new DatabaseSync(process.env.DB, { readOnly: true });
const state = ops.prepare('SELECT state FROM ordarium_operations ORDER BY rowid DESC LIMIT 1').get().state;
const prepared = pal.prepare(\"SELECT COUNT(*) c FROM events WHERE event_type='PROMOTION_PREPARED'\").get().c;
const committed = pal.prepare(\"SELECT COUNT(*) c FROM events WHERE event_type='PROMOTION_COMMITTED'\").get().c;
console.log('PRE-RECOVERY:', JSON.stringify({ operationState: state, promotionPrepared: prepared, promotionCommitted: committed }));
if (committed !== 0 || prepared !== 1) { console.error('expected an in-flight promotion'); process.exit(1); }
"

echo "== 6. operation-lease expiry (engine default 30s), then the recovery turn =="
sleep 32
$PAL run 5

echo "== 7. post-recovery evidence =="
node -e "
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('node:child_process');
const ops = new DatabaseSync(process.env.OPS, { readOnly: true });
const pal = new DatabaseSync(process.env.DB, { readOnly: true });
const final = ops.prepare('SELECT operation_id, state FROM ordarium_operations ORDER BY rowid DESC LIMIT 1').get();
const chain = ops.prepare('SELECT state, at FROM ordarium_operation_events WHERE operation_id=? ORDER BY semantic_revision').all(final.operation_id).map((r) => r.state);
const prepared = pal.prepare(\"SELECT COUNT(*) c FROM events WHERE event_type='PROMOTION_PREPARED'\").get().c;
const committedRow = pal.prepare(\"SELECT payload_json FROM events WHERE event_type='PROMOTION_COMMITTED'\").get();
const reason = committedRow ? JSON.parse(new TextDecoder().decode(committedRow.payload_json)).reason : null;
const log = execFileSync('git', ['log', '--oneline', 'main'], { cwd: '/clean/repo' }).toString().trim().split('\n');
const mergeCount = log.filter((l) => l.includes('promote ')).length;
const out = { operationState: final.state, operationEventChain: chain, promotionPrepared: prepared, promotionCommittedReason: reason, promoteMergeCommitsOnMain: mergeCount, mainLogHead: log[0] };
console.log('EVIDENCE:', JSON.stringify(out, null, 2));
const ok =
  (final.state === 'succeeded' || final.state === 'reconciled') &&
  prepared === 1 &&
  typeof reason === 'string' && reason.startsWith('recovered:') &&
  mergeCount === 1;
if (!ok) { console.error('recovery evidence assertions failed'); process.exit(1); }
console.log('RECOVERY E2E: ALL ASSERTIONS PASSED');
"
echo "== done =="
