#!/usr/bin/env node
/**
 * R1-H §19/§12 — THE DETERMINISTIC CONFINEMENT CONFORMANCE SUITE (H-N01 … H-N16).
 *
 * `scripts/r1s/conformance.mjs` is the same contract measured against the UNFIXED host, where it exits 1
 * (11/14 assertions unmet). It is preserved unchanged as the negative baseline (§20: do NOT redefine its old
 * FAIL into PASS). This suite measures the SAME contract against the R1-H backend, and it must exit 0.
 *
 * IT IS NOT A COPY, AND THE DIFFERENCE IS THE POINT. The R1-S suite could only drive `AclSandbox` — the
 * class — because no shipped path applied a read boundary at all. This suite drives the SHIPPED host code:
 * `host/deployment/runtime/read_fence.js` applies the kernel label and `read_guard.js` decides tool calls.
 * A suite that measured a parallel implementation would not be evidence about what runs.
 *
 * THREE CLASSES, like the qualification matrix, because a security suite with only pass/fail cannot tell a
 * bounded LIMIT from a hole (§18):
 *   PASS  — measured, holds.
 *   LIMIT — not measurable here, or a disclosed residual with a stated bound. Not a pass; not a violation.
 *   FAIL  — measured VIOLATED. Any FAIL means the boundary is not closed.
 *
 * The kernel half runs the subject under the SHIPPED `windows-acl` runner — the exact mechanism the DSH PTC
 * child uses — so the token under test is the real one. The guard half exercises the decision function
 * directly, because that is the function the shipped host registers.
 *
 * All canaries are synthetic and fresh per run. No real secret is read or printed.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { randomBytes } from "node:crypto";

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/u, "").split("=");
  return [key, rest.join("=")];
}));
const RIG = args.get("rig") ?? join(homedir(), ".palimpsest-r1h", "conformance");
if (existsSync(RIG)) rmSync(RIG, { recursive: true, force: true });
mkdirSync(RIG, { recursive: true });

const NL = String.fromCharCode(10);
const BSL = String.fromCharCode(92);
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

const fence = await import(pathToFileURL(join(RUNTIME, "read_fence.js")).href);
const guard = await import(pathToFileURL(join(RUNTIME, "read_guard.js")).href);
const workerFence = await import(pathToFileURL(join(RUNTIME, "worker_fence.js")).href);

/* ---------------------------------------------------------------- fixture */

const PROJECT = join(RIG, "project");
const REPOSITORY = join(PROJECT, "repo");
const WORLDS = join(REPOSITORY, ".palimpsest", "worlds");
const WORLD = join(WORLDS, "attempt-mine");
const SIBLING = join(WORLDS, "attempt-sibling");
const STATE = join(PROJECT, "state");
const OTHER = join(RIG, "other-project", "state");
const HOME = join(RIG, "home");
for (const dir of [WORLD, SIBLING, STATE, OTHER, HOME]) mkdirSync(dir, { recursive: true });

const c = {
  WORLD: canary("world"),
  STATE: canary("state"),
  SIBLING: canary("sibling"),
  OTHER: canary("other"),
  CREDENTIAL: canary("credential"),
};
writeFileSync(join(WORLD, "in-world.txt"), `canary=${c.WORLD}${NL}`, "utf8");
writeFileSync(join(STATE, "proof-blob.txt"), `canary=${c.STATE}${NL}`, "utf8");
writeFileSync(join(SIBLING, "values.js"), `// canary=${c.SIBLING}${NL}`, "utf8");
writeFileSync(join(OTHER, "proof-blob.txt"), `canary=${c.OTHER}${NL}`, "utf8");
const CREDENTIAL_FILE = join(HOME, ".credentials.yaml");
writeFileSync(CREDENTIAL_FILE, `provider: synthetic${NL}apiKey: ${c.CREDENTIAL}${NL}`, "utf8");

/**
 * The protected roots, exactly as the shipped derivation produces them: the repository's `.palimpsest`, the
 * out-of-repository stores this rig uses, and the host home. The derivation is not re-implemented here —
 * `deriveWorkerFence` is called, so the suite measures the configuration that would actually be in force.
 */
const derived = workerFence.deriveWorkerFence({
  world: WORLD,
  repository: REPOSITORY,
  hostHome: HOME,
  extraRoots: [STATE, SIBLING, OTHER],
});
process.stdout.write(`${NL}===== R1-H CONFORMANCE =====${NL}rig ${RIG}${NL}`);
process.stdout.write(`derived roots: ${derived.roots.length}, disclosed residuals: ${derived.residuals.length}${NL}`);

/* ---------------------------------------------------------------- H-N01…N05: the guard (layer 2) */

process.stdout.write(`${NL}--- the trusted-code read guard (the shipped decision function) ---${NL}`);
const guardFor = guard.createReadGuard({ roots: derived.roots, world: WORLD, cwd: WORLD });
const denies = (name, args_) => {
  const reason = guardFor({ name, arguments: args_ });
  return typeof reason === 'string' && reason !== '';
};
const allows = (name, args_) => guardFor({ name, arguments: args_ }) === undefined;

