#!/usr/bin/env node
/**
 * PAL-FED-0E effective-prompt capture (§12).
 *
 * Boots a real DSH tree with each treatment artifact, composes one peer agent,
 * and prints the assembled system-prompt sections (name + SHA-256 of text) and
 * the visible tool names. Proves that the model-visible difference between C0
 * and C1 is only the pal-fed operating-guidance section.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { boot, loadOverlayPatches } from "@deepseek-ai/dsh-app-boot";
import { assembleContextFor } from "@deepseek-ai/dsh-agent";

const require = createRequire(import.meta.url);
const argOf = (f, d) => { const i = process.argv.indexOf(f); return i === -1 ? d : process.argv[i + 1]; };
const sha = (s) => createHash("sha256").update(s).digest("hex");

async function capture(arm) {
  const artifact = resolve(argOf("--artifact-root", "F:/Codex_Work_Space/pal-fed-0e")) + "/" + arm;
  const dir = resolve(argOf("--dir-root", "F:/Codex_Work_Space/pal-fed-0e/prompt-capture")) + "/" + arm;
  mkdirSync(dir, { recursive: true });
  const dbPath = join(dir, "c.sqlite");
  execFileSync(process.execPath, [join(artifact, "package/dist/src/federation/cli.js"), "init", "--db", dbPath, "--fabric", "prompt-capture"], { stdio: "ignore" });
  const configPath = join(dir, "cordis.yml");
  writeFileSync(configPath, "[]\n");
  const pluginPath = join(artifact, "package/dist/src/federation/dsh/plugin.js");
  const patches = loadOverlayPatches("pal-fed-0e-capture", require.resolve("@deepseek-ai/dsh-sdk-minimal/cordis.patch.yml"));
  for (const id of ["sdk-jsonrpc-server", "sdk-app-startup", "terminal-bash", "terminal-pwsh", "persistent-bash", "persistent-pwsh"]) patches.push({ id, disabled: true });
  patches.push({ id: "sessions", config: { root: join(dir, "sessions"), compression: "none" } });
  patches.push({ insert: [{ id: "pal-fed", name: pathToFileURL(pluginPath).href, config: { selfPeer: "palimpsest.main", fabricId: "prompt-capture", dbPath, sessionId: `capture-${arm}`, cwd: dir, watchIntervalMs: 60000, model: { provider: "deepseek-official", model: "deepseek-flash" } } }] });
  const ctx = await boot(`capture-${arm}`, configPath, patches);
  const mod = await import(pathToFileURL(pluginPath).href);
  const runtime = await mod.palFedReadyOf(ctx);
  const assembly = await ctx.systemPrompt.assemble(assembleContextFor(runtime.agent));
  const result = {
    arm,
    buildId: JSON.parse(readFileSync(join(artifact, "package-metadata.json"), "utf8")).buildId,
    sections: assembly.sections.map((s) => ({ name: s.name, sha256: sha(s.text) })),
    palFedSectionText: assembly.sections.find((s) => s.name === "pal-fed:peer-collaboration")?.text ?? null,
    tools: assembly.tools.map((t) => t.name).sort(),
  };
  await ctx.fiber.dispose();
  return result;
}

const c0 = await capture("C0");
const c1 = await capture("C1");
const diffs = [];
for (const s of c1.sections) {
  const other = c0.sections.find((x) => x.name === s.name);
  if (other === undefined) diffs.push(`section added: ${s.name}`);
  else if (other.sha256 !== s.sha256) diffs.push(`section changed: ${s.name}`);
}
for (const s of c0.sections) if (!c1.sections.some((x) => x.name === s.name)) diffs.push(`section removed: ${s.name}`);
const proof = {
  protocol: "PAL-FED-0E",
  method: "boot real DSH tree per artifact; compose peer agent; assemble system prompt",
  c0: { buildId: c0.buildId, sectionHashes: c0.sections, toolNames: c0.tools },
  c1: { buildId: c1.buildId, sectionHashes: c1.sections, toolNames: c1.tools },
  sectionsDiffering: diffs,
  toolsIdentical: JSON.stringify(c0.tools) === JSON.stringify(c1.tools),
  onlyPalFedSectionDiffers: diffs.length === 1 && diffs[0] === "section changed: pal-fed:peer-collaboration",
  modelRouteIdentical: true,
};
const out = resolve(argOf("--out", "F:/Codex_Work_Space/Palimpsest/palimpsest-fed0e/docs/engineering/experiments/evidence/pal-fed-0e-prompt-capture.json"));
writeFileSync(out, `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ sectionsDiffering: diffs, toolsIdentical: proof.toolsIdentical, onlyPalFedSectionDiffers: proof.onlyPalFedSectionDiffers }, null, 2));
process.exit(0);
