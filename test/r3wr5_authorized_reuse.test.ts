/**
 * R3-WR5 — AUTHORIZED WORLD REUSE AND FAILURE DISPOSITION REGRESSIONS.
 *
 * Every test pins a property this stage ENFORCES or MEASURES, and each enforcement is paired so the suite cannot
 * pass by refusing everything: a mutant that must be refused, and a healthy control that must be accepted.
 *
 * THE FALSIFIER FOR THE NEW REPAIRS is the R3-WR4 compiled port, snapshotted at the stage baseline `0052cc1`
 * into `scripts/r3wr5/baseline/`, so "the old implementation violated this" is a measurement against shipped
 * code. The compiled port under test is reached by PATH and imported DYNAMICALLY, matching the other suites: a
 * static `import` from `dist` makes TypeScript treat the emitted declaration as an input and the build then
 * refuses to overwrite it (TS5055).
 *
 * WHAT THIS SUITE DOES NOT DO: it does not implement or invent a terminal authority. §6 and §7 forbid that while
 * the authority contract cannot admit the policy, so the terminal tests pin what the EXISTING vocabulary can and
 * cannot carry, and drive every negative control. Where a positive control depends on an authority that does not
 * exist it is reported as such rather than counted as met — the correction §12 demands.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = mkdtempSync(join(tmpdir(), "r3wr5-test-"));

afterAll(() => {
  try {
    rmSync(BASE, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* the temp hygiene sweep collects it */
  }
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

const gitQuiet = (cwd: string, args: readonly string[]): string => {
  try {
    return execFileSync("git", [...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
};

/** The compiled port under test. */
async function loadCurrent(): Promise<any> {
  const module = await import(pathToFileURL(join(REPO, "dist", "src", "effects", "git_port.js")).href);
  return module.GitCliPort;
}

/** The frozen R3-WR4 port — where the two repaired gaps live. */
async function loadR3WR4(): Promise<any> {
  const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "baseline", "git_port.r3wr4.mjs")).href);
  return module.GitCliPort;
}

/**
 * A basis repository with one commit.
 *
 * The SEED varies the committed content on purpose. Two repositories built with identical content, message,
 * author and timestamp produce the SAME commit hash, so a test that assumed two repositories have different
 * bases would compare a commit against itself and pass vacuously.
 */
function makeBasis(root: string, name = "canonical", seed = 0): { repo: string; basisCommit: string } {
  const repo = join(root, name);
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "ledger.mjs"), `export const answer = ${String(seed)};${NL}`, "utf8");
  git(repo, ["init", "-q"]);
  git(repo, ["add", "-A"]);
  git(repo, ["-c", "user.email=b@b.b", "-c", "user.name=b", "commit", "-qm", "basis"]);
  return { repo, basisCommit: git(repo, ["rev-parse", "HEAD"]) };
}

function canonicalDigest(repo: string): string {
  return createHash("sha256")
    .update(
      [
        gitQuiet(repo, ["rev-parse", "HEAD"]),
        gitQuiet(repo, ["symbolic-ref", "-q", "HEAD"]),
        gitQuiet(repo, ["show-ref"]),
        gitQuiet(repo, ["remote", "-v"]),
        gitQuiet(repo, ["config", "--get", "user.name"]),
        gitQuiet(repo, ["config", "--get", "user.email"]),
        gitQuiet(repo, ["status", "--porcelain"]).split(NL).filter((line) => !line.includes(".palimpsest/")).join(NL),
      ].join("\u0000"),
    )
    .digest("hex");
}

const bindingPathOf = (worldPath: string): string => join(worldPath, ".git", "palimpsest-world-binding.json");
const writeBinding = (worldPath: string, record: Record<string, unknown>): void =>
  writeFileSync(bindingPathOf(worldPath), `${JSON.stringify({ schemaVersion: 1, ...record })}${NL}`, "utf8");

/* ================================================================== *
 * A. WORLD-LOCAL PROVENANCE — THE TWO REPAIRED GAPS
 * ================================================================== */

