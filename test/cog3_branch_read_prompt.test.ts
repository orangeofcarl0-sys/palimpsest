/**
 * COG-3 — the delegated branch's task text must not contradict the capability set it was given.
 *
 * Measured defect: a `PROJECT_READ_ONLY` delegation was composed with `read`/`glob`/`grep` in its
 * restricted tool set, but `branchTask` told it it had "exactly ONE tool" and to reason "using ONLY
 * the material above". The live branch made exactly one call (`palimpsest_branch_result`) and
 * answered "undetermined" while the answer sat in a tracked file at its own basis commit.
 *
 * These tests hold both halves: the RESULT_ONLY wording is unchanged, and the PROJECT_READ_ONLY
 * wording names the read tools and no longer claims a single-tool boundary.
 */
import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";

const moduleUrl = new URL("../host/dsh/lib/branch_prompt.js", import.meta.url).href;

interface BranchPayload {
  readonly cellId: string;
  readonly branchId: string;
  readonly brief: {
    readonly objective: string;
    readonly question: string;
    readonly frontierBasis: unknown;
    readonly acceptedClaims: readonly unknown[];
  };
  readonly allowlist: readonly string[];
  readonly enforceAllowlist: boolean;
  readonly capabilityProfile?: "RESULT_ONLY" | "PROJECT_READ_ONLY";
}

const BASE: BranchPayload = {
  cellId: "cell-cog3",
  branchId: "branch-cog3",
  brief: {
    objective: "Digitise the priority collections",
    question: "Can the Northgate site support scanning the nitrate collection?",
    frontierBasis: null,
    acceptedClaims: [],
  },
  allowlist: [],
  enforceAllowlist: false,
};

async function branchTask(payload: BranchPayload): Promise<string> {
  const module = (await import(moduleUrl)) as { readonly branchTask: (input: BranchPayload) => string };
  return module.branchTask(payload);
}

describe("COG-3 branch prompt", () => {
  it("RESULT_ONLY keeps the single-tool contract byte-for-byte in meaning", async () => {
    const text = await branchTask({ ...BASE, capabilityProfile: "RESULT_ONLY" });
    expect(text).toContain("You have exactly ONE tool, `palimpsest_branch_result`");
    expect(text).toContain("using ONLY the material above");
    expect(text).toContain("Call `palimpsest_branch_result` EXACTLY ONCE");
    expect(text).not.toContain("read-only tools");
  });

  it("PROJECT_READ_ONLY names the host read tools it is actually allowed to call", async () => {
    const text = await branchTask({ ...BASE, capabilityProfile: "PROJECT_READ_ONLY" });
    expect(text).toContain("`read`");
    expect(text).toContain("`glob`");
    expect(text).toContain("`grep`");
  });

  it("PROJECT_READ_ONLY does not claim a single-tool boundary", async () => {
    const text = await branchTask({ ...BASE, capabilityProfile: "PROJECT_READ_ONLY" });
    expect(text).not.toContain("exactly ONE tool");
    expect(text).not.toContain("using ONLY the material above");
  });

  it("PROJECT_READ_ONLY still requires exactly one branch result and grants no writes", async () => {
    const text = await branchTask({ ...BASE, capabilityProfile: "PROJECT_READ_ONLY" });
    expect(text).toContain("Call `palimpsest_branch_result` EXACTLY ONCE");
    expect(text).toContain("must not write");
    expect(text).toContain("Nothing you find there is Evidence");
  });

  it("PROJECT_READ_ONLY without an allowlist tells the branch not to send file paths as evidenceRefs", async () => {
    const text = await branchTask({ ...BASE, capabilityProfile: "PROJECT_READ_ONLY" });
    expect(text).toContain("do not send `evidenceRefs`");
    expect(text).toContain("Name the files you relied on inside the statement");
  });
});
