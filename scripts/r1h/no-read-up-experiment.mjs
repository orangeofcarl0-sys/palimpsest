#!/usr/bin/env node
/**
 * R1-H GATE A — THE ONE PRIMITIVE R1-S NEVER REACHED: A REAL NO_READ_UP MANDATORY LABEL.
 *
 * R1-S's audit recorded that a mandatory integrity label could not express read confinement, on two
 * grounds: `icacls` cannot spell it, and DSH's own `grantWrite` passes the no-WRITE-up policy. BOTH are
 * true, and both are statements about SPELLINGS rather than about the primitive. This experiment separates
 * them, because the shipped host's own FFI binding table takes the mandatory policy as an ARGUMENT:
 *
 *     AddMandatoryAce(pAcl, dwAceRevision, AceFlags, MandatoryPolicy, pLabelSid)
 *                                                                 ^ 1 = NO_WRITE_UP
 *                                                                   2 = NO_READ_UP
 *                                                                   3 = both
 *
 * Measured first, because a claim about a constant is not a claim about the capability: `icacls
 * /setintegritylevel` normalizes EVERY spelling it accepts — M, MR, MNR, MRNW, MNW — to `(NW)`. So
 * R1-S's "Medium + no-read-up" label was in fact a Medium NO-WRITE-UP label, which by design does nothing
 * to reads. Its negative result was therefore measured against a primitive that never had the property
 * under test — the experiment's conclusion happened to be right while its mechanism note was wrong.
 *
 * THE MECHANISM. Windows mandatory integrity control lets a subject at a LOWER level READ an object at a
 * HIGHER level (read-up is permitted by default); NO_READ_UP on the OBJECT turns read-up off. So a label
 * at MEDIUM with NO_READ_UP is exactly the separation a confidential worker needs:
 *
 *     control plane (Medium): still reads      worker (Low): denied
 *
 * The DSH worker is the ideal subject for this, because the backend ALREADY lowers its token to Low for
 * the write side (`restrictTokenIntegrity`, S-1-16-4096). The read fence needs no new principal, no new
 * OS account, and no change to the control plane.
 *
 * MEASURED, NOT ASSUMED: the child's own token integrity is reported by the child, so "the worker is Low"
 * is a measurement rather than a premise, and the control plane is measured reading the same file the
 * worker is refused.
 *
 * All canaries are fresh synthetic values. No real path and no real secret is touched.
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
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1h", "no-read-up");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
mkdirSync(RIG, { recursive: true });

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};
const canary = (label) => `${label}_${randomBytes(12).toString("hex")}`;
const fileUrl = (p) => new URL(`file:///${p.split(String.fromCharCode(92)).join("/")}`).href;
const NL = String.fromCharCode(10);

process.stdout.write(`\n===== R1-H NO_READ_UP LABEL EXPERIMENT =====\nrig ${RIG}\n`);
if (process.platform !== "win32") {
  process.stdout.write("Windows-only experiment. Stopping.\n");
  process.exit(0);
}

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();
const CHUNK = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "types-Cl_DXjhk.js");
const ACL_INDEX = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const WIN32_HELPERS = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-win32-process", "lib", "index.js");
const CHUNK_URL = fileUrl(CHUNK);

/* ------------------------------------------------------------------ fixture */

const PROJECT = join(RIG, "project");
const WORLDS = join(PROJECT, "repo", ".palimpsest", "worlds");
const WORLD = join(WORLDS, "attempt-mine");
const SIBLING = join(WORLDS, "attempt-sibling");
const STATE = join(PROJECT, "state");
for (const dir of [WORLD, SIBLING, STATE]) mkdirSync(dir, { recursive: true });

const c = {
  WORLD: canary("world"),
  SIBLING: canary("sibling"),
  STATE: canary("state"),
};
writeFileSync(join(WORLD, "visible.txt"), `canary=${c.WORLD}${NL}`, "utf8");
writeFileSync(join(SIBLING, "sibling.txt"), `canary=${c.SIBLING}${NL}`, "utf8");
writeFileSync(join(STATE, "proof.txt"), `canary=${c.STATE}${NL}`, "utf8");

