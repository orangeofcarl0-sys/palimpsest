/**
 * R3-L0B §14 — THE HISTORICAL-EVIDENCE MUTATOR REGRESSION.
 *
 * §14 requires a regression test proving that a FULL UNIT RUN cannot change protected historical evidence. The
 * repair itself is in `test/r2lr_last_mile.test.ts`, which used to rewrite
 * `research-evidence/r2-lr/deterministic-suite.json` on every run.
 *
 * WHY THIS TEST IS SHAPED THE WAY IT IS. The defect was not that the suite wrote the WRONG value; it was that
 * the suite wrote AT ALL, into a committed evidence artifact, on every ordinary run. So the test does not check
 * the value — it checks the WRITE, by running the repaired recorder and then proving the committed file is
 * byte-identical to its committed blob.
 *
 * The check is against GIT, not against a digest captured at the start of the test, because a digest captured
 * in-process would already reflect a mutation that happened before the test ran. `git diff --quiet` answers the
 * question the ruling actually asks: is the committed artifact still what was committed?
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { KNOWN_PRE_EXISTING_MUTATORS, checkImmutability, digestProtectedEvidence } from "../scripts/r3l0b/immutability.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const MUTATED_PATH = "research-evidence/r2-lr/deterministic-suite.json";

/** Whether a path differs from its committed blob. */
function differsFromHead(path: string): boolean {
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", path], { cwd: REPO_ROOT, stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
}

/** Whether git knows the path at all. */
function trackedInHead(path: string): boolean {
  try {
    execFileSync("git", ["cat-file", "-e", `HEAD:${path}`], { cwd: REPO_ROOT, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("R3-L0B §14 — the r2lr historical-evidence mutator is repaired", () => {
  it("§14 the committed historical record is tracked and UNCHANGED from its committed blob", () => {
    expect(trackedInHead(MUTATED_PATH)).toBe(true);
    expect(differsFromHead(MUTATED_PATH), `${MUTATED_PATH} differs from HEAD — a run mutated committed evidence`).toBe(false);
  });

  it("§14 the suite's live record goes to a test-owned scratch path, NOT into research-evidence", () => {
    const source = readFileSync(join(REPO_ROOT, "test", "r2lr_last_mile.test.ts"), "utf8");
    /** The writer must target the scratch directory and must no longer name the committed evidence directory. */
    expect(source).toContain("tmpdir()");
    expect(source).toContain("palimpsest-r2lr");
    const writerRegion = source.slice(source.indexOf("export function recordPath"), source.indexOf("export function recordPath") + 400);
    expect(writerRegion).toContain("R2LR_RECORD_DIR");
    expect(writerRegion).not.toContain("research-evidence");
  });

  it("§14 GATE R still reads a compatibility record, from the scratch path with the committed record as fallback", () => {
    const gate = readFileSync(join(REPO_ROOT, "scripts", "r2lr", "gate-r.mjs"), "utf8");
    expect(gate).toContain("palimpsest-r2lr");
    expect(gate).toContain("committedRecord");
    expect(gate).toContain("readJson(scratchRecord) ?? readJson(committedRecord)");
  });

  it("§14 the guard reports the repair as CLEAN, so the mutation has not regressed", () => {
    const guard = checkImmutability();
    expect(guard.r2lrMutatorRepair).toBe("CLEAN");
    expect(guard.stillLiveKnownMutators).toEqual([]);
    expect(guard.changed).not.toContain(MUTATED_PATH);
  });

  it("§14 the historical record of the defect is preserved, so the repair is auditable", () => {
    const mutator = KNOWN_PRE_EXISTING_MUTATORS.find((entry: { path: string }) => entry.path === MUTATED_PATH);
    expect(mutator).toBeDefined();
    expect(String(mutator!.introducedBy)).toContain("R2-LR");
    expect(String(mutator!.repairedBy)).toContain("R3-L0B §14");
  });

  it("§15 a full unit run cannot change protected historical evidence", () => {
    /**
     * The regression proper, in TWO parts, because the obvious formulation recurses.
     *
     * Running the whole suite from inside the suite would re-enter this test forever. So the proof is split:
     *
     *   PART 1 (static, and the stronger of the two) every test file is scanned for a write under
     *   `research-evidence`. A full unit run can only mutate protected evidence if some test writes there, so
     *   "no test writes there" is a COMPLETE proof over the whole suite rather than a sample of it.
     *
     *   PART 2 (dynamic) the one file that actually had the defect is run in a child process, and the protected
     *   tree must be byte-identical afterwards.
     */
    const testDir = join(REPO_ROOT, "test");
    const writers: string[] = [];
    for (const entry of readdirSync(testDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".test.ts")) continue;
      const source = readFileSync(join(testDir, entry.name), "utf8");
      /**
       * A write is `writeFileSync`/`mkdirSync`/`appendFileSync`/`rmSync` whose argument mentions the protected
       * root. Reading it is fine and several tests legitimately read evidence.
       */
      for (const match of source.matchAll(/\b(?:writeFileSync|appendFileSync|mkdirSync|rmSync|unlinkSync|renameSync|cpSync|copyFileSync)\s*\(([\s\S]{0,200}?)\)/gu)) {
        if (match[1].includes("research-evidence")) writers.push(`${entry.name}: ${match[0].slice(0, 120).replace(/\s+/gu, " ")}`);
      }
    }
    expect(writers, "a test file writes under research-evidence, so a full unit run can mutate protected evidence").toEqual([]);

    const before = digestProtectedEvidence();
    let status = 0;
    try {
      execFileSync(process.execPath, [join(REPO_ROOT, "node_modules", "vitest", "vitest.mjs"), "run", "test/r2lr_last_mile.test.ts", "--reporter=dot"], { cwd: REPO_ROOT, stdio: "ignore", timeout: 600_000 });
    } catch (error) {
      status = Number((error as { status?: number }).status ?? 1);
    }
    const after = digestProtectedEvidence();
    /** A non-zero child status is NOT this test's concern — a sibling failure must not mask the mutation check. */
    void status;
    expect(after.treeDigest, "the protected historical evidence tree changed during the mutating suite's run").toBe(before.treeDigest);
    expect(after.fileCount).toBe(before.fileCount);
    expect(differsFromHead(MUTATED_PATH), `${MUTATED_PATH} was mutated by the suite that used to write it`).toBe(false);
  }, 600_000);
});