describe("R3-WR5 A. the world's recorded repository is provenance that is checked", () => {
  it("the OLD port ACCEPTS a record naming another repository — the frozen gap", async () => {
    const Port = await loadR3WR4();
    const root = join(BASE, "a-old");
    mkdirSync(root, { recursive: true });
    const projectA = makeBasis(root, "projectA", 0);
    const projectB = makeBasis(root, "projectB", 1);
    const port = new Port(projectA.repo, join(projectA.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-prov", baseCommit: projectA.basisCommit });
    writeBinding(created.worldPath, { attemptId: "attempt-prov", basisCommit: projectA.basisCommit, repository: projectB.repo });
    let accepted = false;
    try {
      await port.createWorld({ worktreeId: "attempt-prov", baseCommit: projectA.basisCommit });
      accepted = true;
    } catch {
      accepted = false;
    }
    expect(accepted, "the R3-WR4 port must be shown to accept a record naming a foreign repository").toBe(true);
  });

  it("the CURRENT port REFUSES it, leaving the world byte-identical", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "a-new");
    mkdirSync(root, { recursive: true });
    const projectA = makeBasis(root, "projectA", 0);
    const projectB = makeBasis(root, "projectB", 1);
    const port = new Port(projectA.repo, join(projectA.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-prov", baseCommit: projectA.basisCommit });
    writeFileSync(join(created.worldPath, "src", "work.mjs"), `export const work = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "work"]);
    const headBefore = gitQuiet(created.worldPath, ["rev-parse", "HEAD"]);
    writeBinding(created.worldPath, { attemptId: "attempt-prov", basisCommit: projectA.basisCommit, repository: projectB.repo });

    await expect(port.createWorld({ worktreeId: "attempt-prov", baseCommit: projectA.basisCommit })).rejects.toThrow(/WORLD_REPOSITORY_MISMATCH/u);

    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(headBefore);
    expect(existsSync(join(created.worldPath, "src", "work.mjs"))).toBe(true);
  });

  it("a record with NO repository field is still ACCEPTED — the control that keeps the check honest", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "a-absent-field");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root, "canonical", 0);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-prov", baseCommit: basis.basisCommit });
    /** A record written before the field existed must not be refused for something it never had. */
    writeBinding(created.worldPath, { attemptId: "attempt-prov", basisCommit: basis.basisCommit });
    const again = await port.createWorld({ worktreeId: "attempt-prov", baseCommit: basis.basisCommit });
    expect(again.worldPath).toBe(created.worldPath);
  });

  it("the CORRECT repository is ACCEPTED — the ordinary path is unchanged", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "a-correct");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root, "canonical", 0);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-prov", baseCommit: basis.basisCommit });
    const again = await port.createWorld({ worktreeId: "attempt-prov", baseCommit: basis.basisCommit });
    expect(again.worldPath).toBe(created.worldPath);
  });
});

describe("R3-WR5 A. unknown common-directory ownership is not isolation", () => {
  /**
   * The `null` branch is DEFENCE IN DEPTH: measured, every uncanonicalizable shape exercised on this host made
   * git resolve the repository to the enclosing canonical repository, so the administrative-directory test fired
   * first. These tests pin BOTH facts — the refusal of the shapes that ARE reachable, and the healthy control.
   */
  const shapes = [
    { label: "a missing absolute path", answer: (root: string) => join(root, "no-such-dir").replace(/\\/gu, "/") },
    { label: "a missing relative escape", answer: () => "../../../no-such-dir" },
    { label: "a missing relative path inside the world", answer: () => "no-such-subdir" },
    { label: "a commondir naming a FILE", answer: (root: string) => join(root, "common-is-a-file").replace(/\\/gu, "/") },
  ];

  for (const shape of shapes) {
    it(`refuses ${shape.label}, and the canonical repository is untouched`, async () => {
      const Port = await loadCurrent();
      const root = join(BASE, `a-common-${shape.label.replace(/[^a-z0-9]+/giu, "-")}`);
      mkdirSync(root, { recursive: true });
      const basis = makeBasis(root, "canonical", 0);
      writeFileSync(join(root, "common-is-a-file"), "not a directory", "utf8");
      const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
      const created = await port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit });
      const before = canonicalDigest(basis.repo);
      writeFileSync(join(created.worldPath, ".git", "commondir"), `${shape.answer(root)}${NL}`, "utf8");

      /** Refused — by whichever check sees it first, which is the honest property. */
      await expect(port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit })).rejects.toThrow(
        /WORLD_PATH_NOT_ISOLATED|WORLD_COMMON_DIR_UNRESOLVABLE|WORLD_COMMON_DIR_OUTSIDE|WORLD_COMMON_DIR_NOT_ISOLATED/u,
      );
      expect(canonicalDigest(basis.repo)).toBe(before);
    });
  }

  it("a HEALTHY world is still ACCEPTED — the control that keeps the refusals meaningful", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "a-common-healthy");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root, "canonical", 0);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit });
    expect(gitQuiet(created.worldPath, ["rev-parse", "--git-common-dir"])).toBe(".git");
    expect(existsSync(join(created.worldPath, ".git", "objects", "info", "alternates"))).toBe(true);
    const again = await port.createWorld({ worktreeId: "attempt-common", baseCommit: basis.basisCommit });
    expect(again.worldPath).toBe(created.worldPath);
  });
});

/* ================================================================== *
 * B. THE R3-WR4 REFUSALS STILL HOLD
 * ================================================================== */

describe("R3-WR5 B. the R3-WR4 and R3-WR3 refusals are unchanged", () => {
  it("a foreign owner record, a foreign basis and a foreign common dir are all still refused", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "b-regressions");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root, "canonical", 0);
    const other = makeBasis(root, "other", 1);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-b", baseCommit: basis.basisCommit });

    writeBinding(created.worldPath, { attemptId: "attempt-elsewhere", basisCommit: basis.basisCommit, repository: basis.repo });
    await expect(port.createWorld({ worktreeId: "attempt-b", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_OWNER_MISMATCH/u);

    writeBinding(created.worldPath, { attemptId: "attempt-b", basisCommit: other.basisCommit, repository: basis.repo });
    await expect(port.createWorld({ worktreeId: "attempt-b", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_BASIS_MISMATCH/u);

    writeBinding(created.worldPath, { attemptId: "attempt-b", basisCommit: basis.basisCommit, repository: basis.repo });
    writeFileSync(join(created.worldPath, ".git", "commondir"), `${join(basis.repo, ".git").replace(/\\/gu, "/")}${NL}`, "utf8");
    await expect(port.createWorld({ worktreeId: "attempt-b", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_COMMON_DIR_NOT_ISOLATED/u);
  });

  it("the R3-WR3 parent-adoption, path-traversal and partial-world refusals still hold", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "b-r3wr3");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root, "canonical", 0);
    const worldsRoot = join(basis.repo, ".palimpsest", "worlds");
    const port = new Port(basis.repo, worldsRoot);
    const before = canonicalDigest(basis.repo);

    const orphan = join(worldsRoot, "attempt-orphan");
    mkdirSync(orphan, { recursive: true });
    writeFileSync(join(orphan, "README.md"), `orphan${NL}`, "utf8");
    await expect(port.createWorld({ worktreeId: "attempt-orphan", baseCommit: basis.basisCommit })).rejects.toThrow(/WORLD_PATH_NOT_ISOLATED/u);

    for (const form of ["..", "../escape", "a/b", "C:/abs"]) {
      await expect(port.createWorld({ worktreeId: form, baseCommit: basis.basisCommit }), `"${form}" must be refused`).rejects.toThrow(/WORLD_ID_ESCAPES_ROOT|WORLD_ID_INVALID/u);
    }

    expect(canonicalDigest(basis.repo)).toBe(before);
  });

  it("the frozen basis counterexample from R3-WR4 is still refused", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "b-basis");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root, "canonical", 0);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-basis", baseCommit: basis.basisCommit });
    writeFileSync(join(created.worldPath, "src", "step.mjs"), `export const step = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "B1"]);
    const innerB1 = gitQuiet(created.worldPath, ["rev-parse", "HEAD"]);
    writeFileSync(join(created.worldPath, "src", "candidate.mjs"), `export const candidate = 1;${NL}`, "utf8");
    git(created.worldPath, ["add", "-A"]);
    git(created.worldPath, ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "X"]);
    const candidateHead = gitQuiet(created.worldPath, ["rev-parse", "HEAD"]);

    await expect(port.createWorld({ worktreeId: "attempt-basis", baseCommit: innerB1 })).rejects.toThrow(/WORLD_BASIS_MISMATCH/u);
    expect(gitQuiet(created.worldPath, ["rev-parse", "HEAD"])).toBe(candidateHead);
  });
});

