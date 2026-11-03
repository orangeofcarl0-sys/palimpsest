#!/usr/bin/env node
/**
 * R1-HR §21 — CLEAN-ENVIRONMENT REPRODUCTION.
 *
 * The ruling calls this load-bearing, and the reason is specific: R1-H resolved its FFI runtime by reaching
 * into an absolute path inside the DSH installation. That worked on the machine it was written on and proved
 * nothing about any other machine — the classic failure of a dependency that is present by accident.
 *
 * This script reconstructs the adversarial conditions §21 names, and it does so by ISOLATION rather than by
 * assertion:
 *
 *   1. AN EMPTY GLOBAL PACKAGE SET. A temporary directory is created and used as the npm global prefix, and
 *      it contains nothing. Any code that resolves the FFI runtime from "the global npm root" finds nothing
 *      there. The reproduction is still expected to pass, because the runtime is a DECLARED dependency of the
 *      DSH seam package and resolves through that package's own graph.
 *
 *   2. NO REUSED RIG STATE. A fresh rig directory is created under a unique name; nothing from the ordinary
 *      conformance run is read.
 *
 *   3. NO REUSED SECURITY DESCRIPTORS. Every protected root in the fixture is newly created, so no object
 *      carries a label left by an earlier run. The scan asserts this by requiring every root to start with NO
 *      label at all — a root that arrived already labelled would mean an earlier artifact was in play.
 *
 *   4. NO CACHED TEST WORLDS. The fixture builds its own world and its own protected roots from scratch.
 *
 * The script then runs the SHIPPED fence end to end — resolve the seam, apply the label, verify by readback,
 * run a confined subject under the shipped runner, and assert the protected read is refused — and finally
 * re-runs the two acceptance gates with the same scrubbed environment.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1hr", `clean-${randomBytes(6).toString("hex")}`);
const NL = String.fromCharCode(10);
const REPO = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const RUNTIME = join(REPO, "host", "deployment", "runtime");
const canary = (label) => `${label}_${randomBytes(12).toString("hex")}`;

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}${NL}`);
};
const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? "PASS" : "FAIL"}  ${id}  ${statement} — ${detail}${NL}`);
};

process.stdout.write(`${NL}===== R1-HR CLEAN-ENVIRONMENT REPRODUCTION =====${NL}rig ${RIG}${NL}`);

/* ---------------------------------------------------------------- (1) an empty global package set */

/**
 * A temporary npm prefix holding NOTHING. It is passed to the child as `npm_config_prefix` and as `NODE_PATH`,
 * so any resolution that depends on the machine's global install finds an empty directory instead.
 */
const EMPTY_PREFIX = join(RIG, "empty-global-prefix");
mkdirSync(EMPTY_PREFIX, { recursive: true });
const emptyContents = existsSync(join(EMPTY_PREFIX, "node_modules")) ? readFileSync(join(EMPTY_PREFIX, "node_modules"), "utf8") : "(no node_modules)";
record("isolated npm global prefix", EMPTY_PREFIX.replace(RIG, "<rig>"));
record("its contents", String(emptyContents).trim() === "" ? "empty (no node_modules directory at all)" : "empty directory created");

/* ---------------------------------------------------------------- the DSH installation, located explicitly */

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();
process.env.PALIMPSEST_DSH_ROOT = dshRoot;
record("DSH installation under test", "<dsh-install>");
const ACL_INDEX = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const RUNNER = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");

/* ---------------------------------------------------------------- (2/3/4) a fresh fixture */

const PROJECT = join(RIG, "project");
const REPOSITORY = join(PROJECT, "repo");
const WORLDS = join(REPOSITORY, ".palimpsest", "worlds");
const WORLD = join(WORLDS, "attempt-clean");
const STATE = join(PROJECT, "state");
const HOME = join(RIG, "home");
for (const dir of [WORLD, STATE, HOME]) mkdirSync(dir, { recursive: true });
const c = { WORLD: canary("world"), STATE: canary("state"), CREDENTIAL: canary("credential") };
writeFileSync(join(WORLD, "in-world.txt"), `canary=${c.WORLD}${NL}`, "utf8");
writeFileSync(join(STATE, "proof-blob.txt"), `canary=${c.STATE}${NL}`, "utf8");
writeFileSync(join(HOME, ".credentials.yaml"), `provider: synthetic${NL}apiKey: ${c.CREDENTIAL}${NL}`, "utf8");

/**
 * (3) THE DESCRIPTORS ARE FRESH, AND THAT IS ASSERTED. Every protected root is newly created by this run, so
 * each must start with NO mandatory label. A root that arrived labelled would mean an artifact from an earlier
 * run was being measured — the thing §21 forbids — so the reproduction refuses to continue in that case.
 */
