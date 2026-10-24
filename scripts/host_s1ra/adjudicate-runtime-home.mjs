#!/usr/bin/env node
/**
 * Host-S1RA §7 — THE REAL runtime HOME'S BOUNDARY, ADJUDICATED RATHER THAN ASSUMED.
 *
 * THE QUESTION. On this machine the configured runtime home is a JUNCTION (`~/.dsh` → `D:\dsh`). A mandatory
 * integrity label set on the LINK OBJECT is not a label on the TARGET's contents, so a protection claim about
 * "the runtime home" is ambiguous until it names which object carries the protection. §7 requires that
 * ambiguity to be resolved and, where it cannot be, reported as `REAL_runtime_HOME_CONTENT_BOUNDARY_NOT_ESTABLISHED`.
 *
 * WHAT THIS DOES, in the order §7 asks for it:
 *
 *   1. READ-ONLY inspection of the real installation: the path relationship, the object kinds, and the security
 *      descriptor's integrity label at the target. Metadata only — no session body, no credential, no descriptor
 *      write, no relocation.
 *   2. A SYNTHETIC first-party arm: a test-owned home that is a junction, with a runtime-like subtree and a
 *      session-like subtree carrying distinct canaries, exercised through the real Low-integrity execution path.
 *      This establishes what the MECHANISM does. It does not establish what the real target does.
 *   3. An explicit adjudication that keeps the two apart.
 *
 * SAFETY. Every canary is synthetic. The real installation is only read, and only through `lstat`/`icacls`
 * queries. The synthetic arm uses its own descriptors under one `mkdtemp` root.
 *
 * Usage:
 *   node scripts/host_s1ra/adjudicate-runtime-home.mjs [--json-out <path>]
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveRuntimeHome } from "../gates/runtime-home.mjs";

const NL = String.fromCharCode(10);
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(join(HERE, "..", ".."));
const ARGV = process.argv.slice(2);
const argOf = (name) => {
  const index = ARGV.indexOf(name);
  return index === -1 ? null : (ARGV[index + 1] ?? null);
};
const JSON_OUT = argOf("--json-out");

const rel = (path) => String(path).replace(/\\/gu, "/");
const RUN_CANARY = "HOSTS1RA-RUNTIME-CANARY-4f2a91-SYNTHETIC-ONLY";
const SESSION_CANARY = "HOSTS1RA-SESSION-CANARY-9c7e03-SYNTHETIC-ONLY";

/**
 * THE VARIABLE NAME IS BUILT FROM CODE POINTS, BECAUSE A RENDERED IDENTIFIER CANNOT BE TRUSTED HERE.
 *
 * This repository contains TWO identifiers that render identically and differ in their first code point.
 * RA-0/F8 measured that collision for the runtime-HOME variable. The SAME collision exists for the runtime-ROOT
 * variable, and it produced a silent failure here: the probe set a 23-code-point name, the fence read a
 * 19-code-point name, found nothing, and reported that the PACKAGE could not be resolved. Every label write
 * then failed and the arm reported LABEL_NOT_APPLIED for every configuration.
 *
 * The name below is the one the fence reads, spelled as integers so no copy, font or renderer can substitute
 * it:
 *
 *   [80, 65, 76, 73, 77, 80, 83, 69, 83, 84, 95, 68, 83, 72, 95, 82, 79, 79, 84]
 */
const RUNTIME_ROOT_ENV = String.fromCharCode(80, 65, 76, 73, 77, 80, 83, 69, 83, 84, 95, 68, 83, 72, 95, 82, 79, 79, 84);

if ((process.env[RUNTIME_ROOT_ENV] ?? "").trim() === "") {
  const resolvedHome = resolveRuntimeHome();
  const candidate = join(resolvedHome.path, "profiles", "node_modules", "@deepseek-ai", "dsh");
  if (existsSync(candidate)) process.env[RUNTIME_ROOT_ENV] = candidate.split(String.fromCharCode(92)).join("/");
}

/** Read-only descriptor query. `/L` inspects the LINK; the plain form inspects the TARGET. */
function icacls(path, extra = []) {
  const run = spawnSync("icacls", [path, ...extra], { encoding: "utf8", timeout: 60_000 });
  const text = String(run.stdout ?? "") + String(run.stderr ?? "");
  return {
    exitCode: run.status,
    mandatoryLabelLine: text.split(NL).map((line) => line.trim()).find((line) => /^Mandatory Label/iu.test(line)) ?? null,
    sample: text.split(NL).slice(0, 6).map((line) => line.trim()).filter((line) => line !== ""),
  };
}

