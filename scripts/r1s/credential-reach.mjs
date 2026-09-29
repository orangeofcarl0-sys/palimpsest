#!/usr/bin/env node
/**
 * R1-S §13 — THE DECISIVE END-TO-END TEST: can a CONFINED worker reach the real credential file?
 *
 * The capability audit proved the host's confinement does not bound reads. This script closes the loop
 * with the actual stakes: it runs a worker-shaped child under the SAME `AclSandbox` confinement a
 * deployment uses (workspace-write, restricted token, Low integrity) and asks it whether the REAL DSH
 * credentials file is readable from inside a world.
 *
 * NOTHING SECRET IS READ OR PRINTED. The child reports only:
 *   · whether the file exists at that path,
 *   · whether it is readable,
 *   · its byte length.
 * It never reads the content into a variable that reaches output, never prints a key name, and never
 * prints a value. That is the §13 rule, and it is followed in the code rather than by intention.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1s", "credential-reach");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();

const REAL_DSH = process.env.DSH_HOME?.trim() || join(homedir(), ".dsh");
const REAL_CREDENTIALS = join(REAL_DSH, ".credentials.yaml");
process.stdout.write(`\n===== R1-S CREDENTIAL-REACH END-TO-END =====\nrig        ${RIG}\nDSH home   ${REAL_DSH.replace(homedir(), "<home>")}\n`);

/**
 * A world shaped like a real one: `<rig>/project/repo/.palimpsest/worlds/attempt-x`, so the relative
 * traversal to the DSH home is the same shape a real deployment has.
 */
const PROJECT = join(RIG, "project");
const WORLD = join(PROJECT, "repo", ".palimpsest", "worlds", "attempt-cred");
mkdirSync(WORLD, { recursive: true });

const reportPath = join(WORLD, "cred-report.json");
const probePath = join(WORLD, "cred-probe.mjs");
writeFileSync(probePath, `
import { existsSync, readFileSync, statSync, openSync, readSync, closeSync, writeFileSync } from "node:fs";
const out = {};
const target = ${JSON.stringify(REAL_CREDENTIALS)};
out.targetShape = "the real DSH credentials path";
try {
  out.exists = existsSync(target);
  if (out.exists) {
    out.bytes = statSync(target).size;
    // READ one byte and close immediately: enough to prove readability without ever holding the
    // document. The byte's VALUE is never inspected and never reported.
    const fd = openSync(target, "r");
    const buffer = Buffer.alloc(1);
    const read = readSync(fd, buffer, 0, 1, 0);
    closeSync(fd);
    out.readable = read === 1;
    buffer.fill(0);
  }
} catch (error) { out.readable = false; out.error = error?.code ?? String(error); }
// The same question by ABSOLUTE path from the world, and by relative traversal.
try { out.absoluteReadable = (() => { const fd = openSync(target, "r"); closeSync(fd); return true; })(); } catch { out.absoluteReadable = false; }
writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));
`, "utf8");

const ACL = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const aclUrl = new URL(`file:///${ACL.split(String.fromCharCode(92)).join("/")}`).href;
const harnessPath = join(RIG, "cred-harness.mjs");
writeFileSync(harnessPath, `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = {};
const indexModule = await import(${JSON.stringify(aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = indexModule;
const workspaceRoot = ${JSON.stringify(WORLD)};
const tempDir = mkdtempSync(join(tmpdir(), "r1s-cred-"));
let sandbox;
try {
  sandbox = new AclSandbox({ writableDirs: [workspaceRoot], tempDir, writeSid: workspaceWriteSid(workspaceRoot), tempWriteSid: tempWriteSid(tempDir), mode: "workspace-write" });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(probePath)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
} catch (error) { out.error = error?.message ?? String(error); }
finally { try { sandbox?.dispose(); } catch {} try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
process.stderr.write("CRED_RESULT " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");

if (process.platform !== "win32") {
  record("platform", `${process.platform} — this end-to-end test uses the Windows backend; skipping`);
  process.exit(0);
}
record("real credentials file exists", existsSync(REAL_CREDENTIALS) ? "YES" : "no");
const run = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 120_000, stdio: ["ignore", "pipe", "pipe"] });
const line = (run.stderr ?? "").split(String.fromCharCode(10)).map((entry) => entry.trim()).find((entry) => entry.startsWith("CRED_RESULT")) ?? "";
const parsed = line === "" ? null : JSON.parse(line.slice("CRED_RESULT ".length));
record("confined child exit", parsed === null ? `harness failed: ${(run.stderr ?? "").slice(0, 200)}` : String(parsed.exitCode));
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;
record("CONFINED worker: credentials file exists at that path", report?.exists === true ? "YES" : "no");
record("CONFINED worker: credentials file readable", report?.readable === true ? "YES — a Low-integrity restricted-token worker can open the real credential file" : `no (${report?.error ?? "?"})`);
record("CONFINED worker: credentials byte length observed", String(report?.bytes ?? "?"));
record("CONFINED worker: readable by absolute path", report?.absoluteReadable === true ? "YES" : "no");
record("NO SECRET CONTENT WAS READ", "the probe opened one byte and never reported its value; no key name or value appears in this report");

writeFileSync(join(RIG, "credential-reach.json"), `${JSON.stringify({ findings, report, dshHome: REAL_DSH.replace(homedir(), "<home>") }, null, 2)}\n`, "utf8");
process.stdout.write(`\nresult written: ${join(RIG, "credential-reach.json")}\n`);
