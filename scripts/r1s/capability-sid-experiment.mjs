#!/usr/bin/env node
/**
 * R1-S §9 — THE "SMALLEST EXISTING HOST-SUPPORTED CONFINEMENT" TEST.
 *
 * The deny-ACE experiment showed that denying the CURRENT PRINCIPAL blocks the worker but also blocks the
 * daemon. That experiment used the wrong SID. The confined worker's token carries a SID the daemon's does
 * NOT: the per-workspace CAPABILITY SID (`S-1-4-…`) that the DSH backend already adds for the write
 * allowlist. Windows' access check applies a DENY ACE when it matches ANY SID in the token, so:
 *
 *     DENY read to the capability SID on a protected directory
 *       → the confined worker (which holds that SID) is refused
 *       → the daemon (which does not hold it) is unaffected
 *
 * If that works, it is an existing, host-supported primitive — exactly what §9 says to prefer — and it
 * needs no new backend. This script MEASURES whether it works, on synthetic directories, and MEASURES
 * its two obvious limits:
 *
 *   · the SID is per-WORKSPACE, so a deny for one workspace does not protect against a worker in another;
 *   · a `.d.mts`-style type-only claim is not evidence, so everything here is an executed probe.
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
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1s", "capability-sid");
/** This script's own directory, for the PowerShell helper it invokes. */
const REPO_SCRIPTS = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
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
process.stdout.write(`\n===== R1-S CAPABILITY-SID DENY TEST =====\nrig ${RIG}\n`);
if (process.platform !== "win32") {
  process.stdout.write("Windows-only. Stopping.\n");
  process.exit(0);
}

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

const reportPath = join(WORLD, "report.json");
const probePath = join(WORLD, "probe.mjs");
writeFileSync(probePath, `
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
const out = {};
const tryRead = (name, path) => { try { out[name] = { read: true, content: readFileSync(path, "utf8").trim() }; } catch (error) { out[name] = { read: false, code: error?.code ?? String(error) }; } };
tryRead("OWN_WORLD", ${JSON.stringify(join(WORLD, "visible.txt"))});
tryRead("SIBLING_WORLD", ${JSON.stringify(join(SIBLING, "sibling.txt"))});
tryRead("STATE", ${JSON.stringify(join(STATE, "proof.txt"))});
try { out.ENUMERATE_WORLDS = { listed: readdirSync(${JSON.stringify(WORLDS)}) }; } catch (error) { out.ENUMERATE_WORLDS = { listed: false, code: error?.code ?? String(error) }; }
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));
`, "utf8");

