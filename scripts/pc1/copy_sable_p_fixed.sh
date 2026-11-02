#!/usr/bin/env bash
set -euo pipefail
SRC=/home/admini/pc1/runs/sablewick/p1/scored-deepseek/out
DST=/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/research-evidence/pc1/live/sablewick/p-t1-fixed
mkdir -p "$DST/session"
cp "$SRC"/run.log "$SRC"/run.err "$SRC"/proxy.jsonl "$SRC"/proxy.log "$SRC"/exit-code.txt "$SRC"/started-at.txt "$SRC"/world-log.txt "$SRC"/world-status.txt "$SRC"/session-files.txt "$SRC"/p1-profile.patch.yml "$SRC"/p1-profile.package.json "$DST"/
cp "$SRC"/session/* "$DST/session/" 2>/dev/null || true
cp /home/admini/pc1/runs/sablewick/p1/initial-state.json "$DST"/ 2>/dev/null || true
ls -la "$DST" | head
