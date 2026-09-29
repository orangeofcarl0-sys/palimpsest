#!/usr/bin/env node
/**
 * R1-S §6/§9 — CAN AN EXISTING WINDOWS PRIMITIVE CONFINE READS WITHOUT HURTING THE HOST?
 *
 * The deny-ACE experiment showed that a same-principal DENY blocks the read AND blocks the daemon, which
 * makes it unusable. But the confined token is not only restricted — it is also lowered to LOW integrity
 * by the DSH backend. That opens a second route that binds to the TOKEN rather than to the principal:
 *
 *     a mandatory integrity label with NO_READ_UP on a protected directory
 *     → a Low-integrity worker cannot READ it
 *     → the Medium-integrity daemon still can
 *
 * This is a genuine Windows primitive (`icacls /setintegritylevel`), and the DSH ACL module already
 * manipulates integrity labels for the WRITE side, so it is "the smallest existing host-supported
 * confinement" if it works. This script MEASURES whether it works, on synthetic directories.
 *
 * It also measures the boundary's limits, because a mechanism that only works until the worker creates a
 * hard link, or that cannot cover sibling world directories without also covering the worker's own, is
 * not a closure.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1s", "integrity-label");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};
const canary = (label) => `${label}_${randomBytes(12).toString("hex")}`;

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();

process.stdout.write(`\n===== R1-S INTEGRITY-LABEL EXPERIMENT =====\nrig ${RIG}\n`);
if (process.platform !== "win32") {
  process.stdout.write("Windows-only experiment. Stopping.\n");
  process.exit(0);
}

/**
 * The layout mirrors a real deployment closely enough for the boundary question to be the same one:
 * the worker's own world, a SIBLING world, and the durable state dir.
 */
const PROJECT = join(RIG, "project");
const WORLDS = join(PROJECT, "repo", ".palimpsest", "worlds");
const WORLD = join(WORLDS, "attempt-mine");
const SIBLING = join(WORLDS, "attempt-sibling");
const STATE = join(PROJECT, "state");
for (const dir of [WORLD, SIBLING, STATE]) mkdirSync(dir, { recursive: true });

const worldCanary = canary("world");
const siblingCanary = canary("sibling");
const stateCanary = canary("state");
writeFileSync(join(WORLD, "visible.txt"), `canary=${worldCanary}\n`, "utf8");
writeFileSync(join(SIBLING, "sibling.txt"), `canary=${siblingCanary}\n`, "utf8");
writeFileSync(join(STATE, "proof.txt"), `canary=${stateCanary}\n`, "utf8");

const probePath = join(WORLD, "probe.mjs");
const reportPath = join(WORLD, "report.json");
writeFileSync(probePath, `
import { readFileSync, readdirSync, writeFileSync, linkSync } from "node:fs";
import { join } from "node:path";
const out = {};
const tryRead = (name, path) => { try { out[name] = { read: true, content: readFileSync(path, "utf8").trim() }; } catch (error) { out[name] = { read: false, code: error?.code ?? String(error) }; } };
tryRead("OWN_WORLD", ${JSON.stringify(join(WORLD, "visible.txt"))});
tryRead("SIBLING_WORLD", ${JSON.stringify(join(SIBLING, "sibling.txt"))});
tryRead("STATE", ${JSON.stringify(join(STATE, "proof.txt"))});
// Can the worker defeat the label by making a hard link to a labelled file inside its own world?
try {
  const linkPath = join(${JSON.stringify(WORLD)}, "sneaky-link.txt");
  linkSync(${JSON.stringify(join(STATE, "proof.txt"))}, linkPath);
  try { out.HARDLINK_BYPASS = { read: true, content: readFileSync(linkPath, "utf8").trim() }; }
  catch (error) { out.HARDLINK_BYPASS = { read: false, code: error?.code ?? String(error) }; }
} catch (error) { out.HARDLINK_BYPASS = { read: false, code: "link-failed:" + (error?.code ?? String(error)) }; }
try { out.ENUMERATE_WORLDS = { listed: readdirSync(${JSON.stringify(WORLDS)}) }; } catch (error) { out.ENUMERATE_WORLDS = { listed: false, code: error?.code ?? String(error) }; }
// Report the CHILD's own token integrity, so "the token is Low" is measured rather than assumed.
try {
  const { execFileSync } = await import("node:child_process");
  out.WHOAMI_GROUPS = execFileSync("whoami", ["/groups"], { encoding: "utf8" }).split(String.fromCharCode(10)).filter((l) => /Mandatory Label|Label\/u.test(l)).map((l) => l.trim());
} catch (error) { out.WHOAMI_GROUPS = ["probe failed: " + (error?.message ?? String(error))]; }
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));
`, "utf8");