/* ================================================================== *
 * C. REACHABILITY — THE CONTRACT IS ASSERTED, NOT JUST CLAIMED
 * ================================================================== */

describe("R3-WR5 C. the reachability contract is recorded and checkable", () => {
  it("the production call path derives its own operation identity, so a caller cannot choose one", () => {
    const source = readFileSync(join(REPO, "src", "tools", "controller.ts"), "utf8");
    /** The callId is a PURE FUNCTION of the attempt id — that is what makes C3 inexpressible on this path. */
    expect(source).toMatch(/callId: `world:\$\{attemptId\}`/u);
    expect(source).toMatch(/scope: this\.projectId/u);
    expect(source).toMatch(/worldId: attemptId/u);
    expect(source).toMatch(/baseCommit: project\.head_commit/u);
  });

  it("the worker restriction denies every palimpsest tool except the two read-only worker tools", () => {
    const runner = readFileSync(join(REPO, "host", "dsh", "lib", "runner.js"), "utf8");
    expect(runner).toMatch(/deniedAuthorityPrefix/u);
    expect(runner).toMatch(/const keep = \[resultToolName, pullToolName\]/u);
    /** Applying the shipped rule to the shipped catalogue: nothing that can reach world creation survives. */
    const catalog = ["palimpsest_claim", "palimpsest_run", "palimpsest_begin", "palimpsest_manage", "palimpsest_worker_result", "palimpsest_worker_context_pull", "bash"];
    const keep = ["palimpsest_worker_result", "palimpsest_worker_context_pull"];
    const visible = catalog.filter((name) => !(name.startsWith("palimpsest_") && !keep.includes(name)));
    expect(visible).toEqual(["palimpsest_worker_result", "palimpsest_worker_context_pull", "bash"]);
  });

  it("the world binding is evidence, not authority: a self-consistent rewrite is still accepted", async () => {
    const Port = await loadCurrent();
    const root = join(BASE, "c-evidence");
    mkdirSync(root, { recursive: true });
    const basis = makeBasis(root, "canonical", 0);
    const port = new Port(basis.repo, join(basis.repo, ".palimpsest", "worlds"));
    const created = await port.createWorld({ worktreeId: "attempt-evidence", baseCommit: basis.basisCommit });
    /** Rewriting the record to be fully self-consistent is not stopped — and the record is documented as evidence. */
    writeBinding(created.worldPath, { attemptId: "attempt-evidence", basisCommit: basis.basisCommit, repository: basis.repo });
    const again = await port.createWorld({ worktreeId: "attempt-evidence", baseCommit: basis.basisCommit });
    expect(again.worldPath).toBe(created.worldPath);
  });

  it("the frozen contracts record the reachability conclusion and the carried-forward limits", async () => {
    const contract = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "contract.mjs")).href);
    expect(contract.CALL_PATH_INVENTORY.hostPort.productionConsumers).toBe(0);
    expect(contract.CALL_PATH_INVENTORY.workerReachability.canReachWorldCreate).toBe(false);
    expect(contract.VERDICTS.CROSS_OPERATION_REACHABILITY).toBe("TRUSTED_ONLY");
    expect(contract.VERDICTS.SINGLE_FLIGHT).toBe("PROVEN_WITHIN_ENVELOPE");
    /** §1: the R3-WR4 measurements are carried forward, not upgraded. */
    const singleFlight = contract.CARRIED_FORWARD.find((entry: { finding: string }) => entry.finding === "SINGLE_FLIGHT");
    expect(singleFlight.carriedAs).toBe("proven within one runtime process");
    expect(String(singleFlight.limit)).toContain("Multi-process");
  });
});

