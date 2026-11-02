#!/usr/bin/env bash
set -euo pipefail
P=/mnt/f/Codex_Work_Space/Palimpsest/palimpsest-sr1
rm -rf "$HOME/c6r/product/dist"
cp -r "$P/dist" "$HOME/c6r/product/dist"
rm -rf "$HOME/c6r/product/host"
cp -r "$P/host" "$HOME/c6r/product/host"
cp "$P/package.json" "$HOME/c6r/product/package.json"
ls "$HOME/c6r/product/dist/src/product.js" "$HOME/c6r/product/dist/src/cli_product.js"
echo COPIED
