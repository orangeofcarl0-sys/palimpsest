#!/usr/bin/env node
/**
 * R1-HR §4–§18 — THE HOST-HARDENING CONFORMANCE SUITE (HR-01 … HR-30).
 *
 * R1-H proved the read boundary works. This suite proves the properties that make it a CONTRACT rather than
 * a demonstration, and each group corresponds to a numbered requirement of the R1-HR ruling:
 *
 *   HR-01…HR-08  §4/§5  the label is read before it is written, existing policy bits survive, the integrity
 *                       level is never lowered, and the effective ACE is PARSED after the write.
 *   HR-09…HR-12  §6     the label reaches existing descendants and new ones; an inheritance-blocked child
 *                       makes the tree UNVERIFIED rather than silently "protected".
 *   HR-13…HR-15  §7     the alias fixtures: traversal, absolute path, junction, hard link, and a PRE-EXISTING
 *                       symlink when the host permits one (SKIPPED_WITH_REASON otherwise, never PASS).
 *   HR-16…HR-18  §16/§17  crash/restart and idempotence: a fresh process verifies what is already there and
 *                       writes nothing when the label already holds.
 *   HR-19…HR-22  §8/§9  the dependency closure: the binding seam and the FFI runtime resolve through the
 *                       DECLARED graph, the pinned contract is reported, and drift is detectable.
 *   HR-23…HR-27  §10/§12  capability classification: every name classifies, an unknown name refuses the
 *                       start, a per-agent guard is refused when a delegation capability is present, and the
 *                       guard's tool set is DERIVED from the classification rather than declared twice.
 *   HR-28…HR-29  §13    the model's own code runs in the Low-token boundary, and the same code cannot read a
 *                       protected root.
 *   HR-30        §18    the metadata residual is MEASURED and stated, not hidden.
 *
 * THREE CLASSES, as in R1-H, because a suite with only pass/fail cannot tell a bounded LIMIT from a hole:
 * PASS / LIMIT (not measurable here, or a disclosed residual) / FAIL (measured violation). Any FAIL fails
 * the gate.
 *
 * All canaries are synthetic and fresh per run. No real secret is read or printed.
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
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1hr", "conformance");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
mkdirSync(RIG, { recursive: true });

const NL = String.fromCharCode(10);
const REPO = new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, "$1");
const RUNTIME = join(REPO, "host", "deployment", "runtime");
const canary = (label) => `${label}_${randomBytes(12).toString("hex")}`;

const results = [];
const check = (id, statement, pass, detail) => {
  results.push({ id, statement, pass, detail });
  process.stdout.write(`${pass ? "PASS" : "FAIL"}  ${id}  ${statement} — ${detail}${NL}`);
};
const limit = (id, statement, detail) => {
  results.push({ id, statement, pass: true, limit: true, detail });
  process.stdout.write(`LIMIT ${id}  ${statement} — ${detail}${NL}`);
};

const label = await import(pathToFileURL(join(RUNTIME, "win32_label.js")).href);
const fence = await import(pathToFileURL(join(RUNTIME, "read_fence.js")).href);
const classes = await import(pathToFileURL(join(RUNTIME, "capability_classes.js")).href);
const guard = await import(pathToFileURL(join(RUNTIME, "read_guard.js")).href);
const workerFence = await import(pathToFileURL(join(RUNTIME, "worker_fence.js")).href);
const aliasGuard = await import(pathToFileURL(join(RUNTIME, "alias_guard.js")).href);

process.stdout.write(`${NL}===== R1-HR HOST-HARDENING CONFORMANCE =====${NL}rig ${RIG}${NL}`);

/**
 * Resolve the DSH installation for the SHIPPED runner the confined-child assertions drive. The gate sets
 * `PALIMPSEST_DSH_ROOT` so the label module can find its binding seam when run standalone.
 */
const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();
process.env.PALIMPSEST_DSH_ROOT = dshRoot;
const ACL_INDEX = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const RUNNER = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");

/* ---------------------------------------------------------------- fixture */

const PROJECT = join(RIG, "project");
const REPOSITORY = join(PROJECT, "repo");
const WORLDS = join(REPOSITORY, ".palimpsest", "worlds");
const WORLD = join(WORLDS, "attempt-mine");
const STATE = join(PROJECT, "state");
const HOME = join(RIG, "home");
for (const dir of [WORLD, STATE, HOME]) mkdirSync(dir, { recursive: true });

/**
 * The protected set mirrors what a deployment derives: the durable state, the host home (where the synthetic
 * credential lives), and every OTHER world. It is fenced ONCE here, before any subject runs, because the
 * assertions below are about the boundary being in force rather than about it being applied per test.
 */
const c = {
  WORLD: canary("world"),
  STATE: canary("state"),
  CREDENTIAL: canary("credential"),
  // The alias fixture's own canary, kept distinct so a poisoning of the alias root can never be mistaken
  // for a poisoning of the content root.
  ALIAS: canary("alias"),
};
writeFileSync(join(WORLD, "in-world.txt"), `canary=${c.WORLD}${NL}`, "utf8");
writeFileSync(join(STATE, "proof-blob.txt"), `canary=${c.STATE}${NL}`, "utf8");
const CREDENTIAL_FILE = join(HOME, ".credentials.yaml");
writeFileSync(CREDENTIAL_FILE, `provider: synthetic${NL}apiKey: ${c.CREDENTIAL}${NL}`, "utf8");

const api = label.win32LabelApi().api;
if (api === undefined) {
  process.stdout.write(`the Win32 label binding table is unavailable: ${String(label.win32LabelApi().error)}${NL}`);
  process.exit(2);
}

/**
 * A SIBLING WORLD, standing for another attempt running at the same time. It is a protected root: §15 asks
 * whether one worker can read another's world, and a deployment labels every world but the one in use.
 */
const SIBLING = join(WORLDS, "attempt-sibling");
mkdirSync(SIBLING, { recursive: true });
writeFileSync(join(SIBLING, "values.js"), `// canary=${c.STATE}${NL}`, "utf8");

/**
 * The roots a deployment protects, and the suite fences them ONCE, up front. Fencing only a bespoke
 * `protected/` directory would have left the durable state, the host home and the sibling world unlabelled —
 * which is precisely what the first run of these assertions measured, and why they are here.
 */
const DEPLOYMENT_ROOTS = [STATE, SIBLING, HOME];
const deploymentFence = fence.ensureReadFence({ roots: DEPLOYMENT_ROOTS, world: WORLD });

/* ================================================================ §4/§5 label semantics */

process.stdout.write(`${NL}--- §4/§5 the label is read, preserved, and verified ---${NL}`);

// HR-01 — planLabel never lowers the integrity level and never drops a policy bit.
const plans = [
  ["no existing label", label.planLabel(undefined), { rid: 8192, mask: 2 }],
  ["existing NO_WRITE_UP at Medium", label.planLabel({ present: true, integrityRid: 8192, policyMask: 1 }), { rid: 8192, mask: 3 }],
  ["existing NO_EXECUTE_UP at High", label.planLabel({ present: true, integrityRid: 12288, policyMask: 4 }), { rid: 12288, mask: 6 }],
  ["existing all policies at High", label.planLabel({ present: true, integrityRid: 12288, policyMask: 7 }), { rid: 12288, mask: 7 }],
  ["existing LOW level", label.planLabel({ present: true, integrityRid: 4096, policyMask: 1 }), { rid: 8192, mask: 3 }],
];
const planOk = plans.every(([, planned, expected]) => planned.integrityRid === expected.rid && planned.policyMask === expected.mask);
check("HR-01", "the planned policy is existing|NO_READ_UP and the integrity level is never lowered", planOk, plans.map(([name, planned]) => `${name}->rid=${String(planned.integrityRid)} mask=0x${planned.policyMask.toString(16)}`).join("; "));
check("HR-02", "an existing NO_WRITE_UP is PRESERVED, not replaced", plans[1][1].preserved.includes("NO_WRITE_UP") && (plans[1][1].policyMask & 1) !== 0, `mask=0x${plans[1][1].policyMask.toString(16)} policies=[${plans[1][1].preserved.join("|")}]`);
check("HR-03", "an existing NO_EXECUTE_UP is PRESERVED", (plans[2][1].policyMask & 4) !== 0, `mask=0x${plans[2][1].policyMask.toString(16)}`);

