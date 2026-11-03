#!/usr/bin/env bash
# C6-R3 — collect the F1 world and equivalence evidence into the repository.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
RUN="${C6R_F1_RUN:-$HOME/c6r/runs/qual-f1}"
F1="$RUN/f1"
DEST="$REPO/research-evidence/c6r/f1-host"

mkdir -p "$DEST/deliverables"
cp "$F1/initial-state.json" "$DEST/"
cp "$F1/equivalence.json" "$DEST/"
cp "$F1/world/HANDOFF.md" "$DEST/"
cp "$F1/world/deliverables/"*.md "$DEST/deliverables/"
cp "$F1/inbox/arrivals.jsonl" "$DEST/inbox-arrivals.jsonl"
git -C "$F1/world" log --oneline > "$DEST/world-log.txt"
git -C "$F1/world" status --porcelain > "$DEST/world-status.txt"
ls -la "$DEST" "$DEST/deliverables"
