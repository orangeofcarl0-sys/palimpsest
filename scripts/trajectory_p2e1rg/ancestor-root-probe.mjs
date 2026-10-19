/**
 * Trajectory-P2-E1RG §3 — RG-0-F7: THE ANCESTOR-ROOT LOW-INTEGRITY DIRECT-READ PROBE.
 *
 * THE QUESTION THIS ANSWERS, AND WHY IT CANNOT BE ANSWERED BY A TOOL-GUARD TEST.
 *
 * `planReadFence()` intentionally SKIPS a root that contains the execution world, because labelling an ancestor
 * of the worker's own cwd refuses the traverse every process needs to start. In the production layout the world
 * lives at `<repository>/.palimpsest/worlds/<attempt>`, so the protected root `<repository>/.palimpsest` is
 * skipped — and the durable state beside it (`<repository>/.palimpsest/durable-state/`) is therefore NOT
 * covered by that root's label.
 *
 * A refused `read` tool call proves nothing about this. The tool guard works on NAMES in the Medium host; the
 * question is whether a LOW-INTEGRITY PROCESS the worker can start can open the file directly. Those are
 * different enforcement layers and §3-F7 requires the second one to be measured.
 *
 * HOW IT IS MEASURED. The DSH Windows sandbox runner (`dsh-sandbox-windows-acl`) is the same mechanism the
 * shipped worker uses: it creates a restricted Low token and applies the workspace write grant. A probe runs
 * under that token and attempts the read. The result is the actual answer, not an inference.
 *
 * SAFETY. The whole layout is test-owned under a `mkdtemp` root; the canary is synthetic; no real
 * `.palimpsest`, credential, session or user directory is read or written. The sandbox runner and its grants
 * are disposed, and the temp directory is removed.
 *
 * Usage:  node scripts/trajectory_p2e1rg/ancestor-root-probe.mjs [--json-out <path>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const NL = String.fromCharCode(10);
const CANARY = "P2E1RG-ANCESTOR-CANARY-5c7e2b91-SYNTHETIC-ONLY";

const dshHome = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).replace(/\\/gu, "/");
const aclIndex = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const sandboxRunner = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
/**
 * THE BINDING SEAM IS RESOLVED THROUGH THIS VARIABLE.
 *
 * `win32LabelApi()` tries `PALIMPSEST_DSH_ROOT/node_modules/@deepseek-ai/<pkg>` first. A standalone script has no
 * installed profile on its resolution path, so without this the fence reports
 * "the binding seam ... could not be resolved" and `applyReadFence` returns `supported: false` — which would
 * make this probe measure NOTHING while appearing to run. The R1-HR suite sets the same variable for the same
 * reason.
 */
if (process.env.PALIMPSEST_DSH_ROOT === undefined || process.env.PALIMPSEST_DSH_ROOT.trim() === "") {
  process.env.PALIMPSEST_DSH_ROOT = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
}

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_ANCESTOR_ROOT_PROBE",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "NOT_ESTABLISHED",
  question: "In the production-shaped layout, can a Low-integrity process started from the world read durable state beside it, under the skipped ancestor root?",
  canaryIsSynthetic: true,
  observations: {},
  verdict: "NOT_RUN",
};

const ROOT = mkdtempSync(join(tmpdir(), "p2e1rg-ancestor-"));
let grants = null;

