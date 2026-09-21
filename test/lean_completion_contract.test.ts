/**
 * PLMP-LEAN-1 phase 2A-Q / 2A-Q-R — the derived completion contract, its verification policy, and
 * two-layer readiness. Acceptance LEAN-A05, LEAN-A06, LEAN-A14.
 *
 * The contract is a PURE FUNCTION, so most of these are pure tests: no store, no git, no clock. That
 * is the point of the design — what a task must show is derivable, so it can be displayed before the
 * work starts and demanded after it, from the same object.
 *
 * Four properties are worth stating plainly, because they are what these phases exist for:
 *
 *   - The ENVELOPE IS BASIS, NOT STORAGE. Nothing here adds `required_evidence` or
 *     `verification_requirement` to the envelope or to any event.
 *   - `RequirementBasis ≠ CapabilityAssessment`. Capabilities are not an input to the contract at all,
 *     so a verifier being configured mid-task cannot change `basisDigest` while the bar stands still.
 *   - Verification has TWO STRENGTHS. Conflating them made the product manufacture executors for
 *     ordinary work, which contradicts `INV-6`.
 *   - `Task readiness is actionable; deployment readiness is descriptive.` A deployment gap is a
 *     blocker only where a task needs that capability, and the rule is exactly
 *     `known requirement ∧ missing capability ⇒ early blocker` — nothing weaker, nothing broader.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  deriveAttemptCompletionContract,
  deriveCompletionReadiness,
  type AttemptCompletionContract,
  type CompletionCapabilities,
} from "../src/domain/completion_contract.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const CAPABLE: CompletionCapabilities = { independentVerifierAvailable: true, sandboxSpawnVerified: true };
const NO_VERIFIER: CompletionCapabilities = { independentVerifierAvailable: false, sandboxSpawnVerified: true };
const BARE: CompletionCapabilities = { independentVerifierAvailable: false, sandboxSpawnVerified: false };

function standardWith(clauses: ProjectStandard["clauses"], confirmed = true): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze(clauses),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed,
    notes: Object.freeze([]),
  });
}

const TEST_COMMAND = ["node", "-e", "process.exit(0)"];
const LINT_COMMAND = ["node", "--version"];

const TEST_STANDARD = standardWith([
  Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...TEST_COMMAND]), predicate: "tests_pass" as const }),
  Object.freeze({ kind: "scope_respected" as const }),
]);

/** Two command clauses, so the mechanical oracle is not a single command. */
const WIDE_STANDARD = standardWith([
  Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...TEST_COMMAND]), predicate: "tests_pass" as const }),
  Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...LINT_COMMAND]), predicate: "lint_pass" as const }),
  Object.freeze({ kind: "scope_respected" as const }),
]);

const ALLOWED = [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }];
const ALLOWED_WIDE = [...ALLOWED, { executable: "node", argv_prefix: ["--version"] }];

function contractFor(input: {
  standard?: ProjectStandard;
  writePaths?: readonly string[];
  requiredArtifacts?: readonly string[];
  allowedCommands?: readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
}): AttemptCompletionContract {
  const writePaths = input.writePaths ?? ["src/dedupe.ts"];
  const requiredArtifacts = input.requiredArtifacts ?? [];
  return deriveAttemptCompletionContract({
    standard: input.standard ?? TEST_STANDARD,
    task: { write_paths: writePaths, required_artifacts: requiredArtifacts },
    envelope: {
      write_paths: writePaths,
      required_artifacts: requiredArtifacts,
      allowed_commands: input.allowedCommands ?? ALLOWED,
    },
  });
}

