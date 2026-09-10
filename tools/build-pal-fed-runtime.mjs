#!/usr/bin/env node
/**
 * PAL-FED-0D frozen runtime artifact builder (EXPERIMENTAL, §27).
 *
 * Produces a control-plane build OUTSIDE both project worktrees:
 *   pal-fed-runtime/
 *     build-id, package-metadata.json, SHA256SUMS
 *     package/                 the frozen build both DSH hosts load
 *       package.json
 *       dist/src/federation/... compiled plugin + core
 *       node_modules/          pinned dependency closure (junction to the
 *                              control-plane build's install)
 *
 * `depsMode=link` (default) junctions `package/node_modules` to the builder's
 * installed closure, so no network is needed at dogfood time. `depsMode=copy`
 * copies dereferenced packages instead. Either way the FROZEN BYTES are the
 * plugin/core code under package/dist, which is what both hosts load.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

const repo = resolve(import.meta.dirname, "..");
const argOf = (flag, fallback) => {
  const index = process.argv.indexOf(flag);
  return index === -1 ? fallback : resolve(process.argv[index + 1]);
};
const out = argOf("--out", resolve(repo, "..", "pal-fed-runtime"));
const depsMode = argOf("--deps", "link") === "link" ? "link" : "copy";

execFileSync("pnpm", ["build"], { cwd: repo, stdio: "inherit", shell: true });

const stage = join(out, "package");
rmSync(out, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// Control-plane code only: server/plugin sources, never compiled tests.
cpSync(join(repo, "dist/src"), join(stage, "dist/src"), { recursive: true });
const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
writeFileSync(
  join(stage, "package.json"),
  `${JSON.stringify(
    {
      name: "palimpsest-dsh-runtime",
      version: pkg.version,
      private: true,
      type: "module",
      exports: {
        "./dsh-plugin": "./dist/src/federation/dsh/plugin.js",
        "./dsh-deterministic-llm": "./dist/src/federation/dsh/deterministic_llm.js",
      },
    },
    null,
    2,
  )}\n`,
);

if (depsMode === "link") {
  symlinkSync(join(repo, "node_modules"), join(stage, "node_modules"), "junction");
} else {
  cpSync(join(repo, "node_modules"), join(stage, "node_modules"), {
    recursive: true,
    dereference: true,
  });
}

// Hash the frozen code bytes (everything under dist), not the linked deps.
const hash = createHash("sha256");
import { readdirSync, statSync } from "node:fs";
const files = [];
(function collect(dir) {
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collect(full);
    else files.push(full);
  }
})(join(stage, "dist"));
for (const file of files) {
  hash.update(file.slice(stage.length).replaceAll("\\", "/"));
  hash.update(readFileSync(file));
}
const digest = hash.digest("hex");

const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
const buildId = `pal-fed-0d+${head.slice(0, 12)}`;
writeFileSync(join(out, "build-id"), `${buildId}\n`);
writeFileSync(
  join(out, "package-metadata.json"),
  `${JSON.stringify(
    {
      buildId,
      sourceCommit: head,
      package: pkg.name,
      version: pkg.version,
      frozenCodeSha256: digest,
      depsMode,
      pluginEntry: "package/dist/src/federation/dsh/plugin.js",
      deterministicLlmEntry: "package/dist/src/federation/dsh/deterministic_llm.js",
      dshVersion: "0.1.5-rc.1",
      ordarium: "1.3.1",
    },
    null,
    2,
  )}\n`,
);
writeFileSync(join(out, "SHA256SUMS"), `${digest}  package/dist\n`);
if (!existsSync(join(stage, "dist/src/federation/dsh/plugin.js"))) {
  throw new Error("frozen plugin entry missing after build");
}
console.log(JSON.stringify({ artifact: out, buildId, frozenCodeSha256: digest, depsMode }));
