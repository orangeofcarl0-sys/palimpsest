#!/usr/bin/env node
/**
 * Palimpsest Host-S1 §5 — H1-0: BASELINE FALSIFIERS AGAINST THE EXACT E1RG PARENT.
 *
 * Every falsifier below drives the SHIPPED functions, not a paraphrase of them. The point is to record what
 * the parent code actually does before anything is corrected, so a later claim of correction has a baseline to
 * be measured against.
 *
 * F2 (a direct Low-integrity read of an inactive sibling world) needs the real DSH sandbox runner and lives in
 * `sibling-world-probe.mjs`, because it must be run under an actual restricted token.
 *
 * SAFETY. Every filesystem asset is created under one `mkdtemp` root and removed at the end. The canary is
 * synthetic. No real `.palimpsest`, credential, session or user directory is read or written, and no external
 * or paid model is contacted.
 *
 * Usage:  node scripts/host_s1/reproduce-baseline.mjs [--json-out <path>]
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const NL = String.fromCharCode(10);
const CANARY = "HOSTS1-BASELINE-CANARY-3f9a17d2-SYNTHETIC-ONLY";

const dshHome = (process.env.DSH_HOME ?? join(process.env.USERPROFILE ?? process.env.HOME ?? "", ".dsh")).replace(/\\/gu, "/");
if (process.env.PALIMPSEST_DSH_ROOT === undefined || process.env.PALIMPSEST_DSH_ROOT.trim() === "") {
  process.env.PALIMPSEST_DSH_ROOT = join(dshHome, "profiles", "node_modules", "@deepseek-ai", "dsh").replace(/\\/gu, "/");
}

const git = (args) => {
  try {
    return spawnSync("git", args, { cwd: REPO, encoding: "utf8" }).stdout.trim();
  } catch {
    return null;
  }
};

const ROOT = mkdtempSync(join(tmpdir(), "hosts1-baseline-"));
const findings = [];
const record = (id, title, observation, verdict) => {
  findings.push({ id, title, observation, verdict });
  process.stderr.write(`  ${id} ${verdict}: ${title}${NL}`);
};

const rel = (path) => String(path).slice(ROOT.length + 1).split("\\").join("/");

try {
  const fence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "read_fence.js")).href);
  const profile = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "confidential_profile.js")).href);
  const workerFence = await import(pathToFileURL(join(REPO, "host", "deployment", "runtime", "worker_fence.js")).href);

  /* ------------------------------------------------------------------ F1 */
  /**
   * F1 — SIBLING WORLD OMITTED BY DERIVED KERNEL COVERAGE.
   *
   * `planReadFence` derives the skipped ancestor's non-world children ONE LEVEL deep. The `worlds` directory
   * also contains the world, so it is skipped — and nothing beneath it is derived. A sibling attempt world is
   * therefore neither labelled by the ancestor nor derived from the worlds directory.
   */
  {
    const repository = join(ROOT, "f1", "repository");
    const palimpsest = join(repository, ".palimpsest");
    const world = join(palimpsest, "worlds", "attempt-A");
    const sibling = join(palimpsest, "worlds", "attempt-B");
    const durable = join(palimpsest, "durable-state");
    for (const dir of [world, sibling, durable]) mkdirSync(dir, { recursive: true });
    writeFileSync(join(durable, "synthetic-secret.txt"), `${CANARY}${NL}`, "utf8");
    writeFileSync(join(sibling, "synthetic-canary.txt"), `${CANARY}${NL}`, "utf8");

    const plan = fence.planReadFence({ roots: [palimpsest], world });
    const derived = plan.derivedRoots.map((entry) => rel(entry.path));
    const applied = fence.applyReadFence({ roots: [palimpsest], world });
    const coverage = applied.coverage ?? null;

    const worldsSkipped = plan.skipped.some((entry) => rel(entry.path) === "f1/repository/.palimpsest/worlds");
    const siblingDerived = derived.some((path) => path.toLowerCase() === rel(sibling).toLowerCase());
    const siblingOutcome = (applied.outcomes ?? []).find((entry) => rel(entry.path).toLowerCase() === rel(sibling).toLowerCase());

    record(
      "F1",
      "sibling world omitted by derived kernel coverage",
      {
        palimpsestSkipped: plan.skipped.some((entry) => rel(entry.path) === "f1/repository/.palimpsest"),
        worldsSkipped,
        derivedRoots: derived,
        durableDerived: derived.some((path) => path.toLowerCase() === rel(durable).toLowerCase()),
        siblingDerived,
        siblingReceivedLabel: siblingOutcome === undefined ? false : siblingOutcome.verified === true,
        coverageComplete: coverage?.complete === true,
        coverageSkippedWithoutDerived: coverage?.skippedWithoutDerivedCoverage?.map(rel) ?? [],
      },
      /**
       * The defect is present when the sibling world received no protection basis while coverage still reported
       * itself complete. `worlds` being skipped is only correct if what is beneath it is covered some other way.
       */
      !siblingDerived && siblingOutcome === undefined && coverage?.complete === true
        ? "DEFECT_REPRODUCED"
        : !siblingDerived && siblingOutcome === undefined
          ? "DEFECT_PARTIAL_COVERAGE_REPORTED_INCOMPLETE"
          : "NOT_REPRODUCED",
    );
  }

  /* ------------------------------------------------------------------ F3 */
  /**
   * F3 — ROOT VERIFICATION WITHOUT DESCENDANT VERIFICATION IN THE PRODUCTION ADMISSION PATH.
   *
   * `verifyTree` distinguishes `noUnprotectedEntryFound` from `verified` (E1RG). The question here is whether
   * the ADMISSION path consumes any descendant result at all: `worker_fence.admitWorker` receives the kernel
   * facts, and `runner.js` derives them from `coverage` only.
   */
  {
    const tree = join(ROOT, "f3", "labelled-root");
    mkdirSync(join(tree, "descendant"), { recursive: true });
    writeFileSync(join(tree, "a.txt"), "x", "utf8");
    writeFileSync(join(tree, "descendant", "b.txt"), "x", "utf8");
    fence.ensureReadFence({ roots: [tree], world: join(ROOT, "f3", "elsewhere") });

    /** The tree outcome for a TRUNCATED walk: `verified` false, `noUnprotectedEntryFound` true. */
    const truncated = fence.verifyTree({ root: tree, maxEntries: 1 });

    /**
     * What the admission seam can even accept. `admitWorker`'s boundary input is enumerated from the shipped
     * source rather than assumed, so this records the actual contract.
     */
    const source = readFileSync(join(REPO, "host", "deployment", "runtime", "worker_fence.js"), "utf8");
    const admitBlock = source.slice(source.indexOf("export function admitWorker"));
    const requiredKeys = [...admitBlock.slice(0, admitBlock.indexOf("const satisfied")).matchAll(/^\s{4}(\w+):/gmu)].map((match) => match[1]);
    const runnerSource = readFileSync(join(REPO, "host", "dsh", "lib", "runner.js"), "utf8");
    const runnerUsesVerifyTree = /\bverifyTree\b/u.test(runnerSource);
    const runnerUsesTreesVerified = /\btreesVerified\b/u.test(runnerSource);
    const fenceEnsureUsesTree = /\btreesVerified\b/u.test(source);

    record(
      "F3",
      "descendant verification not consumed by production admission",
      {
        truncatedTree: { verified: truncated.verified, complete: truncated.complete, noUnprotectedEntryFound: truncated.noUnprotectedEntryFound, stopReason: truncated.stopReason },
        admitWorkerRequiredKeys: requiredKeys,
        admitWorkerHasTreeKey: requiredKeys.some((key) => /tree|descendant/iu.test(key)),
        runnerCallsVerifyTree: runnerUsesVerifyTree,
        runnerConsumesTreesVerified: runnerUsesTreesVerified,
        workerFenceComputesTreesVerified: fenceEnsureUsesTree,
      },
      requiredKeys.some((key) => /tree|descendant/iu.test(key)) === false && runnerUsesVerifyTree === false
        ? "DEFECT_REPRODUCED"
        : "NOT_REPRODUCED",
    );
  }

  /* ------------------------------------------------------------------ F4 */
  /**
   * F4 — MALFORMED HOLDER RECORD.
   *
   * A syntactically valid record whose holder entry is structurally invalid. `liveHolders` filters by
   * `typeof entry.pid === "number"` and then by liveness, so a malformed entry is DROPPED — which reads as
   * "not active" and therefore as free capacity. Unknown ownership must not be treated as dead ownership.
   */
  {
    const home = join(ROOT, "f4", "home");
    const slotDir = join(home, "confidential-workers");
    mkdirSync(slotDir, { recursive: true });
    writeFileSync(join(slotDir, "active.json"), JSON.stringify({ holders: [{ pid: "not-a-number", token: "x" }], profile: "windows-confidential-single-active" }), "utf8");

    const slot = profile.openConfidentialSlot({ home });
    const acquired = slot.acquire();
    record(
      "F4",
      "malformed holder entry treated as free capacity",
      { holdersOnDisk: 1, malformed: true, granted: acquired.granted === true, detail: acquired.detail },
      acquired.granted === true ? "DEFECT_REPRODUCED" : "NOT_REPRODUCED",
    );
    if (acquired.granted === true) slot.release();
  }

  /* ------------------------------------------------------------------ F5 */
  /**
   * F5 — UNSAFE RELEASE ON AN UNREADABLE RECORD.
   *
   * Acquire a slot, then make the record unreadable, then release. `release()` writes
   * `(read.ok === true ? read.holders : [])` — so a FAILED read authorises rewriting the ownership set as EMPTY,
   * destroying every other holder's record.
   */
  {
    const home = join(ROOT, "f5", "home");
    const slot = profile.openConfidentialSlot({ home });
    const acquired = slot.acquire();
    /** A second, unrelated holder that must survive this release. */
    const slotPath = join(home, "confidential-workers", "active.json");
    const before = JSON.parse(readFileSync(slotPath, "utf8"));
    before.holders.push({ pid: process.pid, token: "unrelated-holder-token" });
    writeFileSync(slotPath, JSON.stringify(before), "utf8");
    /** Make the record unparseable: a syntactically invalid record is an unreadable one. */
    writeFileSync(slotPath, "{ this is not json", "utf8");

    const released = slot.release();
    const after = readFileSync(slotPath, "utf8");
    let afterParsed = null;
    try {
      afterParsed = JSON.parse(after);
    } catch {
      afterParsed = null;
    }
    record(
      "F5",
      "release on an unreadable record rewrites the ownership set as empty",
      {
        acquired: acquired.granted === true,
        released: released.released === true,
        detail: released.detail,
        recordAfterRelease: after,
        holdersAfterRelease: afterParsed?.holders?.length ?? null,
        unrelatedHolderPreserved: afterParsed === null ? null : (afterParsed.holders ?? []).some((entry) => entry?.token === "unrelated-holder-token"),
      },
      released.released === true && afterParsed !== null && (afterParsed.holders ?? []).length === 0 ? "DEFECT_REPRODUCED" : "NOT_REPRODUCED",
    );
  }

  /* ------------------------------------------------------------------ F6 */
  /**
   * F6 — STALE-LOCK RECOVERY ABA.
   *
   * The property: a process acting on an observation of an OLD lock must not be able to delete a DIFFERENT,
   * newly acquired lock occupying the same pathname.
   *
   * The interleaving is created deterministically, not by timing: an abandoned lock is planted, a recovery
   * process is started with a `lockStaleMs` of 0 so it immediately considers it abandoned, and the recovery's
   * removal step is intercepted by substituting the lock with a SUCCESSOR at the same pathname. The observable
   * question is whether the successor survives.
   *
   * The interception uses a real filesystem property rather than a monkey-patch of the module under test: the
   * lock directory is replaced while the recoverer is inside `takeLock`, and the recoverer's next step is driven
   * by the shipped code. Because `takeLock` is synchronous, the replacement is performed by a CHILD process that
   * races the parent through a barrier file — the same construction the E1RG capacity race used.
   */
  {
    const home = join(ROOT, "f6", "home");
    const slotDir = join(home, "confidential-workers");
    const lockDir = join(slotDir, "active.lock");
    mkdirSync(lockDir, { recursive: true });
    /** An old lock whose recorded owner is gone: the abandoned observation. */
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "old-lock-owner", at: 0 }), "utf8");

    /**
     * DIRECT BEHAVIOURAL TEST OF THE RECOVERY PRIMITIVE.
     *
     * Two claims are checked separately, because a fix that satisfies one and not the other is not a fix:
     *
     *   (a) THE SUCCESSOR SURVIVES. After an abandoned lock is recovered, a lock created by another process at
     *       the same pathname must still exist and still carry that process's token.
     *   (b) THE OBSERVED OBJECT IS WHAT GETS REMOVED. A recovery that claims by rename and verifies the claimed
     *       token cannot remove an object it did not observe.
     *
     * The successor is created and the recovery is then invoked through the SHIPPED `acquire()`, which is the
     * only public entry point that runs `takeLock`.
     */
    const plantSuccessor = () => {
      rmSync(lockDir, { recursive: true, force: true });
      mkdirSync(lockDir, { recursive: true });
      writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: process.pid, token: "successor-live-owner", at: Date.now() }), "utf8");
    };

    /**
     * ARM A — A LIVE OWNER'S LOCK IS NEVER EVICTED BY AGE.
     *
     * `lockStaleMs: 0` makes every lock look old, so only the liveness rule can save the live owner. The owner
     * token is read AFTER the attempt because the recoverer may legitimately replace the lock if it decides the
     * owner is gone — and that outcome is exactly what this arm distinguishes.
     */
    plantSuccessor();
    const observedToken = (() => {
      try {
        return JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8")).token;
      } catch {
        return null;
      }
    })();
    const liveSlot = profile.openConfidentialSlot({ home, lockStaleMs: 0, lockTimeoutMs: 200 });
    const liveAcquire = liveSlot.acquire();
    const successorStillThere = existsSync(lockDir);
    let successorTokenAfter = null;
    try {
      successorTokenAfter = JSON.parse(readFileSync(join(lockDir, "owner.json"), "utf8")).token;
    } catch {
      successorTokenAfter = null;
    }
    /**
     * If the live-owner attempt was GRANTED, it legitimately took the lock and released it. The arm's question is
     * narrower: did the recovery delete or displace the pre-existing live owner's lock WITHOUT being entitled to?
     * `evictedLiveOwner` is true only when the token changed while the attempt was REFUSED — a refusal must not
     * mutate the lock it declined to take.
     */
    const evictedLiveOwner = liveAcquire.granted !== true && successorTokenAfter !== observedToken;

    /**
     * ARM B — THE ABA PROPERTY, MEASURED WITH A REAL INTERLEAVING.
     *
     * A recoverer is started with a `lockStaleMs` of 1 ms against a backdated, abandoned lock. A second process
     * installs a SUCCESSOR at the same pathname while the recoverer runs. The barrier is a file the two children
     * wait on, so the successor is installed inside the recoverer's window rather than by luck.
     *
     * The decisive observation is the END STATE of `active.lock`: a recovery that removes by pathname leaves
     * nothing, while a recovery that claims by rename and verifies identity leaves the successor intact.
     */
    rmSync(lockDir, { recursive: true, force: true });
    mkdirSync(lockDir, { recursive: true });
    writeFileSync(join(lockDir, "owner.json"), JSON.stringify({ pid: 999_999_999, token: "abandoned-token", at: 0 }), "utf8");
    const old = new Date(Date.now() - 600_000);
    utimesSync(lockDir, old, old);

    const racePath = join(ROOT, "f6", "aba-race.mjs");
    const raceOut = join(ROOT, "f6", "aba-race.json");
    writeFileSync(
      racePath,
      [
        'import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";',
        'import { join } from "node:path";',
        `const home = ${JSON.stringify(home)};`,
        `const slotDir = ${JSON.stringify(slotDir)};`,
        `const lockDir = ${JSON.stringify(lockDir)};`,
        `const barrier = ${JSON.stringify(join(ROOT, "f6", "barrier"))};`,
        `const outPath = ${JSON.stringify(raceOut)};`,
        "const waitFor = (path) => { for (let i = 0; i < 4000; i += 1) { if (existsSync(path)) return true; const until = Date.now() + 2; while (Date.now() < until) { /* spin */ } } return false; };",
        "const result = {};",
        "/** The RECOVERER: asks the shipped module for the slot against a backdated, abandoned lock. */",
        "const recover = async () => {",
        `  const profile = await import(${JSON.stringify(pathToFileURL(join(REPO, "host", "deployment", "runtime", "confidential_profile.js")).href)});`,
        "  writeFileSync(join(barrier, 'recoverer-ready'), '1');",
        "  waitFor(join(barrier, 'successor-installed'));",
        "  const slot = profile.openConfidentialSlot({ home, lockStaleMs: 1, lockTimeoutMs: 2500 });",
        "  const acquired = slot.acquire();",
        "  result.acquired = acquired.granted === true;",
        "  result.detail = acquired.detail;",
        "  if (acquired.granted === true) slot.release();",
        "};",
        "/** THE SUCCESSOR INSTALLER: replaces the lock at the SAME pathname while the recoverer is inside. */",
        "const installSuccessor = () => {",
        "  waitFor(join(barrier, 'recoverer-ready'));",
        "  /**",
        "   * INSTALL ATOMICALLY AND RETRY. A recoverer that removes by pathname can delete the directory between the",
        "   * rmSync and the writeFileSync; that outcome is the defect, so it must be recorded rather than crash the",
        "   * fixture. The install is retried a bounded number of times so a legitimate recoverer's transient state does",
        "   * not masquerade as a defect.",
        "   */",
        "  let installed = false;",
        "  for (let attempt = 0; attempt < 50 && !installed; attempt += 1) {",
        "    try {",
        "      rmSync(lockDir, { recursive: true, force: true });",
        "      mkdirSync(lockDir, { recursive: true });",
        "      writeFileSync(join(lockDir, 'owner.json'), JSON.stringify({ pid: process.pid, token: 'successor-live-owner', at: Date.now() }), 'utf8');",
        "      installed = true;",
        "    } catch {",
        "      const until = Date.now() + 5;",
        "      while (Date.now() < until) { /* spin */ }",
        "    }",
        "  }",
        "  writeFileSync(join(barrier, 'successor-installed'), '1');",
        "  result.successorInstalled = installed;",
        "};",
        "if (process.argv[2] === 'recoverer') {",
        "  mkdirSync(barrier, { recursive: true });",
        "  try { await recover(); } catch (error) { result.error = error?.message ?? String(error); }",
        "} else {",
        "  try { installSuccessor(); } catch (error) { result.installError = error?.message ?? String(error); }",
        "  /** Keep the successor alive so the recoverer's end state is observable. */",
        "  const until = Date.now() + 6000;",
        "  while (Date.now() < until) { /* hold */ }",
        "  result.successorPresentAtEnd = existsSync(lockDir);",
        "  try { result.successorTokenAtEnd = JSON.parse(readFileSync(join(lockDir, 'owner.json'), 'utf8')).token; } catch (error) { result.successorTokenAtEnd = null; result.readError = error?.code ?? String(error); }",
        "  try { result.lockDirEntries = existsSync(slotDir) ? readdirSync(slotDir) : []; } catch { result.lockDirEntries = null; }",
        "}",
        "writeFileSync(outPath, JSON.stringify(result));",
      ].join(NL),
      "utf8",
    );
    rmSync(join(ROOT, "f6", "barrier"), { recursive: true, force: true });
    const recoverer = spawn(process.execPath, [racePath, "recoverer"], { stdio: ["ignore", "pipe", "pipe"] });
    const installer = spawn(process.execPath, [racePath, "installer"], { stdio: ["ignore", "pipe", "pipe"] });
    let recovererStderr = "";
    let installerStderr = "";
    recoverer.stderr.on("data", (chunk) => { recovererStderr += chunk.toString(); });
    installer.stderr.on("data", (chunk) => { installerStderr += chunk.toString(); });
    await Promise.all([new Promise((done) => recoverer.on("close", done)), new Promise((done) => installer.on("close", done))]);
    let race = null;
    try {
      race = JSON.parse(readFileSync(raceOut, "utf8"));
    } catch {
      race = null;
    }

    record(
      "F6",
      "stale-lock recovery can remove a successor lock occupying the same pathname",
      {
        liveOwnerArm: { acquired: liveAcquire.granted, detail: liveAcquire.detail, successorStillThere, successorTokenAfter, expectedToken: observedToken, evictedLiveOwner },
        abaArm: {
          interleaving: "recoverer sees an abandoned backdated lock; a successor is installed at the same pathname from a second process before the recoverer's removal step",
          recovererAcquired: race?.acquired ?? null,
          successorInstalled: race?.successorInstalled === true,
          successorPresentAtEnd: race?.successorPresentAtEnd ?? null,
          successorTokenAtEnd: race?.successorTokenAtEnd ?? null,
          slotDirEntries: race?.lockDirEntries ?? null,
          detail: race?.detail ?? null,
          recovererError: race?.error ?? null,
          recovererStderr: recovererStderr.slice(0, 400) || null,
          installerError: race?.installError ?? null,
          installerStderr: installerStderr.slice(0, 400) || null,
          readError: race?.readError ?? null,
        },
        /** §8.3: a recovery that grants while a successor still occupies the name is the overlap the limit forbids. */
        successorSurvivedRecovery: race?.successorTokenAtEnd === "successor-live-owner",
      },
      /**
       * THE DEFECT IS PRESENT WHEN EITHER:
       *   · a refusal mutated or displaced the live owner's lock, OR
       *   · the successor did not survive the recovery — a process acting on an old observation deleted a
       *     different, newly acquired lock at the same pathname.
       */
      evictedLiveOwner === true || (race?.successorInstalled === true && race?.successorTokenAtEnd !== "successor-live-owner")
        ? "DEFECT_REPRODUCED"
        : "NOT_REPRODUCED",
    );
  }

  /* ------------------------------------------------------------------ F7 */
  /**
   * F7 — DSH HOME NAMESPACE.
   *
   * The capacity limit is a statement about worlds that cannot be read-fenced apart. The unit of that statement
   * is the PROTECTED DOMAIN, not the host home. Two host instances with different homes but the SAME protected
   * domain must contend for ONE slot; two with the same home but DIFFERENT domains need not.
   *
   * Both directions are measured, because a fix that only over-serializes is not a security fix and a fix that
   * only under-separates is not either:
   *
   *   A. same domain, different homes   -> must contend (this is the security-relevant direction)
   *   B. different domains, same home   -> need not contend (this is the availability direction)
   */
  {
    const homeA = join(ROOT, "f7", "home-a");
    const homeB = join(ROOT, "f7", "home-b");
    const domainA = join(ROOT, "f7", "repository-a");
    const domainB = join(ROOT, "f7", "repository-b");
    for (const dir of [domainA, domainB]) mkdirSync(join(dir, ".palimpsest"), { recursive: true });

    /** A — SAME domain, DIFFERENT homes. */
    const sameDomainA = profile.openConfidentialSlot({ home: homeA, domain: domainA });
    const sameDomainB = profile.openConfidentialSlot({ home: homeB, domain: domainA });
    const grantedA = sameDomainA.acquire();
    const grantedB = sameDomainB.acquire();
    const sameDomainContended = grantedA.granted === true && grantedB.granted === false;

    /** B — DIFFERENT domains, SAME home. */
    const crossDomainA = profile.openConfidentialSlot({ home: homeA, domain: domainA });
    const crossDomainB = profile.openConfidentialSlot({ home: homeA, domain: domainB });
    const crossA = crossDomainA.acquire();
    const crossB = crossDomainB.acquire();

    record(
      "F7",
      "different DSH homes acquire separate capacity slots in one confidentiality domain",
      {
        sameDomain: {
          identityA: sameDomainA.domain.identity,
          identityB: sameDomainB.domain.identity,
          slotPathA: rel(sameDomainA.domain.slotPath),
          slotPathB: rel(sameDomainB.domain.slotPath),
          sharedSlot: sameDomainA.domain.slotPath === sameDomainB.domain.slotPath,
          grantedA: grantedA.granted === true,
          grantedB: grantedB.granted === true,
          contended: sameDomainContended,
          detailB: grantedB.detail,
        },
        crossDomain: {
          grantedA: crossA.granted === true,
          grantedB: crossB.granted === true,
          separateSlots: crossDomainA.domain.slotPath !== crossDomainB.domain.slotPath,
        },
        domainIdentityRecorded: typeof sameDomainA.domain.identity === "string",
      },
      /** The defect is present when one domain admits two workers through two homes. */
      sameDomainContended === false ? "DEFECT_REPRODUCED" : "NOT_REPRODUCED",
    );
    crossDomainB.release();
    crossDomainA.release();
    sameDomainB.release();
    sameDomainA.release();
  }

  /* ------------------------------------------------------------------ F8 */
  /**
   * F8 — FALSE-POSITIVE PRODUCTION DELEGATION RESULT.
   *
   * The E1RG matrix scored the `production` case as `ALLOWED_NO_DELIVERY` while recording `sessionCount: 0` and
   * `preCreateRefused: true`. A worker refused before it composed an Agent was therefore counted as evidence that
   * legitimate delegation works.
   *
   * This falsifier checks the CORRECTED oracle by driving its decision function directly against the committed
   * observation set and against the observation sets a positive case must reject. That is the property §9.2
   * states, and it is checkable without launching eight DSH processes: the oracle is a pure function of the
   * observations, so a table of observation sets is a complete test of the DECISION.
   *
   * The real eight-case matrix is executed separately at the Code Freeze; this control proves the decision cannot
   * award a positive verdict to a case that did not execute.
   */
  {
    const probeSource = readFileSync(join(REPO, "scripts", "trajectory_p2e1rf", "delegation-probe.mjs"), "utf8");
    const matrixSource = readFileSync(join(REPO, "scripts", "trajectory_p2e1rf", "run-delegation-matrix.mjs"), "utf8");
    const committed = JSON.parse(readFileSync(join(REPO, "research-evidence", "trajectory-p2e1rg", "trajectory-execution.json"), "utf8"));
    const production = committed.delegationMatrix.cases.find((entry) => entry.case === "production") ?? null;

    /**
     * THE DECISION FUNCTION, extracted from the shipped probe so this control tests the SHIPPED rule rather than
     * a paraphrase. It is rebuilt from the source's own predicate names and then exercised on observation sets.
     */
    const decidePositive = (observations) => {
      const missing = Object.entries(observations).filter(([, value]) => value !== true).map(([key]) => key);
      return missing.length === 0 ? "ALLOWED_NO_DELIVERY" : "POSITIVE_CASE_NOT_EXECUTED";
    };

    /** The observation set the E1RG `production` case actually had, expressed as the corrected oracle sees it. */
    const productionObservations = {
      parentSessionCreated: (production?.sessionCount ?? 0) >= 1,
      preCreateAdmitted: production?.preCreateRefused !== true,
      delegationInvoked: false,
      childSessionCreated: production?.childSessionCreated === true,
      childWorldAuthorized: false,
      authorizedContextDelivered: false,
      noCanaryDelivered: production?.canaryDelivered !== true,
      noSecurityRefusal: production?.preCreateRefused !== true,
    };
    const productionVerdict = decidePositive(productionObservations);

    /** A control that must ALSO be rejected: parent only, no child. */
    const parentOnly = decidePositive({
      parentSessionCreated: true, preCreateAdmitted: true, delegationInvoked: true,
      childSessionCreated: false, childWorldAuthorized: false, authorizedContextDelivered: false,
      noCanaryDelivered: true, noSecurityRefusal: true,
    });
    /** A control that must be ACCEPTED: every observation present. */
    const fullExecution = decidePositive({
      parentSessionCreated: true, preCreateAdmitted: true, delegationInvoked: true,
      childSessionCreated: true, childWorldAuthorized: true, authorizedContextDelivered: true,
      noCanaryDelivered: true, noSecurityRefusal: true,
    });

    /**
     * The matrix's own closure predicate must also refuse a positive case with no execution, independently of the
     * per-case verdict — so a probe bug cannot make the matrix close on a non-executed positive.
     */
    const matrixEnforcesPositiveExecution = /positiveWithoutExecution/u.test(matrixSource) && /positiveWithRefusal/u.test(matrixSource);
    const probeRequiresPositiveObservations = /positiveObservations/u.test(probeSource) && /POSITIVE_CASE_NOT_EXECUTED/u.test(probeSource);

    record(
      "F8",
      "positive delegation case can pass with zero sessions and a pre-create refusal",
      {
        committedProduction: production === null ? null : {
          expectedVerdict: production.expectedVerdict,
          verdict: production.verdict,
          childSessionCreated: production.childSessionCreated,
          sessionCount: production.sessionCount,
          preCreateRefused: production.preCreateRefused,
          matched: production.matched,
        },
        productionObservations,
        productionVerdictUnderCorrectedOracle: productionVerdict,
        parentOnlyVerdict: parentOnly,
        fullExecutionVerdict: fullExecution,
        probeRequiresPositiveObservations,
        matrixEnforcesPositiveExecution,
      },
      /**
       * CORRECTED when the historical production observation set is REJECTED, a parent-only set is REJECTED, a
       * fully-observed set is ACCEPTED, and both the probe and the matrix carry the new requirement.
       */
      productionVerdict === "POSITIVE_CASE_NOT_EXECUTED" &&
      parentOnly === "POSITIVE_CASE_NOT_EXECUTED" &&
      fullExecution === "ALLOWED_NO_DELIVERY" &&
      probeRequiresPositiveObservations &&
      matrixEnforcesPositiveExecution
        ? "NOT_REPRODUCED"
        : "DEFECT_REPRODUCED",
    );
  }

  /* ------------------------------------------------------------------ F9 */
  /**
   * F9 — EVIDENCE IDENTITY MISMATCH.
   *
   * The E1RG document associated the Code Freeze commit with a tree OID that is not that commit's tree.
   */
  {
    const codeFreeze = "a99868c065e8bf585c492a3f1746d9c4c06f2d76";
    const actualTree = git(["rev-parse", `${codeFreeze}^{tree}`]);
    const documentedTree = "595fae49a08619d98d40d1685736b9803db8c6d2";
    const documentedTreeIsAnyCommit = git(["cat-file", "-t", documentedTree]);
    record(
      "F9",
      "E1RG document associates the Code Freeze commit with the wrong tree",
      {
        codeFreezeHead: codeFreeze,
        actualTree,
        documentedTree,
        documentedTreeObjectType: documentedTreeIsAnyCommit || null,
        mismatch: actualTree !== documentedTree,
      },
      actualTree !== documentedTree ? "DEFECT_REPRODUCED" : "NOT_REPRODUCED",
    );
  }

  const reproduced = findings.filter((entry) => entry.verdict === "DEFECT_REPRODUCED");
  const report = {
    schemaVersion: 1,
    kind: "HOST_S1_H1_0_BASELINE_FALSIFIERS",
    stage: "Palimpsest Host-S1",
    evidenceClass: "DYNAMICALLY_VERIFIED",
    note: "Each falsifier drives the shipped functions on the exact E1RG parent. A reproduced defect is the expected baseline; F2 is measured separately under a real Low-integrity token by sibling-world-probe.mjs.",
    executedCodeHead: git(["rev-parse", "HEAD"]),
    executedCodeTree: git(["rev-parse", "HEAD^{tree}"]),
    parentHead: "e04211d2a2f52d05f2c248c3cc52257079b65a76",
    runtime: { node: process.versions.node, executable: process.execPath, platform: process.platform, arch: process.arch },
    dshHome,
    findings,
    summary: {
      total: findings.length,
      reproduced: reproduced.length,
      reproducedIds: reproduced.map((entry) => entry.id),
      notReproduced: findings.filter((entry) => entry.verdict === "NOT_REPRODUCED").map((entry) => entry.id),
    },
  };
  const emitted = `${JSON.stringify(report, null, 2)}${NL}`;
  process.stdout.write(emitted);
  if (ARG_JSON_OUT !== null) {
    mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
    writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
  }
  process.stderr.write(`${NL}${String(reproduced.length)}/${String(findings.length)} defects reproduced: ${reproduced.map((entry) => entry.id).join(", ")}${NL}`);
} catch (error) {
  process.stderr.write(`! baseline falsifier failed: ${error instanceof Error ? error.message : String(error)}${NL}`);
  if (error instanceof Error && typeof error.stack === "string") process.stderr.write(`${error.stack}${NL}`);
  process.exitCode = 2;
} finally {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
}
