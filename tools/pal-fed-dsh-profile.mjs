#!/usr/bin/env node
/**
 * PAL-FED-0D DSH profile generator (EXPERIMENTAL, §14/§15/§29).
 *
 * Writes one real DSH profile per peer under $DSH_HOME/profiles, each bound to
 * its own worktree and loading the SAME frozen control-plane artifact. This is
 * the declared physical topology; `dsh --profile pal-fed-p` / `-o` boot it.
 *
 * No profile dependency install is needed: the artifact carries its own pinned
 * dependency closure, and the profile's bundles resolve from the DSH install.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const argOf = (flag, fallback) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
};
const dshHome = resolve(argOf("--dsh-home", process.env.DSH_HOME ?? join(homedir(), ".dsh")));
const artifact = resolve(argOf("--artifact", resolve(import.meta.dirname, "..", "..", "pal-fed-runtime")));
const fabric = argOf("--fabric", "palimpsest-ordarium-0");
const db = resolve(argOf("--db", join(dshHome, "..", "pal-fed-0d", "coordination.sqlite")));
const palimpsestCwd = resolve(argOf("--palimpsest-cwd", resolve(import.meta.dirname, "..")));
const ordariumCwd = resolve(argOf("--ordarium-cwd", "F:/Codex_Work_Space/DSH plugin/ordarium"));

const PLUGIN_URL = pathToFileURL(join(artifact, "package/dist/src/federation/dsh/plugin.js")).href;

function writeProfile(name, selfPeer, sessionId, cwd, initialPrompt) {
  const dir = join(dshHome, "profiles", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cordis.yml"), "[]\n");
  writeFileSync(
    join(dir, "package.json"),
    `${JSON.stringify(
      {
        name: `dsh-profile-${name}`,
        private: true,
        dependencies: {},
        dsh: { profile: { bundles: ["@deepseek-ai/dsh-base"], patchReload: "startup" } },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    join(dir, "pnpm-workspace.yaml"),
    "packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n",
  );
  const config = {
    selfPeer,
    fabricId: fabric,
    dbPath: db,
    sessionId,
    cwd,
    watchIntervalMs: 2000,
    ...(initialPrompt === undefined ? {} : { initialPrompt }),
  };
  writeFileSync(
    join(dir, "cordis.patch.yml"),
    [
      "# PAL-FED-0D peer profile (generated). Do not hand-edit; rerun",
      "# tools/pal-fed-dsh-profile.mjs after changing the artifact or config.",
      "- insert:",
      "    - id: pal-fed",
      `      name: ${JSON.stringify(PLUGIN_URL)}`,
      "      config:",
      ...JSON.stringify(config, null, 2)
        .split("\n")
        .map((line) => `        ${line}`),
      "",
    ].join("\n"),
  );
  return dir;
}

const pDir = writeProfile("pal-fed-p", "palimpsest.main", "pal-fed-p-main", palimpsestCwd, undefined);
const oDir = writeProfile("pal-fed-o", "ordarium.main", "pal-fed-o-main", ordariumCwd, undefined);
console.log(JSON.stringify({ fabric, db, artifact, profiles: [pDir, oDir] }, null, 2));