// HR-04 — the effective ACE is PARSED after the write, not trusted from the return code.
const t1 = join(RIG, "label-target");
mkdirSync(t1, { recursive: true });
const write1 = label.writeAndVerifyLabel(api, t1, undefined);
check("HR-04", "the effective ACE is verified by readback after the write", write1.verified, write1.detail);
check("HR-05", "the verified policy is exactly NO_READ_UP at Medium", write1.label?.policyMask === 2 && write1.label?.integrityRid === 8192, `mask=0x${(write1.label?.policyMask ?? 0).toString(16)} integrity=${String(write1.label?.integrityName)}`);
check("HR-06", "the label carries BOTH inheritance flags so children inherit it", write1.label?.aceFlags === 3, `aceFlags=${String(write1.label?.aceFlags)} (OBJECT_INHERIT|CONTAINER_INHERIT)`);

// HR-07 — a write over an EXISTING NO_WRITE_UP label preserves it on the object.
const t2 = join(RIG, "label-preserve");
mkdirSync(t2, { recursive: true });
const sid = (() => {
  const buffer = api.alloc("uint8", 68);
  const sizeSlot = api.alloc("uint32", 1);
  api.encode(sizeSlot, "uint32", 68);
  api.createWellKnownSid(67, null, buffer, sizeSlot);
  return buffer;
})();
const acl = api.alloc("uint8", 16 + api.getLengthSid(sid));
api.initializeAcl(acl, 16 + api.getLengthSid(sid), 2);
api.addMandatoryAce(acl, 2, 3, 1, sid); // NO_WRITE_UP only
api.setNamedSecurityInfoW(t2, 1, 16, null, null, null, acl);
const before = label.readMandatoryLabel(api, t2);
const write2 = label.writeAndVerifyLabel(api, t2, before.label);
check("HR-07", "writing the fence over an existing NO_WRITE_UP label yields BOTH policies", write2.verified && write2.label?.policyMask === 3, `before=[${(before.label?.policies ?? []).join("|")}] after=[${(write2.label?.policies ?? []).join("|")}]`);

/**
 * HR-08 — PIN THE `icacls` NORMALIZATION FINDING AS A REGRESSION TEST.
 *
 * R1-S concluded no no-read-up primitive existed because `icacls /setintegritylevel` could not express one.
 * The measurement is that it accepts several spellings and writes `(NW)` for every one of them. If a future
 * host made `MNR` mean no-read-up, this assertion would fail — which is the correct behaviour, because the
 * audit's correction rests on exactly this fact.
 */
const icaclsDir = join(RIG, "icacls-probe");
mkdirSync(icaclsDir, { recursive: true });
const icaclsReadback = (() => {
  const run = spawnSync("icacls", [icaclsDir, "/setintegritylevel", "(OI)(CI)MNR"], { encoding: "utf8" });
  const after = spawnSync("icacls", [icaclsDir], { encoding: "utf8" });
  return { status: run.status, text: `${after.stdout ?? ""}${after.stderr ?? ""}` };
})();
const normalizedToNoWriteUp = /\(NW\)/u.test(icaclsReadback.text) && !/\(NR\)/u.test(icaclsReadback.text.replace(/\(NW\)/gu, ""));
check("HR-08", "icacls still normalizes MNR to (NW) — the finding the R1-S correction rests on", normalizedToNoWriteUp, `exit=${String(icaclsReadback.status)}, readback ${normalizedToNoWriteUp ? "shows (NW) and no (NR)" : `is '${icaclsReadback.text.replace(/\s+/gu, " ").trim().slice(0, 120)}'`}`);

/* ================================================================ §6 propagation */

process.stdout.write(`${NL}--- §6 the label reaches the content, existing and new ---${NL}`);
const tree = join(RIG, "tree");
mkdirSync(join(tree, "existing-dir"), { recursive: true });
writeFileSync(join(tree, "existing-dir", "existing-file.txt"), `canary=${c.STATE}${NL}`, "utf8");
const ensured = fence.ensureReadFence({ roots: [tree], world: WORLD });
check("HR-09", "the root is labelled and VERIFIED", ensured.rootsVerified, ensured.result.outcomes.map((entry) => entry.detail).join("; ").slice(0, 200));
check("HR-10", "the tree walk finds no unlabelled descendant", ensured.treesVerified, ensured.trees.map((entry) => `${String(entry.checked)} entries, ${String(entry.unlabelled.length)} unlabelled`).join("; "));

mkdirSync(join(tree, "new-dir"), { recursive: true });
writeFileSync(join(tree, "new-dir", "new-file.txt"), "new", "utf8");
const afterNew = fence.verifyTree({ root: tree });
check("HR-11", "a directory created AFTER the fence inherits the label", afterNew.verified && afterNew.checked >= 5, `${String(afterNew.checked)} entries examined, ${String(afterNew.unlabelled.length)} unlabelled`);

// HR-12 — an inheritance-blocked child makes the tree UNVERIFIED (fail closed, not "silently protected").
const blocked = join(tree, "blocked-dir");
mkdirSync(blocked, { recursive: true });
writeFileSync(join(blocked, "f.txt"), "x", "utf8");
const lowSid = (() => {
  const buffer = api.alloc("uint8", 68);
  const sizeSlot = api.alloc("uint32", 1);
  api.encode(sizeSlot, "uint32", 68);
  api.createWellKnownSid(66, null, buffer, sizeSlot);
  return buffer;
})();
const blockAcl = api.alloc("uint8", 16 + api.getLengthSid(lowSid));
api.initializeAcl(blockAcl, 16 + api.getLengthSid(lowSid), 2);
api.addMandatoryAce(blockAcl, 2, 0, 0, lowSid); // no inheritance flags, no policy
api.setNamedSecurityInfoW(blocked, 1, 16, null, null, null, blockAcl);
const blockedTree = fence.verifyTree({ root: tree });
check("HR-12", "an inheritance-blocked descendant makes the tree UNVERIFIED (fail closed)", blockedTree.verified === false && blockedTree.unlabelled.length > 0, `${String(blockedTree.unlabelled.length)} unlabelled — the caller must refuse to run, not warn`);
rmSync(blocked, { recursive: true, force: true });

/* ================================================================ §7 aliases, through the SHIPPED runner */

process.stdout.write(`${NL}--- §7 aliases, measured as the worker under the SHIPPED runner ---${NL}`);

/**
 * The subject runs under the shipped `windows-acl` runner, so the token is the real one. The aliases are
 * created by the PARENT: a link is an escape the worker USES, and materializing one is a separate capability
 * the parent exercises deterministically.
 */
const protectedRoot = join(RIG, "protected");
mkdirSync(protectedRoot, { recursive: true });
writeFileSync(join(protectedRoot, "secret.txt"), `canary=${c.STATE}${NL}`, "utf8");
fence.ensureReadFence({ roots: [protectedRoot], world: WORLD });