describe("LEAN-A05: the requirement is DERIVED, and the envelope is basis rather than storage", () => {
  it("A05 a task that changes code under a confirmed test standard requires tests_pass", () => {
    const contract = contractFor({});
    const commands = contract.mechanical.filter((check) => check.kind === "run_standard_command");
    expect(commands).toEqual([
      { kind: "run_standard_command", command: TEST_COMMAND, predicate: "tests_pass" },
    ]);
  });

  it("A05 no evidence requirement is stored anywhere — the envelope is an INPUT", () => {
    expect(contractFor({}).basisDigest).toBe(contractFor({}).basisDigest);
    const other = standardWith([Object.freeze({ kind: "scope_respected" as const })]);
    expect(contractFor({ standard: other }).basisDigest).not.toBe(contractFor({}).basisDigest);
  });

  it("A05 a documentation-only task narrows the command requirement by a DECLARED rule, and says so", () => {
    const contract = contractFor({ writePaths: ["docs/notes.md"] });
    expect(contract.mechanical.some((check) => check.kind === "run_standard_command")).toBe(false);
    expect(contract.diagnostics.join(" ")).toContain("does not apply here");
    expect(contract.diagnostics.join(" ")).toContain("not by the agent");
    expect(contract.mechanical.some((check) => check.kind === "assert_write_scope")).toBe(true);
  });
});

describe("LEAN-A06: scope is unconditional; expected artifacts only ever come from PRE-DECLARED paths", () => {
  it("A06 write scope is required unconditionally — even for a task that declares no write path", () => {
    expect(contractFor({ writePaths: [] }).mechanical).toContainEqual({ kind: "assert_write_scope" });
  });

  it("A06 expected_files_exist is required only from pre-declared paths", () => {
    expect(contractFor({ requiredArtifacts: ["src/dedupe.ts"] }).mechanical).toContainEqual({
      kind: "assert_required_artifacts",
      paths: ["src/dedupe.ts"],
    });
    // A task that declares no artifact requires no artifact check — even though it will change files.
    expect(contractFor({ writePaths: ["src/a.ts", "src/b/c.ts"] }).mechanical.some((check) => check.kind === "assert_required_artifacts")).toBe(false);
  });

  it("A06 the standard's own declared paths join the requirement; the observed diff never does", () => {
    const standard = standardWith([
      Object.freeze({ kind: "scope_respected" as const }),
      Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["README.md"]) }),
    ]);
    expect(contractFor({ standard, requiredArtifacts: ["src/dedupe.ts"] }).mechanical).toContainEqual({
      kind: "assert_required_artifacts",
      paths: ["README.md", "src/dedupe.ts"],
    });
  });
});

describe("2A-Q-R calibration: verification has two strengths, and REQUIRED stays narrow", () => {
  it("a contract-boundary write path is REQUIRED — a strong risk knowable before the work runs", () => {
    const contract = contractFor({ writePaths: ["src/schema/models.ts"] });
    expect(contract.verification.required).toBe(true);
    expect(contract.verification.requiredReasons.join(" ")).toContain("contract_boundary");
  });

  it("a single-command mechanical bar is RECOMMENDED, never REQUIRED", () => {
    const contract = contractFor({});
    // The calibration: "one command" is a poor proxy for "one evidence fact" — one `npm test` may run
    // five checks or five hundred — so it must not manufacture an executor for ordinary work.
    expect(contract.verification.required).toBe(false);
    expect(contract.verification.requiredReasons).toEqual([]);
    expect(contract.verification.recommended).toBe(true);
    expect(contract.verification.recommendationReasons.join(" ")).toContain("single_command_bar");
  });

  it("a wide mechanical bar with no boundary path recommends nothing either", () => {
    const contract = contractFor({ standard: WIDE_STANDARD, allowedCommands: ALLOWED_WIDE });
    expect(contract.verification.required).toBe(false);
    expect(contract.verification.recommended).toBe(false);
  });

  it("the trigger name says what it measures: single_command_bar, not single_evidence", () => {
    const contract = contractFor({});
    const text = contract.verification.recommendationReasons.join(" ");
    expect(text).toContain("single_command_bar");
    expect(text).not.toContain("single_evidence");
  });
});