/** The worker-shaped probe. Reports what it READ, and its own integrity level. */
const probePath = join(WORLD, "probe.mjs");
const reportPath = join(WORLD, "report.json");
writeFileSync(probePath, [
  'import { readFileSync, readdirSync, writeFileSync } from "node:fs";',
  'import { execFileSync } from "node:child_process";',
  'const out = {};',
  'const tryRead = (name, path) => { try { out[name] = { read: true, content: readFileSync(path, "utf8").trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };',
  `tryRead("OWN_WORLD", ${JSON.stringify(join(WORLD, "visible.txt"))});`,
  `tryRead("SIBLING_WORLD", ${JSON.stringify(join(SIBLING, "sibling.txt"))});`,
  `tryRead("STATE", ${JSON.stringify(join(STATE, "proof.txt"))});`,
  `try { out.ENUMERATE_WORLDS = { listed: readdirSync(${JSON.stringify(WORLDS)}) }; } catch (e) { out.ENUMERATE_WORLDS = { listed: false, code: e?.code ?? String(e) }; }`,
  `try { out.ENUMERATE_STATE = { listed: readdirSync(${JSON.stringify(STATE)}) }; } catch (e) { out.ENUMERATE_STATE = { listed: false, code: e?.code ?? String(e) }; }`,
  'try {',
  '  const g = execFileSync("whoami", ["/groups"], { encoding: "utf8" });',
  '  const m = g.match(/S-1-16-\\d+/);',
  '  out.INTEGRITY = m === null ? "unknown" : m[0];',
  '} catch (e) { out.INTEGRITY = "probe-failed"; }',
  `writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));`,
].join(NL), "utf8");

/* ------------------------------------------------------------------ the label */

/**
 * The label writer. It runs the SHIPPED binding table (the chunk's `win32` resolver, aliased `c`) because
 * that is the table that already works on this host for the write side. It writes ONE mandatory ACE with
 * policy 2 (NO_READ_UP) naming the MEDIUM integrity SID (well-known type 67), then applies it with
 * LABEL_SECURITY_INFORMATION (16) only — the DACL is deliberately untouched, so this experiment changes
 * nothing about who is ALLOWED, only about what a lower integrity level may READ.
 *
 * It VERIFIES the write by re-reading the descriptor through GetNamedSecurityInfoW, because a previous
 * attempt in this project (the PowerShell capability-SID deny) reported success while silently dropping
 * the ACE. A write whose return value is trusted is not evidence.
 */
