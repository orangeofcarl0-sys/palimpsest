#!/usr/bin/env bash
# C6-R3 — collect the P1 host qualification evidence into the repository.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
RUN="${C6R_P1_RUN:-$HOME/c6r/runs/qual-p1}"
P1="$RUN/p1"
OUT="$P1/out"
DEST="$REPO/research-evidence/c6r/p1-host"

mkdir -p "$DEST/session"
cp "$P1/initial-state.json" "$DEST/"
cp "$P1/deployment.json" "$DEST/"
cp "$OUT/p1-profile.patch.yml" "$DEST/"
cp "$OUT/p1-profile.package.json" "$DEST/"
cp "$OUT/p1-script.json" "$DEST/"
cp "$OUT/run.log" "$DEST/"
cp "$OUT/run.err" "$DEST/"
cp "$OUT/mock.log" "$DEST/"
cp "$OUT/proxy.jsonl" "$DEST/"
cp "$OUT/proxy.log" "$DEST/"
cp "$P1/home/bridge.log" "$DEST/" 2>/dev/null || true
for stream in "$P1"/home/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$DEST/session/"; fi
done
find "$P1/home/sessions" -type f -printf "%p %s\n" > "$DEST/session-files.txt"
git -C "$P1/world" log --oneline > "$DEST/world-log.txt"
git -C "$P1/world" status --porcelain > "$DEST/world-status.txt"
ls -la "$DEST" "$DEST/session"
