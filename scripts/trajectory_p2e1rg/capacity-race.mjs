/**
 * Trajectory-P2-E1RG §6.2 — THE CROSS-PROCESS CAPACITY RACE, BEFORE AND AFTER.
 *
 * THE OBSERVATION THIS RECORDS. On the parent commit `openConfidentialSlot().acquire()` read the slot file,
 * compared the holder count and then OVERWROTE the file. Six processes synchronized on a barrier all read an
 * empty record and all six were granted the only slot. The corrected implementation takes an exclusive `mkdir`
 * lock around the read-decide-write section, and exactly one is granted.
 *
 * WHY BOTH ARMS ARE RUN. A single "one winner" result proves nothing on its own — a sequential implementation
 * would also produce one winner. The parent-commit arm is the CONTROL: it shows the same harness, the same
 * barrier and the same six processes DO produce six winners against the old code. Only the pair establishes
 * that the correction is what changed the outcome.
 *
 * SAFETY. Every home is test-owned under one `mkdtemp` root; the racers are synthetic (`setTimeout`) and are
 * killed at the end. The parent-commit source is read with `git show` into a temp file, never checked out, so
 * the working tree is untouched.
 *
 * Usage:  node scripts/trajectory_p2e1rg/capacity-race.mjs [--json-out <path>]
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ARG_JSON_OUT = process.argv.includes("--json-out") ? process.argv[process.argv.indexOf("--json-out") + 1] : null;
const RACERS = 6;
const ROOT = mkdtempSync(join(tmpdir(), "p2e1rg-race-"));

/** Run N racers released by a barrier, and return the verdict each one recorded. */
async function race(modulePath, label) {
  const home = join(ROOT, label);
  const readyDir = join(home, "ready");
  mkdirSync(readyDir, { recursive: true });
  const barrier = join(home, "barrier");
  /** @type {import("node:child_process").ChildProcess[]} */
  const children = [];
  for (let index = 0; index < RACERS; index += 1) {
    const script = join(home, `racer-${String(index)}.mjs`);
    writeFileSync(
      script,
      [
        "import { existsSync, writeFileSync } from 'node:fs';",
        `const mod = await import(${JSON.stringify(pathToFileURL(modulePath).href)});`,
        `const slot = mod.openConfidentialSlot({ home: ${JSON.stringify(home)} });`,
        `writeFileSync(${JSON.stringify(join(readyDir, `r-${String(index)}`))}, "1");`,
        `while (!existsSync(${JSON.stringify(barrier)})) { /* spin: the barrier is what synchronizes the race */ }`,
        "const verdict = slot.acquire();",
        `writeFileSync(${JSON.stringify(join(home, `result-${String(index)}.json`))}, JSON.stringify({ ...verdict, pid: process.pid }));`,
        "await new Promise((resolve) => setTimeout(resolve, 1500));",
      ].join("\n"),
      "utf8",
    );
    children.push(spawn(process.execPath, [script], { stdio: "ignore" }));
  }
  /** Wait for every racer to signal readiness, then open the barrier. */
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    let signalled = 0;
    for (let index = 0; index < RACERS; index += 1) if (existsSync(join(readyDir, `r-${String(index)}`))) signalled += 1;
    if (signalled === RACERS) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  writeFileSync(barrier, "go", "utf8");
  /** Collect results. */
  const results = [];
  const resultDeadline = Date.now() + 30_000;
  while (Date.now() < resultDeadline) {
    results.length = 0;
    for (let index = 0; index < RACERS; index += 1) {
      const file = join(home, `result-${String(index)}.json`);
      if (!existsSync(file)) continue;
      try {
        results.push(JSON.parse(readFileSync(file, "utf8")));
      } catch {
        /* still being written */
      }
    }
    if (results.length === RACERS) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  for (const child of children) {
    try {
      child.kill();
    } catch {
      /* already exited */
    }
  }
  const granted = results.filter((entry) => entry.granted === true);
  return {
    racers: RACERS,
    collected: results.length,
    granted: granted.length,
    grantedPids: granted.map((entry) => entry.pid),
    /** THE OVERLAP: more than one grant means more than one ACTIVE confidential worker. */
    overlap: granted.length > 1,
    details: results.map((entry) => ({ granted: entry.granted === true, detail: String(entry.detail).slice(0, 200) })),
  };
}

const report = {
  schemaVersion: 1,
  kind: "TRAJECTORY_P2E1RG_CAPACITY_RACE",
  stage: "Trajectory-P2-E1RG",
  evidenceClass: "FIRST_PARTY_DSH_VERIFIED",
  note: "Both arms run the SAME harness against different source. The parent-commit arm is the control: without it, a single winner would be indistinguishable from a sequential implementation.",
  racersPerArm: RACERS,
  arms: {},
};

try {
  /** ARM 1 — the corrected working tree. */
  report.arms.corrected = await race(join(REPO, "host", "deployment", "runtime", "confidential_profile.js"), "corrected");

  /**
   * ARM 2 — THE PARENT COMMIT. `git show` writes the old source to a temp file; nothing is checked out, so the
   * working tree and index are untouched.
   */
  const parentSource = join(ROOT, "parent-profile.mjs");
  try {
    writeFileSync(parentSource, execFileSync("git", ["show", "a168bec:host/deployment/runtime/confidential_profile.js"], { cwd: REPO, encoding: "utf8" }), "utf8");
    report.arms.parentCommit = await race(parentSource, "parent");
  } catch (error) {
    report.arms.parentCommit = { error: `the parent source could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
} finally {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows locks */
  }
}

const corrected = report.arms.corrected;
const parent = report.arms.parentCommit;
report.summary = {
  correctedGrants: corrected.granted,
  parentGrants: parent?.granted ?? null,
  correctedOverlap: corrected.overlap,
  parentOverlap: parent?.overlap ?? null,
  /**
   * THE CORRECTION IS ESTABLISHED ONLY WHEN THE PAIR DIFFERS AS DESCRIBED: the parent over-admitted and the
   * corrected code did not. One arm alone is not evidence.
   */
  correctionEstablished: corrected.granted === 1 && parent?.granted > 1,
  note: "`correctionEstablished` requires the parent arm to have over-admitted; a single-winner result alone would also be produced by a sequential implementation.",
};
report.verdict = report.summary.correctionEstablished ? "ATOMIC_OWNERSHIP_ESTABLISHED" : "NOT_ESTABLISHED";

const emitted = `${JSON.stringify(report, null, 2)}\n`;
process.stdout.write(emitted);
if (ARG_JSON_OUT !== null) {
  mkdirSync(dirname(resolve(ARG_JSON_OUT)), { recursive: true });
  writeFileSync(resolve(ARG_JSON_OUT), emitted, "utf8");
}
process.exit(report.summary.correctionEstablished ? 0 : 1);