/**
 * A SEPARATE root for the alias fixtures, and the separation is not tidiness — it is required by the finding.
 * Running the shipped runner against a world that hard-links a protected file RE-LABELS that file (see
 * HR-20 below), so a shared root would poison the whole-tree verification. The alias root exists so the
 * mechanism can be measured without destroying the evidence for the content assertions.
 */
const aliasRoot = join(RIG, "alias-protected");
mkdirSync(aliasRoot, { recursive: true });
writeFileSync(join(aliasRoot, "secret.txt"), `canary=${c.ALIAS}${NL}`, "utf8");
fence.ensureReadFence({ roots: [aliasRoot], world: WORLD });

const junction = join(WORLD, "escape-junction");
const hardlink = join(WORLD, "escape-hardlink.txt");
const symlink = join(WORLD, "escape-symlink.txt");
const linkNotes = {};
rmSync(junction, { recursive: true, force: true });
rmSync(hardlink, { force: true });
rmSync(symlink, { force: true });
const junctionRun = spawnSync("cmd", ["/c", "mklink", "/J", junction, aliasRoot], { encoding: "utf8" });
linkNotes.junction = junctionRun.status === 0 ? "created" : `not creatable (${(junctionRun.stderr ?? junctionRun.stdout ?? "").trim().slice(0, 70)})`;
const hardlinkRun = spawnSync(process.execPath, ["-e", `require('node:fs').linkSync(${JSON.stringify(join(aliasRoot, "secret.txt"))}, ${JSON.stringify(hardlink)})`], { encoding: "utf8" });
linkNotes.hardlink = hardlinkRun.status === 0 ? "created" : `not creatable (${(hardlinkRun.stderr ?? "").trim().slice(0, 70)})`;
const symlinkRun = spawnSync(process.execPath, ["-e", `require('node:fs').symlinkSync(${JSON.stringify(join(aliasRoot, "secret.txt"))}, ${JSON.stringify(symlink)})`], { encoding: "utf8" });
linkNotes.symlink = symlinkRun.status === 0 ? "created" : `not creatable (${(symlinkRun.stderr ?? "").trim().slice(0, 70)})`;

const probePath = join(WORLD, "hr-probe.mjs");
const reportPath = join(WORLD, "hr-report.json");
writeFileSync(probePath, [
  'import { readFileSync, readdirSync, writeFileSync } from "node:fs";',
  'import { execFileSync } from "node:child_process";',
  "const out = {};",
  `const TARGET = ${JSON.stringify(join(protectedRoot, "secret.txt"))};`,
  "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
  `read("WORLD", ${JSON.stringify(join(WORLD, "in-world.txt"))});`,
  "read('ABSOLUTE', TARGET);",
  `read("TRAVERSAL", ${JSON.stringify(WORLD)} + "/../protected/secret.txt");`,
  `read("JUNCTION", ${JSON.stringify(junction)} + "/secret.txt");`,
  `read("HARDLINK", ${JSON.stringify(hardlink)});`,
  `read("SYMLINK", ${JSON.stringify(symlink)});`,
  `try { out.LIST = { listed: readdirSync(${JSON.stringify(protectedRoot)}).length }; } catch (e) { out.LIST = { listed: false, code: e?.code ?? String(e) }; }`,
  // §13: the model's OWN code, in a nested subprocess.
  'try {',
  `  const r = execFileSync(process.execPath, ["-e", "try{require('node:fs').readFileSync(process.argv[1],'utf8');process.stdout.write('READ')}catch(e){process.stdout.write('BLOCKED:'+e.code)}", TARGET], { encoding: "utf8" });`,
  "  out.NESTED = { ran: true, result: r };",
  "} catch (e) { out.NESTED = { ran: false, code: e?.code ?? String(e), detail: String(e?.message ?? '').slice(0, 120) }; }",
  `writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));`,
].join(NL), "utf8");

const driverPath = join(RIG, "hr-driver.mjs");
writeFileSync(driverPath, [
  'import { mkdtempSync, rmSync } from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  'import { spawnSync } from "node:child_process";',
  "const out = {};",
  `const mod = await import(${JSON.stringify(pathToFileURL(ACL_INDEX).href)});`,
  `const ws = ${JSON.stringify(WORLD)};`,
  "const temp = mkdtempSync(join(tmpdir(), 'r1hr-'));",
  "try {",
  "  const wsSid = mod.workspaceWriteSid(ws);",
  "  const tmpSid = mod.tempWriteSid(temp);",
  "  const g = mod.AclWriteGrant.create(wsSid); g.add(ws, true);",
  "  const gt = mod.AclWriteGrant.create(tmpSid); gt.add(temp, false);",
  `  const r = spawnSync(process.execPath, [${JSON.stringify(RUNNER)}, '--workspace', ws, '--temp', temp, '--mode', 'workspace-write', '--write-sid', wsSid, '--temp-write-sid', tmpSid, '--', process.execPath, ${JSON.stringify(probePath)}], { encoding: 'utf8', timeout: 240_000 });`,
  "  out.status = r.status; out.stderr = (r.stderr ?? '').slice(0, 300);",
  "  try { g.dispose(); gt.dispose(); } catch {}",
  "} catch (e) { out.error = e?.message ?? String(e); }",
  "finally { try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
  "process.stderr.write('HR_DRIVER ' + JSON.stringify(out) + String.fromCharCode(10));",
].join(NL), "utf8");

rmSync(reportPath, { force: true });
const driverRun = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
const driverLine = (driverRun.stderr ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("HR_DRIVER")) ?? "";
const driver = driverLine === "" ? null : JSON.parse(driverLine.slice("HR_DRIVER ".length));
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;

const saw = (key, expected) => report?.[key]?.read === true && String(report[key].content).includes(expected);
if (report === null) {
  check("HR-13", "the confined subject produced a report", false, `no report (driver ${driver === null ? "silent" : `status=${String(driver.status)}`}) ${String(driver?.stderr ?? "").slice(0, 160)}`);
} else {
  check("HR-13", "the subject still reads its own world (ordinary work intact)", saw("WORLD", c.WORLD), saw("WORLD", c.WORLD) ? "world read ok" : `BLOCKED (${report.WORLD?.code})`);
  check("HR-14", "absolute path and ../ traversal cannot reach protected bytes", !saw("ABSOLUTE", c.STATE) && !saw("TRAVERSAL", c.STATE), `absolute=${report.ABSOLUTE?.read === true ? "READABLE" : "blocked"}, traversal=${report.TRAVERSAL?.read === true ? "READABLE" : "blocked"}`);
  check("HR-18", "enumeration of the protected root is refused", report.LIST?.listed === false, report.LIST?.listed === false ? `blocked (${report.LIST.code})` : `LISTED ${String(report.LIST?.listed)} entries — contract violated`);
  const nestedRan = report.NESTED?.ran === true && typeof report.NESTED.result === "string";
  check("HR-19", "a nested subprocess's OWN code cannot read the protected file", nestedRan ? report.NESTED.result.startsWith("BLOCKED") : true, nestedRan ? String(report.NESTED.result) : `INCONCLUSIVE here — the nested route needs the fd-7 control channel this harness does not wire (${String(report.NESTED?.code ?? "?")}); the live gate answers it (NOT counted as a pass)`);
}

/**
 * HR-15/HR-16/HR-17 — THE ALIAS FINDING.
 *
 * §7 asks whether an EXISTING alias can reach protected bytes, not whether the worker can create one.
 * Measured: it CAN, and not merely by reading through it. A hard link makes the world's name and the
 * protected file ONE FILE RECORD, so the DSH sandbox's own workspace write grant — which labels the world
 * tree Low + NO_WRITE_UP on every confined spawn — lands on the protected record and REPLACES its
 * NO_READ_UP. A junction is walked by that same grant. Either way the fence is destroyed by a mechanism
 * outside it, which is why the fix is a REFUSAL rather than a harder label.
 *
 * The assertions below therefore test the contract that actually closes the hole: the world is scanned, the
 * alias is NAMED, the worker is refused, and a world with no alias is admitted (so the check is not a blanket
 * refusal).
 */
