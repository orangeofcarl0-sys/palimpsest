#!/usr/bin/env node
/**
 * Host-S1R §4 — REPRODUCE THE NINE CONCERNS AGAINST THE Host-S1 PARENT.
 *
 * Each finding records its source location, the baseline behaviour, the actual input, the observed output, the
 * invariant it violates, its evidence class, whether it was reproduced, and what remains uncertain.
 *
 * NOTHING HERE IS AN EXPLOIT AGAINST REAL CONTENT. Every fixture is test-owned under one `mkdtemp` root, every
 * canary is synthetic, and the only filesystem objects touched are ones this script created.
 *
 * F1 IS AN INSTRUMENTED INTERLEAVING, NOT A SOURCE READING.
 *
 * §4-F1 requires measuring whether a stale observation can make the recovery rename a NEWLY INSTALLED live lock,
 * and whether any interval lets another process acquire the vacated pathname. The parent's recovery is
 * `rename(lockDir -> claimPath)` followed by a token comparison, so the decisive question is what the pathname
 * looks like between those steps. The instrumented `renameSync` below installs a live successor immediately
 * before the recoverer's rename and attempts a third-party acquisition immediately after it, which is the exact
 * interleaving §6.3 describes.
 *
 * F3 IS A REAL TWO-REPOSITORY LOW-TOKEN EXPERIMENT.
 *
 * §5.2 requires two independently allocated repositories, each with its own `.palimpsest`, world and canary, and
 * asks whether a Low token in one can read the other WHILE BOTH ARE ACTIVE. The worlds are made active with the
 * same first-party `AclWriteGrant` the sandbox uses on every confined spawn — that grant is what rewrites a
 * world's label to Low + NO_WRITE_UP, which is the state the capacity limit exists for.
 *
 * Usage:  node scripts/host_s1r/reproduce-concerns.mjs [--json-out <path>] [--only F1,F3]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NL = String.fromCharCode(10);
const argValue = (name) => {
  const prefix = `${name}=`;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  if (inline !== undefined) return inline.slice(prefix.length);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
};
const JSON_OUT = argValue("--json-out");
const ONLY = (argValue("--only") ?? "").split(",").map((entry) => entry.trim()).filter((entry) => entry !== "");

const dshHome = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).split("\\").join("/");
if (process.env.PALIMPSEST_DSH_ROOT === undefined || process.env.PALIMPSEST_DSH_ROOT.trim() === "") {
  process.env.PALIMPSEST_DSH_ROOT = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh").split("\\").join("/");
}
const aclIndex = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "index.js");
const sandboxRunner = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh-sandbox-windows-acl", "lib", "runner.js");

const ROOT = mkdtempSync(join(tmpdir(), "hosts1r-concerns-"));
const CANARY = "HOSTS1R-CONCERN-CANARY-3f91ad07-SYNTHETIC-ONLY";
const findings = [];
const rel = (path) => String(path).slice(ROOT.length + 1).split("\\").join("/");

/** Record one finding in the §4 shape. */
function record(entry) {
  findings.push({ ...entry, reproduced: entry.reproduced === true });
  process.stderr.write(`  · ${entry.id} ${entry.reproduced ? "REPRODUCED" : "not reproduced"} — ${String(entry.observed).slice(0, 150)}${NL}`);
}

const fence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "read_fence.js")).href);
const profile = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "confidential_profile.js")).href);
const label = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "win32_label.js")).href);
/** `win32LabelApi()` returns a RESOLUTION record: the binding table itself is `.api`. */
const labelResolution = label.win32LabelApi();
const api = labelResolution.api;

/** Read one object's mandatory label, or a reason why it could not be read. */
function labelOf(path) {
  if (api === undefined) return { ok: false, detail: labelResolution.error ?? "the label binding table is unavailable" };
  const read = label.readMandatoryLabel(api, path);
  if (!read.ok) return { ok: false, detail: read.detail };
  return { ok: true, present: read.label?.present === true, integrity: read.label?.integrityName ?? null, policies: read.label?.policies ?? [] };
}

const wants = (id) => ONLY.length === 0 || ONLY.includes(id);