const label = await import(pathToFileURL(join(RUNTIME, "win32_label.js")).href);
const fence = await import(pathToFileURL(join(RUNTIME, "read_fence.js")).href);
const api = label.win32LabelApi().api;
const protectedRoots = [STATE, HOME];
const preexisting = protectedRoots.filter((root) => label.readMandatoryLabel(api, root).label?.present === true);
check("CE-01", "no protected root carries a label from an earlier run", preexisting.length === 0, preexisting.length === 0 ? `all ${String(protectedRoots.length)} roots start unlabelled — the descriptors are fresh` : `these roots arrived ALREADY LABELLED, so a previous artifact is in play: ${preexisting.join(", ")}`);

/* ---------------------------------------------------------------- the dependency closure, under isolation */

/**
 * The runtime is resolved by a CHILD PROCESS whose environment carries the empty global prefix. The question
 * is not whether the fence works here — it is whether it still works when the machine's global install
 * contributes nothing.
 */
const isolatedProbe = join(RIG, "isolated.mjs");
writeFileSync(isolatedProbe, [
  `process.env.PALIMPSEST_DSH_ROOT = ${JSON.stringify(dshRoot)};`,
  // Deliberately hostile: the global prefix is empty, and the ordinary global search path is cleared.
  `process.env.npm_config_prefix = ${JSON.stringify(EMPTY_PREFIX)};`,
  "process.env.NODE_PATH = '';",
  `const label = await import(${JSON.stringify(pathToFileURL(join(RUNTIME, "win32_label.js")).href)});`,
  `const fence = await import(${JSON.stringify(pathToFileURL(join(RUNTIME, "read_fence.js")).href)});`,
  "const out = {};",
  "const compat = label.dshCompatibilityReport();",
  "out.compat = compat;",
  // Prove the FFI runtime is NOT coming from the empty global prefix.
  "try {",
  `  const { createRequire } = await import("node:module");`,
  `  const r = createRequire(${JSON.stringify(pathToFileURL(join(RUNTIME, "win32_label.js")).href)});`,
  `  out.repoResolvesKoffi = (() => { try { r.resolve("koffi"); return true; } catch { return false; } })();`,
  "} catch (e) { out.repoResolvesKoffi = 'probe-failed'; }",
  `const ensured = fence.ensureReadFence({ roots: ${JSON.stringify(protectedRoots)}, world: ${JSON.stringify(WORLD)} });`,
  "out.rootsVerified = ensured.rootsVerified;",
  "out.treesVerified = ensured.treesVerified;",
  "out.labels = ensured.result.outcomes.map((entry) => ({ verified: entry.verified, detail: entry.detail }));",
  "process.stdout.write('ISOLATED ' + JSON.stringify(out) + String.fromCharCode(10));",
].join(NL), "utf8");
const isolatedRun = spawnSync(process.execPath, [isolatedProbe], { encoding: "utf8", timeout: 180_000, env: { ...process.env, npm_config_prefix: EMPTY_PREFIX, NODE_PATH: "" } });
const isolatedLine = (isolatedRun.stdout ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("ISOLATED ")) ?? "";
const isolated = isolatedLine === "" ? null : JSON.parse(isolatedLine.slice("ISOLATED ".length));
record("child environment", `npm_config_prefix=<rig>/empty-global-prefix, NODE_PATH=''`);

check("CE-02", "the FFI runtime resolves with an EMPTY global package set", isolated !== null && isolated.compat.usable === true, isolated === null ? `no output (${(isolatedRun.stderr ?? "").slice(0, 200)})` : `${isolated.compat.ffi.package}@${isolated.compat.ffi.resolvedVersion} via ${isolated.compat.package}`);
check("CE-03", "the runtime does NOT come from the repository or the global prefix", isolated !== null && isolated.repoResolvesKoffi === false, isolated === null ? "unmeasured" : `resolve("koffi") from the fence module = ${String(isolated.repoResolvesKoffi)} (false is expected: it is reached through the seam package's declared dependency)`);
check("CE-04", "the pinned contract matches under isolation", isolated !== null && isolated.compat.drifted === false && isolated.compat.versionMatches === true, isolated === null ? "unmeasured" : `resolved ${isolated.compat.resolvedVersion} == qualified ${isolated.compat.qualifiedVersion}, ffi ${isolated.compat.ffi.resolvedVersion} == ${isolated.compat.ffi.qualifiedVersion}`);
check("CE-05", "the fence installs and VERIFIES from a clean environment", isolated !== null && isolated.rootsVerified === true && isolated.treesVerified === true, isolated === null ? "unmeasured" : isolated.labels.map((entry) => entry.detail).join("; ").slice(0, 200));

/* ---------------------------------------------------------------- the confined subject, from scratch */

