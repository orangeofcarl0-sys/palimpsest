#!/usr/bin/env bash
# C6-R3 — build a Linux runtime copy of the already-built product.
#
# The compiled `dist` is JavaScript; only the three production dependencies are native/tarball
# packages. This copies the executable product (not docs, not scenario, not evidence) and installs
# the production dependencies with the repository lockfile, so the P condition can run the real
# Palimpsest host in the WSL runtime.
set -euo pipefail

REPO="${REPO:-/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1}"
BASE="$HOME/c6r"
PRODUCT="$BASE/product"

rm -rf "$PRODUCT"
mkdir -p "$PRODUCT/scripts/cog6" "$PRODUCT/scripts/c6r" "$PRODUCT/host"
cp -r "$REPO/dist" "$PRODUCT/dist"
cp "$REPO/package.json" "$REPO/pnpm-lock.yaml" "$REPO/pnpm-workspace.yaml" "$PRODUCT/"
cp "$REPO/scripts/cog6/rig6.mjs" "$PRODUCT/scripts/cog6/"
cp "$REPO/scripts/cog6/run_cog6.mjs" "$PRODUCT/scripts/cog6/"
cp -r "$REPO/scripts/cog6/scenario" "$PRODUCT/scripts/cog6/scenario"
cp "$REPO"/scripts/c6r/*.mjs "$PRODUCT/scripts/c6r/"
cp -r "$REPO/host/dsh" "$REPO/host/deployment" "$PRODUCT/host/"

cd "$PRODUCT"
pnpm install --prod --frozen-lockfile --config.confirmModulesPurge=false 2>&1 | tail -20

node -e "import('./dist/src/install.js').then((m)=>console.log('install.js exports', Object.keys(m).length)).catch((e)=>{console.error(e.message);process.exit(1)})"