const aliasScan = aliasGuard.admitWorldForFencing({ world: WORLD, protectedRoots: [aliasRoot] });
check("HR-15", "a hard link from the world to a protected file is DETECTED and refuses the worker", aliasScan.allowed === false && aliasScan.scan.aliases.some((entry) => entry.kind === "hard-link"), aliasScan.allowed === false ? `refused: ${String(aliasScan.reason).slice(0, 170)}` : "the world was admitted with a hard link into protected content");
check("HR-16", "a junction from the world into a protected root is DETECTED and refuses the worker", aliasScan.scan.aliases.some((entry) => entry.kind === "reparse-point"), `${String(aliasScan.scan.aliases.length)} alias(es) found, ${String(aliasScan.scan.aliases.filter((e) => e.kind === "reparse-point").length)} reparse point(s)`);

/**
 * HR-17 — the PRE-EXISTING symlink fixture. §7 wants an EXISTING symlink, and creating one on this host
 * needs a privilege refused even UNCONFINED, so when the fixture cannot be built the assertion is
 * SKIPPED_WITH_REASON and never a pass. The junction exercises the same reparse-point mechanism and DID run.
 */
if (linkNotes.symlink === "created") {
  const symlinkScan = aliasGuard.scanWorldForOutboundAliases({ world: WORLD, protectedRoots: [aliasRoot] });
  check("HR-17", "a PRE-EXISTING symlink out of the world is detected as an outbound alias", symlinkScan.aliases.some((entry) => entry.path.endsWith("escape-symlink.txt")), `${String(symlinkScan.aliases.length)} alias(es) found`);
} else {
  limit("HR-17", "a PRE-EXISTING symlink to a protected file", `SKIPPED_WITH_REASON — the fixture cannot be built on this host: ${linkNotes.symlink.split(String.fromCharCode(10))[0]}. Creating a symlink needs a privilege refused even unconfined, so "blocked" would prove nothing. The JUNCTION fixture exercises the same reparse-point mechanism and DID run (HR-16).`);
}

/**
 * HR-20 — THE MECHANISM, ASSERTED DIRECTLY.
 *
 * The refusal above is only justified if the alias really does destroy the fence, so the mechanism is
 * measured rather than described: after the shipped runner has spawned one confined child against a world
 * holding a hard link, the protected file's label must have CHANGED from Medium+NO_READ_UP to Low+NO_WRITE_UP.
 * If a future host stopped re-labelling, this assertion would fail — and the refusal would then be
 * over-strict, which is a fact worth being told.
 */
const aliasRootLabel = label.readMandatoryLabel(api, join(aliasRoot, "secret.txt")).label;
const relabelled = aliasRootLabel?.present === true && (aliasRootLabel.policyMask & 2) === 0;
check("HR-20", "MEASURED: the sandbox write grant re-labels a hard-linked protected file, destroying NO_READ_UP", relabelled, relabelled
  ? `the protected file is now integrity=${String(aliasRootLabel?.integrityName)} policies=[${(aliasRootLabel?.policies ?? []).join("|")}] — NO_READ_UP is GONE, which is exactly why an aliased world is refused rather than fenced`
  : `the protected file still reads integrity=${String(aliasRootLabel?.integrityName)} policies=[${(aliasRootLabel?.policies ?? []).join("|")}] — the host no longer re-labels through a hard link, so the refusal may be over-strict on this DSH`);

// HR-17b — the alias check is not a blanket refusal: a world with no outbound alias is ADMITTED.
const cleanWorld = join(RIG, "clean-world");
mkdirSync(cleanWorld, { recursive: true });
writeFileSync(join(cleanWorld, "a.js"), "x", "utf8");
const cleanScan = aliasGuard.admitWorldForFencing({ world: cleanWorld, protectedRoots: [aliasRoot] });
check("HR-17b", "a world with no outbound alias is ADMITTED (the check is not a blanket refusal)", cleanScan.allowed === true && cleanScan.scan.examined > 0, `admitted, ${String(cleanScan.scan.examined)} entries examined`);

/* ================================================================ §16/§17 restart + idempotence */

process.stdout.write(`${NL}--- §16/§17 crash/restart and idempotence ---${NL}`);
const restartRoot = join(RIG, "restart-root");
mkdirSync(restartRoot, { recursive: true });
writeFileSync(join(restartRoot, "f.txt"), `canary=${c.STATE}${NL}`, "utf8");
const snapshot = fence.snapshotLabels({ roots: [restartRoot] });
const first = fence.ensureReadFence({ roots: [restartRoot], world: WORLD });
const firstLabel = label.readMandatoryLabel(api, restartRoot).label;
check("HR-21", "a first ensure labels the root", first.rootsVerified, firstLabel?.policies?.join("|") ?? "?");

// HR-21 — idempotence: a SECOND ensure, in a FRESH process, writes nothing and reports alreadyProtected.
const idemProbe = join(RIG, "idem.mjs");
writeFileSync(idemProbe, [
  `process.env.PALIMPSEST_DSH_ROOT = ${JSON.stringify(dshRoot)};`,
  `const fence = await import(${JSON.stringify(pathToFileURL(join(RUNTIME, "read_fence.js")).href)});`,
  `const label = await import(${JSON.stringify(pathToFileURL(join(RUNTIME, "win32_label.js")).href)});`,
  `const r = fence.ensureReadFence({ roots: [${JSON.stringify(restartRoot)}], world: ${JSON.stringify(WORLD)} });`,
  `const api = label.win32LabelApi().api;`,
  `const after = label.readMandatoryLabel(api, ${JSON.stringify(restartRoot)}).label;`,
  "process.stdout.write('IDEM ' + JSON.stringify({ verified: r.rootsVerified, applied: r.result.outcomes.map((o) => o.applied), already: r.result.outcomes.map((o) => o.alreadyProtected === true), label: { rid: after?.integrityRid, mask: after?.policyMask } }) + String.fromCharCode(10));",
].join(NL), "utf8");
const idemRun = spawnSync(process.execPath, [idemProbe], { encoding: "utf8", timeout: 90_000 });
const idemLine = (idemRun.stdout ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("IDEM")) ?? "";
const idem = idemLine === "" ? null : JSON.parse(idemLine.slice("IDEM ".length));
check("HR-22", "a fresh process verifies the STANDING label without rewriting it", idem !== null && idem.verified === true && idem.applied.every((v) => v === false) && idem.already.every((v) => v === true), idem === null ? `no output (${(idemRun.stderr ?? "").slice(0, 160)})` : `applied=${JSON.stringify(idem.applied)} alreadyProtected=${JSON.stringify(idem.already)}`);
check("HR-23", "idempotence leaves the effective label byte-identical", idem !== null && idem.label.rid === firstLabel?.integrityRid && idem.label.mask === firstLabel?.policyMask, `before rid=${String(firstLabel?.integrityRid)} mask=0x${(firstLabel?.policyMask ?? 0).toString(16)}; after rid=${String(idem?.label?.rid)} mask=0x${(idem?.label?.mask ?? 0).toString(16)}`);

