#!/usr/bin/env node
/**
 * Host-S1 §5-F2 — A DIRECT LOW-INTEGRITY READ OF AN INACTIVE SIBLING WORLD.
 *
 * THE QUESTION. `planReadFence()` omits an inactive sibling world under a skipped ancestor (F1). This probe
 * measures what that omission COSTS: can a process running under the real DSH Low token, started from the active
 * world, read a synthetic canary from `attempt-B`?
 *
 * WHY THE TOOL GUARD IS NOT AN ANSWER. A refused `tools.read` call proves nothing here. The tool guard works on
 * NAMES in the Medium host; the question is whether a Low-integrity PROCESS the worker can start can open the
 * file directly. Those are different enforcement layers.
 *
 * ARMS, and why both are required:
 *
 *   1. SPINE-COVERED   — the sibling carries its own derived label, which is what the corrected derivation does.
 *   2. SPINE-UNCOVERED — the sibling carries NO label, which is the E1RG state (and the parent's).
 *
 * Arm 2 is the decisive control: if both arms refused, the refusal could come from the sandbox write-grant ACL
 * rather than from the Kernel label, and an ACL-only protection would be reported as a Kernel protection.
 *
 * SAFETY. The whole layout is test-owned under a `mkdtemp` root, the canary is synthetic, and no real
 * `.palimpsest`, credential, session or user directory is read or written.
 *
 * Usage:  node scripts/host_s1/sibling-world-probe.mjs [--json-out <path>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const NL = String.fromCharCode(10);
const CANARY = "HOSTS1-SIBLING-CANARY-b82e4f61-SYNTHETIC-ONLY";

const dshHome = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).replace(/\\/gu, "/");
const aclIndex = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const sandboxRunner = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
if (process.env.PALIMPSEST_DSH_ROOT === undefined || process.env.PALIMPSEST_DSH_ROOT.trim() === "") {
  process.env.PALIMPSEST_DSH_ROOT = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
}

const ROOT = mkdtempSync(join(tmpdir(), "hosts1-sibling-"));
const report = {
  schemaVersion: 1,
  kind: "HOST_S1_SIBLING_WORLD_PROBE",
  stage: "Palimpsest Host-S1",
  evidenceClass: "NOT_ESTABLISHED",
  question: "Can a Low-integrity process started from the ACTIVE world read an INACTIVE sibling world under the same skipped ancestor?",
  canaryIsSynthetic: true,
  observations: {},
  verdict: "NOT_RUN",
};

try {
  const fence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "read_fence.js")).href);

  /**
   * THE PRODUCTION SHAPE. The active world is `attempt-A`; the sibling is `attempt-B`; durable state sits beside
   * the worlds directory.
   */
  const repository = join(ROOT, "repository");
  const palimpsest = join(repository, ".palimpsest");
  const worlds = join(palimpsest, "worlds");
  const active = join(worlds, "attempt-A");
  const sibling = join(worlds, "attempt-B");
  const durable = join(palimpsest, "durable-state");
  for (const dir of [active, sibling, durable]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(sibling, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");
  writeFileSync(join(durable, "synthetic-secret.txt"), `${CANARY}${NL}`, "utf8");
  writeFileSync(join(active, "in-world.txt"), "WORLD-ORDINARY-WORK\n", "utf8");

  /* ---- the plan: does the derivation actually reach the sibling? ---- */
  const plan = fence.planReadFence({ roots: [palimpsest], world: active });
  const rel = (path) => String(path).slice(ROOT.length + 1).split("\\").join("/");
  report.observations.plan = {
    derivedRoots: plan.derivedRoots.map((entry) => rel(entry.path)),
    siblingDerived: plan.derivedRoots.some((entry) => entry.path.toLowerCase() === sibling.toLowerCase()),
    durableDerived: plan.derivedRoots.some((entry) => entry.path.toLowerCase() === durable.toLowerCase()),
    spine: (plan.skipped[0]?.spine ?? []).map(rel),
    unresolved: plan.unresolved.map(rel),
  };

  const applied = fence.applyReadFence({ roots: [palimpsest], world: active });
  const siblingOutcome = (applied.outcomes ?? []).find((entry) => entry.path.toLowerCase() === sibling.toLowerCase()) ?? null;
  report.observations.kernelApplication = {
    supported: applied.supported === true,
    siblingLabelled: siblingOutcome === null ? false : siblingOutcome.verified === true,
    durableLabelled: (applied.outcomes ?? []).some((entry) => entry.path.toLowerCase() === durable.toLowerCase() && entry.verified === true),
    coverageComplete: applied.coverage?.complete === true,
    coverageSkippedWithoutDerived: (applied.coverage?.skippedWithoutDerivedCoverage ?? []).map(rel),
    coverageIncompletePlans: (applied.coverage?.incompletePlans ?? []).map(rel),
  };

  if (!existsSync(aclIndex) || !existsSync(sandboxRunner)) {
    report.verdict = "NOT_ESTABLISHED";
    report.observations.blocker = "the DSH Windows sandbox runner is not present, so the Low-token path could not be exercised";
  } else {
    const probePath = join(ROOT, "low-probe.mjs");
    /** The result must land where the Low token can WRITE: the workspace or its designated temp. */
    const probeOut = join(active, "low-probe-result.json");
    writeFileSync(
      probePath,
      [
        'import { readFileSync, writeFileSync } from "node:fs";',
        "const out = {};",
        "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
        `read("WORLD", ${JSON.stringify(join(active, "in-world.txt"))});`,
        `read("SIBLING_WORLD", ${JSON.stringify(join(sibling, "synthetic-canary.txt"))});`,
        `read("DURABLE_STATE", ${JSON.stringify(join(durable, "synthetic-secret.txt"))});`,
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
          `const ws = ${JSON.stringify(active)};`,
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
          `process.stderr.write('HS1_SIB_DRIVER ' + JSON.stringify(out) + ${JSON.stringify(NL)});`,
        ].join(NL),
        "utf8",
      );
      const driverRun = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
      const driverLine = (driverRun.stderr ?? "").split(NL).map((line) => line.trim()).find((line) => line.startsWith("HS1_SIB_DRIVER")) ?? "";
      const driver = driverLine === "" ? null : JSON.parse(driverLine.slice("HS1_SIB_DRIVER ".length));
      const probe = existsSync(probeOut) ? JSON.parse(readFileSync(probeOut, "utf8")) : null;
      return { driver, probe };
    };

    /* ---- ARM 1: the corrected derivation labels the sibling ---- */
    const covered = runLowProbe("covered");

    /* ---- ARM 2: THE DECISIVE CONTROL — remove the sibling's label ---- */
    const removed = fence.uninstallReadFence({
      roots: [sibling],
      originals: [{ path: sibling, integrityRid: 8192, policyMask: 0 }],
    });
    report.observations.labelRemovedForControl = removed.restored.map((entry) => ({ restored: entry.restored, detail: String(entry.detail).slice(0, 160) }));
    const uncovered = runLowProbe("uncovered");
    /** Restore the fixture to the state Arm 1 measured. */
    fence.ensureReadFence({ roots: [sibling], world: active });

    const coveredRead = covered.probe?.SIBLING_WORLD?.read === true;
    const coveredLeaked = typeof covered.probe?.SIBLING_WORLD?.content === "string" && covered.probe.SIBLING_WORLD.content.includes(CANARY);
    const uncoveredRead = uncovered.probe?.SIBLING_WORLD?.read === true;
    const uncoveredLeaked = typeof uncovered.probe?.SIBLING_WORLD?.content === "string" && uncovered.probe.SIBLING_WORLD.content.includes(CANARY);
    const durableLeaked = typeof covered.probe?.DURABLE_STATE?.content === "string" && covered.probe.DURABLE_STATE.content.includes(CANARY);

    report.observations.coveredArm = {
      driver: covered.driver,
      worldReadable: covered.probe?.WORLD?.read === true,
      sibling: covered.probe?.SIBLING_WORLD ?? null,
      durable: covered.probe?.DURABLE_STATE ?? null,
    };
    report.observations.uncoveredArm = {
      driver: uncovered.driver,
      sibling: uncovered.probe?.SIBLING_WORLD ?? null,
    };
    report.observations.siblingReadableUnderCoverage = coveredRead;
    report.observations.siblingCanaryLeakedUnderCoverage = coveredLeaked;
    report.observations.siblingCanaryLeakedWithoutLabel = uncoveredLeaked;
    report.observations.durableCanaryLeaked = durableLeaked;
    report.observations.activeWorldStillUsable = covered.probe?.WORLD?.read === true;

    /**
     * THE VERDICT NAMES THE LAYER.
     *
     *   SIBLING_PROTECTED_BY_THE_LABEL   the covered arm refused AND the uncovered arm read it. The Kernel label
     *                                    is the protection, which is what makes the derived coverage load-bearing.
     *   SIBLING_READABLE_BY_LOW_TOKEN     the covered arm STILL read the canary. A verified confidentiality
     *                                    failure; exit 3.
     *   SIBLING_PROTECTED_WITHOUT_LABEL  both arms refused: something independent also protects it, a stronger
     *                                    statement recorded as such.
     *   PROBE_INCONCLUSIVE               the control could not read either, so nothing is attributable.
     */
    if (coveredLeaked) report.verdict = "SIBLING_READABLE_BY_LOW_TOKEN";
    else if (!coveredRead && uncoveredLeaked) report.verdict = "SIBLING_PROTECTED_BY_THE_LABEL";
    else if (!coveredRead && !uncoveredRead) report.verdict = "SIBLING_PROTECTED_WITHOUT_LABEL";
    else report.verdict = "PROBE_INCONCLUSIVE";
    report.evidenceClass = report.verdict === "PROBE_INCONCLUSIVE" ? "NOT_ESTABLISHED" : "FIRST_PARTY_DSH_VERIFIED";
  }
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.verdict = "PROBE_FAILED";
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
process.exit(report.verdict === "SIBLING_READABLE_BY_LOW_TOKEN" ? 3 : report.verdict === "PROBE_FAILED" ? 2 : 0);