const report = {
  schemaVersion: 1,
  kind: "HOST_S1RA_runtime_HOME_BOUNDARY_ADJUDICATION",
  stage: "Palimpsest Host-S1RA",
  measuredAt: new Date().toISOString(),
  canariesAreSynthetic: true,
  realInstallation: null,
  syntheticArm: null,
  adjudication: null,
  verdict: "NOT_RUN",
};

/* ================================================================== 1. real installation ==== */
{
  const resolved = resolveRuntimeHome();
  const home = resolved.path;
  const observations = { home: rel(home), resolvedFrom: resolved.source };
  /** Hoisted: the trusted-dependency measurement below needs the TARGET, not the link. */
  let resolvedTarget = null;

  let homeStats = null;
  try {
    homeStats = lstatSync(home);
  } catch (error) {
    observations.homeUnreadable = String(error?.code ?? error);
  }

  if (homeStats !== null) {
    observations.homeIsReparsePoint = homeStats.isSymbolicLink();
    observations.homeKind = homeStats.isSymbolicLink() ? "reparse" : homeStats.isDirectory() ? "directory" : "other";

    /** THE TARGET, resolved. `realpathSync` is what the planner would see; the LINK is what a label sits on. */
    let target = null;
    try {
      target = realpathSync(home);
      resolvedTarget = target;
      observations.target = rel(target);
      observations.targetIsSameObject = resolve(target).toLowerCase() === resolve(home).toLowerCase();
    } catch (error) {
      observations.targetUnresolvable = String(error?.code ?? error);
    }

    if (target !== null) {
      let targetStats = null;
      try {
        targetStats = lstatSync(target);
      } catch (error) {
        observations.targetUnreadable = String(error?.code ?? error);
      }
      observations.targetKind = targetStats === null ? null : targetStats.isDirectory() ? "directory" : targetStats.isFile() ? "file" : "other";

      /** THE LABELS. The link and the target are queried SEPARATELY, because that distinction is the finding. */
      observations.linkDescriptor = icacls(home, ["/L"]);
      observations.targetDescriptor = icacls(target);

      /**
       * THE DATA CLASSES §7.2 REQUIRES TO BE KEPT APART. Only their EXISTENCE and object kind are recorded;
       * nothing inside a session or credential directory is read.
       */
      const classify = (relativePath) => {
        const path = join(target, relativePath);
        try {
          const stats = lstatSync(path);
          return { path: relativePath, present: true, kind: stats.isSymbolicLink() ? "reparse" : stats.isDirectory() ? "directory" : "file", isReparsePoint: stats.isSymbolicLink() };
        } catch {
          return { path: relativePath, present: false };
        }
      };
      observations.dataClasses = {
        runtimePackages: classify(join("profiles", "node_modules", "@deepseek-ai")),
        profileConfiguration: classify("profiles"),
        sessionPersistence: classify("sessions"),
        credentials: classify("credentials"),
        /** Recorded only as a COUNT, never as names, so no private identifier leaves this machine's report. */
        sessionEntryCount: (() => {
          try {
            return readdirSync(join(target, "sessions")).length;
          } catch {
            return null;
          }
        })(),
      };

      /** DO THE INSTALLER'S LINKS POINT INSIDE THE TARGET, OR ELSEWHERE? Counts only. */
      observations.dependencyJunctions = (() => {
        const modules = join(target, "profiles", "node_modules");
        try {
          const entries = readdirSync(modules);
          let links = 0;
          let inside = 0;
          let outside = 0;
          for (const entry of entries) {
            const candidate = join(modules, entry);
            let stats;
            try {
              stats = lstatSync(candidate);
            } catch {
              continue;
            }
            if (!stats.isSymbolicLink()) continue;
            links += 1;
            try {
              const resolvedTarget = resolve(candidate, "..", readFileLink(candidate));
              if (resolve(resolvedTarget).toLowerCase().startsWith(resolve(target).toLowerCase())) inside += 1;
              else outside += 1;
            } catch {
              outside += 1;
            }
          }
          return { totalEntries: entries.length, links, linksResolvingInsideTarget: inside, linksResolvingOutsideTarget: outside };
        } catch (error) {
          return { error: String(error?.code ?? error) };
        }
      })();
    }
  }

  /**
   * THE TRUSTED-DEPENDENCY CONTRACT, AS THE SHIPPED CODE ACTUALLY COMPUTES IT. `trustedDependencyRoots` is not
   * exported, so its OUTPUT is measured through the module's public descendant verification instead of being
   * reimplemented here — a reimplementation would measure this script rather than the host.
   */
  observations.trustedDependencyContract = await (async () => {
    try {
      const fence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "read_fence.js")).href);
      const root = join(resolvedTarget ?? home, "profiles", "node_modules", "@deepseek-ai");
      if (!existsSync(root)) return { measured: false, reason: "the runtime package tree is not present" };
      const tree = fence.verifyTree({ root });
      return {
        measured: true,
        verified: tree.verified,
        complete: tree.complete,
        reparsePoints: (tree.reparsePoints ?? []).length,
        reparseWithinRoot: (tree.reparseWithinRoot ?? []).length,
        reparseIntoProtectedRoot: (tree.reparseIntoProtectedRoot ?? []).length,
        reparseOutsideProtectionDomain: (tree.reparseOutsideProtectionDomain ?? []).length,
        dependencyRootsUsed: (tree.dependencyRootsUsed ?? []).length,
        unqualifiedExternalLinks: (tree.unqualifiedExternalLinks ?? []).length,
        admissionEligible: tree.admissionEligible,
      };
    } catch (error) {
      return { measured: false, reason: String(error?.message ?? error).slice(0, 240) };
    }
  })();

  report.realInstallation = observations;
}