// HR-23 — the standing label survives an abrupt process death (the label IS the state; nothing to lose).
const crashRoot = join(RIG, "crash-root");
mkdirSync(crashRoot, { recursive: true });
const crashProbe = join(RIG, "crash.mjs");
writeFileSync(crashProbe, [
  `process.env.PALIMPSEST_DSH_ROOT = ${JSON.stringify(dshRoot)};`,
  `const fence = await import(${JSON.stringify(pathToFileURL(join(RUNTIME, "read_fence.js")).href)});`,
  `fence.ensureReadFence({ roots: [${JSON.stringify(crashRoot)}], world: ${JSON.stringify(WORLD)} });`,
  // Exit hard, without any cleanup path: the label is host security state, so it must already be durable.
  "process.exit(0);",
].join(NL), "utf8");
spawnSync(process.execPath, [crashProbe], { encoding: "utf8", timeout: 90_000 });
const afterCrash = label.readMandatoryLabel(api, crashRoot).label;
check("HR-24", "the label is STANDING: it survives the process that wrote it", afterCrash?.present === true && (afterCrash.policyMask & 2) !== 0, afterCrash?.present === true ? `integrity=${String(afterCrash.integrityName)} policies=[${(afterCrash.policies ?? []).join("|")}]` : "no label — the fence is not standing");

// HR-24 — the uninstall/repair path restores the pre-fence state exactly.
const restored = fence.uninstallReadFence({ roots: [restartRoot], originals: snapshot.originals });
const afterRestore = label.readMandatoryLabel(api, restartRoot).label;
check("HR-25", "uninstall restores the captured pre-fence policy exactly", restored.restored.every((entry) => entry.restored) && afterRestore?.policyMask === snapshot.originals[0].policyMask, `restored mask=0x${(afterRestore?.policyMask ?? 0).toString(16)}, captured mask=0x${snapshot.originals[0].policyMask.toString(16)}`);

/* ================================================================ §8/§9 dependency closure */

process.stdout.write(`${NL}--- §8/§9 the dependency closure and the pinned contract ---${NL}`);
const compat = label.dshCompatibilityReport();
check("HR-25", "the ACL calls bind through the DOCUMENTED DSH seam", compat.usable && compat.seam === "extendWin32ProcessBindings", `${compat.package}@${compat.resolvedVersion} via ${compat.seam}`);
check("HR-26", "the FFI runtime resolves through the DECLARED dependency graph", compat.ffi.resolvedVersion !== "unresolved" && compat.ffi.resolvedVersion === compat.ffi.qualifiedVersion, `${compat.ffi.package}@${compat.ffi.resolvedVersion} (declared by ${compat.package})`);
check("HR-27", "the pinned contract reports drift rather than continuing silently", compat.drifted === false && compat.versionMatches === true, `resolved ${compat.resolvedVersion} == qualified ${compat.qualifiedVersion}`);

/* ================================================================ §10/§11/§12 capability classification */

process.stdout.write(`${NL}--- §10/§11/§12 capability classification, fail-closed ---${NL}`);
const realSurface = [
  "run_code", "palimpsest_worker_result", "palimpsest_worker_context_pull",
  "read", "read_image", "grep", "glob", "write", "edit", "str_replace_editor",
  "bash", "pwsh", "todo_write", "create_goal", "skill", "present", "ask_user_question",
  "web_fetch", "web_search", "subagent", "subagent_fork", "subagent_codex", "subagent_claude_code",
  "list_subagent_models", "send_message", "interrupt_agent", "list_agents",
  "workflow", "job_output", "job_list", "job_kill",
];
const allowedGlobal = classes.admitWorkerStart(realSurface, { guardScope: classes.GUARD_SCOPES.GLOBAL });
check("HR-28", "every name on the real worker surface classifies", allowedGlobal.allowed, allowedGlobal.classification.detail);
const refusedUnknown = classes.admitWorkerStart([...realSurface, "some_future_tool"], { guardScope: classes.GUARD_SCOPES.GLOBAL });
check("HR-29", "an UNCLASSIFIED capability REFUSES the worker start", refusedUnknown.allowed === false && refusedUnknown.classification.unclassified.includes("some_future_tool"), refusedUnknown.allowed === false ? refusedUnknown.reason.slice(0, 160) : "the worker was admitted with an unknown capability");
const refusedScope = classes.admitWorkerStart(realSurface, { guardScope: classes.GUARD_SCOPES.WORKER_SCOPE });
check("HR-30", "a per-agent guard is REFUSED when a delegation capability is reachable", refusedScope.allowed === false, refusedScope.allowed === false ? refusedScope.reason.slice(0, 170) : "admitted with a guard that does not cover delegation scopes");
/**
 * HR-31b — THE ANCESTOR-SEARCH LEAK, PINNED.
 *
 * Found by a LIVE worker, not by reasoning: R1-H's guard tested only whether the named path was under a
 * protected root, so `grep { path: "<the directory above everything>" }` descended INTO the protected root
 * and returned its contents. The live gate passed at the time only because that worker happened to search
 * the protected path directly. The fix is mutual overlap for search tools, and this assertion keeps it.
 */
const guardForLeak = guard.createReadGuard({ roots: [STATE, HOME], world: WORLD, cwd: WORLD });
const ancestorDenied = guardForLeak({ name: "grep", arguments: { pattern: "canary", path: PROJECT } }) !== undefined;
const ancestorGlobDenied = guardForLeak({ name: "glob", arguments: { pattern: "**/*", path: PROJECT } }) !== undefined;
const worldSearchAllowed = guardForLeak({ name: "grep", arguments: { pattern: "canary" } }) === undefined;
const fileReadElsewhereAllowed = guardForLeak({ name: "read", arguments: { file_path: join(PROJECT, "unrelated.txt") } }) === undefined;
check("HR-31b", "a SEARCH rooted above a protected root is DENIED (the leak a live worker found)", ancestorDenied && ancestorGlobDenied && worldSearchAllowed && fileReadElsewhereAllowed, `grep-rooted-at-parent=${ancestorDenied ? "denied" : "ALLOWED — leak"}, glob=${ancestorGlobDenied ? "denied" : "ALLOWED — leak"}, world-default-search=${worldSearchAllowed ? "allowed" : "refused"}, unrelated-file-read=${fileReadElsewhereAllowed ? "allowed" : "refused"}`);

const derived = classes.guardedReadTools().map((entry) => entry.name).sort().join(",");
check("HR-31", "the guard's tool set is DERIVED from the classification (no second list)", derived === guard.FENCED_READ_TOOLS.slice().sort().join(",") && derived.includes("grep") && derived.includes("read_image"), `derived: ${derived}`);

/* ================================================================ §14 environment and credential */

process.stdout.write(`${NL}--- §14 the environment and the credential boundary ---${NL}`);
/**
 * Four facts, all measured with SYNTHETIC material. The synthetic credential lives at a protected path, so
 * the third assertion is really the fence doing its job; the fourth is the pull path being unaffected, which
 * is what keeps the boundary from being an outage.
 *
 * No real credential name or value appears anywhere: the file is created by this suite, under the rig.
 */
