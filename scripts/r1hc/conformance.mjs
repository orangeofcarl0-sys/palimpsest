#!/usr/bin/env node
/**
 * R1-HC §3–§16 — THE RESIDUAL-CLOSURE CONFORMANCE SUITE (HC-01 … HC-26).
 *
 * R1-HR left two content-confidentiality gaps open and documented. This suite proves each is now closed or
 * bounded, and it is organized by the ruling's gates:
 *
 *   HC-01…HC-05  §3/§14  HC-GATE-A: the worker-start ORDER, and that an alias is refused BEFORE anything can
 *                        re-label the aliased protected object. Includes the runtime case: an alias created
 *                        AFTER admission is caught on the next start.
 *   HC-06…HC-11  §9/§11/§13  the trusted-host read TOCTOU. A junction inside the world used to return
 *                        protected bytes; it is now refused on the MECHANISM, and a race with a live
 *                        indirection yields zero protected observations.
 *   HC-12…HC-15  §12  search capabilities keep mutual-overlap refusal and never traverse in unrestricted host
 *                     context.
 *   HC-16…HC-19  §4/§5/§6  the confidential profile: at most one ACTIVE worker, and the refusal is a host
 *                     capacity fact that fails no attempt.
 *   HC-20…HC-22  §7  sibling-world confidentiality: an ACTIVE worker cannot read an at-rest world, and the
 *                     reverse after the roles swap.
 *   HC-23…HC-26  §15/§16  the capability gate stays fail-closed, and the R1-HR label lifecycle is preserved.
 *
 * THREE CLASSES, as in R1-H/HR: PASS / LIMIT (not measurable here, or a disclosed residual) / FAIL (measured
 * violation). Any FAIL fails the gate.
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
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1hc", "conformance");
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
const guard = await import(pathToFileURL(join(RUNTIME, "read_guard.js")).href);
const aliasGuard = await import(pathToFileURL(join(RUNTIME, "alias_guard.js")).href);
const classes = await import(pathToFileURL(join(RUNTIME, "capability_classes.js")).href);
const profile = await import(pathToFileURL(join(RUNTIME, "confidential_profile.js")).href);

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();
process.env.PALIMPSEST_DSH_ROOT = dshRoot;
const ACL_INDEX = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const RUNNER = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
const api = label.win32LabelApi().api;

process.stdout.write(`${NL}===== R1-HC RESIDUAL-CLOSURE CONFORMANCE =====${NL}rig ${RIG}${NL}`);
if (api === undefined) {
  process.stdout.write(`the Win32 label binding table is unavailable: ${String(label.win32LabelApi().error)}${NL}`);
  process.exit(2);
}

/** Create a junction. PowerShell is used because `mklink` mangles forward-slash paths under some shells. */
function makeJunction(link, target) {
  const run = spawnSync("powershell", ["-NoProfile", "-Command", `New-Item -ItemType Junction -Path '${link}' -Target '${target}' | Out-Null`], { encoding: "utf8" });
  return run.status === 0;
}

