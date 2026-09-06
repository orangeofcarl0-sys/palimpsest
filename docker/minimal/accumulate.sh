#!/bin/sh
# Empirical accumulation (PLMP-CTX-2/ALC data gate): N durable sessions in a
# clean container against ONE persistent shared production ledger. Varied
# outcomes (pass-first / all-fail via broken test repos) and two attributed
# models with small bookkeeping costs. $ACC (default /clean/dsh) persists the
# ledger across runs; bind-mount a host directory there to keep the samples.
set -eu
N=${1:-12}
RUN_ID=${RUN_ID:-$(date +%s)}
ACC=${ACC:-/acc-dsh}
[ -f "$ACC/.mount-check" ] || { echo "ACC mount preflight failed: $ACC is not a live mount"; exit 78; }
mkdir -p "$ACC/ordarium"

echo "== 0. preflight (baked palimpsest-minimal image) =="
command -v python >/dev/null 2>&1 || { echo "python missing"; exit 78; }
python -m pytest --version

echo "== 1. clean consumer install (release-tarball channel) =="
TGZ=$(ls /workspace/palimpsest-dsh-*.tgz)
mkdir -p /clean && cd /clean
npm init -y >/dev/null 2>&1
cp /workspace/pnpm-workspace.yaml /clean/pnpm-workspace.yaml
npm install -g pnpm@11.21.0 >/dev/null 2>&1
pnpm add "$TGZ" >/dev/null 2>&1

i=1
while [ "$i" -le "$N" ]; do
  DB="$ACC/palimpsest/proj-${RUN_ID}-$i.sqlite"
  OPS="$ACC/ordarium/operations.sqlite"
  REPO="/clean/repo-$i"
  CASE=$(( i % 2 ))  # 0 pass-first / 1 all-fail (broken test repo)
  MODEL=clean-a; [ $(( i % 2 )) -eq 1 ] && MODEL=clean-b
  COST="0.00$(( (i % 9) + 1 ))"
  PAL="/clean/node_modules/.bin/palimpsest --db $DB --ops $OPS --repo $REPO"

  mkdir -p "$REPO" && cd "$REPO"
  git init -q -b main
  git config user.email acc@clean.test && git config user.name acc
  printf 'modulation reference for session %s\n' "$i" > notes_modulation.md
  if [ "$CASE" -eq 1 ]; then
    printf 'def test_broken():\n    assert False\n' > test_clean.py
  else
    printf 'def test_clean():\n    assert True\n' > test_clean.py
  fi
  git add -A && git commit -qm "session $i seed"

  # The pump drives everything: claim -> mechanical gate -> report ->
  # settle -> attributed telemetry flush at the pump boundary.
  $PAL new "proj-$i" "session $CASE objective: handle modulation task $i"
  $PAL pump 20 --model "$MODEL" --cost "$COST" >/dev/null

  LAST=$($PAL status | node /workspace/docker/minimal/attempt-id.mjs)
  $PAL context "$LAST" >/dev/null
  echo "session $i: model=$MODEL case=$CASE done"
  i=$(( i + 1 ))
done

echo "== 2. accumulated stats (pooled view + data-backed model advice) =="
PALSTATS="/clean/node_modules/.bin/palimpsest --db $ACC/palimpsest/proj-1.sqlite --ops $ACC/ordarium/operations.sqlite"
$PALSTATS telemetry --candidates '[{"model":"clean-a","cost":0.002},{"model":"clean-b","cost":0.006}]'
echo "== accumulation done: N=$N =="
