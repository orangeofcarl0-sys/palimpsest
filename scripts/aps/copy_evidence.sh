#!/usr/bin/env bash
# Copy the APS real-host deterministic run evidence into the repository.
set -euo pipefail

RUN="${APS_RUN:-/home/admini/aps/run}"
DEST="${APS_EVIDENCE:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1/research-evidence/aps/2026-11-03-host-run}"

mkdir -p "$DEST/session" "$DEST/session-logs"
cd "$RUN"
for f in "$RUN"/home/sessions/*/*/session.v4.jsonl.zstd; do
  id="$(basename "$(dirname "$f")")"
  cp "$f" "$DEST/session/$id.zstd"
done
rm -f "$DEST/session/session.v4.jsonl.zstd"
cp out/final-pulse.json out/seed.json out/deployment.json out/profile.patch.yml out/profile.package.json \
  out/dump-config.txt out/mock.jsonl out/mock.log out/proxy.jsonl out/session-files.txt run-summary.json \
  operator-acceptance.json downstream-completion.json "$DEST/"
for d in out/session-1 out/session-2 out/session-3; do
  n="$(basename "$d")"
  cp "$d/run.log" "$DEST/session-logs/$n-run.log"
  cp "$d/run.err" "$DEST/session-logs/$n-run.err"
  cp "$d/exit-code.txt" "$DEST/session-logs/$n-exit-code.txt"
done
cp world/deliverables/site-a.md "$DEST/artifact-site-a.md"
cp world/deliverables/site-b-coastal.md "$DEST/artifact-site-b-coastal.md" 2>/dev/null || true
cp world/deliverables/capacity-refresh.md "$DEST/artifact-capacity-refresh.md" 2>/dev/null || true
git -C world log --oneline > "$DEST/world-log.txt"
git -C world status --porcelain > "$DEST/world-status.txt"
find "$DEST" -maxdepth 2 -type f | sort
