#!/usr/bin/env bash
set -euo pipefail
SRC="$1"
DST="$2"
mkdir -p "$DST/session"
cp "$SRC"/run.log "$SRC"/run.err "$SRC"/proxy.jsonl "$SRC"/proxy.log "$SRC"/exit-code.txt "$SRC"/started-at.txt "$SRC"/world-log.txt "$SRC"/world-status.txt "$SRC"/session-files.txt "$SRC"/*profile*.yml "$SRC"/*profile*.json "$DST"/ 2>/dev/null || true
cp "$SRC"/session/* "$DST/session/" 2>/dev/null || true
PARENT=$(dirname "$(dirname "$SRC")")
cp "$PARENT"/initial-state.json "$DST"/ 2>/dev/null || true
cp "$PARENT"/deployment.json "$DST"/ 2>/dev/null || true
cp "$PARENT"/equivalence.json "$DST"/ 2>/dev/null || true
ls -la "$DST" | head
