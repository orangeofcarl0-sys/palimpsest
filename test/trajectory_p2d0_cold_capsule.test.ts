/**
 * Trajectory-P2-D0 §11 (C6/C7) — REAL COLD-RECOVERED CAPSULE GATE.
 *
 * Runs `scripts/trajectory_p2d0/cold-capsule-gate.mjs`, which drives TWO INDEPENDENT processes: one that
 * starts real work through the normal product composition against the real first-party DSH host (via the
 * capability-refusal probe, so a real Session is created with NO model turn), and one that RECOMPOSES the
 * product fresh and derives a bounded Capsule from the cold-recovered evidence.
 *
 * The gate's own outcomes are PASS / SKIPPED / BLOCKED / NOT_ESTABLISHED. A SKIPPED gate is NOT counted as
 * successful first-party evidence (the ruling's §14.2), so this test asserts the gate ran and reports its
 * outcome, and requires PASS explicitly when the first-party DSH tree is present.
 *
 * SAFETY. Test-owned roots; no model, no network, no personal session.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const REPO = process.cwd();
const REAL_MODULES = join(process.env.DSH_HOME ?? join(homedir(), ".dsh"), "profiles", "node_modules");
const hasFirstPartyDsh = existsSync(join(REAL_MODULES, "@deepseek-ai", "dsh-session"));
const hasBuiltDist = existsSync(join(REPO, "dist", "src", "advanced.js"));

describe("P2D0 C7 — real cold-recovered trajectory context capsule", () => {
  it(
    "derives a bounded, read-only Capsule from real cold-recovered DSH evidence through the product path",
    () => {
      if (!hasBuiltDist) {
        // The build gate is a prerequisite, not a pass: report it rather than asserting.
        expect(hasBuiltDist, "dist/src/advanced.js is absent; run `pnpm run build`").toBe(true);
        return;
      }
      let report: Record<string, unknown> | null = null;
      try {
        const stdout = execFileSync(process.execPath, [join(REPO, "scripts", "trajectory_p2d0", "cold-capsule-gate.mjs")], {
          encoding: "utf8",
          maxBuffer: 32 * 1024 * 1024,
          timeout: 480_000,
          env: { ...process.env },
        });
        report = JSON.parse(stdout) as Record<string, unknown>;
      } catch (error) {
        const candidate = (error as { stdout?: string }).stdout;
        if (typeof candidate === "string" && candidate.trim() !== "") {
          report = JSON.parse(candidate) as Record<string, unknown>;
        }
      }
      expect(report).not.toBeNull();
      const outcome = report!.outcome as string;
      expect(["PASS", "SKIPPED", "BLOCKED", "NOT_ESTABLISHED"]).toContain(outcome);
      if (!hasFirstPartyDsh) {
        // §14.2: a missing dependency is reported, never counted as a qualified first-party result.
        expect(["SKIPPED", "BLOCKED"]).toContain(outcome);
        return;
      }
      // With the first-party tree present, the gate must PASS: a SKIPPED/BLOCKED/NOT_ESTABLISHED here is a
      // real absence of evidence, not a success.
      expect(outcome).toBe("PASS");
      expect(report!.qualified).toBe(true);
      expect(report!.modelCallsMade).toBe(0);
      expect(report!.privateSessionsAccessed).toBe(false);
      expect(report!.realFirstPartyDshRan).toBe(true);
      const processB = report!.processB as Record<string, unknown>;
      const capsule = processB.capsuleSummary as Record<string, unknown>;
      expect(capsule.authority).toBe("READ_ONLY_INSPECTION");
      expect(capsule.framing).toBe("HISTORICAL_DATA_NOT_INSTRUCTIONS");
      expect(capsule.eventCount as number).toBeGreaterThan(0);
      // The authorization boundary refuses an arbitrary attempt through the ordinary product path.
      expect(processB.arbitraryAttemptCapsuleState).toBe("NO_LINEAGE");
      expect(processB.arbitraryAttemptCapsuleIsNull).toBe(true);
    },
    480_000,
  );
});