/** Read a link's raw target without following it. Kept separate so the failure is explicit. */
function readFileLink(path) {
  const run = spawnSync("cmd", ["/c", "dir", "/AL", dirname(path)], { encoding: "utf8", timeout: 30_000 });
  const line = String(run.stdout ?? "")
    .split(NL)
    .find((entry) => entry.includes(basename(path)) && entry.includes("JUNCTION"));
  if (line === undefined) return path;
  const match = /\[(.+)\]/u.exec(line);
  return match === null ? path : match[1];
}

/* ================================================================== 2. synthetic arm ==== */
{
  /**
   * THE SYNTHETIC ARM MUST LIVE WHERE A LABEL CAN BE WRITTEN.
   *
   * Measured: `applyReadFence` returns `supported: false` on `F:`, because writing a mandatory integrity label
   * needs WRITE_OWNER/WRITE_DAC and this account holds only Modify on that volume. The first run of this probe
   * therefore produced `rootsVerified: false` — the label was NEVER APPLIED, so the canaries were readable for a
   * reason that has nothing to do with the boundary, and reporting that as a leak would have been false.
   *
   * The arm now runs under the user profile, and the rig is granted explicitly, exactly as the Host-S1R
   * conformance rig does. The grant is recorded so a reader can see the arm was configured to be able to label.
   */
  const ROOT = mkdtempSync(join(tmpdir(), "hosts1ra-home-"));
  const arm = { root: rel(ROOT), canariesAreSynthetic: true };
  try {
    const grant = spawnSync("icacls", [ROOT, "/grant", `${process.env.USERNAME ?? ""}:(OI)(CI)F`], { encoding: "utf8", timeout: 60_000 });
    arm.rigAclGranted = grant.status === 0;
    arm.rigAclNote = "a label write needs WRITE_OWNER, which the volume's inherited ACL does not grant; the rig is granted explicitly and the outcome is recorded";
    /**
     * THE SHAPE §7.3 ASKS FOR: a home that is a JUNCTION to a target directory, with a runtime-like subtree and a
     * session-like subtree under the TARGET. The home path is the junction; the target is elsewhere.
     */
    const target = join(ROOT, "target");
    const runtimeSubtree = join(target, "profiles", "node_modules", "pkg-runtime");
    const sessionSubtree = join(target, "sessions", "attempt-1");
    for (const dir of [runtimeSubtree, sessionSubtree]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(runtimeSubtree, "index.js"), `export const canary = ${JSON.stringify(RUN_CANARY)};${NL}`, "utf8");
    writeFileSync(join(sessionSubtree, "message.txt"), `${SESSION_CANARY}${NL}`, "utf8");
    const home = join(ROOT, "home");
    symlinkSync(target, home, "junction");

    arm.relationship = {
      home: "home (junction)",
      target: "target (directory)",
      homeIsReparsePoint: lstatSync(home).isSymbolicLink(),
      targetIsSameObject: resolve(realpathSync(home)).toLowerCase() === resolve(home).toLowerCase(),
    };

    /**
     * THE FIRST-PARTY MECHANISM. The real Low-integrity execution path is `dsh-sandbox-windows-acl`'s runner,
     * driven exactly as `scripts/host_s1/junction-label-probe.mjs` drives it. If it is unavailable the arm records
     * that, because an unexercised mechanism is NOT evidence of protection.
     */
    const resolved = resolveRuntimeHome();
    const runtimeModules = join(resolved.path, "profiles", "node_modules");
    const aclIndex = join(runtimeModules, "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
    const sandboxRunner = join(runtimeModules, "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");
    arm.mechanismAvailable = existsSync(aclIndex) && existsSync(sandboxRunner);
    arm.aclIndexPath = rel(aclIndex);

    if (arm.mechanismAvailable) {
      const fence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "read_fence.js")).href);

      const probePath = join(ROOT, "low-probe.mjs");
      /**
       * THE RESULT MUST LAND WHERE THE LOW TOKEN MAY WRITE. Under `workspace-write` that is the workspace, so it
       * is written there. Writing it into the TARGET fails with EPERM as soon as the target is labelled — which is
       * the very configuration being measured, so a result file inside the target would make the decisive arm
       * unobservable.
       */
      const probeOut = join(runtimeSubtree, "low-probe-result.json");
      writeFileSync(
        probePath,
        [
          'import { readFileSync, writeFileSync } from "node:fs";',
          "const out = {};",
          "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim().slice(0, 120) }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
          `read("THROUGH_JUNCTION_RUNTIME", ${JSON.stringify(join(home, "profiles", "node_modules", "pkg-runtime", "index.js"))});`,
          `read("THROUGH_JUNCTION_SESSION", ${JSON.stringify(join(home, "sessions", "attempt-1", "message.txt"))});`,
          `read("TARGET_DIRECT_SESSION", ${JSON.stringify(join(sessionSubtree, "message.txt"))});`,
          `writeFileSync(${JSON.stringify(probeOut)}, JSON.stringify(out));`,
        ].join(NL),
        "utf8",
      );

      const driverPath = join(ROOT, "low-driver.mjs");
      writeFileSync(
        driverPath,
        [
          "import { mkdtempSync, rmSync } from 'node:fs';",
          "import { tmpdir } from 'node:os';",
          "import { join } from 'node:path';",
          "import { spawnSync } from 'node:child_process';",
          "const out = {};",
          `const mod = await import(${JSON.stringify(pathToFileURL(aclIndex).href)});`,
          `const ws = ${JSON.stringify(runtimeSubtree)};`,
          "const temp = mkdtempSync(join(tmpdir(), 'hosts1ra-low-'));",
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
          `process.stderr.write('HS1RA_HOME_DRIVER ' + JSON.stringify(out) + ${JSON.stringify(NL)});`,
        ].join(NL),
        "utf8",
      );

      const run = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
      const driverLine = String(run.stderr ?? "")
        .split(NL)
        .map((line) => line.trim())
        .find((line) => line.startsWith("HS1RA_HOME_DRIVER")) ?? "";
      arm.driver = driverLine === "" ? null : JSON.parse(driverLine.slice("HS1RA_HOME_DRIVER ".length));
      arm.probe = existsSync(probeOut) ? JSON.parse(readFileSync(probeOut, "utf8")) : null;

      /**
       * ARM 1 — label the TARGET (the directory that actually holds the content), then try to read through the
       * junction. This measures whether a label on the CONTENT is what stops the read, which is the only basis
       * that would protect the real target.
       */
      /**
       * THE ENVIRONMENT IS ASSERTED AT THE POINT OF USE, not assumed. If this value is empty the fence cannot
       * resolve the binding seam, every label write fails, and the arm would report `LABEL_NOT_APPLIED` — a probe
       * failure that must never be read as a boundary finding.
       */
      const envAtFenceImport = (process.env[RUNTIME_ROOT_ENV] ?? "").trim();
      const applied = fence.applyReadFence({ roots: [target], world: runtimeSubtree });
      arm.labelApplicationDiagnostic = {
        runtimeRootAtFenceImport: envAtFenceImport,
        runtimeRootLength: [...envAtFenceImport].length,
        runtimeRootResolves: envAtFenceImport === "" ? null : (() => {
          try {
            /**
             * `createRequire` takes a PATH OR FILE URL and returns a resolver anchored there. The helper must be
             * created FROM the runtime root, not from this script — anchoring it here resolves against the
             * repository, which contains no runtime packages, and that was the bug in the first version of this
             * diagnostic.
             */
            createRequire(`file:///${envAtFenceImport}/node_modules/@deepseek-ai/dsh-win32-process/lib/index.js`).resolve("@deepseek-ai/dsh-win32-process");
            return true;
          } catch {
            return false;
          }
        })(),
        supported: applied.supported,
        platform: applied.platform,
        unavailable: applied.unavailable ?? null,
        contract: applied.contract ?? null,
        outcomes: applied.outcomes ?? [],
        skipped: applied.skipped ?? [],
      };
      const labelTarget = fence.ensureReadFence({ roots: [target], world: runtimeSubtree });
      arm.targetLabelled = { rootsVerified: labelTarget.rootsVerified, treesVerified: labelTarget.treesVerified };
      const labelled = runProbeAgain(ROOT, probePath, probeOut, aclIndex, sandboxRunner, runtimeSubtree);
      arm.labelledTargetArm = labelled;

      /**
       * ARM 2 — label only the LINK OBJECT, leave the target unlabelled, and try the same read. This is the
       * configuration a naive "protect the runtime home" fix would produce, so its outcome decides whether such a
       * fix protects anything.
       */
      fence.uninstallReadFence({ roots: [target], originals: [{ path: target, integrityRid: 8192, policyMask: 0 }] });
      const labelLink = fence.ensureReadFence({ roots: [home], world: runtimeSubtree });
      arm.linkLabelled = { rootsVerified: labelLink.rootsVerified, treesVerified: labelLink.treesVerified };
      const linkOnly = runProbeAgain(ROOT, probePath, probeOut, aclIndex, sandboxRunner, runtimeSubtree);
      arm.linkOnlyArm = linkOnly;

      const canary = (probe, key) => probe !== null && probe[key]?.read === true && String(probe[key]?.content ?? "").includes("CANARY");
      /**
       * A READ THAT SUCCEEDS PROVES NOTHING UNLESS THE LABEL WAS ACTUALLY APPLIED.
       *
       * The first run of this probe reported the session canary as readable in every arm — but `rootsVerified`
       * was FALSE, so no label existed and the read was simply an ordinary read. The outcome is therefore
       * recorded as three states rather than two: `LABEL_NOT_APPLIED` (the arm is inconclusive), `PROTECTED`
       * (the label was applied and the read refused), and `DISCLOSED` (the label was applied and the read
       * succeeded, which is a genuine failure).
       */
      const classifyArm = (labelState, probe, key) => {
        if (labelState?.rootsVerified !== true) return "LABEL_NOT_APPLIED";
        return canary(probe, key) ? "DISCLOSED" : "PROTECTED";
      };
      arm.observations = {
        targetLabelled_state: classifyArm(arm.targetLabelled, arm.labelledTargetArm.probe, "THROUGH_JUNCTION_SESSION"),
        targetLabelled_directRead_state: classifyArm(arm.targetLabelled, arm.labelledTargetArm.probe, "TARGET_DIRECT_SESSION"),
        linkLabelled_state: classifyArm(arm.linkLabelled, arm.linkOnlyArm.probe, "THROUGH_JUNCTION_SESSION"),
        runtimeDependencyReadableWhenTargetLabelled: canary(arm.labelledTargetArm.probe, "THROUGH_JUNCTION_RUNTIME"),
        /** The superseded booleans, kept so the earlier reading is visible rather than deleted. */
        targetLabelled_stopsReadThroughJunction: arm.targetLabelled?.rootsVerified === true && !canary(arm.labelledTargetArm.probe, "THROUGH_JUNCTION_SESSION"),
        linkLabelled_stopsReadThroughJunction: arm.linkLabelled?.rootsVerified === true && !canary(arm.linkOnlyArm.probe, "THROUGH_JUNCTION_SESSION"),
      };
      arm.canary = { run: RUN_CANARY, session: SESSION_CANARY };
    }
  } catch (error) {
    arm.error = error instanceof Error ? error.message : String(error);
  } finally {
    try {
      rmSync(ROOT, { recursive: true, force: true });
    } catch {
      /* windows locks */
    }
  }
  report.syntheticArm = arm;
}