describe("2A-Q-R: RequirementBasis ≠ CapabilityAssessment", () => {
  it("capabilities are not an input, so a verifier appearing mid-task cannot move basisDigest", () => {
    // `deriveAttemptCompletionContract` takes no capabilities at all — the separation is structural,
    // not a convention. Two derivations from the same normative inputs are identical, and the
    // readiness assessment is where capability differences show up.
    const contract = contractFor({});
    const atT0 = deriveCompletionReadiness({
      standard: TEST_STANDARD,
      authorizedCommands: ALLOWED,
      capabilities: NO_VERIFIER,
      contract,
    });
    const atT1 = deriveCompletionReadiness({
      standard: TEST_STANDARD,
      authorizedCommands: ALLOWED,
      capabilities: CAPABLE,
      contract,
    });
    // The bar is the same object...
    expect(atT1.deployment.independentVerifierAvailable).not.toBe(atT0.deployment.independentVerifierAvailable);
    // ...and only the ASSESSMENT moved.
    expect(contract.basisDigest).toBe(contractFor({}).basisDigest);
  });

  it("no capability appears in the contract's diagnostics either", () => {
    const text = contractFor({}).diagnostics.join(" ");
    expect(text).not.toContain("verifier");
    expect(text).not.toContain("sandbox");
  });
});

describe("LEAN-A14: task readiness is actionable, deployment readiness is descriptive", () => {
  const readiness = (input: Parameters<typeof deriveCompletionReadiness>[0]) => deriveCompletionReadiness(input);

  it("A14 an unconfirmed standard is INCOMPLETE — nothing can be derived at all", () => {
    const result = readiness({
      standard: standardWith([], false),
      authorizedCommands: ALLOWED,
      capabilities: CAPABLE,
    });
    expect(result.deployment.standardConfirmed).toBe(false);
    expect(result.deployment.state).toBe("INCOMPLETE");
    expect(result.deployment.gaps.join(" ")).toContain("no confirmed completion standard");
    expect(result.task).toBeNull();
  });

  it("A14 a deployment with no verifier is DEGRADED, NOT blocked — and a task needing none is READY", () => {
    const contract = contractFor({ standard: WIDE_STANDARD, allowedCommands: ALLOWED_WIDE });
    const result = readiness({
      standard: WIDE_STANDARD,
      authorizedCommands: ALLOWED_WIDE,
      capabilities: NO_VERIFIER,
      contract,
    });
    // Descriptive layer: the gap is named...
    expect(result.deployment.state).toBe("DEGRADED");
    expect(result.deployment.gaps.join(" ")).toContain("no verifier");
    // ...and the actionable layer still says READY, because this task needs nothing that is missing.
    // A global BLOCKED here would contradict the task layer — the two answer different questions.
    expect(result.task?.verificationRequired).toBe(false);
    expect(result.task?.state).toBe("READY");
    expect(result.task?.blockers).toEqual([]);
  });

  it("A14 a task that REQUIRES verification is blocked before the work starts, not at promotion", () => {
    const contract = contractFor({ writePaths: ["src/schema/models.ts"] });
    const result = readiness({
      standard: TEST_STANDARD,
      authorizedCommands: ALLOWED,
      capabilities: NO_VERIFIER,
      contract,
    });
    expect(result.task?.state).toBe("BLOCKED");
    expect(result.task?.verificationSatisfiable).toBe(false);
    expect(result.task?.blockers.join(" ")).toContain("REQUIRES independent verification");
  });

  it("A14 a RECOMMENDED-but-unavailable verifier is an advisory, never a blocker", () => {
    const contract = contractFor({});
    expect(contract.verification.recommended).toBe(true);
    const result = readiness({
      standard: TEST_STANDARD,
      authorizedCommands: ALLOWED,
      capabilities: NO_VERIFIER,
      contract,
    });
    expect(result.task?.state).toBe("READY");
    expect(result.task?.blockers).toEqual([]);
    expect(result.task?.advisories.join(" ")).toContain("recommended");
    expect(result.task?.advisories.join(" ")).toContain("not a reason to refuse");
  });

  it("A14 a required command the envelope does not authorize is surfaced NOW, not discovered at finish", () => {
    const contract = contractFor({ allowedCommands: [] });
    expect(contract.diagnostics.join(" ")).toContain("does not authorize it");
    expect(contract.diagnostics.join(" ")).toContain("the agent cannot");
    const result = readiness({
      standard: TEST_STANDARD,
      authorizedCommands: ALLOWED,
      capabilities: CAPABLE,
      contract,
    });
    expect(result.task?.state).toBe("BLOCKED");
    expect(result.task?.blockers.join(" ")).toContain("does not authorize it");
  });

  it("A14 a task that must RUN something is blocked when the sandbox cannot spawn", () => {
    const contract = contractFor({});
    const result = readiness({
      standard: TEST_STANDARD,
      authorizedCommands: ALLOWED,
      capabilities: BARE,
      contract,
    });
    expect(result.task?.state).toBe("BLOCKED");
    expect(result.task?.blockers.join(" ")).toContain("sandbox can spawn");
  });
});

