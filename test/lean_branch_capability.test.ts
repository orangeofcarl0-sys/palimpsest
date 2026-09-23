/**
 * PLMP-LEAN-1 §C.23 (D1-g) — the branch CAPABILITY PROFILE.
 *
 * `worker 有 frozen project snapshot，但没有读取它的能力` was the gap the D1 live gate measured: the
 * branch's cwd was the frozen snapshot while its tool set was exactly `palimpsest_branch_result`, so
 * the worker could not read the very basis it was given.
 *
 * The fix is a capability profile the branch REQUEST carries, composed by the host into a concrete
 * tool allowlist. Two facts make it a capability boundary rather than a promise, and both are
 * asserted here:
 *
 *   1. the DEFAULT is `RESULT_ONLY`, so every existing blocking branch keeps its tool set byte for
 *      byte (the empty request cannot widen anything);
 *   2. the read-only set is exactly `read`/`glob`/`grep` — no writer, no shell, no terminal — so
 *      "the worker cannot modify the canonical project" is a property of the set.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { BRANCH_RESULT_TOOL_NAME, composeBranchHostEnvironment } from "../src/deployment/branch_host.js";
import { dshSubprocessBranchExecutionPort } from "../src/reasoning_cell/branch_execution.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const BRIEF = {
  schemaVersion: 1 as const,
  cell: { schemaVersion: 1 as const, cellId: "cell-cap" },
  branch: { schemaVersion: 1 as const, cellId: "cell-cap", branchId: "br-cap" },
  objective: "objective",
  question: "what is the complexity of dedupe?",
  frontierBasis: { schemaVersion: 1 as const, cellId: "cell-cap", frontierRevision: 0, frontierDigest: "a".repeat(64) },
  acceptedClaims: Object.freeze([] as never[]),
};

const allowedOf = (raw: unknown): readonly string[] => {
  const composed = composeBranchHostEnvironment(raw);
  if (!composed.ok) throw new Error(composed.detail);
  return composed.environment.allowedTools;
};

describe("§C.23 the profile decides the branch's capability SET", () => {
  it("an absent profile is RESULT_ONLY: the blocking path's tool set, unchanged", () => {
    const bare = composeBranchHostEnvironment({ ...BRIEF });
    if (!bare.ok) throw new Error(bare.detail);
    expect(bare.environment.payload.capabilityProfile).toBe("RESULT_ONLY");
    expect(bare.environment.allowedTools).toEqual([BRANCH_RESULT_TOOL_NAME]);
    // The Palimpsest-composed tool set is still exactly one tool, for every profile.
    expect(bare.environment.toolNames).toEqual([BRANCH_RESULT_TOOL_NAME]);
  });

  it("PROJECT_READ_ONLY adds exactly the read-only project tools", () => {
    const allowed = allowedOf({ brief: { ...BRIEF }, capabilityProfile: "PROJECT_READ_ONLY" });
    expect(allowed).toEqual(["read", "glob", "grep", BRANCH_RESULT_TOOL_NAME]);
    // The boundary is the ABSENCE of anything that can change bytes or run a program.
    for (const forbidden of ["write", "edit", "str_replace", "pwsh", "bash", "shell", "terminal", "subagent", "skill", "web", "jobs"]) {
      expect(allowed, `a read-only branch must not be offered "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("a profile that is not in the vocabulary is refused, never silently downgraded", () => {
    const composed = composeBranchHostEnvironment({ brief: { ...BRIEF }, capabilityProfile: "PROJECT_READ_WRITE" });
    expect(composed.ok).toBe(false);
    if (composed.ok) return;
    expect(composed.detail).toContain("capabilityProfile must be one of RESULT_ONLY, PROJECT_READ_ONLY");
  });

  it("the evidence envelope and the profile compose together", () => {
    const composed = composeBranchHostEnvironment({
      brief: { ...BRIEF },
      evidenceContext: { allowedEvidenceRefs: ["pev-1"], selections: [] },
      capabilityProfile: "PROJECT_READ_ONLY",
    });
    if (!composed.ok) throw new Error(composed.detail);
    expect(composed.environment.payload.capabilityProfile).toBe("PROJECT_READ_ONLY");
    expect(composed.environment.payload.allowlist).toEqual(["pev-1"]);
    expect(composed.environment.payload.enforceAllowlist).toBe(true);
  });
});

describe("§C.23 the profile survives the trip through the real port", () => {
  /**
   * A scripted branch host that WRITES DOWN the payload it was handed and then reports one honest
   * result. The port only ever reads the result line, so the payload itself can only be observed from
   * inside the host — which is exactly where a real branch reads it too.
   */
  function scriptedHost() {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-cap-"));
    const workDir = join(root, "repo");
    mkdirSync(workDir, { recursive: true });
    const observed = join(root, "observed.json");
    const hostScript = join(root, "host.mjs");
    writeFileSync(
      hostScript,
      [
        'import { readFileSync, writeFileSync } from "node:fs";',
        "const index = process.argv.indexOf('--branch');",
        'const payload = JSON.parse(readFileSync(process.argv[index + 1], "utf8"));',
        "writeFileSync(process.env.PALGATE_OBSERVED, JSON.stringify({",
        "  profile: payload.capabilityProfile ?? null,",
        "  isEnvelope: payload.brief !== undefined,",
        "  question: payload.brief !== undefined ? payload.brief.question : payload.question,",
        "}));",
        `process.stdout.write(${JSON.stringify("PALIMPSEST_BRANCH_RESULT ")} + JSON.stringify({ status: "completed", statement: "observed the payload" }) + String.fromCharCode(10));`,
        "",
      ].join(String.fromCharCode(10)),
    );
    cleanups.push(() => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows keeps the directory busy while a handle is open; the OS reaps it.
      }
    });
    return { root, workDir, hostScript, observed };
  }

  const runScripted = async (args: { readonly capabilityProfile?: "RESULT_ONLY" | "PROJECT_READ_ONLY" }) => {
    const f = scriptedHost();
    const previous = process.env.PALGATE_OBSERVED;
    process.env.PALGATE_OBSERVED = f.observed;
    try {
      const port = dshSubprocessBranchExecutionPort({
        dshBin: f.hostScript,
        profile: "cap-test",
        workDir: f.workDir,
        nodeExecPath: process.execPath,
      });
      const outcome = (await port.run({ brief: { ...BRIEF }, ...args })) as { readonly status: string; readonly detail: string };
      expect(outcome.status, outcome.detail).toBe("completed");
      return JSON.parse(readFileSync(f.observed, "utf8")) as {
        readonly profile: string | null;
        readonly isEnvelope: boolean;
        readonly question: string;
      };
    } finally {
      if (previous === undefined) delete process.env.PALGATE_OBSERVED;
      else process.env.PALGATE_OBSERVED = previous;
    }
  };

  it("a bare request still writes a bare brief — no envelope appears out of nowhere", async () => {
    const observed = await runScripted({});
    expect(observed.isEnvelope).toBe(false);
    expect(observed.profile).toBeNull();
    expect(observed.question).toBe(BRIEF.question);
  });

  it("the delegation's request carries PROJECT_READ_ONLY into the payload the branch actually reads", async () => {
    const observed = await runScripted({ capabilityProfile: "PROJECT_READ_ONLY" });
    expect(observed.isEnvelope).toBe(true);
    expect(observed.profile).toBe("PROJECT_READ_ONLY");
    expect(observed.question).toBe(BRIEF.question);
  });

  it("an explicit RESULT_ONLY is written as such — the default is asked for, not assumed", async () => {
    const observed = await runScripted({ capabilityProfile: "RESULT_ONLY" });
    expect(observed.profile).toBe("RESULT_ONLY");
    // ...and it composes the same capability set the default does.
    expect(allowedOf({ brief: { ...BRIEF }, capabilityProfile: "RESULT_ONLY" })).toEqual([BRANCH_RESULT_TOOL_NAME]);
  });
});