const ACL = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const aclUrl = new URL(`file:///${ACL.split(String.fromCharCode(92)).join("/")}`).href;
const harnessPath = join(RIG, "label-harness.mjs");
writeFileSync(harnessPath, `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = {};
const indexModule = await import(${JSON.stringify(aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = indexModule;
const workspaceRoot = ${JSON.stringify(WORLD)};
const tempDir = mkdtempSync(join(tmpdir(), "r1s-label-"));
let sandbox;
try {
  sandbox = new AclSandbox({ writableDirs: [workspaceRoot], tempDir, writeSid: workspaceWriteSid(workspaceRoot), tempWriteSid: tempWriteSid(tempDir), mode: "workspace-write" });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(probePath)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
} catch (error) { out.error = error?.message ?? String(error); }
finally { try { sandbox?.dispose(); } catch {} try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
process.stderr.write("LABEL_RESULT " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");

function runConfined() {
  rmSync(reportPath, { force: true });
  rmSync(join(WORLD, "sneaky-link.txt"), { force: true });
  const run = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
  const line = (run.stderr ?? "").split(String.fromCharCode(10)).map((entry) => entry.trim()).find((entry) => entry.startsWith("LABEL_RESULT")) ?? "";
  const parsed = line === "" ? null : JSON.parse(line.slice("LABEL_RESULT ".length));
  const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
  return { parsed, report };
}

record("--- baseline, no label ---", "");
const baseline = runConfined();
record("BASELINE own world", baseline.report?.OWN_WORLD?.read === true ? "readable" : `blocked (${baseline.report?.OWN_WORLD?.code})`);
record("BASELINE sibling world", baseline.report?.SIBLING_WORLD?.read === true ? "READABLE (the leak)" : `blocked (${baseline.report?.SIBLING_WORLD?.code})`);
record("BASELINE durable state", baseline.report?.STATE?.read === true ? "READABLE (the leak)" : `blocked (${baseline.report?.STATE?.code})`);

/**
 * Apply a NO_READ_UP mandatory label to the protected directories.
 *
 * THE LEVEL MATTERS, and getting it wrong is instructive: a `(OI)(CI)LR` label sets the object to LOW
 * with no-read-up, but the confined token is ALSO Low, and no-read-up only denies a subject reading an
 * object at a STRICTLY HIGHER integrity level. A Low object therefore stays readable by a Low token —
 * measured, which is why the first configuration did nothing.
 *
 * The configuration that can bind is `(OI)(CI)MR`: the object sits at MEDIUM (the daemon's own level, so
 * the daemon keeps working) with a no-read-up policy, which denies the LOW worker token.
 */
record("--- applying NO_READ_UP labels ---", "");
for (const dir of [SIBLING, STATE]) {
  const applied = spawnSync("icacls", [dir, "/setintegritylevel", "(OI)(CI)MR"], { encoding: "utf8" });
  record(`label on ${dir.replace(RIG, "<rig>")}`, applied.status === 0 ? "applied (OI)(CI)MR (Medium + no-read-up)" : `failed: ${(applied.stderr ?? "").trim().slice(0, 160)}`);
}

const afterLabel = runConfined();
record("--- after the label ---", "");
record("own world still readable (ordinary work intact)", afterLabel.report?.OWN_WORLD?.read === true ? "YES" : `NO — label broke ordinary work (${afterLabel.report?.OWN_WORLD?.code})`);
record("sibling world readable", afterLabel.report?.SIBLING_WORLD?.read === true ? "STILL READABLE" : `blocked (${afterLabel.report?.SIBLING_WORLD?.code})`);
record("durable state readable", afterLabel.report?.STATE?.read === true ? "STILL READABLE" : `blocked (${afterLabel.report?.STATE?.code})`);
record("hard-link bypass", afterLabel.report?.HARDLINK_BYPASS?.read === true ? "READABLE — the label is defeated by a hard link" : `blocked (${afterLabel.report?.HARDLINK_BYPASS?.code})`);
record("sibling world still enumerable", afterLabel.report?.ENUMERATE_WORLDS?.listed === false ? "no" : `YES (${(afterLabel.report?.ENUMERATE_WORLDS?.listed ?? []).join(", ")})`);

/**
 * Does the DAEMON survive the label? It runs at Medium integrity, so it should still read. If it cannot,
 * the mechanism is unusable for the same reason the deny ACE was.
 */
record("--- effect on the daemon (this process) ---", "");
for (const [name, path] of [["sibling", join(SIBLING, "sibling.txt")], ["state", join(STATE, "proof.txt")]]) {
  try {
    readFileSync(path, "utf8");
    record(`daemon can still read ${name}`, "yes — the label binds to the token, not the principal");
  } catch (error) {
    record(`daemon can still read ${name}`, `NO (${error?.code}) — unusable, like the deny ACE`);
  }
}

// Restore and clean up.
for (const dir of [SIBLING, STATE]) spawnSync("icacls", [dir, "/setintegritylevel", "(OI)(CI)M"], { encoding: "utf8" });
writeFileSync(join(RIG, "integrity-label-experiment.json"), `${JSON.stringify({ findings, baseline: baseline.report, afterLabel: afterLabel.report }, null, 2)}\n`, "utf8");
process.stdout.write(`\nexperiment written: ${join(RIG, "integrity-label-experiment.json")}\n`);
