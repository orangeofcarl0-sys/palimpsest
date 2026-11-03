#!/usr/bin/env bash
# C6-R2 — collect the WSL runtime qualification evidence into the repository.
# No credential is copied. The synthetic canary files stay in the test-owned runtime home.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="$HOME/c6r"
QUAL="$BASE/qual"
DEST="$REPO/research-evidence/c6r/runtime"

mkdir -p "$DEST/session"
cp "$QUAL/out/qualification.json" "$DEST/"
cp "$QUAL/out/run.log" "$DEST/"
cp "$QUAL/out/run.err" "$DEST/"
cp "$QUAL/out/mock.log" "$DEST/"
cp "$QUAL/out/proxy.jsonl" "$DEST/"
cp "$QUAL/out/proxy.log" "$DEST/"
cp "$QUAL/script.json" "$DEST/"
cp "$QUAL/patch.yml" "$DEST/"
if [ ! -f "$QUAL/out/dump-config.txt" ]; then
  DSH_HOME="$QUAL/home" "$BASE/dsh/node_modules/.bin/dsh" --profile headless --patch "$QUAL/patch.yml" --dump-config \
    > "$QUAL/out/dump-config.txt" 2> "$QUAL/out/dump-config.err" || true
fi
if [ -f "$QUAL/out/dump-config.txt" ]; then cp "$QUAL/out/dump-config.txt" "$DEST/"; fi
if [ -f "$QUAL/home/bridge.log" ]; then cp "$QUAL/home/bridge.log" "$DEST/"; fi
for stream in "$QUAL"/home/sessions/*/session-*/session.v4.jsonl.zstd; do
  if [ -f "$stream" ]; then cp "$stream" "$DEST/session/"; fi
done
find "$QUAL/home/sessions" -type f -printf "%p %s\n" > "$DEST/session-files.txt"

{
  echo "captured_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "dsh: $("$BASE/dsh/node_modules/.bin/dsh" --version)"
  echo "node: $(node --version)"
  echo "bwrap: $(bwrap --version)"
  echo "uname: $(uname -a)"
  echo "--- relevant packages ---"
  for package in dsh-base dsh-headless dsh-sandbox-local dsh-sandbox-policy dsh-sandbox-windows-acl dsh-fs-sandbox dsh-bash-sandbox dsh-permission-presets dsh-user-approval dsh-llm-deepseek-api-key dsh-tool-bash dsh-tool-fs dsh-tool-fs-search; do
    manifest="$BASE/dsh/node_modules/@deepseek-ai/$package/package.json"
    if [ -f "$manifest" ]; then
      node -e 'const j=require(process.argv[1]);console.log(j.name+" "+j.version)' "$manifest"
    fi
  done
} > "$DEST/runtime-inventory.txt"

ls -la "$DEST" "$DEST/session"