const ACL = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const aclUrl = new URL(`file:///${ACL.split(String.fromCharCode(92)).join("/")}`).href;
const harnessPath = join(RIG, "sid-harness.mjs");
writeFileSync(harnessPath, `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = {};
const indexModule = await import(${JSON.stringify(aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = indexModule;
const workspaceRoot = ${JSON.stringify(WORLD)};
const tempDir = mkdtempSync(join(tmpdir(), "r1s-sid-"));
out.workspaceSid = workspaceWriteSid(workspaceRoot);
let sandbox;
try {
  sandbox = new AclSandbox({ writableDirs: [workspaceRoot], tempDir, writeSid: workspaceWriteSid(workspaceRoot), tempWriteSid: tempWriteSid(tempDir), mode: "workspace-write" });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(probePath)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
} catch (error) { out.error = error?.message ?? String(error); }
finally { try { sandbox?.dispose(); } catch {} try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
process.stderr.write("SID_RESULT " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");

function runConfined() {
  rmSync(reportPath, { force: true });
  const run = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
  const line = (run.stderr ?? "").split(String.fromCharCode(10)).map((entry) => entry.trim()).find((entry) => entry.startsWith("SID_RESULT")) ?? "";
  const parsed = line === "" ? null : JSON.parse(line.slice("SID_RESULT ".length));
  return { parsed, report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null };
}

record("--- baseline ---", "");
const base = runConfined();
const workspaceSid = base.parsed?.workspaceSid ?? null;
record("workspace capability SID", String(workspaceSid));
record("BASELINE own world", base.report?.OWN_WORLD?.read === true ? "readable" : "blocked");
record("BASELINE sibling world", base.report?.SIBLING_WORLD?.read === true ? "READABLE (the leak)" : "blocked");
record("BASELINE durable state", base.report?.STATE?.read === true ? "READABLE (the leak)" : "blocked");

/**
 * Apply DENY read to the capability SID on the protected directories. `icacls` accepts a SID by its
 * `*S-1-…` string form, so no FFI is needed for this test.
 */
record("--- applying DENY (RD) for the capability SID ---", "");
if (workspaceSid === null) {
  record("deny applied", "SKIPPED — the harness did not report a capability SID");
} else {
  /**
   * `icacls` CANNOT express this deny: it tries to resolve the SID to an account name and fails
   * ("account name and security ID cannot be mapped"), measured. PowerShell's `Set-Acl` accepts a raw
   * SecurityIdentifier, so that is the route used.
   */
  const psScript = join(REPO_SCRIPTS, "apply-capability-deny.ps1");
  const applied = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", psScript, "-Sid", String(workspaceSid), "-Paths", `${SIBLING},${STATE}`], { encoding: "utf8", timeout: 120_000 });
  record("deny applied via Set-Acl", applied.status === 0 ? (applied.stdout ?? "").trim().split(String.fromCharCode(10)).filter((l) => l.trim() !== "").join(" | ") : `failed: ${((applied.stderr ?? "") + (applied.stdout ?? "")).trim().slice(0, 240)}`);
  const after = runConfined();
  record("--- after the capability-SID deny ---", "");
  record("own world still readable (ordinary work intact)", after.report?.OWN_WORLD?.read === true ? "YES" : `NO (${after.report?.OWN_WORLD?.code}) — this would make the mechanism unusable`);
  record("sibling world readable by the worker", after.report?.SIBLING_WORLD?.read === true ? "STILL READABLE" : `BLOCKED (${after.report?.SIBLING_WORLD?.code})`);
  record("durable state readable by the worker", after.report?.STATE?.read === true ? "STILL READABLE" : `BLOCKED (${after.report?.STATE?.code})`);
  record("daemon can still read the protected dirs", (() => {
    try {
      readFileSync(join(STATE, "proof.txt"), "utf8");
      return "YES — the daemon is unaffected, which is the property the principal-wide deny lacked";
    } catch (error) {
      return `NO (${error?.code}) — the mechanism blocks the host too`;
    }
  })());
  record("sibling worlds still enumerable by the worker", after.report?.ENUMERATE_WORLDS?.listed === false ? "no" : `YES (${(after.report?.ENUMERATE_WORLDS?.listed ?? []).join(", ")})`);

  /**
   * THE LIMIT THAT MATTERS. The SID is derived from ONE workspace path. A worker in a DIFFERENT
   * workspace gets a DIFFERENT SID, so this deny does not protect against it — which means a per-project
   * deny cannot cover "other project durable state" in general.
   */
  record("--- the limit ---", "");
  const otherWorkspace = join(RIG, "other-project", "repo");
  mkdirSync(otherWorkspace, { recursive: true });
  const otherSid = (() => {
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const mod = await import(${JSON.stringify(aclUrl)});
      process.stdout.write(mod.workspaceWriteSid(${JSON.stringify(otherWorkspace)}));
    `], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
    return run.status === 0 ? run.stdout.trim() : null;
  })();
  record("a different workspace's capability SID", String(otherSid));
  record("the deny protects against another workspace's worker", otherSid !== null && otherSid !== workspaceSid ? "NO — the SIDs differ, so a second project's worker would not be denied" : "untested");

  // Clean up every deny we added, so nothing standing is left behind.
  // Clean up: PowerShell removes the deny it added (icacls cannot address this SID).
  spawnSync("powershell", ["-NoProfile", "-Command", `foreach ($p in @(${JSON.stringify(SIBLING)},${JSON.stringify(STATE)})) { $acl = Get-Acl -LiteralPath $p; $acl.Access | Where-Object { $_.IdentityReference -eq ${JSON.stringify(String(workspaceSid))} -and $_.AccessControlType -eq "Deny" } | ForEach-Object { [void]$acl.RemoveAccessRule($_) }; Set-Acl -LiteralPath $p -AclObject $acl }`], { encoding: "utf8", timeout: 120_000 });
}

writeFileSync(join(RIG, "capability-sid-experiment.json"), `${JSON.stringify({ findings, workspaceSid, baseline: base.report }, null, 2)}\n`, "utf8");
process.stdout.write(`\nexperiment written: ${join(RIG, "capability-sid-experiment.json")}\n`);