check("H-N01", "the guard ALLOWS a read inside the worker's world", allows("read", { file_path: join(WORLD, "in-world.txt") }), "in-world read permitted — ordinary work intact");
check("H-N02", "the guard DENIES a read of the durable state", denies("read", { file_path: join(STATE, "proof-blob.txt") }), "denied");
check("H-N03", "the guard DENIES a read of a sibling world", denies("read", { file_path: join(SIBLING, "values.js") }), "denied");
check("H-N04", "the guard DENIES a read of another project", denies("read", { file_path: join(OTHER, "proof-blob.txt") }), "denied");
check("H-N05", "the guard DENIES a read of the credential file", denies("read", { file_path: CREDENTIAL_FILE }), "denied");
check("H-N06", "the guard DENIES ../ traversal to a protected root", denies("read", { file_path: "../../../../state/proof-blob.txt" }), "denied");
check("H-N07", "the guard DENIES grep over a protected root", denies("grep", { pattern: "canary", path: STATE }), "denied — the path ripgrep spawns with, which bypasses ctx.fs entirely");
check("H-N08", "the guard DENIES glob over a protected root", denies("glob", { pattern: "**/*", path: SIBLING }), "denied");
check("H-N09", "the guard DENIES read_image on a protected file", denies("read_image", { file_path: CREDENTIAL_FILE }), "denied — bytes cannot be pulled through the image tool");
check("H-N10", "the guard DENIES a non-string path rather than falling through", denies("read", { file_path: 42 }), "denied — a call whose path cannot be interpreted must not reach the tool body");
check("H-N11", "the guard ALLOWS a grep with no path (defaults to the world)", allows("grep", { pattern: "canary" }), "permitted — the tool defaults to the session cwd, which IS the world");
check("H-N12", "the guard leaves a non-reading tool alone", allows("bash", { command: "ls" }) && allows("write", { file_path: join(WORLD, "x.txt") }), "not a content reader; `bash` is the kernel layer's job, not the guard's");

/* ---------------------------------------------------------------- H-N13…N16: the kernel fence (layer 1) */

process.stdout.write(`${NL}--- the kernel read fence, through the SHIPPED windows-acl runner ---${NL}`);

const dshRoot = (() => {
  const explicit = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (explicit !== undefined && explicit !== "") return explicit;
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || join(spawnSync("npm", ["root", "-g"], { encoding: "utf8", shell: true }).stdout.trim(), "@deepseek-ai", "dsh", "lib", "bin.js");
  return join(bin, "..", "..");
})();
const ACL_INDEX = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const RUNNER = join(dshRoot, "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
/**
 * Publish the resolved root so the SHIPPED fence can find its FFI runtime. The fence resolves koffi from an
 * explicit root, the DSH entry point, or the global npm prefix — and a gate run standalone has none of the
 * first two, so without this the kernel half would report `supported: false` and the suite would fail for a
 * setup reason rather than a boundary reason. This is the same variable a real deployment sets.
 */
process.env.PALIMPSEST_DSH_ROOT = dshRoot;

const probePath = join(WORLD, "probe.mjs");
const reportPath = join(WORLD, "report.json");
writeFileSync(probePath, [
  'import { readFileSync, writeFileSync, readdirSync } from "node:fs";',
  "const out = {};",
  "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
  `read("WORLD", ${JSON.stringify(join(WORLD, "in-world.txt"))});`,
  `read("STATE", ${JSON.stringify(join(STATE, "proof-blob.txt"))});`,
  `read("SIBLING", ${JSON.stringify(join(SIBLING, "values.js"))});`,
  `read("OTHER", ${JSON.stringify(join(OTHER, "proof-blob.txt"))});`,
  `read("CREDENTIAL", ${JSON.stringify(CREDENTIAL_FILE)});`,
  `try { writeFileSync(${JSON.stringify(join(WORLD, "wrote.txt"))}, "ok"); out.WRITE_WORLD = true; } catch { out.WRITE_WORLD = false; }`,
  `try { writeFileSync(${JSON.stringify(join(STATE, "intruder.txt"))}, "no"); out.WRITE_STATE = true; } catch { out.WRITE_STATE = false; }`,
  `try { out.LIST_STATE = { listed: readdirSync(${JSON.stringify(STATE)}).length }; } catch (e) { out.LIST_STATE = { listed: false, code: e?.code ?? String(e) }; }`,
  `writeFileSync(${JSON.stringify(reportPath)}, JSON.stringify(out));`,
].join(NL), "utf8");

/** Apply the shipped fence to the derived roots, then run the subject under the shipped runner. */
const applied = fence.applyReadFence({ roots: derived.roots, world: WORLD });
process.stdout.write(`  kernel fence: supported=${String(applied.supported)} labelled=${String(applied.outcomes.filter((o) => o.verified).length)}/${String(applied.outcomes.length)}${applied.unavailable === undefined ? "" : ` unavailable=${applied.unavailable}`}${NL}`);

const workerDriver = join(RIG, "driver.mjs");
writeFileSync(workerDriver, [
  'import { mkdtempSync, rmSync } from "node:fs";',
  'import { tmpdir } from "node:os";',
  'import { join } from "node:path";',
  'import { spawnSync } from "node:child_process";',
  "const out = {};",
  `const mod = await import(${JSON.stringify(pathToFileURL(ACL_INDEX).href)});`,
  `const ws = ${JSON.stringify(WORLD)};`,
  "const temp = mkdtempSync(join(tmpdir(), 'r1h-conf-'));",
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
  "process.stderr.write('DRIVER ' + JSON.stringify(out) + String.fromCharCode(10));",
].join(NL), "utf8");

rmSync(reportPath, { force: true });
const driverRun = spawnSync(process.execPath, [workerDriver], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
const driverLine = (driverRun.stderr ?? "").split(NL).map((e) => e.trim()).find((e) => e.startsWith("DRIVER")) ?? "";
const driver = driverLine === "" ? null : JSON.parse(driverLine.slice("DRIVER ".length));
const report = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, "utf8")) : null;