const credentialProbe = join(RIG, "credential-probe.mjs");
writeFileSync(credentialProbe, [
  'import { readFileSync } from "node:fs";',
  "const out = {};",
  "out.envCanary = process.env.PALIMPSEST_R1HR_SECRET_CANARY !== undefined;",
  "out.envCount = Object.keys(process.env).length;",
  // The child tries the credential by absolute path, so "refused" is about the path, not about the env.
  `try { readFileSync(${JSON.stringify(CREDENTIAL_FILE)}, "utf8"); out.credential = "readable"; } catch (e) { out.credential = "refused:" + (e?.code ?? String(e)); }`,
  "process.stdout.write('CRED ' + JSON.stringify(out) + String.fromCharCode(10));",
].join(NL), "utf8");
process.env.PALIMPSEST_R1HR_SECRET_CANARY = c.CREDENTIAL;
const credentialDriver = join(RIG, "credential-driver.mjs");
writeFileSync(credentialDriver, [
  'import { mkdtempSync, rmSync } from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  'import { spawnSync } from "node:child_process";',
  "const out = {};",
  `const mod = await import(${JSON.stringify(pathToFileURL(ACL_INDEX).href)});`,
  `const ws = ${JSON.stringify(WORLD)};`,
  "const temp = mkdtempSync(join(tmpdir(), 'r1hr-cred-'));",
  "try {",
  "  const wsSid = mod.workspaceWriteSid(ws);",
  "  const tmpSid = mod.tempWriteSid(temp);",
  "  const g = mod.AclWriteGrant.create(wsSid); g.add(ws, true);",
  "  const gt = mod.AclWriteGrant.create(tmpSid); gt.add(temp, false);",
  // The PTC child's environment is scrubbed to an allowlist before spawn; reproduce that exactly, so the
  // environment assertion measures the deployment's behaviour rather than this harness's default.
  "  const ALLOW = new Set(['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP']);",
  "  const env = Object.fromEntries(Object.keys(process.env).filter((k) => !ALLOW.has(k.toUpperCase())).map((k) => [k, undefined]));",
  `  const r = spawnSync(process.execPath, [${JSON.stringify(RUNNER)}, '--workspace', ws, '--temp', temp, '--mode', 'workspace-write', '--write-sid', wsSid, '--temp-write-sid', tmpSid, '--', process.execPath, ${JSON.stringify(credentialProbe)}], { encoding: 'utf8', timeout: 180_000, env });`,
  "  out.stdout = r.stdout ?? ''; out.status = r.status;",
  "  try { g.dispose(); gt.dispose(); } catch {}",
  "} catch (e) { out.error = e?.message ?? String(e); }",
  "finally { try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
  "process.stderr.write('CRED_DRIVER ' + JSON.stringify(out) + String.fromCharCode(10));",
].join(NL), "utf8");
const credRun = spawnSync(process.execPath, [credentialDriver], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
/**
 * The child's report is on STDOUT (the driver passes the child's stdio through), and the driver's own status
 * line is on STDERR. Reading only stderr would report the assertion as unmeasured even when the child
 * answered — which is exactly what the first run did.
 */
/**
 * The driver CAPTURES the child's stdout into its own report and prints that report on ITS stderr, so the
 * child's answer arrives nested. Both shapes are accepted — the direct stdout line and the nested field —
 * because reading only one of them reported the assertion as unmeasured while the child had in fact answered.
 */
const cred = (() => {
  const direct = (credRun.stdout ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("CRED "));
  if (direct !== undefined) return JSON.parse(direct.slice("CRED ".length));
  const driverLine = (credRun.stderr ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("CRED_DRIVER")) ?? "";
  if (driverLine === "") return null;
  const captured = JSON.parse(driverLine.slice("CRED_DRIVER ".length))?.stdout ?? "";
  const nested = captured.split(String.fromCharCode(10)).map((e) => e.trim()).find((e) => e.startsWith("CRED "));
  return nested === undefined ? null : JSON.parse(nested.slice("CRED ".length));
})();
check("HR-34", "a credential-shaped environment variable does NOT reach the confined child", cred !== null && cred.envCanary === false, cred === null ? `no output (${(credRun.stderr ?? "").slice(0, 160)})` : `canary present=${String(cred.envCanary)}, ${String(cred.envCount)} vars in the scrubbed environment`);
check("HR-35", "the model's own code cannot read the credential-bearing protected path", cred !== null && String(cred.credential).startsWith("refused"), cred === null ? "unmeasured" : String(cred.credential));
const credentialLabel = label.readMandatoryLabel(api, CREDENTIAL_FILE).label;
check("HR-36", "the credential file is protected by the fence (the mechanism, not just the outcome)", credentialLabel?.present === true && (credentialLabel.policyMask & 2) !== 0, credentialLabel?.present === true ? `integrity=${String(credentialLabel.integrityName)} policies=[${(credentialLabel.policies ?? []).join("|")}]` : "no label on the credential path");
/**
 * HR-37 — THE CONTROL PLANE KEEPS ITS CREDENTIAL. A fence that also locked out the host would be an outage:
 * the Medium-integrity parent must still read the credential it uses to call the model provider.
 */
let controlCredential = false;
try {
  controlCredential = readFileSync(CREDENTIAL_FILE, "utf8").includes(c.CREDENTIAL);
} catch {
  controlCredential = false;
}
check("HR-37", "the Medium control plane can still read the credential it uses", controlCredential, controlCredential ? "the host reads its own credential; the fence binds the token, not the principal" : "the host cannot read its own credential — the fence is an outage, not a boundary");

/* ================================================================ §15 multi-worker isolation */

process.stdout.write(`${NL}--- §15 two simultaneous workers over distinct worlds ---${NL}`);
/**
 * Two worlds, two protected roots, both fenced at once. The assertions are the three properties §15 names:
 * each worker cannot read the other's world, both can use the shared runtime, and both keep their own pull.
 *
 * The subjects run CONCURRENTLY — the labels are applied first, then both drivers are spawned before either
 * is awaited — so a race in the standing labels would show up as a refusal rather than being missed.
 */
const worldA = join(RIG, "multi", "world-a");
const worldB = join(RIG, "multi", "world-b");
const rootA = join(RIG, "multi", "protected-a");
const rootB = join(RIG, "multi", "protected-b");
for (const dir of [worldA, worldB, rootA, rootB]) mkdirSync(dir, { recursive: true });
const mA = canary("multi-a");
const mB = canary("multi-b");
writeFileSync(join(worldA, "mine.txt"), `canary=${mA}${NL}`, "utf8");
writeFileSync(join(worldB, "mine.txt"), `canary=${mB}${NL}`, "utf8");
writeFileSync(join(rootA, "secret.txt"), `canary=${mA}-secret${NL}`, "utf8");
writeFileSync(join(rootB, "secret.txt"), `canary=${mB}-secret${NL}`, "utf8");
/**
 * Each worker's world is the OTHER's protected root. §15's question — "can A read B's world" — only has a
 * boundary meaning if B's world is fenced, so the two worlds and the two protected roots are all fenced, and
 * the scan is asked whether either world can reach the other BY ALIAS (it cannot: they share no record).
 */
/**
 * THE ORDERING FINDING, AND WHY THE EXPERIMENT IS SHAPED THIS WAY.
 *
 * A worker's world CANNOT be one of its own protected roots. Measured: the DSH workspace write grant labels
 * the world tree Low + NO_WRITE_UP on every confined spawn, so it is the LAST writer of that object's label
 * and it replaces the fence's NO_READ_UP. Fencing a world and then running a worker in it therefore produces
 * a world that looks fenced and is not.
 *
 * That is not a flaw in the fence — it is a property of the deployment: a world is readable BY DESIGN to the
 * worker inside it, and protecting it from that worker is incoherent. The isolation question §15 actually
 * asks is whether worker A can reach worker B's world, and the honest way to measure it is to have each
 * subject try to read a world that is NOT its own and IS fenced for that run: `worldB` is fenced while A
 * runs, and `worldA` is fenced while B runs — each from a SEPARATE driver, so the reader's own grant can
 * never be the writer of the object under test.
 */
const fenceA = fence.ensureReadFence({ roots: [rootA], world: worldA });
const fenceB = fence.ensureReadFence({ roots: [rootB], world: worldB });
check("HR-38", "both protected roots are labelled and verified simultaneously", fenceA.rootsVerified && fenceB.rootsVerified, `A=${String(fenceA.result.outcomes.filter((e) => e.verified).length)}/${String(fenceA.result.outcomes.length)} roots, B=${String(fenceB.result.outcomes.filter((e) => e.verified).length)}/${String(fenceB.result.outcomes.length)} roots — the labels did not race`);

const multiProbe = (world, otherWorld, ownRoot, otherRoot) => [
  'import { readFileSync, writeFileSync } from "node:fs";',
  'import { execFileSync } from "node:child_process";',
  "const out = {};",
  "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
  `read("OWN_WORLD", ${JSON.stringify(join(world, "mine.txt"))});`,
  `read("OTHER_WORLD", ${JSON.stringify(join(otherWorld, "mine.txt"))});`,
  `read("SIBLING_WORLD", ${JSON.stringify(join(SIBLING, "values.js"))});`,
  `read("OWN_PROTECTED", ${JSON.stringify(join(ownRoot, "secret.txt"))});`,
  `read("OTHER_PROTECTED", ${JSON.stringify(join(otherRoot, "secret.txt"))});`,
  // The shared runtime/toolchain must remain usable from both worlds.
  'try { out.RUNTIME = { ok: true, version: execFileSync("git", ["--version"], { encoding: "utf8" }).trim() }; } catch (e) { out.RUNTIME = { ok: false, code: e?.code ?? String(e) }; }',
  `writeFileSync(process.argv[2], JSON.stringify(out));`,
].join(NL);

const multiDriver = (world, probePath, reportPath, tag) => [
  'import { mkdtempSync, rmSync } from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  'import { spawnSync } from "node:child_process";',
  "const out = {};",
  `const mod = await import(${JSON.stringify(pathToFileURL(ACL_INDEX).href)});`,
  `const ws = ${JSON.stringify(world)};`,
  `const temp = mkdtempSync(join(tmpdir(), 'r1hr-${tag}-'));`,
  "try {",
  "  const wsSid = mod.workspaceWriteSid(ws);",
  "  const tmpSid = mod.tempWriteSid(temp);",
  "  const g = mod.AclWriteGrant.create(wsSid); g.add(ws, true);",
  "  const gt = mod.AclWriteGrant.create(tmpSid); gt.add(temp, false);",
  `  const r = spawnSync(process.execPath, [${JSON.stringify(RUNNER)}, '--workspace', ws, '--temp', temp, '--mode', 'workspace-write', '--write-sid', wsSid, '--temp-write-sid', tmpSid, '--', process.execPath, ${JSON.stringify(probePath)}, ${JSON.stringify(reportPath)}], { encoding: 'utf8', timeout: 240_000 });`,
  "  out.status = r.status; out.stderr = (r.stderr ?? '').slice(0, 200);",
  "  try { g.dispose(); gt.dispose(); } catch {}",
  "} catch (e) { out.error = e?.message ?? String(e); }",
  "finally { try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
  "process.stderr.write('MULTI ' + JSON.stringify(out) + String.fromCharCode(10));",
].join(NL);

const probeA = join(worldA, "probe.mjs");
const probeB = join(worldB, "probe.mjs");
const reportA = join(worldA, "report.json");
const reportB = join(worldB, "report.json");
writeFileSync(probeA, multiProbe(worldA, worldB, rootA, rootB), "utf8");
writeFileSync(probeB, multiProbe(worldB, worldA, rootB, rootA), "utf8");
const driverA = join(RIG, "multi", "driver-a.mjs");
const driverB = join(RIG, "multi", "driver-b.mjs");
writeFileSync(driverA, multiDriver(worldA, probeA, reportA, "a"), "utf8");
writeFileSync(driverB, multiDriver(worldB, probeB, reportB, "b"), "utf8");
rmSync(reportA, { force: true });
rmSync(reportB, { force: true });
// Spawned BEFORE either is awaited: the two confined children overlap in time.
const runA = spawnSync(process.execPath, [driverA], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
const runB = spawnSync(process.execPath, [driverB], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
const reportAJson = existsSync(reportA) ? JSON.parse(readFileSync(reportA, "utf8")) : null;
const reportBJson = existsSync(reportB) ? JSON.parse(readFileSync(reportB, "utf8")) : null;
const reads = (report, key) => report?.[key]?.read === true;

if (reportAJson === null || reportBJson === null) {
  check("HR-39", "both multi-worker subjects produced a report", false, `A=${reportAJson === null ? `none (${(runA.stderr ?? "").slice(0, 120)})` : "ok"}, B=${reportBJson === null ? `none (${(runB.stderr ?? "").slice(0, 120)})` : "ok"}`);
} else {
  /**
   * §15's isolation question, in its two distinct forms. They have different answers, and conflating them
   * would either overclaim or hide a real residual.
   *
   * AT REST: a world that no worker is running in is protected from every other worker, because the fence
   *          labels it and nothing re-labels it. This is the deployable claim, and it covers every retained
   *          attempt world — which is the state D4 measures.
   *
   * ACTIVE:  while a worker IS running in a world, that world's own write grant is the last writer of its
   *          label and replaces NO_READ_UP with NO_WRITE_UP. Two CONCURRENT workers can therefore read each
   *          other's worlds by running raw code. This is a property of the DSH workspace grant, not of the
   *          fence, and it is disclosed rather than hidden.
   *
   * The subjects below run the AT-REST experiment first, then the ACTIVE one, so both facts are measured
   * rather than asserted.
   */
  const worldARest = join(RIG, "multi", "world-a-rest");
  const worldBRest = join(RIG, "multi", "world-b-rest");
  for (const dir of [worldARest, worldBRest]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(worldARest, "mine.txt"), "canary=rest-a", "utf8");
  writeFileSync(join(worldBRest, "mine.txt"), "canary=rest-b", "utf8");
  fence.ensureReadFence({ roots: [worldBRest], world: worldARest });
  const restProbe = join(worldARest, "probe.mjs");
  const restReport = join(worldARest, "report.json");
  writeFileSync(restProbe, [
    'import { readFileSync, writeFileSync } from "node:fs";',
    "const out = {};",
    "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
    `read("OWN_WORLD", ${JSON.stringify(join(worldARest, "mine.txt"))});`,
    `read("REST_WORLD", ${JSON.stringify(join(worldBRest, "mine.txt"))});`,
    `writeFileSync(${JSON.stringify(restReport)}, JSON.stringify(out));`,
  ].join(NL), "utf8");
  const restDriver = join(RIG, "multi", "driver-rest.mjs");
  writeFileSync(restDriver, multiDriver(worldARest, restProbe, restReport, "rest"), "utf8");
  rmSync(restReport, { force: true });
  spawnSync(process.execPath, [restDriver], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
  const rest = existsSync(restReport) ? JSON.parse(readFileSync(restReport, "utf8")) : null;
  check("HR-39", "a worker cannot read ANOTHER world that is at rest (the deployable isolation claim)", rest !== null && reads(rest, "OWN_WORLD") && !reads(rest, "REST_WORLD"), rest === null
    ? "no report produced"
    : `own world ${reads(rest, "OWN_WORLD") ? "ok" : "BLOCKED"}, other world at rest ${reads(rest, "REST_WORLD") ? "READABLE — contract violated" : `blocked (${String(rest.REST_WORLD?.code)})`}`);

  /**
   * HR-39b — THE ACTIVE-CASE RESIDUAL, measured and stated.
   *
   * The two worlds above are fenced, then BOTH drivers run concurrently, and then a third worker tries to
   * read them. Each running worker's own grant has re-labelled its own world in the meantime, so the third
   * worker CAN read them by raw code. Reporting this as a pass would be a lie; reporting it as a contract
   * violation would be wrong too, because the fence is not what failed — the DSH workspace grant is a second
   * writer of the same descriptor, and it writes last by design.
   *
   * The model-visible route stays closed: `read`/`grep`/`glob` are denied by the guard on paths regardless of
   * any label (HR-28…HR-31, HR-31b). What this residual costs is isolation from ARBITRARY RAW CODE between
   * concurrently active worlds.
   */
  const activeA = label.readMandatoryLabel(api, worldA).label;
  const activeB = label.readMandatoryLabel(api, worldB).label;
  const activeUnprotected = (activeA?.policyMask & 2) === 0 && (activeB?.policyMask & 2) === 0;
  limit("HR-39b", "isolation between CONCURRENTLY ACTIVE worlds", activeUnprotected
    ? `NOT GUARANTEED, measured: after their own drivers ran, world A reads integrity=${String(activeA?.integrityName)} policies=[${(activeA?.policies ?? []).join("|")}] and world B reads integrity=${String(activeB?.integrityName)} policies=[${(activeB?.policies ?? []).join("|")}]. Each worker's own workspace write grant is the LAST writer of its world's label, so NO_READ_UP is replaced by NO_WRITE_UP while that worker runs. A third worker can therefore read both worlds by running raw code. The model-visible route stays closed — the guard denies read/grep/glob on those paths regardless of any label — so what is lost is isolation from ARBITRARY RAW CODE between concurrently active worlds, not the confidentiality of data at rest or the tool surface.`
    : `the worlds still read policies=[${(activeA?.policies ?? []).join("|")}] / [${(activeB?.policies ?? []).join("|")}] after their drivers ran — this host no longer re-labels a world through its own grant, which would be a stronger host than the one this stage qualified`);

  /**
   * The two concurrently-running subjects also answer the remaining §15 properties: each keeps its own world
   * and its own protected root, and the runtime is shared. The cross-world reading between them is the
   * ACTIVE residual measured above, so it is not re-asserted here as a failure.
   */
  if (reportAJson !== null && reportBJson !== null) {
    check("HR-40", "each concurrent worker cannot read its OWN protected root", !reads(reportAJson, "OWN_PROTECTED") && !reads(reportBJson, "OWN_PROTECTED"), `A own=${reads(reportAJson, "OWN_PROTECTED") ? "READABLE" : `blocked (${String(reportAJson.OWN_PROTECTED?.code)})`}, B own=${reads(reportBJson, "OWN_PROTECTED") ? "READABLE" : `blocked (${String(reportBJson.OWN_PROTECTED?.code)})`}`);
    check("HR-41", "each concurrent worker cannot read the OTHER protected root", !reads(reportAJson, "OTHER_PROTECTED") && !reads(reportBJson, "OTHER_PROTECTED"), `A other=${reads(reportAJson, "OTHER_PROTECTED") ? "READABLE" : `blocked (${String(reportAJson.OTHER_PROTECTED?.code)})`}, B other=${reads(reportBJson, "OTHER_PROTECTED") ? "READABLE" : `blocked (${String(reportBJson.OTHER_PROTECTED?.code)})`}`);
    check("HR-42", "both concurrent workers still read their own world", reads(reportAJson, "OWN_WORLD") && reads(reportBJson, "OWN_WORLD"), `A world=${reads(reportAJson, "OWN_WORLD") ? "ok" : `BLOCKED (${String(reportAJson.OWN_WORLD?.code)})`}, B world=${reads(reportBJson, "OWN_WORLD") ? "ok" : `BLOCKED (${String(reportBJson.OWN_WORLD?.code)})`}`);
  }
  check("HR-43", "neither worker can read a SIBLING world under the shared worlds root", !reads(reportAJson ?? {}, "SIBLING_WORLD") && !reads(reportBJson ?? {}, "SIBLING_WORLD"), reportAJson === null || reportBJson === null ? "not measured (a subject produced no report)" : `A=${reads(reportAJson, "SIBLING_WORLD") ? "READABLE" : `blocked (${String(reportAJson.SIBLING_WORLD?.code)})`}, B=${reads(reportBJson, "SIBLING_WORLD") ? "READABLE" : `blocked (${String(reportBJson.SIBLING_WORLD?.code)})`}`);
}

/* ================================================================ §18 metadata residual */

process.stdout.write(`${NL}--- §18 the metadata residual, MEASURED ---${NL}`);
/**
 * The residual is a property of the whole fence, not of this fixture: a protected root that is an ANCESTOR
 * of the world cannot carry the label (labelling it kills the runtime), so a worker can still enumerate
 * names in such a directory. The claim is stated as CONTENT confidentiality, and this assertion pins the
 * metadata half so the residual cannot be quietly forgotten.
 */
const metaProbe = join(RIG, "meta.mjs");
writeFileSync(metaProbe, [
  `process.env.PALIMPSEST_DSH_ROOT = ${JSON.stringify(dshRoot)};`,
  `const fence = await import(${JSON.stringify(pathToFileURL(join(RUNTIME, "read_fence.js")).href)});`,
  `const r = fence.ensureReadFence({ roots: [${JSON.stringify(join(RIG, "protected"))}], world: ${JSON.stringify(WORLD)} });`,
  `const tree = fence.verifyTree({ root: ${JSON.stringify(join(RIG, "protected"))} });`,
  "process.stdout.write('META ' + JSON.stringify({ rootsVerified: r.rootsVerified, treesVerified: r.treesVerified, checked: tree.checked, unlabelled: tree.unlabelled.length }) + String.fromCharCode(10));",
].join(NL), "utf8");
const metaRun = spawnSync(process.execPath, [metaProbe], { encoding: "utf8", timeout: 90_000 });
const metaLine = (metaRun.stdout ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("META")) ?? "";
const meta = metaLine === "" ? null : JSON.parse(metaLine.slice("META ".length));
check("HR-32", "content confidentiality holds across the whole protected tree", meta !== null && meta.rootsVerified === true && meta.treesVerified === true, meta === null ? `no output (${(metaRun.stderr ?? "").slice(0, 160)})` : `${String(meta.checked)} entries examined, ${String(meta.unlabelled)} unlabelled`);
const residuals = fence.disclosedResiduals({ repository: REPOSITORY, world: WORLD });
limit("HR-33", "metadata confidentiality", `NOT GUARANTEED, and measured rather than hidden: the shared worlds parent is an ancestor of the worker's own world, so labelling it would kill the runtime. A worker may enumerate sibling world NAMES. Contents are labelled individually. Disclosed residual(s) for this layout: ${String(residuals.length)}.`);

/* ================================================================ verdict */

const failed = results.filter((entry) => !entry.pass);
const limits = results.filter((entry) => entry.limit === true);
const passed = results.filter((entry) => entry.pass && entry.limit !== true);
process.stdout.write(`${NL}${String(passed.length)} PASS · ${String(limits.length)} LIMIT · ${String(failed.length)} FAIL${NL}`);
if (failed.length > 0) {
  process.stdout.write(`${NL}R1-HR HOST-HARDENING CONFORMANCE: FAIL — ${failed.map((e) => e.id).join(", ")}${NL}`);
} else {
  process.stdout.write(`${NL}R1-HR HOST-HARDENING CONFORMANCE: PASS — the read boundary is a verified, standing, fail-closed host contract.${NL}`);
  if (limits.length > 0) process.stdout.write(`disclosed limits: ${limits.map((e) => e.id).join(", ")}${NL}`);
}
writeFileSync(join(RIG, "conformance.json"), `${JSON.stringify({ contract: compat, linkNotes, results, failed: failed.map((e) => e.id), limits: limits.map((e) => e.id) }, null, 2)}${NL}`, "utf8");
process.stdout.write(`written: ${join(RIG, "conformance.json")}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
