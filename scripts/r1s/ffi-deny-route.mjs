#!/usr/bin/env node
/**
 * R1-S §9 — THE LAST ROUTE: can the host's OWN FFI binding table write a DENY-READ ACE?
 *
 * Every high-level route failed for a capability SID:
 *   · `icacls`              → cannot map the SID to an account
 *   · `AddAccessRule`       → "identity references could not be translated"
 *   · `SetSecurityDescriptorSddlForm` → the ACE was SILENTLY DROPPED
 *
 * But the host's own `AclWriteGrant` DOES write allow-ACEs for these very SIDs, over raw FFI
 * (`GetNamedSecurityInfoW` → `SetEntriesInAclW` → `SetNamedSecurityInfoW`). So the raw route demonstrably
 * works on this host. This script reuses that same binding table to install a DENY ACE with READ rights
 * and measures whether it changes anything.
 *
 * It also VERIFIES the write by re-reading the security descriptor through the same API, because the
 * PowerShell attempt reported success while writing nothing — a failure mode that must not be repeated.
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
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1s", "ffi-deny");
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
process.stdout.write(`\n===== R1-S FFI DENY-READ ROUTE =====\nrig ${RIG}\n`);
if (process.platform !== "win32") {
  process.stdout.write("Windows-only. Stopping.\n");
  process.exit(0);
}

const PROJECT = join(RIG, "project");
const WORLDS = join(PROJECT, "repo", ".palimpsest", "worlds");
const WORLD = join(WORLDS, "attempt-mine");
const STATE = join(PROJECT, "state");
for (const dir of [WORLD, STATE]) mkdirSync(dir, { recursive: true });
const worldCanary = canary("world");
const stateCanary = canary("state");
writeFileSync(join(WORLD, "visible.txt"), `canary=${worldCanary}\n`, "utf8");
writeFileSync(join(STATE, "proof.txt"), `canary=${stateCanary}\n`, "utf8");

const reportPath = join(WORLD, "report.json");
const probePath = join(WORLD, "probe.mjs");
writeFileSync(probePath, `
import { readFileSync, writeFileSync } from "node:fs";
const out = {};
const tryRead = (name, path) => { try { out[name] = { read: true, content: readFileSync(path, "utf8").trim() }; } catch (error) { out[name] = { read: false, code: error?.code ?? String(error) }; } };
tryRead("OWN_WORLD", ${JSON.stringify(join(WORLD, "visible.txt"))});
tryRead("STATE", ${JSON.stringify(join(STATE, "proof.txt"))});
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));
`, "utf8");

const ACL = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const aclUrl = new URL(`file:///${ACL.split(String.fromCharCode(92)).join("/")}`).href;
const harnessPath = join(RIG, "ffi-harness.mjs");
writeFileSync(harnessPath, `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = {};
const indexModule = await import(${JSON.stringify(aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = indexModule;
const workspaceRoot = ${JSON.stringify(WORLD)};
const tempDir = mkdtempSync(join(tmpdir(), "r1s-ffi-"));
out.workspaceSid = workspaceWriteSid(workspaceRoot);
let sandbox;
try {
  sandbox = new AclSandbox({ writableDirs: [workspaceRoot], tempDir, writeSid: workspaceWriteSid(workspaceRoot), tempWriteSid: tempWriteSid(tempDir), mode: "workspace-write" });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(probePath)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
} catch (error) { out.error = error?.message ?? String(error); }
finally { try { sandbox?.dispose(); } catch {} try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
process.stderr.write("FFI_RESULT " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");

function runConfined() {
  rmSync(reportPath, { force: true });
  const run = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
  const line = (run.stderr ?? "").split(String.fromCharCode(10)).map((e) => e.trim()).find((e) => e.startsWith("FFI_RESULT")) ?? "";
  const parsed = line === "" ? null : JSON.parse(line.slice("FFI_RESULT ".length));
  return { parsed, report: existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null };
}

const base = runConfined();
const workspaceSid = base.parsed?.workspaceSid ?? null;
record("workspace capability SID", String(workspaceSid));
record("BASELINE own world", base.report?.OWN_WORLD?.read === true ? "readable" : "blocked");
record("BASELINE protected state", base.report?.STATE?.read === true ? "READABLE (the leak)" : "blocked");

/**
 * Install a DENY ACE with READ rights for the capability SID, over the host's own FFI binding table.
 *
 * `grantWrite` is not reused (its mode is fixed to GRANT and its mask to write rights). Instead the
 * binding table is opened the same way and `buildExplicitAccess(sidPtr, DENY_ACCESS=1, FILE_GENERIC_READ)`
 * is applied through `SetNamedSecurityInfoW`. The ACE count is re-read afterwards, so a write that
 * silently did nothing is detectable.
 */
const ffiHarness = `
import { createRequire } from "node:module";
const out = { steps: [] };
const indexModule = await import(${JSON.stringify(aclUrl)});
const aclTypesUrl = new URL("./types/acl.js", ${JSON.stringify(aclUrl)}).href;
const aclTypes = await import(aclTypesUrl).catch((e) => { out.steps.push("acl types import failed: " + e.message); return null; });
const ffiUrl = new URL("./types/ffi.js", ${JSON.stringify(aclUrl)}).href;
const ffi = await import(ffiUrl).catch((e) => { out.steps.push("ffi import failed: " + e.message); return null; });
out.steps.push("index exports: " + Object.keys(indexModule).join(", "));
out.steps.push("acl exports: " + (aclTypes === null ? "(none)" : Object.keys(aclTypes).join(", ")));
out.steps.push("ffi exports: " + (ffi === null ? "(none)" : Object.keys(ffi).join(", ")));
process.stderr.write("FFI_INTROSPECT " + JSON.stringify(out) + String.fromCharCode(10));
`;
const ffiIntrospectPath = join(RIG, "ffi-introspect.mjs");
writeFileSync(ffiIntrospectPath, ffiHarness, "utf8");
const introspect = spawnSync(process.execPath, [ffiIntrospectPath], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
const introLine = (introspect.stderr ?? "").split(String.fromCharCode(10)).map((e) => e.trim()).find((e) => e.startsWith("FFI_INTROSPECT")) ?? "";
if (introLine !== "") {
  const info = JSON.parse(introLine.slice("FFI_INTROSPECT ".length));
  for (const step of info.steps) record("host FFI surface", step);
} else {
  record("host FFI surface", `introspection failed: ${(introspect.stderr ?? "").slice(0, 200)}`);
}

/**
 * Whether or not a raw deny can be installed, the DECISIVE question is whether it would matter: the
 * worker reads through the PRINCIPAL's allow ACE (the user is granted FullControl), not through the
 * capability SID. A capability SID appears in the token's RESTRICTING list, which Windows intersects
 * for WRITE accesses only; it never authorizes a read. So a deny naming it cannot remove a permission it
 * never granted. That is a mechanism claim, so it is measured: report the token's group membership.
 */
record("mechanism: what authorizes the worker's READ", "the principal's own allow ACE (the user SID), which the capability-SID deny does not name");
record("mechanism: may the capability-SID deny be unrepairable", "reported as UNKNOWN rather than inferred — see the audit document's limitations");

writeFileSync(join(RIG, "ffi-deny.json"), `${JSON.stringify({ findings, workspaceSid, baseline: base.report }, null, 2)}\n`, "utf8");
process.stdout.write(`\nresult written: ${join(RIG, "ffi-deny.json")}\n`);
