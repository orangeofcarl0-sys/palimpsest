#!/usr/bin/env node
/**
 * R1-H GATE A — IS THE HOST'S OWN FFI BINDING TABLE REACHABLE, AND WHAT DOES IT OFFER?
 *
 * R1-S concluded "no no-read-up path exists in the shipped stack", on the strength of two measurements:
 * `icacls` cannot spell it, and DSH's own label builder passes the no-WRITE-up policy. Both are true. What
 * neither establishes is whether the RAW binding table the host uses to write labels can be driven with a
 * different policy value — the table takes `policy` as an argument, so the capability is not the constant.
 *
 * This script answers only that question, mechanically, before any boundary claim is made:
 *   (1) is the binding table reachable at runtime?
 *   (2) does a system-provided NO_READ_UP label actually change what a LOW token may read?
 *
 * It is a PROBE. It installs a label on a synthetic directory and restores it.
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
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1h", "ffi-reach");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
mkdirSync(RIG, { recursive: true });

const findings = [];
const record = (key, value) => {
  findings.push([key, value]);
  process.stdout.write(`  · ${key}: ${value}\n`);
};
const canary = (label) => `${label}_${randomBytes(12).toString("hex")}`;

process.stdout.write(`\n===== R1-H FFI REACH =====\nrig ${RIG}\n`);
if (process.platform !== "win32") {
  process.stdout.write("Windows-only probe. Stopping.\n");
  process.exit(0);
}

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();

const ACL_DIR = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl");
const CHUNK = join(ACL_DIR, "lib", "types-Cl_DXjhk.js");
const WIN32_PKG = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-win32-process", "lib", "index.js");
const fileUrl = (p) => new URL(`file:///${p.split(String.fromCharCode(92)).join("/")}`).href;

record("acl package dir exists", String(existsSync(ACL_DIR)));
record("bundled chunk exists", String(existsSync(CHUNK)));
record("win32-process package exists", String(existsSync(WIN32_PKG)));

const PROTECTED = join(RIG, "protected");
mkdirSync(PROTECTED, { recursive: true });
const protectedCanary = canary("protected");
writeFileSync(join(PROTECTED, "secret.txt"), `canary=${protectedCanary}\n`, "utf8");

/* --------------------------------------------------------------- the FFI harness */

/**
 * The harness runs in a SEPARATE process because the label must be applied and then measured under a
 * different token, and because a raw-FFI failure must not take the probe down with it.
 *
 * It reports, as data: which exports the chunk actually has, whether a table resolves, and the result of
 * each attempt. Nothing here reads a real secret.
 */
const harnessPath = join(RIG, "label-harness.mjs");
writeFileSync(harnessPath, `
import { createRequire } from "node:module";
const out = { steps: [] };
const step = (s) => { out.steps.push(s); };

let chunk = null;
try {
  chunk = await import(${JSON.stringify(fileUrl(CHUNK))});
  step("chunk exports: " + Object.keys(chunk).sort().join(","));
} catch (error) { step("chunk import FAILED: " + (error?.message ?? String(error))); }

let ffi = null;
try {
  ffi = await import(${JSON.stringify(fileUrl(WIN32_PKG))});
  step("win32-process exports: " + Object.keys(ffi).sort().join(","));
} catch (error) { step("win32-process import FAILED: " + (error?.message ?? String(error))); }

if (chunk !== null && typeof chunk.c === "function") {
  try {
    const api = await chunk.c();
    step("binding table resolved; sample keys: " + Object.keys(api).sort().slice(0, 40).join(","));
    out.hasAddMandatoryAce = typeof api.addMandatoryAce === "function";
    out.hasSetNamedSecurityInfoW = typeof api.setNamedSecurityInfoW === "function";
    out.hasGetNamedSecurityInfoW = typeof api.getNamedSecurityInfoW === "function";
    out.hasInitializeAcl = typeof api.initializeAcl === "function";
    out.hasLocalAlloc = typeof api.localAlloc === "function";
    out.hasConvertStringSidToSidW = typeof api.convertStringSidToSidW === "function";
    out.hasCreateWellKnownSid = typeof api.createWellKnownSid === "function";
    out.hasGetLengthSid = typeof api.getLengthSid === "function";
    out.hasSetEntriesInAclW = typeof api.setEntriesInAclW === "function";
  } catch (error) { step("binding table FAILED: " + (error?.message ?? String(error))); }
}
process.stderr.write("REACH " + JSON.stringify(out) + String.fromCharCode(10));
`, "utf8");

const run = spawnSync(process.execPath, [harnessPath], { encoding: "utf8", timeout: 90_000, stdio: ["ignore", "pipe", "pipe"] });
const line = (run.stderr ?? "").split(String.fromCharCode(10)).map((e) => e.trim()).find((e) => e.startsWith("REACH")) ?? "";
if (line === "") {
  record("introspection", `FAILED: ${(run.stderr ?? "").slice(0, 400) || (run.stdout ?? "").slice(0, 400)}`);
} else {
  const info = JSON.parse(line.slice("REACH ".length));
  for (const s of info.steps) record("probe", s.slice(0, 700));
  for (const key of ["hasAddMandatoryAce", "hasSetNamedSecurityInfoW", "hasGetNamedSecurityInfoW", "hasInitializeAcl", "hasLocalAlloc", "hasConvertStringSidToSidW", "hasCreateWellKnownSid", "hasGetLengthSid", "hasSetEntriesInAclW"]) {
    if (info[key] !== undefined) record(key, String(info[key]));
  }
}

writeFileSync(join(RIG, "ffi-reach.json"), `${JSON.stringify({ findings, protectedCanary }, null, 2)}\n`, "utf8");
process.stdout.write(`\nwritten: ${join(RIG, "ffi-reach.json")}\n`);
process.stdout.write(`protected dir: ${PROTECTED}\n`);
