#!/bin/sh
set -eu
command -v python >/dev/null 2>&1 || ln -sf /usr/bin/python3 /usr/local/bin/python
curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py >/dev/null 2>&1
python3 /tmp/get-pip.py --break-system-packages -q >/dev/null 2>&1
python3 -m pip install --break-system-packages -q pytest >/dev/null 2>&1
TGZ=$(ls /workspace/palimpsest-dsh-*.tgz)
mkdir -p /clean && cd /clean
npm init -y >/dev/null 2>&1
cp /workspace/pnpm-workspace.yaml ./
npm install -g pnpm@11.21.0 >/dev/null 2>&1
pnpm add "$TGZ" >/dev/null 2>&1
export DSH_HOME=/acc-dsh
DB=/acc-dsh/db/debug-$(date +%s).sqlite
OPS=/acc-dsh/ordarium/operations.sqlite
mkdir -p /clean/repo && cd /clean/repo
git init -q -b main
git config user.email d@t && git config user.name d
printf 'def test_clean():\n    assert True\n' > test_clean.py
git add -A && git commit -qm seed
PAL="/clean/node_modules/.bin/palimpsest --db $DB --ops $OPS --repo /clean/repo"
$PAL new dbg "debug objective: handle modulation"
$PAL next
$PAL next
ATT=$($PAL status | node /workspace/docker/minimal/attempt-id.mjs)
echo "attempt: $ATT"
$PAL claim "$ATT" >/dev/null
echo "== pump (stderr visible) =="
$PAL pump 12 --model clean-a --cost 0.001
echo "== state revisions after pump =="
node /workspace/docker/minimal/statsquery.mjs