/* -------------------------------------------------------------------------- *
 * The derivation is a PROJECTION, not a truth owner: reaching it appends nothing.
 * -------------------------------------------------------------------------- */

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

describe("2A-Q: readiness is reachable and the derivation stores nothing", () => {
  it("deriving the contract and readiness appends NO event, and readiness reflects the deployment", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-2aq-"));
    const repo = join(root, "repo");
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
    const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
    cleanups.push(() => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows keeps the directory busy while a sqlite handle is open; the OS reaps it.
      }
    });

    const git = new GitCliPort(repo, join(repo, ".palimpsest", "worktrees"));
    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "twoaq",
        databasePath: join(repo, ".palimpsest", "p.sqlite"),
        ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
        repository: repo,
        git,
        execution: "in-place",
        standard: TEST_STANDARD,
        policy: trustedDefaultPolicy({ allowed_commands: ALLOWED }),
      } as never,
    );
    cleanups.push(() => void installed.dispose());

    const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      const tool = installed.tools.find((entry) => entry.name === name);
      if (tool === undefined) throw new Error(`no core tool ${name}`);
      return (await tool.execute(args, {
        callId: `c-${name}`,
        rootCallId: `r-${name}`,
        name,
        arguments: args,
        signal: new AbortController().signal,
      })) as Record<string, unknown>;
    };

    await call("palimpsest_start", {
      projectId: "twoaq",
      goal: "make dedupe cheap",
      headCommit: head,
      tasks: [
        { task_id: "t1", objective: "rewrite dedupe", depends_on: [], write_paths: ["src/dedupe.ts"], required_artifacts: ["src/dedupe.ts"] },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    await call("palimpsest_claim", { attemptId: created.entityId });

    const countEvents = (): number =>
      (installed.controller.store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }).c;

    const before = countEvents();
    // Readiness is answered through the APPLICATION surface — the same object the HTTP governance
    // payload exposes — and answering it must not write anything.
    const first = installed.application.work.completionReadiness();
    const second = installed.application.work.completionReadiness();
    expect(countEvents()).toBe(before);
    expect(second).toEqual(first);

    expect(first.deployment.standardConfirmed).toBe(true);
    expect(first.deployment.commandsAuthorized).toBe(true);
    expect(first.task).not.toBeNull();
    // This fixture composes no verifier and no verification store, so the deployment layer is
    // DEGRADED and names the gap — while the TASK stays READY, because a single-command bar is only a
    // RECOMMENDATION. That disagreement is the calibration working: the deployment is descriptive,
    // the task layer is what decides, and ordinary work is not blocked for want of an executor.
    expect(first.deployment.independentVerifierAvailable).toBe(false);
    expect(first.deployment.state).toBe("DEGRADED");
    expect(first.task?.verificationRequired).toBe(false);
    expect(first.task?.verificationRecommended).toBe(true);
    expect(first.task?.state).toBe("READY");
    expect(first.task?.advisories.join(" ")).toContain("recommended");

    // The contract itself is reachable and deterministic for the same attempt.
    const direct = installed.controller.completionContract(created.entityId);
    expect(direct).not.toBeNull();
    expect(direct?.basisDigest).toBe(installed.controller.completionContract(created.entityId)?.basisDigest);
    expect(countEvents()).toBe(before);
  }, 60000);
});
