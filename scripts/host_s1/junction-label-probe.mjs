#!/usr/bin/env node
/**
 * Host-S1 §6.4/§7.1 — DOES A LABELLED REPARSE POINT CONSTITUTE A PROTECTION BASIS?
 *
 * WHY THIS MUST BE MEASURED BEFORE H1-B IS DESIGNED.
 *
 * A real DSH home contains junction entries in `profiles/node_modules` (the shipped installer links packages).
 * `verifyTree` refuses to walk a reparse point and therefore reports the tree as incomplete. If descendant
 * verification becomes an admission requirement with "no reparse points" as its rule, every real deployment
 * refuses every worker — an outage dressed as a security improvement.
 *
 * The alternative basis is the LINK'S OWN LABEL. Traversal through a junction requires read/traverse access on
 * the junction object itself, so a NO_READ_UP label on the link should refuse a Low-integrity process at the
 * link, before the target is ever reached. That is a claim about the kernel, and it is either true on this host
 * or it is not.
 *
 * ARMS:
 *   1. root labelled (inheritance covers the junction), target NOT labelled  -> is the canary readable through
 *      the junction? Through the target directly?
 *   2. nothing labelled (control)                                          -> proves the probe can actually read,
 *      so Arm 1's refusal is attributable to the label rather than to a broken probe.
 *
 * SAFETY. Everything is test-owned under one mkdtemp root; the canary is synthetic; no real `.palimpsest`,
 * credential or session is touched. The sandbox grants are disposed and the temp tree removed.
 *
 * Usage:  node scripts/host_s1/junction-label-probe.mjs [--json-out <path>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const NL = String.fromCharCode(10);
const CANARY = "HOSTS1-JUNCTION-CANARY-7b41c8e5-SYNTHETIC-ONLY";

const dshHome = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).replace(/\\/gu, "/");
const aclIndex = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const sandboxRunner = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
if (process.env.PALIMPSEST_DSH_ROOT === undefined || process.env.PALIMPSEST_DSH_ROOT.trim() === "") {
  process.env.PALIMPSEST_DSH_ROOT = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
}

const ROOT = mkdtempSync(join(tmpdir(), "hosts1-junction-"));
const report = {
  schemaVersion: 1,
  kind: "HOST_S1_JUNCTION_LABEL_PROBE",
  stage: "Palimpsest Host-S1",
  evidenceClass: "NOT_ESTABLISHED",
  question: "Does a NO_READ_UP label on a directory that contains a junction refuse a Low-integrity process at the junction, before the target is reached?",
  canaryIsSynthetic: true,
  observations: {},
  verdict: "NOT_RUN",
};

try {
  const fence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "read_fence.js")).href);

  /**
   * THE SHAPE. `root` is the protected directory a worker must not read. It contains a junction `link` whose
   * target `outside` holds the canary. `world` is where the worker legitimately runs.
   */
  const root = join(ROOT, "protected-root");
  const outside = join(ROOT, "outside-target");
  const world = join(ROOT, "world");
  for (const dir of [root, outside, world]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(outside, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");
  writeFileSync(join(world, "in-world.txt"), "WORLD-ORDINARY-WORK\n", "utf8");
  const link = join(root, "link-to-outside");
  try {
    symlinkSync(outside, link, "junction");
  } catch (error) {
    report.verdict = "FIXTURE_LIMIT";
    report.observations.blocker = `the junction fixture could not be created: ${error instanceof Error ? String(error.code ?? error.message) : String(error)}`;
    throw new Error("fixture unavailable");
  }

  const probePath = join(ROOT, "low-probe.mjs");
  const probeOut = join(world, "low-probe-result.json");
  writeFileSync(
    probePath,
    [
      'import { readFileSync, readdirSync, writeFileSync } from "node:fs";',
      "const out = {};",
      "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
      "const list = (name, p) => { try { out[name] = { listed: true, entries: readdirSync(p).length }; } catch (e) { out[name] = { listed: false, code: e?.code ?? String(e) }; } };",
      `read("WORLD", ${JSON.stringify(join(world, "in-world.txt"))});`,
      `read("THROUGH_JUNCTION", ${JSON.stringify(join(link, "synthetic-canary.txt"))});`,
      `read("TARGET_DIRECT", ${JSON.stringify(join(outside, "synthetic-canary.txt"))});`,
      `list("JUNCTION_LISTED", ${JSON.stringify(link)});`,
      `writeFileSync(${JSON.stringify(probeOut)}, JSON.stringify(out));`,
    ].join(NL),
    "utf8",
  );

  const runLowProbe = (tag) => {
    rmSync(probeOut, { force: true });
    const driverPath = join(ROOT, `low-driver-${tag}.mjs`);
    writeFileSync(
      driverPath,
      [
        "import { mkdtempSync, rmSync } from 'node:fs';",
        "import { tmpdir } from 'node:os';",
        "import { join } from 'node:path';",
        "import { spawnSync } from 'node:child_process';",
        "const out = {};",
        `const mod = await import(${JSON.stringify(pathToFileURL(aclIndex).href)});`,
        `const ws = ${JSON.stringify(world)};`,
        "const temp = mkdtempSync(join(tmpdir(), 'hosts1-low-'));",
        "try {",
        "  const wsSid = mod.workspaceWriteSid(ws);",
        "  const tmpSid = mod.tempWriteSid(temp);",
        "  const g = mod.AclWriteGrant.create(wsSid); g.add(ws, true);",
        "  const gt = mod.AclWriteGrant.create(tmpSid); gt.add(temp, false);",
        `  const r = spawnSync(process.execPath, [${JSON.stringify(sandboxRunner)}, '--workspace', ws, '--temp', temp, '--mode', 'workspace-write', '--write-sid', wsSid, '--temp-write-sid', tmpSid, '--', process.execPath, ${JSON.stringify(probePath)}], { encoding: 'utf8', timeout: 240_000 });`,
        "  out.status = r.status; out.stderr = String(r.stderr ?? '').slice(0, 300);",
        "  try { g.dispose(); gt.dispose(); } catch {}",
        "} catch (e) { out.error = e?.message ?? String(e); }",
        "finally { try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
        `process.stderr.write('HS1_DRIVER ' + JSON.stringify(out) + ${JSON.stringify(NL)});`,
      ].join(NL),
      "utf8",
    );
    const driverRun = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
    const driverLine = (driverRun.stderr ?? "").split(NL).map((line) => line.trim()).find((line) => line.startsWith("HS1_DRIVER")) ?? "";
    const driver = driverLine === "" ? null : JSON.parse(driverLine.slice("HS1_DRIVER ".length));
    const probe = existsSync(probeOut) ? JSON.parse(readFileSync(probeOut, "utf8")) : null;
    return { driver, probe };
  };

  /* ---- ARM 1: label the root; the junction inherits ---- */
  const ensured = fence.ensureReadFence({ roots: [root], world });
  report.observations.rootLabelled = { rootsVerified: ensured.rootsVerified, treesVerified: ensured.treesVerified };
  /**
   * THE TREE OUTCOME FOR A ROOT THAT CONTAINS A JUNCTION. This is the fact H1-B must account for: a reparse
   * point makes `complete` false even when every object that CAN be examined carries the label.
   */
  const tree = fence.verifyTree({ root });
  report.observations.treeWithJunction = {
    complete: tree.complete,
    verified: tree.verified,
    noUnprotectedEntryFound: tree.noUnprotectedEntryFound,
    stopReason: tree.stopReason,
    reparsePoints: tree.reparsePoints.map((path) => String(path).slice(ROOT.length + 1).split("\\").join("/")),
    unlabelled: tree.unlabelled.map((path) => String(path).slice(ROOT.length + 1).split("\\").join("/")),
  };
  const labelled = runLowProbe("labelled");

  /* ---- ARM 2: CONTROL — no label anywhere ---- */
  fence.uninstallReadFence({ roots: [root], originals: [{ path: root, integrityRid: 8192, policyMask: 0 }] });
  const unlabelled = runLowProbe("unlabelled");

  const leakedThrough = labelled.probe?.THROUGH_JUNCTION?.read === true && String(labelled.probe?.THROUGH_JUNCTION?.content ?? "").includes(CANARY);
  const leakedDirect = labelled.probe?.TARGET_DIRECT?.read === true && String(labelled.probe?.TARGET_DIRECT?.content ?? "").includes(CANARY);
  const controlThrough = unlabelled.probe?.THROUGH_JUNCTION?.read === true && String(unlabelled.probe?.THROUGH_JUNCTION?.content ?? "").includes(CANARY);

  report.observations.labelledArm = {
    driver: labelled.driver,
    worldReadable: labelled.probe?.WORLD?.read === true,
    throughJunction: labelled.probe?.THROUGH_JUNCTION ?? null,
    junctionListed: labelled.probe?.JUNCTION_LISTED ?? null,
    targetDirect: labelled.probe?.TARGET_DIRECT ?? null,
  };
  report.observations.controlArm = {
    driver: unlabelled.driver,
    throughJunction: unlabelled.probe?.THROUGH_JUNCTION ?? null,
  };

  /**
   * THE VERDICT.
   *
   *   JUNCTION_LABEL_IS_A_PROTECTION_BASIS  the label refused the read through the junction AND the control
   *                                        read it. The link's own label is what stopped it.
   *   JUNCTION_LABEL_INSUFFICIENT           the labelled junction still delivered the canary. A reparse point
   *                                        inside a protected root is then a genuine gap, and admission must
   *                                        refuse it rather than treat the label as coverage.
   *   PROBE_INCONCLUSIVE                    the control could not read either, so nothing is attributable.
   */
  if (leakedThrough) report.verdict = "JUNCTION_LABEL_INSUFFICIENT";
  else if (controlThrough && !leakedThrough) report.verdict = "JUNCTION_LABEL_IS_A_PROTECTION_BASIS";
  else if (!controlThrough) report.verdict = "PROBE_INCONCLUSIVE";
  else report.verdict = "PROBE_INCONCLUSIVE";

  report.observations.canaryReadThroughLabelledJunction = leakedThrough;
  report.observations.canaryReadThroughUnlabelledJunction = controlThrough;
  report.observations.canaryReadAtTargetDirectly = leakedDirect;
  report.observations.worldStillUsable = labelled.probe?.WORLD?.read === true;
  report.evidenceClass = report.verdict === "PROBE_INCONCLUSIVE" ? "NOT_ESTABLISHED" : "FIRST_PARTY_DSH_VERIFIED";
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  if (report.verdict !== "FIXTURE_LIMIT") report.verdict = "PROBE_FAILED";
} finally {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
}

const emitted = `${JSON.stringify(report, null, 2)}${NL}`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}
process.exit(report.verdict === "JUNCTION_LABEL_INSUFFICIENT" ? 3 : report.verdict === "PROBE_FAILED" ? 2 : 0);