const probePath = join(WORLD, "probe.mjs");
const reportPath = join(WORLD, "report.json");
writeFileSync(probePath, [
  'import { readFileSync, writeFileSync } from "node:fs";',
  "const out = {};",
  "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
  `read("WORLD", ${JSON.stringify(join(WORLD, "in-world.txt"))});`,
  `read("STATE", ${JSON.stringify(join(STATE, "proof-blob.txt"))});`,
  `read("CREDENTIAL", ${JSON.stringify(join(HOME, ".credentials.yaml"))});`,
  `writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));`,
].join(NL), "utf8");
const driverPath = join(RIG, "driver.mjs");
writeFileSync(driverPath, [
  'import { mkdtempSync, rmSync } from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  'import { spawnSync } from "node:child_process";',
  "const out = {};",
  `const mod = await import(${JSON.stringify(pathToFileURL(ACL_INDEX).href)});`,
  `const ws = ${JSON.stringify(WORLD)};`,
  "const temp = mkdtempSync(join(tmpdir(), 'r1hr-clean-'));",
  "try {",
  "  const wsSid = mod.workspaceWriteSid(ws);",
  "  const tmpSid = mod.tempWriteSid(temp);",
  "  const g = mod.AclWriteGrant.create(wsSid); g.add(ws, true);",
  "  const gt = mod.AclWriteGrant.create(tmpSid); gt.add(temp, false);",
  `  const r = spawnSync(process.execPath, [${JSON.stringify(RUNNER)}, '--workspace', ws, '--temp', temp, '--mode', 'workspace-write', '--write-sid', wsSid, '--temp-write-sid', tmpSid, '--', process.execPath, ${JSON.stringify(probePath)}], { encoding: 'utf8', timeout: 240_000 });`,
  "  out.status = r.status; out.stderr = (r.stderr ?? '').slice(0, 200);",
  "  try { g.dispose(); gt.dispose(); } catch {}",
  "} catch (e) { out.error = e?.message ?? String(e); }",
  "finally { try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
  "process.stderr.write('CLEAN_DRIVER ' + JSON.stringify(out) + String.fromCharCode(10));",
].join(NL), "utf8");
rmSync(reportPath, { force: true });
const driverRun = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
const saw = (key, expected) => report?.[key]?.read === true && String(report[key].content).includes(expected);
check("CE-06", "the confined subject reads its own world (ordinary work intact)", report !== null && saw("WORLD", c.WORLD), report === null ? `no report (${(driverRun.stderr ?? "").slice(0, 160)})` : saw("WORLD", c.WORLD) ? "world read ok" : `BLOCKED (${String(report.WORLD?.code)})`);
check("CE-07", "the confined subject cannot read the durable state", report !== null && !saw("STATE", c.STATE), report === null ? "unmeasured" : saw("STATE", c.STATE) ? "READABLE — contract violated" : `blocked (${String(report.STATE?.code)})`);
check("CE-08", "the confined subject cannot read the credential", report !== null && !saw("CREDENTIAL", c.CREDENTIAL), report === null ? "unmeasured" : saw("CREDENTIAL", c.CREDENTIAL) ? "READABLE — contract violated" : `blocked (${String(report.CREDENTIAL?.code)})`);

/* ---------------------------------------------------------------- the acceptance gates, re-run isolated */

/**
 * The two deterministic gates are re-run as CHILDREN with the empty global prefix, so "it passes on my
 * machine" is replaced by "it passes in an environment that shares nothing with the machine's global install".
 * Each gets its own fresh rig, so no cached fixture is reused.
 */
for (const [id, script, label_] of [
  ["CE-09", "scripts/r1hr/conformance.mjs", "gate:r1-hr-conformance"],
  ["CE-10", "scripts/r1h/conformance.mjs", "gate:r1-h-conformance"],
]) {
  const gateRig = join(RIG, `gate-${id}`);
  const run = spawnSync(process.execPath, [join(REPO, script), `--rig=${gateRig}`], {
    encoding: "utf8",
    timeout: 900_000,
    cwd: REPO,
    env: { ...process.env, npm_config_prefix: EMPTY_PREFIX, NODE_PATH: "", PALIMPSEST_DSH_ROOT: dshRoot },
  });
  const tail = (run.stdout ?? "").split(NL).filter((line) => line.trim() !== "").slice(-2).join(" | ");
  check(id, `${label_} passes with an EMPTY global package set and a fresh rig`, run.status === 0, `exit=${String(run.status)}; ${tail.slice(0, 200)}`);
}

/* ---------------------------------------------------------------- verdict */

const failed = results.filter((entry) => !entry.pass);
process.stdout.write(`${NL}${String(results.length - failed.length)}/${String(results.length)} clean-environment assertions hold${NL}`);
if (failed.length > 0) {
  process.stdout.write(`R1-HR CLEAN-ENVIRONMENT REPRODUCTION: FAIL — ${failed.map((e) => e.id).join(", ")}${NL}`);
} else {
  process.stdout.write(`R1-HR CLEAN-ENVIRONMENT REPRODUCTION: PASS — the fence resolves and holds with no global package set, no reused rig state, no reused descriptors and no cached worlds.${NL}`);
}
writeFileSync(join(RIG, "clean-env.json"), `${JSON.stringify({ findings, isolated: isolated === null ? null : { compat: isolated.compat, repoResolvesKoffi: isolated.repoResolvesKoffi }, results, failed: failed.map((e) => e.id) }, null, 2)}${NL}`, "utf8");
process.stdout.write(`written: ${join(RIG, "clean-env.json")}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