check("H-N13", "the kernel fence installed and VERIFIED every root", applied.supported && applied.outcomes.length > 0 && applied.outcomes.every((entry) => entry.verified), applied.supported ? `${String(applied.outcomes.filter((o) => o.verified).length)}/${String(applied.outcomes.length)} verified by readback` : `unsupported: ${String(applied.unavailable)}`);

if (report === null) {
  check("H-N14", "the confined subject produced a report", false, `no report (driver ${driver === null ? "produced no output" : `status=${String(driver.status)}`}) ${String(driver?.stderr ?? "").slice(0, 160)}`);
} else {
  const saw = (key, expected) => report[key]?.read === true && String(report[key].content).includes(expected);
  check("H-N14", "the confined subject can read and write inside its world", saw("WORLD", c.WORLD) && report.WRITE_WORLD === true, `world read ${saw("WORLD", c.WORLD) ? "ok" : `BLOCKED (${report.WORLD?.code})`}, world write ${report.WRITE_WORLD === true ? "ok" : "REFUSED — the fence broke ordinary work"}`);
  check("H-N15", "the confined subject CANNOT read any protected root", !saw("STATE", c.STATE) && !saw("SIBLING", c.SIBLING) && !saw("OTHER", c.OTHER) && !saw("CREDENTIAL", c.CREDENTIAL), [["state", saw("STATE", c.STATE)], ["sibling", saw("SIBLING", c.SIBLING)], ["other", saw("OTHER", c.OTHER)], ["credential", saw("CREDENTIAL", c.CREDENTIAL)]].map(([n, hit]) => `${n}=${hit ? "READABLE" : "blocked"}`).join(", "));
  check("H-N16", "write confinement still holds", report.WRITE_WORLD === true && report.WRITE_STATE === false, `in-world write ${report.WRITE_WORLD === true ? "allowed" : "REFUSED"}, outside write ${report.WRITE_STATE === true ? "ALLOWED — regressed" : "refused"}`);
  check("H-N17", "the confined subject cannot enumerate a protected root", report.LIST_STATE?.listed === false, report.LIST_STATE?.listed === false ? `blocked (${report.LIST_STATE.code})` : `LISTED ${String(report.LIST_STATE?.listed)} entries — contract violated`);
}

/* ---------------------------------------------------------------- verdict */

const failed = results.filter((entry) => !entry.pass);
const limits = results.filter((entry) => entry.limit === true);
const passed = results.filter((entry) => entry.pass && entry.limit !== true);
process.stdout.write(`${NL}${String(passed.length)} PASS · ${String(limits.length)} LIMIT · ${String(failed.length)} FAIL${NL}`);
if (failed.length > 0) {
  process.stdout.write(`${NL}R1-H CONFINEMENT CONFORMANCE: FAIL — ${String(failed.length)} assertion(s) not met: ${failed.map((e) => e.id).join(", ")}${NL}`);
} else {
  process.stdout.write(`${NL}R1-H CONFINEMENT CONFORMANCE: PASS — the read boundary holds on this host.${NL}`);
  if (limits.length > 0) process.stdout.write(`disclosed limits: ${limits.map((e) => e.id).join(", ")}${NL}`);
}
writeFileSync(join(RIG, "conformance.json"), `${JSON.stringify({ derivedRoots: derived.roots.length, residuals: derived.residuals, kernel: { supported: applied.supported, outcomes: applied.outcomes, unavailable: applied.unavailable }, results, failed: failed.map((e) => e.id), limits: limits.map((e) => e.id) }, null, 2)}${NL}`, "utf8");
process.stdout.write(`written: ${join(RIG, "conformance.json")}${NL}`);
process.exit(failed.length === 0 ? 0 : 1);