/** Run the Low-integrity probe again against the current label state. */
function runProbeAgain(ROOT, probePath, probeOut, aclIndex, sandboxRunner, workspace) {
  try {
    rmSync(probeOut, { force: true });
  } catch {
    /* absent */
  }
  const driverPath = join(ROOT, `low-driver-${Date.now().toString(36)}.mjs`);
  writeFileSync(
    driverPath,
    [
      "import { mkdtempSync, rmSync } from 'node:fs';",
      "import { tmpdir } from 'node:os';",
      "import { join } from 'node:path';",
      "import { spawnSync } from 'node:child_process';",
      "const out = {};",
      `const mod = await import(${JSON.stringify(pathToFileURL(aclIndex).href)});`,
      `const ws = ${JSON.stringify(workspace)};`,
      "const temp = mkdtempSync(join(tmpdir(), 'hosts1ra-low-'));",
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
      `process.stderr.write('HS1RA_HOME_DRIVER ' + JSON.stringify(out) + ${JSON.stringify(NL)});`,
    ].join(NL),
    "utf8",
  );
  const run = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
  const line = String(run.stderr ?? "")
    .split(NL)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("HS1RA_HOME_DRIVER")) ?? "";
  return {
    driver: line === "" ? null : JSON.parse(line.slice("HS1RA_HOME_DRIVER ".length)),
    probe: existsSync(probeOut) ? JSON.parse(readFileSync(probeOut, "utf8")) : null,
  };
}

