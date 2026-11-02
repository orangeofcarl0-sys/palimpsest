#!/usr/bin/env bash
set -euo pipefail
SRC=/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/.pc1-rig
DST=$HOME/pc1/runs
mkdir -p "$DST"
for name in sablewick field-study; do
  rm -rf "$DST/$name"
  cp -a "$SRC/$name" "$DST/$name"
done
ls -d "$DST/sablewick/p1/world" "$DST/field-study/p1/world"
echo COPIED_TO_WSL