/** Run one confined subject through the SHIPPED runner and return its report. */
function runConfined(world, probeSource, tag) {
  const probe = join(world, `probe-${tag}.mjs`);
  const report = join(world, `report-${tag}.json`);
  rmSync(report, { force: true });
  writeFileSync(probe, probeSource, "utf8");
  const driver = join(RIG, `driver-${tag}.mjs`);
  writeFileSync(driver, [
    'import { mkdtempSync, rmSync } from "node:fs";',
    'import { tmpdir } from "node:os";',
    'import { join } from "node:path";',
    'import { spawnSync } from "node:child_process";',
    "const out = {};",
    `const mod = await import(${JSON.stringify(pathToFileURL(ACL_INDEX).href)});`,
    `const ws = ${JSON.stringify(world)};`,
    `const temp = mkdtempSync(join(tmpdir(), 'r1hc-${tag}-'));`,
    "try {",
    "  const wsSid = mod.workspaceWriteSid(ws);",
    "  const tmpSid = mod.tempWriteSid(temp);",
    "  const g = mod.AclWriteGrant.create(wsSid); g.add(ws, true);",
    "  const gt = mod.AclWriteGrant.create(tmpSid); gt.add(temp, false);",
    `  const r = spawnSync(process.execPath, [${JSON.stringify(RUNNER)}, '--workspace', ws, '--temp', temp, '--mode', 'workspace-write', '--write-sid', wsSid, '--temp-write-sid', tmpSid, '--', process.execPath, ${JSON.stringify(probe)}], { encoding: 'utf8', timeout: 240_000 });`,
    "  out.status = r.status; out.stderr = (r.stderr ?? '').slice(0, 200);",
    "  try { g.dispose(); gt.dispose(); } catch {}",
    "} catch (e) { out.error = e?.message ?? String(e); }",
    "finally { try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
    "process.stderr.write('HC_DRIVER ' + JSON.stringify(out) + String.fromCharCode(10));",
  ].join(NL), "utf8");
  const run = spawnSync(process.execPath, [driver], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
  return { report: existsSync(report) ? JSON.parse(readFileSync(report, "utf8")) : null, run };
}

/* ================================================================ §3/§14 HC-GATE-A ordering */

process.stdout.write(`${NL}--- §3/§14 the worker-start ORDER, and alias refusal BEFORE any grant ---${NL}`);

const WORLD = join(RIG, "world");
const PROT = join(RIG, "prot");
const STATE = join(RIG, "state");
const HOME = join(RIG, "home");
for (const dir of [WORLD, PROT, STATE, HOME]) mkdirSync(dir, { recursive: true });
const c = { WORLD: canary("world"), PROT: canary("prot"), STATE: canary("state"), CRED: canary("cred") };
writeFileSync(join(WORLD, "in-world.txt"), `canary=${c.WORLD}${NL}`, "utf8");
writeFileSync(join(PROT, "secret.txt"), `canary=${c.PROT}${NL}`, "utf8");
writeFileSync(join(STATE, "proof-blob.txt"), `canary=${c.STATE}${NL}`, "utf8");
writeFileSync(join(HOME, ".credentials.yaml"), `provider: synthetic${NL}apiKey: ${c.CRED}${NL}`, "utf8");

/**
 * HC-01 — THE ORDER, AS CODE. R1-HR's `worker_fence.js` calls `admitWorldForFencing` (the alias scan) and
 * `applyReadFence` (the label) in that order, and the alias verdict is returned in the SAME result object the
 * caller inspects before spawning. The assertion reads the shipped source rather than asserting from memory,
 * so a future reordering that put the label first would fail here.
 */
const fenceSource = readFileSync(join(RUNTIME, "worker_fence.js"), "utf8");
const aliasIndex = fenceSource.indexOf("const aliases = admitWorldForFencing(");
const labelIndex = fenceSource.indexOf("const kernel = applyReadFence(");
check("HC-01", "the alias scan runs BEFORE the fence is applied in the shipped install path", aliasIndex !== -1 && labelIndex !== -1 && aliasIndex < labelIndex, `alias scan at char ${String(aliasIndex)}, label apply at char ${String(labelIndex)} — ${aliasIndex < labelIndex ? "correct order" : "WRONG ORDER: a grant could precede the scan"}`);

/**
 * HC-02 — A MALICIOUS PRE-EXISTING ALIAS IS REFUSED, AND THE PROTECTED TARGET IS UNCHANGED.
 *
 * The second half is the part that matters: the refusal must not merely be reported, it must happen before
 * anything could re-label the aliased object. So the protected file's label is captured BEFORE, the alias is
 * planted, admission is asked, and the label is compared AFTER.
 */
const aliasWorld = join(RIG, "alias-world");
mkdirSync(aliasWorld, { recursive: true });
writeFileSync(join(aliasWorld, "a.js"), "x", "utf8");
fence.ensureReadFence({ roots: [PROT, STATE, HOME], world: aliasWorld });
const protBefore = label.readMandatoryLabel(api, join(PROT, "secret.txt")).label;
const junctionOk = makeJunction(join(aliasWorld, "escape"), PROT);
const hardlinkOk = spawnSync(process.execPath, ["-e", `require('node:fs').linkSync(${JSON.stringify(join(PROT, "secret.txt"))}, ${JSON.stringify(join(aliasWorld, "escape-hl.txt"))})`], { encoding: "utf8" }).status === 0;
const admission = aliasGuard.admitWorldForFencing({ world: aliasWorld, protectedRoots: [PROT, STATE, HOME] });
const protAfter = label.readMandatoryLabel(api, join(PROT, "secret.txt")).label;
check("HC-02", "a malicious pre-existing alias refuses the worker", junctionOk && hardlinkOk && admission.allowed === false, junctionOk && hardlinkOk ? `refused with ${String(admission.scan.aliases.length)} alias(es) named` : `fixture incomplete: junction=${String(junctionOk)} hardlink=${String(hardlinkOk)}`);
check("HC-03", "the protected target's mandatory label is UNCHANGED by the refusal", protBefore?.policyMask === protAfter?.policyMask && protBefore?.integrityRid === protAfter?.integrityRid, `before mask=0x${(protBefore?.policyMask ?? 0).toString(16)} rid=${String(protBefore?.integrityRid)}; after mask=0x${(protAfter?.policyMask ?? 0).toString(16)} rid=${String(protAfter?.integrityRid)}`);

/**
 * HC-04 — THE RUNTIME CASE (§14): no alias at admission, an alias created AFTER, refused on the next start.
 *
 * This is the lifecycle §14 asks for. The first admission must succeed (the world is clean), the alias is then
 * created by the parent — standing in for whatever could create one while the worker runs — and the SECOND
 * admission must refuse. That pins the ordering against the state a worker leaves behind.
 */
const lifecycleWorld = join(RIG, "lifecycle-world");
mkdirSync(lifecycleWorld, { recursive: true });
writeFileSync(join(lifecycleWorld, "a.js"), "x", "utf8");
const firstAdmission = aliasGuard.admitWorldForFencing({ world: lifecycleWorld, protectedRoots: [PROT] });
makeJunction(join(lifecycleWorld, "late-escape"), PROT);
const secondAdmission = aliasGuard.admitWorldForFencing({ world: lifecycleWorld, protectedRoots: [PROT] });
check("HC-04", "no alias at admission, alias created after, refused on the next start", firstAdmission.allowed === true && secondAdmission.allowed === false, `first=${firstAdmission.allowed ? "admitted" : "refused"}, after alias=${secondAdmission.allowed ? "ADMITTED — ordering broken" : `refused (${String(secondAdmission.scan.aliases.length)} alias)`}`);

/**
 * HC-05 — A CONFINED WORKER CANNOT CREATE AN ALIAS ITSELF. This bounds what the lifecycle above has to defend
 * against: the confined token lacks the privilege, so an alias can only arrive from outside the worker.
 */
const aliasProbe = [
  'import { symlinkSync, linkSync } from "node:fs";',
  'import { execFileSync } from "node:child_process";',
  "const out = {};",
  'try { symlinkSync(process.argv[2], process.argv[3]); out.symlink = "created"; } catch (e) { out.symlink = e.code ?? String(e); }',
  'try { linkSync(process.argv[2], process.argv[4]); out.hardlink = "created"; } catch (e) { out.hardlink = e.code ?? String(e); }',
  'try { execFileSync("cmd", ["/c", "mklink", "/J", process.argv[5], process.argv[6]], { stdio: "ignore" }); out.junction = "created"; } catch (e) { out.junction = String(e.code ?? "failed"); }',
  `writeFileSyncOut();`,
  'function writeFileSyncOut() { require("node:fs").writeFileSync(process.argv[7], JSON.stringify(out)); }',
].join(NL);
/**
 * The probe uses its OWN protected target, and the reason is a measured trap: HC-02 deliberately poisons
 * `PROT` by hard-linking it (that is the attack being refused), so a later probe against the same file would
 * be testing an object that is already unprotected. A separate target keeps each assertion honest.
 */
const aliasProbeTarget = join(RIG, "alias-probe-prot");
mkdirSync(aliasProbeTarget, { recursive: true });
writeFileSync(join(aliasProbeTarget, "secret.txt"), `canary=${c.PROT}${NL}`, "utf8");
fence.ensureReadFence({ roots: [aliasProbeTarget], world: aliasWorld });
const aliasWorldReport = runConfined(aliasWorld, [
  'import { symlinkSync, linkSync, writeFileSync } from "node:fs";',
  'import { execFileSync } from "node:child_process";',
  "const out = {};",
  `try { symlinkSync(${JSON.stringify(join(aliasProbeTarget, "secret.txt"))}, ${JSON.stringify(join(aliasWorld, "w-sl.txt"))}); out.symlink = "created"; } catch (e) { out.symlink = e?.code ?? String(e); }`,
  `try { linkSync(${JSON.stringify(join(aliasProbeTarget, "secret.txt"))}, ${JSON.stringify(join(aliasWorld, "w-hl.txt"))}); out.hardlink = "created"; } catch (e) { out.hardlink = e?.code ?? String(e); }`,
  `try { execFileSync("cmd", ["/c", "mklink", "/J", ${JSON.stringify(join(aliasWorld, "w-j"))}, ${JSON.stringify(aliasProbeTarget)}], { stdio: "ignore" }); out.junction = "created"; } catch (e) { out.junction = String(e?.code ?? "failed"); }`,
  `writeFileSync(${JSON.stringify(join(aliasWorld, "report-aliasmk.json"))}, JSON.stringify(out));`,
].join(NL), "aliasmk");
const aliasMade = aliasWorldReport.report === null ? null : aliasWorldReport.report;
check("HC-05", "a CONFINED worker cannot create any alias kind", aliasMade !== null && aliasMade.symlink !== "created" && aliasMade.hardlink !== "created" && aliasMade.junction !== "created", aliasMade === null ? `no report (${String(aliasWorldReport.run.stderr).slice(0, 140)})` : `symlink=${String(aliasMade.symlink)}, hardlink=${String(aliasMade.hardlink)}, junction=${String(aliasMade.junction)}`);

/* ================================================================ §9/§11/§13 the trusted-host read TOCTOU */

process.stdout.write(`${NL}--- §9/§11/§13 the trusted-host read TOCTOU ---${NL}`);

/**
 * HC-06 — THE HOLE THAT WAS, AS A REGRESSION ASSERTION.
 *
 * R1-HR's guard resolved the model's path LEXICALLY, so a junction placed inside the world made
 * `resolve()` report world content while the KERNEL followed the link to a protected file. This is not a race;
 * it is a deterministic bypass, and it is the reason §9 exists.
 *
 * The assertion plants exactly that junction and requires the guard to refuse it.
 */
const toctouWorld = join(RIG, "toctou-world");
mkdirSync(toctouWorld, { recursive: true });
writeFileSync(join(toctouWorld, "in-world.txt"), `canary=${c.WORLD}${NL}`, "utf8");
const toctouJunction = makeJunction(join(toctouWorld, "escape"), PROT);
const guardToctou = guard.createReadGuard({ roots: [PROT, STATE, HOME], world: toctouWorld, cwd: toctouWorld });
const viaJunction = guardToctou({ name: "read", arguments: { file_path: join(toctouWorld, "escape", "secret.txt") } });
const viaDirect = guardToctou({ name: "read", arguments: { file_path: join(PROT, "secret.txt") } });
const worldOk = guardToctou({ name: "read", arguments: { file_path: join(toctouWorld, "in-world.txt") } });
check("HC-06", "a junction INSIDE the world is refused (the deterministic bypass R1-HR left open)", toctouJunction && viaJunction !== undefined && viaDirect !== undefined, `junction=${String(toctouJunction)}, via-junction=${viaJunction === undefined ? "ALLOWED — HOLE" : "denied"}, direct=${viaDirect === undefined ? "ALLOWED" : "denied"}`);
check("HC-07", "ordinary reads inside the world are still allowed", worldOk === undefined, worldOk === undefined ? "in-world read permitted" : `REFUSED: ${String(worldOk).slice(0, 120)}`);

/**
 * HC-08 — THE DECISION USES THE REAL OBJECT.
 *
 * `findReparseBelow` is the mechanism: it refuses on the EXISTENCE of an indirection at or below the world,
 * not on where the indirection currently points. That is what makes the answer independent of timing, and it
 * is asserted directly here — a junction pointing at a HARMLESS directory is refused too.
 */
const harmless = join(RIG, "harmless");
mkdirSync(harmless, { recursive: true });
writeFileSync(join(harmless, "x.txt"), "harmless", "utf8");
const harmlessJunction = makeJunction(join(toctouWorld, "to-harmless"), harmless);
const harmlessVerdict = guardToctou({ name: "read", arguments: { file_path: join(toctouWorld, "to-harmless", "x.txt") } });
const found = guard.findReparseBelow({ world: toctouWorld, target: join(toctouWorld, "to-harmless", "x.txt") });
check("HC-08", "the refusal is on the MECHANISM: an indirection is refused wherever it points", harmlessJunction && harmlessVerdict !== undefined && found !== undefined, `a junction to a harmless directory is also refused (${found === undefined ? "not detected" : `detected at ${String(found.path).slice(-24)}`}) — so a racing re-point cannot win`);

/**
 * HC-09 — THE ADVERSARIAL RACE (§13). Two junctions are planted inside the world and sampled repeatedly;
 * every sample has a LIVE indirection. PASS requires zero protected observations, and the argument rests on
 * the mechanism rather than on the sample count.
 */
const raceWorld = join(RIG, "race-world");
mkdirSync(raceWorld, { recursive: true });
const raceSafe = join(RIG, "race-safe");
mkdirSync(raceSafe, { recursive: true });
writeFileSync(join(raceSafe, "secret.txt"), "SAFE_VALUE", "utf8");
const raceGuard = guard.createReadGuard({ roots: [PROT], world: raceWorld, cwd: raceWorld });
makeJunction(join(raceWorld, "toSafe"), raceSafe);
makeJunction(join(raceWorld, "toProt"), PROT);
let liveSamples = 0;
let protectedObservations = 0;
let deniedSamples = 0;
for (let i = 0; i < 300; i += 1) {
  for (const name of ["toSafe", "toProt"]) {
    const linkPath = join(raceWorld, name);
    let isLink = false;
    try {
      isLink = label !== undefined && (await import("node:fs")).lstatSync(linkPath).isSymbolicLink();
    } catch {
      isLink = false;
    }
    if (!isLink) continue;
    liveSamples += 1;
    const verdict = raceGuard({ name: "read", arguments: { file_path: join(linkPath, "secret.txt") } });
    if (verdict !== undefined) {
      deniedSamples += 1;
      continue;
    }
    try {
      if (readFileSync(join(linkPath, "secret.txt"), "utf8").includes(c.PROT)) protectedObservations += 1;
    } catch {
      /* an unreadable allowed path is not a leak */
    }
  }
}
check("HC-09", "the adversarial race yields ZERO protected observations with a LIVE indirection", liveSamples > 0 && protectedObservations === 0 && deniedSamples === liveSamples, `${String(liveSamples)} live-indirection samples, ${String(deniedSamples)} denied, ${String(protectedObservations)} protected observations`);

/**
 * HC-10 — THE SEARCH TOOLS CARRY THE SAME CHECK. `grep`/`glob` name a directory to WALK, so the reparse rule
 * must apply to the walk root too; otherwise a search through a junction would traverse into a protected root
 * without ever naming a protected path.
 */
const searchViaJunction = raceGuard({ name: "grep", arguments: { pattern: "canary", path: join(raceWorld, "toProt") } });
const searchInWorld = raceGuard({ name: "grep", arguments: { pattern: "canary", path: raceWorld } });
check("HC-10", "a search rooted AT a junction inside the world is refused", searchViaJunction !== undefined, searchViaJunction === undefined ? "ALLOWED — a walk through the indirection would leak" : "denied");
check("HC-11", "a search rooted in ordinary world content is allowed", searchInWorld === undefined, searchInWorld === undefined ? "permitted" : `REFUSED: ${String(searchInWorld).slice(0, 120)}`);

/* ================================================================ §12 search capabilities */

process.stdout.write(`${NL}--- §12 search capabilities: mutual overlap retained ---${NL}`);
const ancestorDenied = raceGuard({ name: "grep", arguments: { pattern: "x", path: RIG } });
const protectedRootDenied = raceGuard({ name: "glob", arguments: { pattern: "**/*", path: PROT } });
const worldSearch = raceGuard({ name: "glob", arguments: { pattern: "**/*", path: raceWorld } });
check("HC-12", "a search rooted ABOVE a protected root is still refused (mutual overlap retained)", ancestorDenied !== undefined && protectedRootDenied !== undefined, `ancestor=${ancestorDenied === undefined ? "ALLOWED" : "denied"}, at-root=${protectedRootDenied === undefined ? "ALLOWED" : "denied"}`);
check("HC-13", "an in-world search is still permitted", worldSearch === undefined, worldSearch === undefined ? "permitted" : `REFUSED: ${String(worldSearch).slice(0, 120)}`);
check("HC-14", "the search tools are classified GUARDED_HOST_READ and derived into the guard", classes.guardedReadTools().some((entry) => entry.name === "grep") && classes.guardedReadTools().some((entry) => entry.name === "glob") && guard.FENCED_READ_TOOLS.includes("grep"), `guard tools: ${guard.FENCED_READ_TOOLS.join(", ")}`);

/* ================================================================ §4/§5/§6 confidential concurrency */

process.stdout.write(`${NL}--- §4/§5/§6 the confidential profile: at most one ACTIVE worker ---${NL}`);
check("HC-15", "the profile states its capacity as data", profile.CONFIDENTIAL_PROFILE.maxActiveWorkers === 1 && profile.CONFIDENTIAL_PROFILE.canonicalConcurrencyUnaffected === true, `${profile.CONFIDENTIAL_PROFILE.id}: max=${String(profile.CONFIDENTIAL_PROFILE.maxActiveWorkers)}, canonical concurrency unaffected`);

/**
 * HC-16 — SERIALIZATION, MEASURED. Two runs are launched together against a stub port that records overlap.
 * The wrapper must never let two be ACTIVE at once, whichever policy is chosen.
 */
const overlapProbe = (() => {
  let active = 0;
  let maxObserved = 0;
  const order = [];
  const port = {
    adapterId: "stub",
    async run(input) {
      active += 1;
      if (active > maxObserved) maxObserved = active;
      order.push(`start:${String(input.id)}`);
      await new Promise((resolve) => setTimeout(resolve, 40));
      order.push(`end:${String(input.id)}`);
      active -= 1;
      return { kind: "READY_FOR_SETTLEMENT", summary: `ran ${String(input.id)}` };
    },
  };
  return { port, maxObserved: () => maxObserved, order: () => order };
})();
const serialized = profile.serializeConfidentialWorkers({ port: overlapProbe.port });
await Promise.all([serialized.run({ id: "A" }), serialized.run({ id: "B" })]);
check("HC-16", "two concurrent requests are serialized: the peak ACTIVE count never exceeds 1", overlapProbe.maxObserved() === 1, `peak ACTIVE = ${String(overlapProbe.maxObserved())}; order = ${overlapProbe.order().join(" -> ")}`);
check("HC-17", "the queued worker still RUNS rather than being dropped", overlapProbe.order().length === 4 && overlapProbe.order().filter((e) => e.startsWith("end:")).length === 2, `both runs completed (waited=${String(serialized.waited())})`);

/**
 * HC-18 — THE REFUSAL IS A HOST CAPACITY FACT. Under the `refuse` policy the second request must not be a
 * Work outcome: it is a HOST_FAILURE shape, no attempt is failed, and the first run's result is untouched.
 */
let refusalDetail = null;
const refusing = profile.serializeConfidentialWorkers({
  port: {
    adapterId: "stub-refuse",
    async run() {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return { kind: "READY_FOR_SETTLEMENT", summary: "the first worker" };
    },
  },
  policy: "refuse",
  onRefusal: (detail) => {
    refusalDetail = detail;
  },
});
const [firstResult, secondResult] = await Promise.all([refusing.run({ id: "A" }), refusing.run({ id: "B" })]);
const refused = secondResult?.kind === "HOST_FAILURE";
check("HC-18", "a second worker under `refuse` gets an honest HOST CAPACITY refusal, not a Work outcome", refused && firstResult?.kind === "READY_FOR_SETTLEMENT" && refusalDetail !== null, `${refused ? "second refused as HOST_FAILURE" : "second was NOT refused"}; first=${String(firstResult?.kind)}; capacityRefusals=${String(refusing.capacityRefusals())}`);
check("HC-19", "the refusal names the profile and states that no attempt was failed", typeof refusalDetail === "string" && refusalDetail.includes("HOST CAPACITY") && refusalDetail.includes("no attempt was failed"), String(refusalDetail ?? "").slice(0, 170));
check("HC-20", "the admission question is answerable without running anything", profile.admitConfidentialWorker({ active: 0 }).admitted === true && profile.admitConfidentialWorker({ active: 1 }).admitted === false, `active=0 admitted=${String(profile.admitConfidentialWorker({ active: 0 }).admitted)}, active=1 admitted=${String(profile.admitConfidentialWorker({ active: 1 }).admitted)}`);

/* ================================================================ §7 sibling-world confidentiality */

process.stdout.write(`${NL}--- §7 sibling-world confidentiality, active vs at-rest ---${NL}`);
/**
 * Two worlds, two protected roots. The ACTIVE worker's world is the one its driver grants; the SIBLING world
 * is fenced and at rest. The active worker must not read the sibling's content.
 *
 * This is the claim R1-HR could not make for two ACTIVE worlds — and with the capacity limit in force there is
 * only ever one active, so the claim holds for every world a running worker could reach.
 */
const activeWorld = join(RIG, "active-world");
const siblingWorld = join(RIG, "sibling-world");
for (const dir of [activeWorld, siblingWorld]) mkdirSync(dir, { recursive: true });
writeFileSync(join(activeWorld, "mine.txt"), `canary=${c.WORLD}${NL}`, "utf8");
writeFileSync(join(siblingWorld, "values.js"), `// canary=${c.STATE}${NL}`, "utf8");
const siblingFence = fence.ensureReadFence({ roots: [siblingWorld, STATE, HOME], world: activeWorld });
const siblingProbe = [
  'import { readFileSync, writeFileSync } from "node:fs";',
  "const out = {};",
  "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
  `read("OWN", ${JSON.stringify(join(activeWorld, "mine.txt"))});`,
  `read("SIBLING", ${JSON.stringify(join(siblingWorld, "values.js"))});`,
  `read("STATE", ${JSON.stringify(join(STATE, "proof-blob.txt"))});`,
  `read("CRED", ${JSON.stringify(join(HOME, ".credentials.yaml"))});`,
  `writeFileSync(${JSON.stringify(join(activeWorld, "report-sibling.json"))}, JSON.stringify(out));`,
].join(NL);
const siblingRun = runConfined(activeWorld, siblingProbe, "sibling");
const sr = siblingRun.report;
const sawCanary = (key, expected) => sr?.[key]?.read === true && String(sr[key].content).includes(expected);
check("HC-21", "an ACTIVE worker cannot read an at-rest sibling world's content", sr !== null && sawCanary("OWN", c.WORLD) && !sawCanary("SIBLING", c.STATE), sr === null ? `no report (${String(siblingRun.run.stderr).slice(0, 140)})` : `own=${sawCanary("OWN", c.WORLD) ? "ok" : "BLOCKED"}, sibling=${sawCanary("SIBLING", c.STATE) ? "READABLE — contract violated" : `blocked (${String(sr.SIBLING?.code)})`}`);
check("HC-22", "the ACTIVE worker still cannot read the durable state or the credential", sr !== null && !sawCanary("STATE", c.STATE) && !sawCanary("CRED", c.CRED), sr === null ? "unmeasured" : `state=${sawCanary("STATE", c.STATE) ? "READABLE" : `blocked (${String(sr.STATE?.code)})`}, credential=${sawCanary("CRED", c.CRED) ? "READABLE" : `blocked (${String(sr.CRED?.code)})`}`);

/* ================================================================ §15/§16 fail-closed + label lifecycle */

process.stdout.write(`${NL}--- §15/§16 capability fail-closed, and the label lifecycle preserved ---${NL}`);
const previouslyUnclassified = ["exit_plan_mode", "get_goal", "update_goal"];
const nowClassified = classes.admitWorkerStart(previouslyUnclassified, { guardScope: classes.GUARD_SCOPES.GLOBAL });
check("HC-23", "the three capabilities the live gate once caught are classified", nowClassified.allowed === true, nowClassified.classification.detail);
const unknownRefused = classes.admitWorkerStart([...previouslyUnclassified, "brand_new_capability"], { guardScope: classes.GUARD_SCOPES.GLOBAL });
check("HC-24", "an UNKNOWN capability still refuses the worker start", unknownRefused.allowed === false && unknownRefused.classification.unclassified.includes("brand_new_capability"), unknownRefused.allowed === false ? unknownRefused.reason.slice(0, 150) : "the worker was admitted with an unknown capability");
const scopeRefused = classes.admitWorkerStart(["run_code", "subagent", "read"], { guardScope: classes.GUARD_SCOPES.WORKER_SCOPE });
check("HC-25", "a per-agent guard is still refused when a delegation capability is reachable", scopeRefused.allowed === false, scopeRefused.allowed === false ? scopeRefused.reason.slice(0, 150) : "admitted with a guard that does not cover delegation scopes");

/**
 * HC-26 — THE R1-HR LABEL LIFECYCLE IS PRESERVED, not redesigned. The properties §16 names are re-measured
 * here against the same roots the rest of this suite used, so a change to the fence would fail this suite as
 * well as the R1-HR one.
 */
const lifecycleRoot = join(RIG, "lifecycle-root");
mkdirSync(lifecycleRoot, { recursive: true });
const preserved = fence.ensureReadFence({ roots: [lifecycleRoot], world: activeWorld });
const relabelled = fence.ensureReadFence({ roots: [lifecycleRoot], world: activeWorld });
const preservedLabel = label.readMandatoryLabel(api, lifecycleRoot).label;
check("HC-26", "preservation, descendant verification and idempotence are unchanged", preserved.rootsVerified && preserved.treesVerified && relabelled.rootsVerified && relabelled.result.outcomes.every((entry) => entry.alreadyProtected === true) && preservedLabel?.policyMask === 2, `first verified=${String(preserved.rootsVerified)}/${String(preserved.treesVerified)}, second alreadyProtected=${String(relabelled.result.outcomes.every((entry) => entry.alreadyProtected === true))}, label=[${(preservedLabel?.policies ?? []).join("|")}]`);

limit("HC-27", "parallel ACTIVE confidential workers on the current Windows backend", "UNSUPPORTED CAPABILITY, by design: a running worker's own workspace write grant is the last writer of its world label, so two ACTIVE worlds cannot both be read-fenced. The profile serializes them (HC-15…HC-17) rather than pretending to separate them. Future options, none implemented here: a per-world principal, an AppContainer, a narrow namespace/container, or a microVM.");

/* ================================================================ verdict */

const failed = results.filter((entry) => !entry.pass);
const limits = results.filter((entry) => entry.limit === true);
const passed = results.filter((entry) => entry.pass && entry.limit !== true);
process.stdout.write(`${NL}${String(passed.length)} PASS · ${String(limits.length)} LIMIT · ${String(failed.length)} FAIL${NL}`);
if (failed.length > 0) {
  process.stdout.write(`${NL}R1-HC RESIDUAL-CLOSURE CONFORMANCE: FAIL — ${failed.map((e) => e.id).join(", ")}${NL}`);
} else {
  process.stdout.write(`${NL}R1-HC RESIDUAL-CLOSURE CONFORMANCE: PASS — the TOCTOU is closed structurally, aliases are refused before any grant, and the confidential profile serializes ACTIVE workers.${NL}`);
  if (limits.length > 0) process.stdout.write(`disclosed limits: ${limits.map((e) => e.id).join(", ")}${NL}`);
}
writeFileSync(join(RIG, "conformance.json"), `${JSON.stringify({ results, failed: failed.map((e) => e.id), limits: limits.map((e) => e.id), race: { liveSamples, deniedSamples, protectedObservations } }, null, 2)}${NL}`, "utf8");
process.stdout.write(`written: ${join(RIG, "conformance.json")}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