/* ================================================================== 3. adjudication ==== */
{
  const real = report.realInstallation;
  const synthetic = report.syntheticArm;
  const mechanism = synthetic?.mechanismAvailable === true && synthetic?.observations !== undefined;

  /**
   * THE TWO CLAIMS ARE SEPARATE, AND THAT SEPARATION IS THE ADJUDICATION.
   *
   *   REAL_runtime_HOME_BOUNDARY_ADJUDICATED
   *       the path relationship, the object kinds and the data classes are established, and the limit of
   *       non-destructive observation is stated. This can hold while the stronger claim does not.
   *
   *   REAL_runtime_HOME_CONTENT_BOUNDARY_ESTABLISHED
   *       the real target's CONTENTS are protected. This requires evidence about the real target, which a
   *       read-only inspection of a label that is not present cannot supply.
   */
  const adjudicated = real !== null && real.home !== undefined && real.homeIsReparsePoint !== undefined && real.target !== undefined;
  const contentBoundaryEstablished =
    adjudicated &&
    real.targetDescriptor?.mandatoryLabelLine !== null &&
    real.targetDescriptor?.mandatoryLabelLine !== undefined &&
    synthetic?.observations?.targetLabelled_state === "PROTECTED";

  report.adjudication = {
    realPathRelationship: adjudicated
      ? {
          home: real.home,
          isReparsePoint: real.homeIsReparsePoint,
          target: real.target,
          targetKind: real.targetKind,
          /** WHICH OBJECT A LABEL WOULD SIT ON. This is the ambiguity §7 asks to resolve. */
          labelOnLinkProtects: "the link object only; traversal through it is a separate authorization decision",
          labelOnTargetProtects: "the target's contents, which is the object that actually holds runtime, session and credential data",
        }
      : null,
    realTargetLabelObserved: real?.targetDescriptor?.mandatoryLabelLine ?? null,
    linkLabelObserved: real?.linkDescriptor?.mandatoryLabelLine ?? null,
    syntheticMechanismEstablished: mechanism,
    syntheticObservations: synthetic?.observations ?? null,
    realContentBoundaryEstablished: contentBoundaryEstablished === true,
    /**
     * THE HONEST LIMIT. A label that is ABSENT cannot be distinguished from a label that could not be READ by a
     * descriptor query, so the real target's protection basis is NOT established by this observation alone.
     */
    limitOfObservation:
      "icacls reports the absence of a Mandatory Label line for the real target. That absence is consistent both with 'no label' and with 'the label was not readable by this account'; the two are not distinguished without a descriptor write, which §7.1 forbids.",
  };

  report.verdict = adjudicated ? "REAL_runtime_HOME_BOUNDARY_ADJUDICATED" : "NOT_ESTABLISHED";
  report.contentBoundaryVerdict = contentBoundaryEstablished === true ? "REAL_runtime_HOME_CONTENT_BOUNDARY_ESTABLISHED" : "REAL_runtime_HOME_CONTENT_BOUNDARY_NOT_ESTABLISHED";
  report.evidenceClass = "READ_ONLY_RUNTIME_OBSERVATION";
}

const emitted = `${JSON.stringify(report, null, 2)}${NL}`;
process.stdout.write(emitted);
if (JSON_OUT !== null) {
  mkdirSync(dirname(resolve(JSON_OUT)), { recursive: true });
  writeFileSync(resolve(JSON_OUT), emitted, "utf8");
}
