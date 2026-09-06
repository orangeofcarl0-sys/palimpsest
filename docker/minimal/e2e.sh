#!/bin/sh
# Clean-environment E2E (production-ledger first-use evidence): a
# consumer-grade palimpsest session in a STOCK node:24-bookworm container.
# Base image provides node + git + python3; this script provisions the
# `python` alias and pytest at runtime. Expects the repo bind-mounted at
# /workspace (consumer tarball + pnpm-workspace.yaml overrides) and
# HTTPS_PROXY set for GitHub/PyPI reachability.
set -eu

echo "== 0. runtime provisioning (stock node:24-bookworm) =="
command -v python >/dev/null 2>&1 || ln -sf /usr/bin/python3 /usr/local/bin/python
curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
python3 /tmp/get-pip.py --break-system-packages -q
python3 -m pip install --break-system-packages -q pytest
python -m pytest --version

echo "== 1. clean consumer install (release-tarball channel) =="
TGZ=$(ls /workspace/palimpsest-dsh-*.tgz)
mkdir -p /clean && cd /clean
npm init -y >/dev/null 2>&1
cp /workspace/pnpm-workspace.yaml /clean/pnpm-workspace.yaml
npm install -g pnpm@11.21.0 >/dev/null 2>&1
pnpm add "$TGZ" 2>&1 | tail -2
PAL="/clean/node_modules/.bin/palimpsest"

echo "== 2. clean DSH home + real git repo =="
export DSH_HOME=/clean/dsh
DB=/clean/dsh/palimpsest/palimpsest.sqlite
OPS=/clean/dsh/ordarium/operations.sqlite
export DB OPS
PAL="/clean/node_modules/.bin/palimpsest --db $DB --ops $OPS --repo /clean/repo"
mkdir -p /clean/repo && cd /clean/repo
git init -q -b main
git config user.email e2e@clean.test && git config user.name e2e
printf 'def test_clean():\n    assert True\n' > test_clean.py
git add -A && git commit -qm init

echo "== 3. durable session (dispatch -> claim -> manifest -> work -> gate -> report -> promote) =="
$PAL new proj-1 "prove the clean environment"
$PAL next
$PAL next
ATT=$($PAL status | node -e "const v=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(v.attempts[0].attempt_id)")
echo "attempt: $ATT"
CLAIM=$($PAL claim "$ATT")
echo "$CLAIM"
WT=$(echo "$CLAIM" | node -e "const v=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(v.worktreePath)")
$PAL context "$ATT"
cd "$WT"
printf 'clean environment change\n' > change.md
git add -A && git commit -qm "work: clean environment change"
COMMIT=$(git rev-parse HEAD)
cd /clean/repo
printf '[{"gate_id":"gate-release","version":1,"subject_type":"attempt","require":{"all":[{"exists":{"predicate":"tests_pass"}}]}}]' > /clean/gates.json
$PAL gate "$ATT" tests_pass 0 --gate /clean/gates.json python -m pytest
$PAL report "$ATT" completed "clean environment run" --commit "$COMMIT"
$PAL promote gate-release
$PAL status > /clean/status.json
node -e "
const status = JSON.parse(require('fs').readFileSync('/clean/status.json','utf8'));
console.log('task state:', status.tasks[0].state);
console.log('promotions:', JSON.stringify(status.promotions));
console.log('telemetry:', JSON.stringify(status.telemetry?.rows ?? 'absent'));
"

echo "== 3b. second project on the SAME production ledger (pump + attribution) =="
DB2=/clean/dsh/palimpsest/proj2.sqlite
PAL2="/clean/node_modules/.bin/palimpsest --db $DB2 --ops $OPS --repo /clean/repo"
$PAL2 new proj-2 "pump the telemetry channel"
$PAL2 pump 12 --model clean-env --cost 0.02

echo "== 4. evidence assertions =="
node -e "
const { DatabaseSync } = require('node:sqlite');
const ops = new DatabaseSync(process.env.OPS);
const pal = new DatabaseSync(process.env.DB);
const opsOps = ops.prepare('SELECT COUNT(*) AS c FROM ordarium_operations').get().c;
const telemetry = ops.prepare('SELECT COUNT(*) AS c FROM ordarium_state_revisions WHERE namespace=?').get('palimpsest.telemetry.v1').c;
const manifests = pal.prepare('SELECT COUNT(*) AS c FROM context_manifests').get().c;
const manifestEvents = pal.prepare(\"SELECT COUNT(*) AS c FROM events WHERE event_type='CONTEXT_MANIFEST_ADDED'\").get().c;
const chain = pal.prepare('SELECT COUNT(*) AS c FROM events').get().c;
const out = { productionLedgerOperations: opsOps, telemetrySubjects: telemetry, contextManifests: manifests, contextManifestEvents: manifestEvents, hashChainEvents: chain };
console.log('EVIDENCE:', JSON.stringify(out));
if (opsOps < 3 || telemetry < 1 || manifests !== 1 || manifestEvents !== 1) { process.exit(1); }
console.log('CLEAN ENV E2E: ALL ASSERTIONS PASSED');
"
echo "== done =="