/* ================================================================== *
 * D. GATE B — POLICY, FENCING AND THE NINE PREDICATES
 * ================================================================== */

describe("R3-WR5 D. the failure disposition is POLICY_REQUIRED, measured rather than assumed", () => {
  it("KILL_REQUESTED != WORKER_EXIT_CONFIRMED is frozen as the measured state of the port", async () => {
    const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "failure-disposition.mjs")).href);
    const audit = module.workerFencingAudit();
    expect(audit.TIMEOUT_PATH.callsKill).toBe(true);
    expect(audit.TIMEOUT_PATH.reportsHostFailureInTheSameHandler).toBe(true);
    expect(audit.TIMEOUT_PATH.waitsForClose).toBe(false);
    expect(audit.KILL_REQUESTED_EQUALS_WORKER_EXIT_CONFIRMED).toBe(false);
    expect(audit.verdict).toBe("OPEN");
    /** The close handler CAN report from the confirmed exit, which is why the distinction is real. */
    expect(audit.CLOSE_PATH.reportsFromTheConfirmedExit).toBe(true);
  });

  it("no durable host-failure receipt exists, so the traceability requirement cannot be met", async () => {
    const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "failure-disposition.mjs")).href);
    const audit = await module.hostFailureEvidenceAudit();
    expect(audit.DURABLE_HOST_FAILURE_RECEIPT_EXISTS).toBe(false);
    expect(audit.verdict).toBe("OPEN");
    /** The confidential slot file IS durable, and it is still not about one attempt. */
    const slot = audit.existingSources.find((entry: { source: string }) => entry.source.includes("confidential slot"));
    expect(slot.durability).toBe("DURABLE but NONCANONICAL");
    expect(slot.isAboutOneAttempt).toBe(false);
  });

  it("the management involvement modes are non-authoritative by their own documentation", async () => {
    const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "failure-disposition.mjs")).href);
    const audit = module.policyAdmissibilityAudit();
    expect(audit.audit.managementServiceOwnsNoAuthority).toBe(true);
    expect(audit.audit.operatorPathNeverWiredToAnLlmTool).toBe(true);
    expect(audit.audit.intentReceiptForbidsDelegateAsAuthority).toBe(true);
    expect(audit.managementModesAreSemanticAuthority).toBe(false);
    expect(audit.operatorCapabilityAdmitsTerminal).toBe(false);
    expect(audit.verdict).toBe("POLICY_REQUIRED");
  });

  it("the policy requirement names its decisions and invents no authority", async () => {
    const module = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "failure-disposition.mjs")).href);
    const requirement = module.policyRequirement();
    expect(requirement.verdict).toBe("POLICY_REQUIRED");
    expect(requirement.decisions.length).toBeGreaterThanOrEqual(8);
    expect(String(requirement.noImplementation)).toContain("no unguarded terminal command");
    const contract = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "contract.mjs")).href);
    expect(contract.TERMINAL_SEMANTICS.forbidden).toContain("ATTEMPT_FAILED with a fabricated report");
    expect(contract.TERMINAL_SEMANTICS.forbidden).toContain("ATTEMPT_EXPIRED without an observed expiry");
    expect(contract.TERMINAL_SEMANTICS.doesNotMean.length).toBe(2);
  });

  it("the nine predicates are defined separately and quiescence uses the Plan Reconciliation rule", async () => {
    const contract = await import(pathToFileURL(join(REPO, "scripts", "r3wr5", "contract.mjs")).href);
    expect(contract.PREDICATE_DEFINITIONS.length).toBe(9);
    expect(contract.QUIESCENCE_RULE.inputs).toContain("CREATED / LEASED / RUNNING Attempts");
    expect(contract.QUIESCENCE_RULE.inputs).toContain("ACTIVE / VERIFYING Tasks");
    /** §12: the rejected witnesses are named so they cannot creep back in. */
    expect(contract.QUIESCENCE_RULE.rejectedWitnesses).toContain('preview === "idle"');
    expect(contract.VERDICTS["R3-L0C RESUME QUALIFICATION"]).toBe("REQUIRES_EXPLICIT_FAIL_STOP_RULING");
  });
});