try {
  /**
   * THE PRODUCTION SHAPE. The world is inside the protected root, and the durable state is a SIBLING of the
   * worlds directory — which is exactly what `disclosedResiduals()` describes.
   */
  const repository = join(ROOT, "repository");
  const palimpsest = join(repository, ".palimpsest");
  const world = join(palimpsest, "worlds", "attempt-A");
  const durable = join(palimpsest, "durable-state");
  for (const dir of [world, durable]) mkdirSync(dir, { recursive: true });
  writeFileSync(join(durable, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");
  writeFileSync(join(world, "in-world.txt"), "WORLD-ORDINARY-WORK\n", "utf8");

  const fence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "read_fence.js")).href);
  /**
   * THE ROOT COVERAGE PLAN. This is the fact the admission decision must account for: the protected root is
   * SKIPPED, so the label is never applied to it and its descendants inherit nothing from it.
   */
  const plan = fence.planReadFence({ roots: [palimpsest], world });
  report.observations.rootPlan = {
    requestedRoots: [".palimpsest"],
    plannedRoots: plan.protectedRoots.length,
    skippedRoots: plan.skipped.map((entry) => ({ path: ".palimpsest", why: entry.why })),
    note: "a skipped root is NOT a labelled root; its descendants are covered only if they are separately labelled",
  };

  /**
   * WHICH DESCENDANTS RECEIVE THEIR OWN LABEL. `applyReadFence` labels the PLANNED roots only. Because the
   * ancestor was skipped, nothing under it is planned — so this reports what actually happens rather than
   * assuming the durable state is covered.
   */
  const applied = fence.applyReadFence({ roots: [palimpsest], world });
  report.observations.kernelApplication = {
    supported: applied.supported === true,
    outcomes: (applied.outcomes ?? []).map((entry) => ({ path: ".palimpsest", applied: entry.applied, verified: entry.verified, detail: String(entry.detail).slice(0, 200) })),
    skipped: (applied.skipped ?? []).length,
  };

  if (!existsSync(aclIndex) || !existsSync(sandboxRunner)) {
    report.verdict = "NOT_ESTABLISHED";
    report.observations.blocker = "the DSH Windows sandbox runner is not present, so the Low-token path could not be exercised";
  } else {
    /** The probe that runs UNDER the restricted token. */
    const probePath = join(ROOT, "low-probe.mjs");
    /**
     * THE RESULT MUST BE WRITTEN SOMEWHERE THE LOW TOKEN CAN WRITE. The sandbox grants write access to the
     * WORKSPACE and to a designated TEMP directory, and nothing else — so writing the result beside the probe
     * (outside both) fails with EPERM and the probe reports nothing. Measured, not assumed: the first run of
     * this script failed exactly that way.
     */
    const probeOut = join(world, "low-probe-result.json");
    writeFileSync(
      probePath,
      [
        'import { readFileSync, writeFileSync } from "node:fs";',
        "const out = {};",
        "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
        `read("WORLD", ${JSON.stringify(join(world, "in-world.txt"))});`,
        `read("DURABLE_UNDER_SKIPPED_ANCESTOR", ${JSON.stringify(join(durable, "synthetic-canary.txt"))});`,
        `read("ANCESTOR_ITSELF", ${JSON.stringify(join(palimpsest, "worlds", "attempt-A", "in-world.txt"))});`,
        `writeFileSync(${JSON.stringify(probeOut)}, JSON.stringify(out));`,
      ].join(NL),
      "utf8",
    );

    /**
     * RUN THE PROBE UNDER A LOW TOKEN. Factored out so the SAME probe can be run twice: once with the durable
     * directory labelled, and once with NO label at all. The second run is the decisive control.
     */
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
          "const temp = mkdtempSync(join(tmpdir(), 'p2e1rg-low-'));",
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
          `process.stderr.write('RG_DRIVER ' + JSON.stringify(out) + ${JSON.stringify(NL)});`,
        ].join(NL),
        "utf8",
      );
      const driverRun = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
      const driverLine = (driverRun.stderr ?? "").split(NL).map((line) => line.trim()).find((line) => line.startsWith("RG_DRIVER")) ?? "";
      const driver = driverLine === "" ? null : JSON.parse(driverLine.slice("RG_DRIVER ".length));
      const probe = existsSync(probeOut) ? JSON.parse(readFileSync(probeOut, "utf8")) : null;
      return { driver, probe };
    };

    /* ---- ARM 1: durable state carries its OWN label (the intended mitigation) ---- */
    const durableFence = fence.ensureReadFence({ roots: [durable], world });
    report.observations.durableLabelledSeparately = { rootsVerified: durableFence.rootsVerified, treesVerified: durableFence.treesVerified };
    const labelled = runLowProbe("labelled");

    /* ---- ARM 2: THE DECISIVE CONTROL — NO label anywhere under the skipped ancestor ---- */
    /**
     * WHY THIS ARM EXISTS. If the Low token is refused in Arm 1, the refusal could come from the label OR from
     * the sandbox's own write-grant ACL — and those are different guarantees with different failure modes. A
     * probe that only ran Arm 1 would let an ACL-only protection be reported as a Kernel protection. So the
     * label is REMOVED and the same probe is run again: whatever still refuses the read is a layer that does
     * not depend on the Kernel fence.
     */
    const removal = fence.uninstallReadFence({ roots: [durable], originals: durableFence.trees.map((entry) => ({ path: entry.root, integrityRid: 8192, policyMask: 0 })) });
    report.observations.labelRemovedForControl = removal.restored.map((entry) => ({ restored: entry.restored, detail: String(entry.detail).slice(0, 160) }));
    const unlabelled = runLowProbe("unlabelled");
    /** Restore the label so the fixture ends in the state the first arm measured. */
    fence.ensureReadFence({ roots: [durable], world });

    report.observations.labelledArm = {
      lowToken: labelled.driver,
      probe: labelled.probe,
      durableReadable: labelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.read === true,
      refusingCode: labelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.code ?? null,
    };
    report.observations.unlabelledArm = {
      lowToken: unlabelled.driver,
      probe: unlabelled.probe,
      durableReadable: unlabelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.read === true,
      refusingCode: unlabelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.code ?? null,
      canaryLeaked: typeof unlabelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.content === "string" && unlabelled.probe.DURABLE_UNDER_SKIPPED_ANCESTOR.content.includes(CANARY),
    };

    const labelledRead = labelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.read === true;
    const unlabelledRead = unlabelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.read === true;
    const unlabelledLeaked = unlabelled.probe?.DURABLE_UNDER_SKIPPED_ANCESTOR?.content?.includes?.(CANARY) === true;

    report.observations.durableReadableByLowToken = labelledRead;
    report.observations.canaryLeaked = unlabelledLeaked;
    report.observations.worldStillReadable = labelled.probe?.WORLD?.read === true;

    /**
     * THE VERDICT NAMES THE LAYER, NOT A MOOD.
     *
     *   CANARY_READABLE_BY_LOW_TOKEN       a verified confidentiality failure — §3-F7 requires it be reported.
     *   PROTECTED_WITHOUT_THE_LABEL        the read was refused with NO label in place, so an independent
     *                                      boundary (the sandbox write-grant ACL / Low token) provides it. This
     *                                      is the STRONGEST available statement and it is still narrower than
     *                                      "the Kernel fence protects durable state".
     *   PROTECTED_ONLY_BY_THE_LABEL        the labelled arm refused and the unlabelled arm succeeded: the
     *                                      protection IS the Kernel label, which is why durable state must be
     *                                      labelled even though the ancestor root cannot be.
     *   PROBE_INCONCLUSIVE                 neither arm produced a usable observation.
     */
    if (unlabelledLeaked) report.verdict = "CANARY_READABLE_BY_LOW_TOKEN";
    else if (!labelledRead && !unlabelledRead) report.verdict = "PROTECTED_WITHOUT_THE_LABEL";
    else if (!labelledRead && unlabelledRead) report.verdict = "PROTECTED_ONLY_BY_THE_LABEL";
    else report.verdict = "PROBE_INCONCLUSIVE";
    /** Readable-but-not-leaking is its own state: the file opened and did not carry the token. */
    if (unlabelledRead && !unlabelledLeaked) report.verdict = "READ_SUCCEEDED_WITHOUT_CANARY";
  }
  report.evidenceClass = report.verdict === "NOT_ESTABLISHED" || report.verdict === "PROBE_INCONCLUSIVE" ? "NOT_ESTABLISHED" : "FIRST_PARTY_DSH_VERIFIED";
} catch (error) {
  report.error = error instanceof Error ? error.message : String(error);
  report.verdict = "PROBE_FAILED";
} finally {
  if (grants !== null) {
    try {
      grants.dispose();
    } catch {
      /* already disposed */
    }
  }
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
}

const emitted = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}
/**
 * EXIT CODE. A LEAK is a security finding, not a harness failure — but it must never exit 0, because a caller
 * that only checked the status would read it as success.
 */
process.exit(report.verdict === "CANARY_READABLE_BY_LOW_TOKEN" ? 3 : report.verdict === "PROBE_FAILED" ? 2 : 0);