try {
  /* ------------------------------------------------------------------ F1 */
  if (wants("F1")) {
    /**
     * THE EXACT INTERLEAVING, IN A BOUNDED CHILD.
     *
     * The parent's recovery loop checks its timeout only on the path where the lock is NOT abandoned. Once it
     * decides `abandoned` it re-enters the loop after the claim step, and a claim path that is still occupied
     * makes every later iteration fail the same way — so the arm is run in a child process with a hard timeout,
     * and the timeout itself is recorded as an observation rather than suffered.
     */
    const home = join(ROOT, "f1-home");
    const slotDir = join(home, "confidential-workers");
    const lockDir = join(slotDir, "active.lock");
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "observed-abandoned", at: 0 }), "utf8");
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockDir, old, old);

    const tracePath = join(ROOT, "f1-trace.json");
    const childPath = join(ROOT, "f1-child.mjs");
    writeFileSync(
      childPath,
      [
        'import fs from "node:fs";',
        'import { syncBuiltinESMExports } from "node:module";',
        'import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";',
        'import { join, resolve } from "node:path";',
        'import { spawnSync } from "node:child_process";',
        'import { pathToFileURL } from "node:url";',
        `const profile = await import(${JSON.stringify(pathToFileURL(join(REPO, "host", "deployment", "runtime", "confidential_profile.js")).href)});`,
        `const home = ${JSON.stringify(home)};`,
        `const lockDir = ${JSON.stringify(lockDir)};`,
        `const tracePath = ${JSON.stringify(tracePath)};`,
        "const trace = { successorInstalled: false, recovererMovedTheSuccessor: false, thirdPartyEntered: false, successorDisplaced: false, completed: false, finalOwnerToken: null };",
        "const flush = () => writeFileSync(tracePath, JSON.stringify(trace), 'utf8');",
        "flush();",
        "const originalRename = fs.renameSync;",
        "let instrumented = false;",
        "fs.renameSync = function (from, to) {",
        "  const f = resolve(String(from)); const t = resolve(String(to));",
        "  if (!instrumented && f.toLowerCase() === lockDir.toLowerCase() && t.includes('.claim-')) {",
        "    instrumented = true;",
        "    /* STEPS 2-3: the old lock is replaced by a NEW LIVE lock installed at the same pathname. */",
        "    rmSync(lockDir, { recursive: true, force: true });",
        "    mkdirSync(lockDir, { recursive: true });",
        "    writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, token: 'successor-live', at: Date.now() }), 'utf8');",
        "    trace.successorInstalled = true; flush();",
        "    /* STEP 4: the recoverer acts on its STALE observation. */",
        "    originalRename.call(this, from, to);",
        "    trace.recovererMovedTheSuccessor = true; flush();",
        "    /* STEP 5: a fourth process attempts to acquire during the resulting interval. */",
        "    const third = spawnSync(process.execPath, ['-e', `const fs = require('node:fs'); try { fs.mkdirSync(${JSON.stringify(lockDir)}); fs.writeFileSync(${JSON.stringify(join(lockDir, 'owner.json'))}, JSON.stringify({ pid: process.pid, token: 'third-party', at: Date.now() })); process.stdout.write('ENTERED'); } catch (e) { process.stdout.write('BLOCKED:' + (e.code ?? String(e))); }`], { encoding: 'utf8' });",
        "    trace.thirdPartyEntered = String(third.stdout ?? '').trim() === 'ENTERED';",
        "    trace.successorDisplaced = trace.successorInstalled && trace.thirdPartyEntered;",
        "    flush();",
        "    return undefined;",
        "  }",
        "  return originalRename.call(this, from, to);",
        "};",
        "syncBuiltinESMExports();",
        "const slot = profile.openConfidentialSlot({ home, lockStaleMs: 1, lockTimeoutMs: 120 });",
        "const acquired = slot.acquire();",
        "trace.completed = true;",
        "trace.acquireGranted = acquired.granted === true;",
        "try { trace.finalOwnerToken = JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8')).token ?? null; } catch { trace.finalOwnerToken = null; }",
        "flush();",
      ].join(NL),
      "utf8",
    );

    const childRun = spawnSync(process.execPath, [childPath], { encoding: "utf8", timeout: 25_000, stdio: ["ignore", "pipe", "pipe"] });
    const timedOut = childRun.error?.code === "ETIMEDOUT" || childRun.signal === "SIGTERM" || childRun.status === null;
    const trace = fs.existsSync(tracePath) ? JSON.parse(readFileSync(tracePath, "utf8")) : {};
    /** What the pathname holds after the child stopped, whatever state it stopped in. */
    let finalOwner = null;
    try {
      finalOwner = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8")).token ?? null;
    } catch {
      finalOwner = null;
    }

    record({
      id: "F1",
      title: "Rename-before-verify exclusivity: a stale observation moves a newly installed live lock, and the recovery then livelocks",
      source: "host/deployment/runtime/confidential_profile.js :: takeLock() (recovery branch)",
      baselineBehavior:
        "Recovery reads the lock's owner, decides it is abandoned, then renames the PATHNAME to a private claim and verifies the token AFTERWARDS. The rename is unconditional on identity, so the object moved may be a successor installed after the observation. The claim name is `active.lock.claim-<ownerToken>`, deterministic per process, and the loop's timeout check is skipped on the abandoned path, so a second pass that collides with its own leftover claim does not terminate.",
      actualInput: {
        plantedLock: { owner: "observed-abandoned", pid: 999999999, ageMs: 600_000 },
        interleaving: "a live successor (pid = recoverer process) installed immediately before the recoverer's rename; a third process attempts mkdir immediately after it",
        bound: "25s child-process timeout",
      },
      observed: {
        successorInstalledBeforeRecoveryRename: trace.successorInstalled === true,
        recovererMovedTheSuccessor: trace.recovererMovedTheSuccessor === true,
        thirdPartyAcquiredTheVacatedPathname: trace.thirdPartyEntered === true,
        successorDisplacedFromPathname: trace.successorDisplaced === true,
        childCompleted: trace.completed === true,
        childTimedOut: timedOut,
        childExitCode: childRun.status,
        finalPathnameOwnerToken: finalOwner,
      },
      invariant: "At any instant within the exclusion domain, at most one owner holds execution authority, and a live owner's lock is never moved or deleted by a process acting on a different observation.",
      evidenceClass: "DYNAMIC_UNIT_VERIFIED",
      reproduced: trace.recovererMovedTheSuccessor === true,
      violatesExclusivity: trace.thirdPartyEntered === true,
      additionalDefect: timedOut ? "the recovery did not terminate within the bound after colliding with its own claim path" : null,
      uncertain: "The successor here is a synthetic holder record, not a second real host process; what is demonstrated is that the object at the pathname can be replaced between observation and removal, which is the property, not the process identity.",
    });
  }

  /* ------------------------------------------------------------------ F2 */
  if (wants("F2")) {
    const home = join(ROOT, "f2-home");
    const slotDir = join(home, "confidential-workers");
    mkdirSync(slotDir, { recursive: true });
    const slotPath = join(slotDir, "active.json");
    const observations = {};

    /** (a) a malformed holder entry */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: "not-a-pid", token: "x" }] }), "utf8");
    const malformedAcquire = profile.openConfidentialSlot({ home, lockTimeoutMs: 150 }).acquire();
    observations.malformedAcquire = { granted: malformedAcquire.granted, detail: String(malformedAcquire.detail).slice(0, 140) };
    observations.malformedBytesPreserved = readFileSync(slotPath, "utf8");

    /** (b) an unreadable record during release, with an unrelated live holder present */
    writeFileSync(slotPath, "{ this is not json", "utf8");
    const unreadableSlot = profile.openConfidentialSlot({ home, lockTimeoutMs: 150 });
    observations.unreadablePeek = unreadableSlot.peek();
    observations.unreadableBytesPreserved = readFileSync(slotPath, "utf8");

    /** (c) release by a handle that recorded a different token */
    writeFileSync(slotPath, JSON.stringify({ holders: [{ pid: process.pid, token: "someone-else", at: 0 }] }), "utf8");
    const stranger = profile.openConfidentialSlot({ home, lockTimeoutMs: 150 });
    observations.strangerRelease = stranger.release();
    observations.strangerBytesPreserved = readFileSync(slotPath, "utf8");

    /** (d) a successful release must not erase an unrelated holder */
    /** Clear the record the previous arms left behind, so the grant below measures RELEASE and not capacity. */
    writeFileSync(slotPath, JSON.stringify({ holders: [] }), "utf8");
    const holderSlot = profile.openConfidentialSlot({ home, lockTimeoutMs: 200 });
    const granted = holderSlot.acquire();
    /**
     * PLANT THE UNRELATED HOLDER AFTER THE GRANT, not before. Writing it first would occupy the single slot and
     * make the acquisition refuse — the arm would then measure capacity, not release.
     */
    const ownRecord = JSON.parse(readFileSync(slotPath, "utf8")).holders.filter((entry) => entry.token !== undefined);
    writeFileSync(
      slotPath,
      JSON.stringify({ holders: [...ownRecord, { pid: process.pid, token: "unrelated-live", at: 0 }] }),
      "utf8",
    );
    const released = holderSlot.release();
    const after = JSON.parse(readFileSync(slotPath, "utf8")).holders.map((entry) => entry.token);
    observations.selfRelease = { granted: granted.granted, released: released.released, remainingTokens: after };

    /**
     * (e) A FAILED RECORD WRITE DURING RELEASE.
     *
     * §6.6 requires that a failed write must not falsely mark the handle released, and that retryability must
     * reflect actual ownership. The release sets `held = false` BEFORE it writes the reduced holder set, so a
     * write that throws leaves the handle claiming it holds nothing while its record is still on disk — a retry
     * then refuses with "this holds no slot" and the stale record blocks capacity forever.
     *
     * The failure is injected at the filesystem boundary (`writeFileSync` for the temp record), which is the
     * narrowest seam that reproduces a disk-full or permission-denied condition without touching real state.
     */
    writeFileSync(slotPath, JSON.stringify({ holders: [] }), "utf8");
    const failingSlot = profile.openConfidentialSlot({ home, lockTimeoutMs: 200 });
    const failingGrant = failingSlot.acquire();
    const originalWriteFileSync = fs.writeFileSync;
    let writeInjected = false;
    fs.writeFileSync = function (target, ...rest) {
      if (!writeInjected && String(target).includes("active.json") && String(target).endsWith(".tmp")) {
        writeInjected = true;
        const error = new Error("injected ENOSPC");
        error.code = "ENOSPC";
        throw error;
      }
      return originalWriteFileSync.call(this, target, ...rest);
    };
    syncBuiltinESMExports();
    let failingRelease = null;
    let releaseThrew = null;
    try {
      failingRelease = failingSlot.release();
    } catch (error) {
      releaseThrew = String(error?.code ?? error?.message ?? error);
    } finally {
      fs.writeFileSync = originalWriteFileSync;
      syncBuiltinESMExports();
    }
    /** The retry is the property under test: the handle must still be able to release its own record. */
    const retry = failingSlot.release();
    const recordAfterFailedRelease = (() => {
      try {
        return JSON.parse(readFileSync(slotPath, "utf8")).holders.map((entry) => entry.token);
      } catch {
        return null;
      }
    })();
    observations.failedWriteDuringRelease = {
      granted: failingGrant.granted,
      writeFailureInjected: writeInjected,
      releaseResult: failingRelease,
      releaseThrew,
      retryResult: retry,
      holdersAfterFailedRelease: recordAfterFailedRelease,
    };

    const defects = [];
    if (malformedAcquire.granted === true) defects.push("a malformed holder was treated as free capacity");
    if (observations.unreadableBytesPreserved !== "{ this is not json") defects.push("an unreadable record was rewritten");
    if (observations.strangerRelease.released === true) defects.push("a non-owner release removed a holder");
    if (!after.includes("unrelated-live")) defects.push("a release erased an unrelated holder");
    if (failingRelease?.released === true) defects.push("a failed record write reported the slot released");
    if (retry?.released !== true) defects.push("a retry after a failed write could not release the handle's own record");

    record({
      id: "F2",
      title: "Release recovery and unknown ownership",
      source: "host/deployment/runtime/confidential_profile.js :: readHolders(), acquire(), release()",
      baselineBehavior:
        "Malformed entries are classified before liveness; an unreadable record refuses acquisition and release; release removes only its own token and preserves the rest.",
      actualInput: { malformed: "pid is a string", unreadable: "invalid JSON", strangerToken: "someone-else", unrelatedToken: "unrelated-live" },
      observed: observations,
      invariant: "Unknown ownership never becomes free capacity; a failed read never authorises rewriting an empty holder set; a release removes only the releasing handle's verified record.",
      evidenceClass: "DYNAMIC_UNIT_VERIFIED",
      reproduced: defects.length > 0,
      defects,
      uncertain: "A genuinely failed record WRITE (as opposed to an unreadable record) is exercised in the capacity suite with an injected filesystem boundary, not here.",
    });
  }

  /* ------------------------------------------------------------------ F3 */
  if (wants("F3")) {
    const experiment = { aclAvailable: fs.existsSync(aclIndex) && fs.existsSync(sandboxRunner) };
    const repoA = join(ROOT, "f3-repo-a");
    const repoB = join(ROOT, "f3-repo-b");
    const worldA = join(repoA, ".palimpsest", "worlds", "attempt-A");
    const worldB = join(repoB, ".palimpsest", "worlds", "attempt-A");
    for (const dir of [worldA, worldB]) mkdirSync(dir, { recursive: true });
    mkdirSync(join(repoA, ".palimpsest", "durable-state"), { recursive: true });
    mkdirSync(join(repoB, ".palimpsest", "durable-state"), { recursive: true });
    writeFileSync(join(worldA, "in-world.txt"), "WORLD-A-ORDINARY-WORK" + NL, "utf8");
    writeFileSync(join(worldB, "in-world.txt"), "WORLD-B-ORDINARY-WORK" + NL, "utf8");
    writeFileSync(join(worldB, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");
    writeFileSync(join(repoB, ".palimpsest", "durable-state", "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");

    /** Each repository is fenced exactly as a production host would fence it. */
    const fenceA = fence.applyReadFence({ roots: [join(repoA, ".palimpsest")], world: worldA });
    const fenceB = fence.applyReadFence({ roots: [join(repoB, ".palimpsest")], world: worldB });
    experiment.fenceA = { supported: fenceA.supported, complete: fenceA.coverage?.complete === true };
    experiment.fenceB = { supported: fenceB.supported, complete: fenceB.coverage?.complete === true };

    if (!experiment.aclAvailable) {
      record({
        id: "F3",
        title: "Cross-repository capacity scope",
        source: "host/deployment/runtime/confidential_profile.js :: openConfidentialSlot() slot namespace",
        baselineBehavior: "The slot lives at <repository>/.palimpsest/host-capacity/, so two repositories hold two independent slots.",
        actualInput: { repositories: 2 },
        observed: { blocker: "the DSH Windows sandbox runner is not present, so no Low token could be created" },
        invariant: "No two Confidential Workers that lack mutual read isolation may simultaneously hold execution authority.",
        evidenceClass: "NOT_ESTABLISHED",
        reproduced: false,
        uncertain: "The experiment could not run.",
      });
    } else {
      /**
       * BOTH WORLDS ACTIVE. The write grant is the same call the sandbox makes on every confined spawn, and it
       * is the last writer of the world's label — that is why two ACTIVE worlds cannot both stay fenced.
       */
      const driverPath = join(ROOT, "f3-driver.mjs");
      const probePath = join(ROOT, "f3-low-probe.mjs");
      const probeOut = join(worldA, "f3-result.json");
      writeFileSync(
        probePath,
        [
          'import { readFileSync, writeFileSync } from "node:fs";',
          "const out = {};",
          "const read = (name, p) => { try { out[name] = { read: true, content: readFileSync(p, 'utf8').trim() }; } catch (e) { out[name] = { read: false, code: e?.code ?? String(e) }; } };",
          `read("OWN_WORLD", ${JSON.stringify(join(worldA, "in-world.txt"))});`,
          `read("OTHER_REPO_WORLD", ${JSON.stringify(join(worldB, "synthetic-canary.txt"))});`,
          `read("OTHER_REPO_DURABLE", ${JSON.stringify(join(repoB, ".palimpsest", "durable-state", "synthetic-canary.txt"))});`,
          `writeFileSync(${JSON.stringify(probeOut)}, JSON.stringify(out));`,
        ].join(NL),
        "utf8",
      );
      writeFileSync(
        driverPath,
        [
          "import { mkdtempSync, rmSync } from 'node:fs';",
          "import { tmpdir } from 'node:os';",
          "import { join } from 'node:path';",
          "import { spawnSync } from 'node:child_process';",
          "const out = {};",
          `const mod = await import(${JSON.stringify(pathToFileURL(aclIndex).href)});`,
          `const worldA = ${JSON.stringify(worldA)};`,
          `const worldB = ${JSON.stringify(worldB)};`,
          "const temp = mkdtempSync(join(tmpdir(), 'hosts1r-low-'));",
          "const grants = [];",
          "try {",
          "  const tempSid = mod.tempWriteSid(temp);",
          "  const gt = mod.AclWriteGrant.create(tempSid); gt.add(temp, false); grants.push(gt);",
          "  /* BOTH WORLDS GET THE WRITE GRANT: both are ACTIVE at the same time. */",
          "  for (const w of [worldA, worldB]) { const sid = mod.workspaceWriteSid(w); const g = mod.AclWriteGrant.create(sid); g.add(w, true); grants.push(g); }",
          `  const sidA = mod.workspaceWriteSid(worldA);`,
          `  const r = spawnSync(process.execPath, [${JSON.stringify(sandboxRunner)}, '--workspace', worldA, '--temp', temp, '--mode', 'workspace-write', '--write-sid', sidA, '--temp-write-sid', tempSid, '--', process.execPath, ${JSON.stringify(probePath)}], { encoding: 'utf8', timeout: 240_000 });`,
          "  out.status = r.status; out.stderr = String(r.stderr ?? '').slice(0, 400);",
          "} catch (e) { out.error = e?.message ?? String(e); }",
          "finally { for (const g of grants) { try { g.dispose(); } catch {} } try { rmSync(temp, { recursive: true, force: true }); } catch {} }",
          `process.stderr.write('S1R_F3 ' + JSON.stringify(out) + ${JSON.stringify(NL)});`,
        ].join(NL),
        "utf8",
      );

      /** Label state of each world BEFORE the grants, so the change is attributable. */
      experiment.labelBeforeGrants = { worldA: labelOf(worldA), worldB: labelOf(worldB) };
      const driverRun = spawnSync(process.execPath, [driverPath], { encoding: "utf8", timeout: 300_000, stdio: ["ignore", "pipe", "pipe"] });
      const driverLine = (driverRun.stderr ?? "").split(NL).map((line) => line.trim()).find((line) => line.startsWith("S1R_F3")) ?? "";
      experiment.driver = driverLine === "" ? null : JSON.parse(driverLine.slice("S1R_F3 ".length));
      /** AFTER the grants, both worlds are in the state a running worker leaves them in. */
      experiment.labelAfterGrants = { worldA: labelOf(worldA), worldB: labelOf(worldB) };
      const probe = fs.existsSync(probeOut) ? JSON.parse(readFileSync(probeOut, "utf8")) : null;
      experiment.probe = probe;
      const leakedWorld = typeof probe?.OTHER_REPO_WORLD?.content === "string" && probe.OTHER_REPO_WORLD.content.includes(CANARY);
      const leakedDurable = typeof probe?.OTHER_REPO_DURABLE?.content === "string" && probe.OTHER_REPO_DURABLE.content.includes(CANARY);
      const ownUsable = probe?.OWN_WORLD?.read === true;
      experiment.otherWorldReadable = leakedWorld;
      experiment.otherDurableReadable = leakedDurable;

      record({
        id: "F3",
        title: "Cross-repository capacity scope: two ACTIVE worlds in different repositories",
        source: "host/deployment/runtime/confidential_profile.js :: openConfidentialSlot() domain namespace",
        baselineBehavior:
          "The slot is keyed by <repository>/.palimpsest/host-capacity/, so two repositories never contend. The design assumes a repository is the confidentiality domain.",
        actualInput: { repositories: [rel(repoA), rel(repoB)], bothWorldsActive: true, canary: "synthetic, in repo B" },
        observed: experiment,
        invariant: "No two Confidential Workers that lack mutual read isolation may simultaneously acquire execution authority; the exclusion scope must match the actual isolation scope.",
        evidenceClass: leakedWorld ? "FIRST_PARTY_DSH_VERIFIED" : "DYNAMIC_UNIT_VERIFIED",
        reproduced: leakedWorld === true,
        ownWorldUsable: ownUsable,
        uncertain:
          "The probe runs under the real DSH ACL sandbox with both worlds granted, which is the measured ACTIVE state; it does not run two full agent sessions concurrently.",
      });
    }
  }

  /* ------------------------------------------------------------------ F4 */
  if (wants("F4")) {
    const root = join(ROOT, "f4-protected");
    const outside = join(ROOT, "f4-outside");
    mkdirSync(root, { recursive: true });
    mkdirSync(outside, { recursive: true });
    writeFileSync(join(outside, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");
    writeFileSync(join(root, "ordinary.txt"), "ordinary protected content" + NL, "utf8");

    /**
     * THE FIXTURE QUESTION, MEASURED RATHER THAN ASSUMED.
     *
     * §4-F4 asks for a symbolic link to a FILE outside the protected tree, and requires a LIMIT when Windows
     * cannot create it. On this host a FILE symlink is refused with EPERM (the privilege is not held and
     * Developer Mode is off), and a `junction` aimed at a file is created but is a BROKEN link — it resolves to
     * ENOENT, so it is not a link to readable external content and cannot demonstrate a bypass.
     *
     * What IS reachable is a DIRECTORY junction, whose `statSync` reports a directory and therefore does reach
     * the reparse classification. That asymmetry is exactly the ordering under test: the classification is gated
     * on `stats.isDirectory()`, so the class of link whose target is a file is gated OUT before it is classified.
     */
    const fixtures = {};
    const tryLink = (name, target, type) => {
      try {
        fs.symlinkSync(target, join(root, name), type);
        return { created: true };
      } catch (error) {
        return { created: false, code: String(error?.code ?? error) };
      }
    };
    fixtures.fileSymlink = tryLink("file-link.txt", join(outside, "synthetic-canary.txt"), "file");
    fixtures.junctionToFile = tryLink("junction-file.txt", join(outside, "synthetic-canary.txt"), "junction");
    fixtures.directoryJunction = tryLink("dir-link", outside, "junction");

    const identity = (name) => {
      const path = join(root, name);
      const result = {};
      try {
        const l = fs.lstatSync(path);
        result.lstatIsSymbolicLink = l.isSymbolicLink();
      } catch (error) {
        result.lstat = `ERR:${String(error?.code ?? error)}`;
      }
      try {
        const s = fs.statSync(path);
        result.statIsDirectory = s.isDirectory();
        result.statIsFile = s.isFile();
      } catch (error) {
        result.stat = `ERR:${String(error?.code ?? error)}`;
      }
      return result;
    };
    fixtures.junctionToFileIdentity = identity("junction-file.txt");
    fixtures.directoryJunctionIdentity = identity("dir-link");

    const world = join(ROOT, "f4-world");
    mkdirSync(world, { recursive: true });
    const applied = fence.applyReadFence({ roots: [root], world });
    const tree = fence.verifyTree({ root });

    /**
     * THE ORDERING, READ FROM THE SHIPPED SOURCE. `statSync` precedes the `isDirectory()` early return and
     * `lstatSync` follows it, so a link whose target is a FILE never reaches the classification.
     */
    const fenceSource = readFileSync(join(REPO, "host", "deployment", "runtime", "read_fence.js"), "utf8");
    const statBeforeGate = /stats = statSync\(path\);[\s\S]{0,500}?if \(!stats\.isDirectory\(\)\) return;/u.test(fenceSource);
    const lstatAfterGate = /if \(!stats\.isDirectory\(\)\) return;[\s\S]{0,700}?linkStats = lstatSync\(path\);/u.test(fenceSource);

    record({
      id: "F4",
      title: "File-directed links are gated out before reparse classification",
      source: "host/deployment/runtime/read_fence.js :: verifyTree() — `statSync` then `if (!stats.isDirectory()) return;` then `lstatSync`",
      baselineBehavior:
        "The walk stats an entry and RETURNS when it is not a directory, so the lstat-based reparse classification below is never reached for a link whose target is a file. A DIRECTORY junction does reach it, so the omission is specific to the file-target class.",
      actualInput: {
        fixtures,
        note: "a file symlink is refused (EPERM) here; a junction aimed at a file creates a BROKEN link (statSync ENOENT)",
      },
      observed: {
        fileSymlinkCreatable: fixtures.fileSymlink.created === true,
        fileSymlinkCode: fixtures.fileSymlink.code ?? null,
        junctionToFileCreated: fixtures.junctionToFile.created === true,
        junctionToFileIdentity: fixtures.junctionToFileIdentity,
        directoryJunctionIdentity: fixtures.directoryJunctionIdentity,
        statBeforeDirectoryGate: statBeforeGate,
        lstatAfterDirectoryGate: lstatAfterGate,
        reparsePoints: tree.reparsePoints.map(rel),
        reparseOutsideProtectionDomain: tree.reparseOutsideProtectionDomain.map(rel),
        undetermined: tree.undetermined.map(rel),
        complete: tree.complete,
        verified: tree.verified,
        admissionEligible: tree.admissionEligible,
        rootCoverageComplete: applied.coverage?.complete === true,
        linkObjectLabel: labelOf(join(root, "dir-link")),
        linkTargetLabel: labelOf(join(outside, "synthetic-canary.txt")),
      },
      invariant: "Every reparse point inside a protected tree is classified by its target, whatever the target's type; a link to content outside the protection domain is never silently counted as covered.",
      evidenceClass: fixtures.fileSymlink.created === true ? "DYNAMIC_UNIT_VERIFIED" : "SOURCE_DEMONSTRATED",
      reproduced: statBeforeGate === true && lstatAfterGate === true,
      fixtureLimit:
        fixtures.fileSymlink.created !== true
          ? `a file-directed symlink could not be created on this host (${String(fixtures.fileSymlink.code)}), so the FILE-link case is SOURCE_DEMONSTRATED rather than dynamically exercised`
          : null,
      uncertain:
        "Whether a Low token could READ through a file-directed link is not measurable here, because no such fixture can be created. What is established is that the code would not classify it at all.",
    });
  }

  /* ------------------------------------------------------------------ F5 */
  if (wants("F5")) {
    const rootA = join(ROOT, "f5-root-a");
    const rootB = join(ROOT, "f5-root-b");
    mkdirSync(rootA, { recursive: true });
    mkdirSync(rootB, { recursive: true });
    writeFileSync(join(rootA, "ordinary.txt"), "a" + NL, "utf8");
    writeFileSync(join(rootB, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");
    /** A junction from A into B, where B is DECLARED but never verified. */
    fs.symlinkSync(rootB, join(rootA, "into-b"), "junction");
    /**
     * A IS FENCED, B IS NOT. A must be labelled first, otherwise `noUnprotectedEntryFound` is false for a
     * trivial reason (A's own ordinary file is unlabelled) and the finding would pass for the wrong reason.
     */
    const world = join(ROOT, "f5-world");
    mkdirSync(world, { recursive: true });
    const appliedA = fence.applyReadFence({ roots: [rootA], world });
    const tree = fence.verifyTree({ root: rootA, protectedRoots: [rootA, rootB] });

    record({
      id: "F5",
      title: "A declared protected root is treated as a verified protection outcome",
      source: "host/deployment/runtime/read_fence.js :: verifyTree() — `reparseIntoProtectedRoot` uses `input.protectedRoots`",
      baselineBehavior:
        "A link whose target lies under any DECLARED protected root is classified as `reparseIntoProtectedRoot` and excluded from the unresolvable set, so it never makes the walk fail. The declaration is not evidence that the target object carries a verified label.",
      actualInput: { rootA: rel(rootA), rootB: rel(rootB), declaredRoots: [rel(rootA), rel(rootB)], rootBVerified: false },
      observed: {
        rootALabelled: appliedA.coverage?.complete === true,
        reparseIntoProtectedRoot: tree.reparseIntoProtectedRoot.map(rel),
        reparseOutsideProtectionDomain: tree.reparseOutsideProtectionDomain.map(rel),
        admissionEligible: tree.admissionEligible,
        targetLabel: labelOf(join(rootB, "synthetic-canary.txt")),
        rootBLabel: labelOf(rootB),
      },
      invariant: "A path being inside a DECLARED root is not sufficient; the protection basis must be an actual verified Kernel label on the target.",
      evidenceClass: "DYNAMIC_UNIT_VERIFIED",
      reproduced: tree.admissionEligible === true && labelOf(rootB).present !== true,
      uncertain: "The target here is unlabelled because it was never planned; the same classification would occur if labelling had been attempted and failed, which is the case that matters.",
    });
  }

  /* ------------------------------------------------------------------ F6 */
  if (wants("F6")) {
    const root = join(ROOT, "f6-protected");
    const external = join(ROOT, "f6-external");
    mkdirSync(root, { recursive: true });
    mkdirSync(external, { recursive: true });
    writeFileSync(join(root, "ordinary.txt"), "a" + NL, "utf8");
    writeFileSync(join(external, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");
    fs.symlinkSync(external, join(root, "to-external"), "junction");
    /** Label the root FIRST, so `admissionEligible` can only be false for the reason under test. */
    const world = join(ROOT, "f6-world");
    mkdirSync(world, { recursive: true });
    const applied = fence.applyReadFence({ roots: [root], world });
    const tree = fence.verifyTree({ root });

    record({
      id: "F6",
      title: "An unknown external reparse target receives an unconditional positive qualification",
      source: "host/deployment/runtime/read_fence.js :: verifyTree() — `admissionEligible` requires only `reparseUnresolvable.length === 0`",
      baselineBehavior:
        "A link that RESOLVES but points outside every protected root is recorded as `reparseOutsideProtectionDomain` and leaves `admissionEligible` true. Nothing distinguishes a qualified DSH dependency from an unknown external path or model-controlled content.",
      actualInput: { link: "junction -> an arbitrary directory outside every protected root, containing a synthetic canary" },
      observed: {
        reparseBasis: tree.reparseBasis,
        reparseOutsideProtectionDomain: tree.reparseOutsideProtectionDomain.map(rel),
        admissionEligible: tree.admissionEligible,
        coverageComplete: applied.coverage?.complete === true,
        targetLabel: labelOf(join(external, "synthetic-canary.txt")),
        linkObjectLabel: labelOf(join(root, "to-external")),
      },
      invariant: "An unknown or mutable target must not receive an unconditional positive qualification; the exception must be a qualified, identified dependency contract.",
      evidenceClass: "DYNAMIC_UNIT_VERIFIED",
      reproduced: tree.admissionEligible === true && tree.reparseOutsideProtectionDomain.length > 0,
      uncertain: "The measured fact that a labelled junction still delivers its target's bytes to a Low token is in junction-label-probe.mjs; this finding is about ADMISSION, not the read.",
    });
  }

  /* ------------------------------------------------------------------ F7 */
  if (wants("F7")) {
    /**
     * A STALE SUCCESS-SHAPED REPORT. The parent's generator reads fixed paths under USERPROFILE and records
     * `read: true` plus a pass count, with no Code Freeze, run id or command identity in the receipt.
     */
    const stalePath = join(ROOT, "stale-conformance", "conformance.json");
    mkdirSync(dirname(stalePath), { recursive: true });
    writeFileSync(
      stalePath,
      JSON.stringify({ results: [{ id: "HR-01", statement: "stale", pass: true }, { id: "HR-02", statement: "stale", pass: true }], limits: [], failed: [] }),
      "utf8",
    );
    const source = readFileSync(join(REPO, "scripts", "host_s1", "generate-evidence.mjs"), "utf8");
    const usesFixedHomePaths = /join\(process\.env\.USERPROFILE \?\? "", "\.palimpsest-r1hr"/u.test(source);
    /** Reproduce the loader's own admission decision against the stale file. */
    const raw = readFileSync(stalePath, "utf8");
    const parsed = JSON.parse(raw);
    const checks = Array.isArray(parsed.checks) ? parsed.checks : Array.isArray(parsed.results) ? parsed.results : [];
    const limitSet = new Set((parsed.limits ?? []).map((entry) => (typeof entry === "string" ? entry : entry?.id)));
    const failureSet = new Set((parsed.failed ?? []).map((entry) => (typeof entry === "string" ? entry : entry?.id)));
    const passed = checks.filter((entry) => entry.pass === true && !limitSet.has(entry.id) && !failureSet.has(entry.id)).length;
    const admittedAsCurrent = { read: true, pass: passed, fail: 0, total: checks.length };

    record({
      id: "F7",
      title: "Conformance evidence is loaded from fixed user directories with no run relationship",
      source: "scripts/host_s1/generate-evidence.mjs :: conformance block (paths under USERPROFILE)",
      baselineBehavior:
        "The generator reads `<USERPROFILE>/.palimpsest-r1hr/conformance/conformance.json` and `.palimpsest-r1hc/...` and admits them with `read: true` and a pass count. The receipt carries no Code Freeze HEAD, run id, command, exit code or artifact digest, so a report from any earlier run is admitted identically.",
      actualInput: { staleReport: rel(stalePath), content: "two passing checks, no run identity", usesFixedHomePaths },
      observed: { usesFixedHomePaths, admittedAsCurrent, receiptFields: ["path", "read", "digest", "pass", "limit", "fail", "total"] },
      invariant: "Current-run conformance must be tied to the Code Freeze and the executed command; a historical report may be used for comparison, never as unqualified current execution evidence.",
      evidenceClass: "SOURCE_DEMONSTRATED",
      reproduced: usesFixedHomePaths === true && admittedAsCurrent.pass === 2,
      uncertain: "The demonstration replays the loader's admission logic rather than invoking the whole generator; the negative controls in C4 exercise the corrected gate end to end.",
    });
  }

  /* ------------------------------------------------------------------ F8 */
  if (wants("F8")) {
    const source = readFileSync(join(REPO, "scripts", "host_s1", "generate-evidence.mjs"), "utf8");
    const exitLine = source.split(NL).find((line) => line.includes("process.exit(")) ?? "";
    const suiteVerdict = source.split(NL).find((line) => line.includes('observedVerdict: report === null')) ?? "";
    const suiteIgnoresExit = /observedVerdict: report === null \? "MISSING" : failed === 0 && passed > 0 \? "PASS" : "FAIL"/u.test(source);
    const finalExitIgnoresVerdicts = /process\.exit\(producersOk && suitesOk \? 0 : 1\)/u.test(source);
    /**
     * `runSuite` decides PASS from `failed === 0 && passed > 0` and never consults `result.status`. A process
     * that exits nonzero after its tests pass, or that exits zero having executed zero tests, is therefore
     * summarised from the JSON alone.
     */
    const skippedTreatedAsExecuted = /const skipped = tests\.filter/u.test(source) && !/skipped > 0/u.test(source);

    record({
      id: "F8",
      title: "The final exit code and suite verdicts are not driven by the qualification result",
      source: "scripts/host_s1/generate-evidence.mjs :: runSuite() and the final process.exit()",
      baselineBehavior:
        "`runSuite` computes PASS from the JSON report alone and ignores the child's exit code; skipped tests are counted but never block PASS; the final `process.exit` depends on producer and suite verdicts only, never on the derived final verdicts.",
      actualInput: { exitLine, suiteVerdictLine: suiteVerdict },
      observed: { suiteIgnoresExit, finalExitIgnoresVerdicts, skippedTreatedAsExecuted },
      invariant: "RequiredVerdict NOT_ESTABLISHED => nonzero qualification exit; a nonzero child exit, a missing report, zero executed tests or a required skip is never PASS.",
      evidenceClass: "SOURCE_DEMONSTRATED",
      reproduced: finalExitIgnoresVerdicts === true && suiteIgnoresExit === true,
      uncertain: "The negative controls are built and run in C4; this finding records the baseline control flow.",
    });
  }

  /* ------------------------------------------------------------------ F9 */
  if (wants("F9")) {
    /** A skipped ancestor whose ONLY non-spine content is the active world itself. */
    const repository = join(ROOT, "f9-repo");
    const palimpsest = join(repository, ".palimpsest");
    const worlds = join(palimpsest, "worlds");
    const active = join(worlds, "attempt-A");
    mkdirSync(active, { recursive: true });
    const plan = fence.planReadFence({ roots: [palimpsest], world: active });
    const applied = fence.applyReadFence({ roots: [palimpsest], world: active });
    const coverage = applied.coverage ?? {};

    record({
      id: "F9",
      title: "A fully enumerated skipped ancestor containing only the active world is refused",
      source: "host/deployment/runtime/read_fence.js :: coverageOf() — `skippedWithoutDerivedCoverage` from an empty derived list",
      baselineBehavior:
        "`coverageOf` marks any skipped ancestor with no derived roots as `skippedWithoutDerivedCoverage`, so `complete` is false even when the derivation enumerated every level and found nothing but the spine.",
      actualInput: { layout: ".palimpsest/worlds/attempt-A, with no sibling worlds and no durable state", planComplete: plan.skipped[0]?.planComplete },
      observed: {
        planComplete: plan.skipped[0]?.planComplete ?? null,
        spine: (plan.skipped[0]?.spine ?? []).map(rel),
        derivedRoots: plan.derivedRoots.map((entry) => rel(entry.path)),
        unresolved: plan.unresolved.map(rel),
        skippedWithoutDerivedCoverage: (coverage.skippedWithoutDerivedCoverage ?? []).map(rel),
        incompletePlans: (coverage.incompletePlans ?? []).map(rel),
        coverageComplete: coverage.complete === true,
        rootsVerified: applied.outcomes?.every((entry) => entry.verified === true) ?? false,
      },
      invariant: "Security failure and overconservative refusal must remain distinguishable: an ancestor that was fully enumerated and genuinely contains only the authorized world is not a confidentiality violation.",
      evidenceClass: "DYNAMIC_UNIT_VERIFIED",
      reproduced: coverage.complete === false && (plan.skipped[0]?.planComplete === true) && plan.unresolved.length === 0,
      uncertain: "Whether the refusal is acceptable as a permanent conservative policy is a product decision; §7.5 asks only that it be distinguishable from a security failure.",
    });
  }
} catch (error) {
  findings.push({ id: "HARNESS", error: error instanceof Error ? `${error.message}${NL}${error.stack ?? ""}` : String(error) });
} finally {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
}

const reproducedIds = findings.filter((entry) => entry.reproduced === true).map((entry) => entry.id);
const report = {
  schemaVersion: 1,
  kind: "HOST_S1R_BASELINE_SECURITY_FALSIFIERS",
  stage: "Palimpsest Host-S1R",
  parentHead: "c4ea1ab6090163f951941c0ab0d9794c6e0f8df4",
  note: "Nine §4 hypotheses measured against the Host-S1 parent. Each records its source, baseline behaviour, actual input, observed output, invariant, evidence class and what remains uncertain.",
  runtime: { node: process.versions.node, executable: process.execPath, platform: process.platform, arch: process.arch },
  findings,
  summary: { total: findings.length, reproduced: reproducedIds.length, reproducedIds, notReproducedIds: findings.filter((entry) => entry.reproduced !== true).map((entry) => entry.id) },
};
const emitted = `${JSON.stringify(report, null, 2)}${NL}`;
process.stdout.write(emitted);
if (JSON_OUT !== null) {
  mkdirSync(dirname(resolve(JSON_OUT)), { recursive: true });
  writeFileSync(resolve(JSON_OUT), emitted, "utf8");
}
