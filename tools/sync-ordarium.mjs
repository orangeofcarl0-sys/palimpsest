#!/usr/bin/env node
/**
 * Vendor the five Ordarium release tarballs from a sibling checkout into
 * vendor/ordarium/ (P1 consumption path).
 *
 * Rationale: single-package `pnpm add github:...#path=packages/<pkg>` cannot
 * resolve inter-package `workspace:*` ranges (recorded limitation in the
 * Ordarium README). The five-tarball set is self-consistent - exactly what
 * Ordarium's `pnpm test:package` verifies - so we pack all five locally and
 * consume them via file: protocol.
 *
 * Usage:
 *   node tools/sync-ordarium.mjs [path-to-ordarium-checkout]
 *   (default: ../Palimpsest/ordarium, then ../ordarium)
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";

const candidates = [
  process.argv[2],
  "../Palimpsest/ordarium",
  "../ordarium",
].filter(Boolean);

const root = candidates
  .map((candidate) => resolve(process.cwd(), candidate))
  .find((path) => existsSync(join(path, "pnpm-workspace.yaml")));

if (root === undefined) {
  console.error(
    `No Ordarium checkout found. Tried:\n${candidates
      .map((candidate) => `  ${resolve(process.cwd(), candidate)}`)
      .join("\n")}`,
  );
  process.exit(1);
}

const outDir = resolve(process.cwd(), "vendor/ordarium");
mkdirSync(outDir, { recursive: true });

console.log(`Packing Ordarium packages from ${root} ...`);
// pnpm is managed via corepack in this environment (corepack.cmd shim on
// Windows); run through a shell so the shim resolves. A node_modules purge
// may be requested without a TTY, so run non-interactively.
const pnpm = process.platform === "win32" ? "corepack pnpm" : "pnpm";
const env = { ...process.env, CI: "true" };
execSync(`${pnpm} run build`, { cwd: root, stdio: "inherit", env });

for (const pkg of readdirSync(join(root, "packages"))) {
  const pkgDir = join(root, "packages", pkg);
  if (!existsSync(join(pkgDir, "package.json"))) continue;
  execSync(`${pnpm} pack --pack-destination "${outDir}"`, {
    cwd: pkgDir,
    stdio: "inherit",
    env,
  });
}

// Normalize names: ordarium-dsh-1.0.0.tgz -> @ordarium/dsh-1.0.0.tgz
for (const file of readdirSync(outDir)) {
  const match = /^ordarium-(.+)-(\d+\.\d+\.\d+.*?)\.tgz$/u.exec(file);
  if (match === null) continue;
  const [, name, version] = match;
  renameSync(join(outDir, file), join(outDir, `@ordarium-${name}-${version}.tgz`));
}

console.log(`Vendored ${readdirSync(outDir).length} tarballs into ${outDir}`);
console.log("Install with:");
console.log('  pnpm add "file:vendor/ordarium/@ordarium-core-1.0.0.tgz" \\');
console.log('    "file:vendor/ordarium/@ordarium-dsh-1.0.0.tgz" \\');
console.log('    "file:vendor/ordarium/@ordarium-ledger-sqlite-1.0.0.tgz" \\');
console.log('    "file:vendor/ordarium/@ordarium-testing-1.0.0.tgz"');