const labelScript = join(RIG, "apply-no-read-up.mjs");
writeFileSync(labelScript, `
import { createRequire } from "node:module";
const koffi = createRequire(${JSON.stringify(CHUNK_URL)})( "koffi" );
const out = { steps: [] };
const step = (s) => { out.steps.push(s); };
const chunk = await import(${JSON.stringify(fileUrl(CHUNK))});
const api = await chunk.c();
const TARGETS = ${JSON.stringify([SIBLING, STATE, join(SIBLING, "sibling.txt"), join(STATE, "proof.txt")])};
const SE_FILE_OBJECT = 1;
const LABEL_SECURITY_INFORMATION = 16;
const NO_READ_UP = 2;
const WinMediumLabelSid = 67;

const mediumSid = koffi.alloc("uint8", 68);
const sizeSlot = koffi.alloc("uint32", 1);
koffi.encode(sizeSlot, "uint32", 68);
if (api.createWellKnownSid(WinMediumLabelSid, null, mediumSid, sizeSlot) === 0) { step("CreateWellKnownSid(Medium) FAILED"); process.stderr.write("LABEL " + JSON.stringify(out) + String.fromCharCode(10)); process.exit(0); }
const sidLen = api.getLengthSid(mediumSid);
step("medium integrity SID length: " + sidLen);

for (const target of TARGETS) {
  const aclLen = 16 + sidLen;
  const acl = api.localAlloc(64, aclLen);
  if (acl === null || acl === 0n) { step("LocalAlloc FAILED for " + target); continue; }
  if (api.initializeAcl(acl, aclLen, 2) === 0) { step("InitializeAcl FAILED for " + target); api.localFree(acl); continue; }
  if (api.addMandatoryAce(acl, 2, 3, NO_READ_UP, mediumSid) === 0) { step("AddMandatoryAce(policy=" + NO_READ_UP + ") FAILED for " + target); api.localFree(acl); continue; }
  const rc = api.setNamedSecurityInfoW(target, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, null, null, null, acl);
  api.localFree(acl);
  step("SetNamedSecurityInfoW(" + target.split(String.fromCharCode(92)).pop() + ") rc=" + rc);
}
process.stderr.write("LABEL " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");

/* ------------------------------------------------------------------ the reader */

/**
 * TWO readers of the SAME file, differing only in token integrity:
 *   · the CONTROL PLANE — a plain child at the caller's own (Medium) integrity;
 *   · the WORKER — a child spawned through the SHIPPED AclSandbox, whose token the backend lowers to Low.
 * Both report their own integrity level, so the comparison is between two measured subjects.
 */
const readerScript = join(RIG, "reader.mjs");
writeFileSync(readerScript, [
  'import { readFileSync, readdirSync } from "node:fs";',
  'import { execFileSync } from "node:child_process";',
  'const out = {};',
  `try { out.world = readFileSync(${JSON.stringify(join(WORLD, "visible.txt"))}, "utf8").trim(); } catch (e) { out.world = "BLOCKED:" + (e?.code ?? String(e)); }`,
  `try { out.sibling = readFileSync(${JSON.stringify(join(SIBLING, "sibling.txt"))}, "utf8").trim(); } catch (e) { out.sibling = "BLOCKED:" + (e?.code ?? String(e)); }`,
  `try { out.state = readFileSync(${JSON.stringify(join(STATE, "proof.txt"))}, "utf8").trim(); } catch (e) { out.state = "BLOCKED:" + (e?.code ?? String(e)); }`,
  'try {',
  '  const g = execFileSync("whoami", ["/groups"], { encoding: "utf8" });',
  '  const line = g.split(String.fromCharCode(10)).map((l) => l.trim()).find((l) => /S-1-16-\\d+/.test(l));',
  '  out.integrity = line === undefined ? "unknown" : (line.match(/S-1-16-\\d+/) ?? ["unknown"])[0];',
  '} catch (e) { out.integrity = "probe-failed"; }',
  'process.stdout.write("READER " + JSON.stringify(out) + String.fromCharCode(10));',
].join(NL), "utf8");

const aclUrl = fileUrl(ACL_INDEX);
const workerDriver = join(RIG, "worker-driver.mjs");
writeFileSync(workerDriver, `
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const out = {};
const mod = await import(${JSON.stringify(aclUrl)});
const { AclSandbox, tempWriteSid, workspaceWriteSid } = mod;
const workspaceRoot = ${JSON.stringify(WORLD)};
const tempDir = mkdtempSync(join(tmpdir(), "r1h-nru-"));
let sandbox;
try {
  sandbox = new AclSandbox({ writableDirs: [workspaceRoot], tempDir, writeSid: workspaceWriteSid(workspaceRoot), tempWriteSid: tempWriteSid(tempDir), mode: "workspace-write" });
  await sandbox.init();
  const child = sandbox.spawn({ command: process.execPath, args: [${JSON.stringify(readerScript)}], cwd: workspaceRoot, stdio: "inherit" });
  out.exitCode = (await child.wait()).exitCode;
} catch (error) { out.error = error?.message ?? String(error); }
finally { try { sandbox?.dispose(); } catch {} try { rmSync(tempDir, { recursive: true, force: true }); } catch {} }
process.stderr.write("WORKER_DRIVER " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");

const readAs = (which) => {
  if (which === "worker") {
    const run = spawnSync(process.execPath, [workerDriver], { encoding: "utf8", timeout: 150_000, stdio: ["ignore", "pipe", "pipe"] });
    const line = (run.stdout ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("READER")) ?? "";
    return line === "" ? { error: (run.stderr ?? "").slice(0, 300) } : JSON.parse(line.slice("READER ".length));
  }
  const run = spawnSync(process.execPath, [readerScript], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
  const line = (run.stdout ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("READER")) ?? "";
  return line === "" ? { error: (run.stderr ?? "").slice(0, 300) } : JSON.parse(line.slice("READER ".length));
};

/* ------------------------------------------------------------------ (1) baseline */

record("--- 1. baseline: no label ---", "");
const baseWorker = readAs("worker");
const baseControl = readAs("control");
record("worker integrity (measured)", String(baseWorker.integrity ?? "unknown"));
record("control integrity (measured)", String(baseControl.integrity ?? "unknown"));
record("BASELINE worker reads own world", String(baseWorker.world ?? "?").startsWith("canary=") ? "yes" : `NO (${baseWorker.world})`);
record("BASELINE worker reads sibling world", String(baseWorker.sibling ?? "?").includes(c.SIBLING) ? "READABLE — the leak" : `blocked (${baseWorker.sibling})`);
record("BASELINE worker reads durable state", String(baseWorker.state ?? "?").includes(c.STATE) ? "READABLE — the leak" : `blocked (${baseWorker.state})`);

/* ------------------------------------------------------------------ (2) the label */

record("--- 2. applying a MEDIUM + NO_READ_UP mandatory label ---", "");
const applied = spawnSync(process.execPath, [labelScript], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
const appliedLine = (applied.stderr ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("LABEL")) ?? "";
if (appliedLine === "") {
  record("label application", `FAILED: ${(applied.stderr ?? "").slice(0, 300)}`);
} else {
  for (const s of JSON.parse(appliedLine.slice("LABEL ".length)).steps) record("label", s.replace(RIG, "<rig>"));
}

/* ------------------------------------------------------------------ (3) verification */

/**
 * Verify PERSISTENCE before drawing any conclusion. The check re-reads the label through the same
 * binding table rather than trusting the write's return code: a write that silently did nothing would
 * otherwise be reported as a working boundary.
 */
const verifyScript = join(RIG, "verify-label.mjs");
writeFileSync(verifyScript, `
import { createRequire } from "node:module";
const koffi = createRequire(${JSON.stringify(CHUNK_URL)})( "koffi" );
const chunk = await import(${JSON.stringify(fileUrl(CHUNK))});
const api = await chunk.c();
const out = {};
for (const target of ${JSON.stringify([SIBLING, STATE, join(STATE, "proof.txt")])}) {
  const owner = koffi.alloc(koffi.pointer("void"), 1);
  const group = koffi.alloc(koffi.pointer("void"), 1);
  const dacl = koffi.alloc(koffi.pointer("void"), 1);
  const label = koffi.alloc(koffi.pointer("void"), 1);
  const sd = koffi.alloc(koffi.pointer("void"), 1);
  // GetNamedSecurityInfoW(path, SE_FILE_OBJECT=1, LABEL_SECURITY_INFORMATION=16, ...)
  const rc = api.getNamedSecurityInfoW(target, 1, 16, owner, group, dacl, label, sd);
  const labelPtr = koffi.decode(label, koffi.pointer("void"));
  out[target.split(String.fromCharCode(92)).pop()] = { rc, labelPresent: !(labelPtr === null || labelPtr === undefined || labelPtr === 0n) };
}
process.stderr.write("VERIFY " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");
const verified = spawnSync(process.execPath, [verifyScript], { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] });
const vLine = (verified.stderr ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("VERIFY")) ?? "";
record("label persistence probe", vLine === "" ? `probe failed: ${(verified.stderr ?? "").slice(0, 200)}` : vLine.slice("VERIFY ".length).slice(0, 300));

/* ------------------------------------------------------------------ (4) after */

record("--- 3. after the label ---", "");
const afterWorker = readAs("worker");
const afterControl = readAs("control");
record("worker integrity (measured)", String(afterWorker.integrity ?? "unknown"));
record("control integrity (measured)", String(afterControl.integrity ?? "unknown"));
record("WORKER reads own world (ordinary work intact)", String(afterWorker.world ?? "?").startsWith("canary=") ? "YES" : `NO — the label broke ordinary work (${afterWorker.world})`);
record("WORKER reads sibling world", String(afterWorker.sibling ?? "?").includes(c.SIBLING) ? "STILL READABLE — the label does not bind" : `blocked (${afterWorker.sibling})`);
record("WORKER reads durable state", String(afterWorker.state ?? "?").includes(c.STATE) ? "STILL READABLE — the label does not bind" : `blocked (${afterWorker.state})`);
record("WORKER enumerates the worlds dir", afterWorker.ENUMERATE_WORLDS?.listed === false ? `blocked (${afterWorker.ENUMERATE_WORLDS.code})` : `still listable (${(afterWorker.ENUMERATE_WORLDS?.listed ?? []).join(", ")})`);
record("CONTROL PLANE reads sibling world", String(afterControl.sibling ?? "?").includes(c.SIBLING) ? "yes — the control plane is unaffected" : `NO (${afterControl.sibling}) — unusable`);
record("CONTROL PLANE reads durable state", String(afterControl.state ?? "?").includes(c.STATE) ? "yes — the control plane is unaffected" : `NO (${afterControl.state}) — unusable`);

/* ------------------------------------------------------------------ restore */

for (const target of [SIBLING, STATE]) {
  spawnSync("icacls", [target, "/setintegritylevel", "(OI)(CI)M"], { encoding: "utf8" });
}
writeFileSync(join(RIG, "no-read-up.json"), `${JSON.stringify({ findings, canaries: c, baseline: { worker: baseWorker, control: baseControl }, after: { worker: afterWorker, control: afterControl } }, null, 2)}${NL}`, "utf8");
process.stdout.write(`\nwritten: ${join(RIG, "no-read-up.json")}\n`);
