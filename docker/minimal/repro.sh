set -eu
command -v python >/dev/null 2>&1 || ln -sf /usr/bin/python3 /usr/local/bin/python
python3 -m pip install --break-system-packages -q pytest >/dev/null 2>&1
TGZ=$(ls /workspace/palimpsest-dsh-*.tgz)
mkdir -p /clean && cd /clean
npm init -y >/dev/null 2>&1
cp /workspace/pnpm-workspace.yaml ./
npm install -g pnpm@11.21.0 >/dev/null 2>&1
pnpm add "$TGZ" >/dev/null 2>&1
export DSH_HOME=/acc-dsh
DB=/acc-dsh/db/dbg2.sqlite
OPS=/acc-dsh/ordarium/operations.sqlite
mkdir -p /clean/repo && cd /clean/repo
git init -q -b main
git config user.email d@t && git config user.name d
printf 'def test_broken():\n    assert False\n' > test_clean.py
git add -A && git commit -qm seed
PAL="/clean/node_modules/.bin/palimpsest --db $DB --ops $OPS --repo /clean/repo"
$PAL new dbg2 "broken session"
echo "== pump (stderr visible) =="
$PAL pump 20 --model clean-b --cost 0.004 || echo "PUMP EXITED NONZERO"
echo "== state revs =="
node -e "const { DatabaseSync } = require('node:sqlite'); const ops = new DatabaseSync('/acc-dsh/ordarium/operations.sqlite'); console.log(JSON.stringify(ops.prepare('SELECT namespace, COUNT(*) c FROM ordarium_state_revisions GROUP BY namespace').all()));"
