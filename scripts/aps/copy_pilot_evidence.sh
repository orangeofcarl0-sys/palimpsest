#!/usr/bin/env bash
# Copy the APS-C real-model pilot evidence into a stable, structured repository directory.
set -euo pipefail

RUN="${APS_PILOT_RUN:-$HOME/aps/pilot}"
DEST="${APS_PILOT_EVIDENCE:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/research-evidence/aps/live/aps-pilot-2026-11-03}"

mkdir -p "$DEST"
cp "$RUN/cohort.json" "$RUN/authorization.json" "$RUN/pilot.json" "$RUN/score.json" "$RUN/pilot-G-state.json" "$RUN/pilot-G-acceptance.json" "$DEST/"
cp "$RUN/out/run-plan.json" "$RUN/out/run-state.json" "$RUN/out/cohort-run.json" "$RUN/out/cohort-run.err" "$DEST/" 2>/dev/null || true
cp "$RUN/out/score-summary.json" "$RUN/out/score.err" "$DEST/" 2>/dev/null || true
cp "$RUN/out/proxy.jsonl" "$RUN/out/proxy.log" "$DEST/" 2>/dev/null || true
for condition in F L G; do
  target="$DEST/$condition"
  mkdir -p "$target/session"
  cp "$RUN/out/$condition/run.log" "$target/run.log" 2>/dev/null || true
  cp "$RUN/out/$condition/run.err" "$target/run.err" 2>/dev/null || true
  cp "$RUN/out/$condition/exit-code.txt" "$target/exit-code.txt" 2>/dev/null || true
  cp "$RUN/out/$condition"/session/*.zstd "$target/session/" 2>/dev/null || true
  cp "$RUN/worlds/$condition/deliverables/selection.md" "$target/selection.md" 2>/dev/null || true
  git -C "$RUN/worlds/$condition" log --oneline > "$target/world-log.txt" 2>/dev/null || true
  git -C "$RUN/worlds/$condition" status --porcelain > "$target/world-status.txt" 2>/dev/null || true
done
mkdir -p "$DEST/G/reviews"
cp "$RUN/worlds/G/reviews/coastal.md" "$DEST/G/reviews/coastal.md" 2>/dev/null || true
rm -f "$DEST"/F-selection.md "$DEST"/L-selection.md "$DEST"/G-selection.md "$DEST"/F-run.log "$DEST"/L-run.log "$DEST"/G-run.log "$DEST"/F-run.err "$DEST"/L-run.err "$DEST"/G-run.err "$DEST"/F-exit-code.txt "$DEST"/L-exit-code.txt "$DEST"/G-exit-code.txt
find "$DEST" -maxdepth 3 -type f | sort
