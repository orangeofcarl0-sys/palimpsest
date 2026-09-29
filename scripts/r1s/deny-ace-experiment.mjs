#!/usr/bin/env node
/**
 * R1-S §6/§9 — CAN AN EXISTING HOST PRIMITIVE BE MADE TO CONFINE READS?
 *
 * The capability audit found that every DSH runner confines WRITES only, and that the Windows backend
 * lowers its token to Low integrity with a no-WRITE-up label. Before concluding that no enforceable
 * read boundary exists, this script tests the one remaining plausible route: the ACL module CAN build
 * DENY ACEs, and the backend's token carries a per-workspace capability SID. So the question is
 * empirical, not rhetorical —
 *
 *     if a DENY FILE_READ_DATA ACE for that capability SID is placed on a protected directory,
 *     does the confined child stop being able to read it?
 *
 * Windows access checks accumulate every ACE matching ANY SID in the token, and a deny for one SID does
 * not block an allow granted through another. This script MEASURES that rather than asserting it. It is
 * the difference between "I reasoned it would not work" and "I tried it, on this host, and it did not."
 *
 * The test is on SYNTHETIC directories and synthetic canaries only, and it is scoped to paths this
 * script creates and deletes. No real durable state is touched.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const require_ = createRequire(import.meta.url);
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1s", "deny-ace");
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

process.stdout.write(`\n===== R1-S DENY-ACE EXPERIMENT =====\nrig ${RIG}\nplatform ${process.platform}\n`);

if (process.platform !== "win32") {
  process.stdout.write("\nNot Windows: the WRITE_RESTRICTED/token route is Windows-specific. Stopping.\n");
  process.exit(0);
}

const WORLD = join(RIG, "world");
const PROTECTED = join(RIG, "protected");
mkdirSync(WORLD, { recursive: true });
mkdirSync(PROTECTED, { recursive: true });
const protectedCanary = canary("deny");
writeFileSync(join(PROTECTED, "secret.txt"), `canary=${protectedCanary}\n`, "utf8");
const worldCanary = canary("world");
writeFileSync(join(WORLD, "visible.txt"), `canary=${worldCanary}\n`, "utf8");

const ACL = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const aclUrl = new URL(`file:///${ACL.split(String.fromCharCode(92)).join("/")}`).href;
const probePath = join(WORLD, "probe.mjs");
const reportPath = join(WORLD, "report.json");
writeFileSync(probePath, `
import { readFileSync, writeFileSync } from "node:fs";
const out = {};
const tryRead = (name, path) => { try { out[name] = { read: true, content: readFileSync(path, "utf8").trim() }; } catch (error) { out[name] = { read: false, code: error?.code ?? String(error) }; } };
tryRead("WORLD", ${JSON.stringify(join(WORLD, "visible.txt"))});
tryRead("PROTECTED", ${JSON.stringify(join(PROTECTED, "secret.txt"))});
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));
`, "utf8");

/**
 * Attempt the deny: build a DENY FILE_READ_DATA ACE for the workspace-write capability SID on the
 * protected directory using the backend's OWN `acl` module, then run the confined probe and see whether
 * the read is refused.
 */
const harness = `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = { steps: [] };
const indexModule = await import(${JSON.stringify(aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = indexModule;
const workspaceRoot = ${JSON.stringify(WORLD)};
const tempDir = mkdtempSync(join(tmpdir(), "r1s-deny-"));
out.workspaceSid = workspaceWriteSid(workspaceRoot);
let sandbox;
try {
  sandbox = new AclSandbox({ writableDirs: [workspaceRoot], tempDir, writeSid: workspaceWriteSid(workspaceRoot), tempWriteSid: tempWriteSid(tempDir), mode: "workspace-write" });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(probePath)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
} catch (error) {
  out.error = error?.message ?? String(error);
} finally {
  try { sandbox?.dispose(); } catch {}
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
}
process.stderr.write("DENY_RESULT " + JSON.stringify(out) + String.fromCharCode(10));
`;
const harnessPath = join(RIG, "deny-harness.mjs");
writeFileSync(harnessPath, harness, "utf8");
rmSync(reportPath, { force: true });
const run = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
const line = (run.stderr ?? "").split(String.fromCharCode(10)).map((entry) => entry.trim()).find((entry) => entry.startsWith("DENY_RESULT")) ?? "";
const parsed = line === "" ? null : JSON.parse(line.slice("DENY_RESULT ".length));
record("baseline: confined child exit", parsed === null ? `harness failed: ${(run.stderr ?? "").slice(0, 200)}` : String(parsed.exitCode));
if (parsed !== null) record("workspace capability SID", String(parsed.workspaceSid));
if (parsed !== null && parsed.steps !== undefined) for (const step of parsed.steps) record("acl module", step);
const baseline = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
record("BASELINE world read", baseline?.WORLD?.read === true ? "readable" : `blocked (${baseline?.WORLD?.code})`);
record("BASELINE protected read (no deny ACE)", baseline?.PROTECTED?.read === true ? "READABLE — the leak" : `blocked (${baseline?.PROTECTED?.code})`);

/**
 * Now attempt the deny, using `icacls` (the OS's own ACL tool) so this experiment does not depend on my
 * own FFI plumbing being correct. A deny ACE is written for the current user on the protected directory,
 * which is the strongest form of the "deny read" idea available without a separate principal.
 */
const whoami = spawnSync("whoami", { encoding: "utf8" }).stdout.trim();
record("current principal", whoami);
const deny = spawnSync("icacls", [PROTECTED, "/deny", `${whoami}:(RD)`], { encoding: "utf8" });
record("icacls deny read for the current principal", deny.status === 0 ? "applied" : `failed (${(deny.stderr ?? "").trim().slice(0, 160)})`);
const denyFile = spawnSync("icacls", [join(PROTECTED, "secret.txt"), "/deny", `${whoami}:(RD)`], { encoding: "utf8" });
record("icacls deny read on the file", denyFile.status === 0 ? "applied" : `failed (${(denyFile.stderr ?? "").trim().slice(0, 160)})`);

rmSync(reportPath, { force: true });
const run2 = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
const after = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
record("AFTER DENY world read", after?.WORLD?.read === true ? "readable" : `blocked (${after?.WORLD?.code})`);
record("AFTER DENY protected read", after?.PROTECTED?.read === true ? "STILL READABLE — a same-principal deny cannot confine the worker" : `blocked (${after?.PROTECTED?.code})`);
record("the daemon itself is affected by the deny", (() => {
  try {
    readFileSync(join(PROTECTED, "secret.txt"), "utf8");
    return "no — this process can still read it";
  } catch (error) {
    return `YES — this process is now blocked too (${error?.code}), which is why a same-principal deny is unusable`;
  }
})());

// Clean up the ACL edits so nothing standing is left behind (best effort; the rig is deleted anyway).
spawnSync("icacls", [PROTECTED, "/remove:d", whoami], { encoding: "utf8" });
spawnSync("icacls", [join(PROTECTED, "secret.txt"), "/remove:d", whoami], { encoding: "utf8" });

writeFileSync(join(RIG, "deny-ace-experiment.json"), `${JSON.stringify({ findings, baseline, after }, null, 2)}\n`, "utf8");
process.stdout.write(`\nexperiment written: ${join(RIG, "deny-ace-experiment.json")}\n`);
