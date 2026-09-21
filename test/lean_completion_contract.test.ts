/**
 * PLMP-LEAN-1 phase 2A-Q — the derived completion contract and two-layer readiness.
 * Acceptance LEAN-A05, LEAN-A06, LEAN-A14.
 *
 * The contract is a PURE FUNCTION, so most of these are pure tests: no store, no git, no clock. That
 * is the point of the design — what a task must show is derivable, so it can be displayed before the
 * work starts and demanded after it, from the same object.
 *
 * The two properties worth stating plainly, because they are what the phase exists for:
 *
 *   - The ENVELOPE IS BASIS, NOT STORAGE. Nothing here adds `required_evidence` or
 *     `verification_requirement` to the envelope or to any event: the requirement is derived, and the
 *     envelope is one of its inputs.
 *   - Readiness has TWO LAYERS. "No independent verifier is composed" is a deployment fact, and it is
 *     a TASK blocker only when this task actually needs one. Marking every project NOT READY for a
 *     requirement it does not have would be dishonest.
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
const TEST_STANDARD = standardWith([
  Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...TEST_COMMAND]), predicate: "tests_pass" as const }),
  Object.freeze({ kind: "scope_respected" as const }),
]);

const ALLOWED = [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }];

function contractFor(input: {
  standard?: ProjectStandard;
  writePaths?: readonly string[];
  requiredArtifacts?: readonly string[];
  allowedCommands?: readonly { readonly executable: string; readonly argv_prefix: readonly string[] }[];
  capabilities?: CompletionCapabilities;
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
    capabilities: input.capabilities ?? CAPABLE,
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
    // Two derivations from identical inputs are byte-identical, which is what makes "the bar did not
    // move after the result was seen" checkable rather than promised.
    expect(contractFor({}).basisDigest).toBe(contractFor({}).basisDigest);
    // Changing the standard changes the digest: the bar is a function of the stated standard.
    const other = standardWith([Object.freeze({ kind: "scope_respected" as const })]);
    expect(contractFor({ standard: other }).basisDigest).not.toBe(contractFor({}).basisDigest);
  });

  it("A05 a documentation-only task narrows the command requirement by a DECLARED rule, and says so", () => {
    const contract = contractFor({ writePaths: ["docs/notes.md"] });
    expect(contract.mechanical.some((check) => check.kind === "run_standard_command")).toBe(false);
    expect(contract.diagnostics.join(" ")).toContain("does not apply here");
    // The narrowing names its rule and disclaims the agent, so it is auditable rather than silent.
    expect(contract.diagnostics.join(" ")).toContain("not by the agent");
    // Narrowing may never remove the scope assertion: that one is unconditional.
    expect(contract.mechanical.some((check) => check.kind === "assert_write_scope")).toBe(true);
  });
});

describe("LEAN-A06: scope is unconditional; expected artifacts only ever come from PRE-DECLARED paths", () => {
  it("A06 write scope is required unconditionally — even for a task that declares no write path", () => {
    const contract = contractFor({ writePaths: [] });
    expect(contract.mechanical).toContainEqual({ kind: "assert_write_scope" });
  });

  it("A06 expected_files_exist is required only from pre-declared paths", () => {
    const withArtifacts = contractFor({ requiredArtifacts: ["src/dedupe.ts"] });
    expect(withArtifacts.mechanical).toContainEqual({
      kind: "assert_required_artifacts",
      paths: ["src/dedupe.ts"],
    });
    // A task that declares no artifact requires no artifact check — even though it will change a file.
    const withoutArtifacts = contractFor({ writePaths: ["src/a.ts", "src/b/c.ts"] });
    expect(withoutArtifacts.mechanical.some((check) => check.kind === "assert_required_artifacts")).toBe(false);
  });

  it("A06 the standard's own declared paths join the requirement; the observed diff never does", () => {
    const standard = standardWith([
      Object.freeze({ kind: "scope_respected" as const }),
      Object.freeze({ kind: "files_exist" as const, paths: Object.freeze(["README.md"]) }),
    ]);
    const contract = contractFor({ standard, requiredArtifacts: ["src/dedupe.ts"] });
    expect(contract.mechanical).toContainEqual({
      kind: "assert_required_artifacts",
      paths: ["README.md", "src/dedupe.ts"],
    });
  });
});

describe("2A-Q: the verification requirement is DERIVED here and EXECUTED in 2B", () => {
  it("a contract-boundary write path requires independent verification, with a named reason", () => {
    const contract = contractFor({ writePaths: ["src/schema/models.ts"] });
    expect(contract.verification.required).toBe(true);
    expect(contract.verification.reasons.join(" ")).toContain("contract_boundary");
  });

  it("a single-command mechanical bar is thin evidence and requires verification", () => {
    const contract = contractFor({});
    expect(contract.verification.reasons.join(" ")).toContain("single_evidence");
  });

  it("a task with a wide mechanical bar and no boundary path needs no verification", () => {
    const standard = standardWith([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...TEST_COMMAND]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "--version"]), predicate: "lint_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]);
    const contract = deriveAttemptCompletionContract({
      standard,
      task: { write_paths: ["src/a.ts"], required_artifacts: [] },
      envelope: {
        write_paths: ["src/a.ts"],
        required_artifacts: [],
        allowed_commands: [...ALLOWED, { executable: "node", argv_prefix: ["--version"] }],
      },
      capabilities: CAPABLE,
    });
    expect(contract.verification.required).toBe(false);
    expect(contract.verification.reasons).toEqual([]);
  });
});

describe("LEAN-A14: readiness has two layers, and a deployment gap is only a task blocker when it matters", () => {
  const readiness = (input: Parameters<typeof deriveCompletionReadiness>[0]) => deriveCompletionReadiness(input);

  it("A14 an unconfirmed standard blocks the DEPLOYMENT layer, naming the operator's action", () => {
    const result = readiness({
      standard: standardWith([], false),
      authorizedCommands: ALLOWED,
      capabilities: CAPABLE,
    });
    expect(result.deployment.standardConfirmed).toBe(false);
    expect(result.deployment.state).toBe("BLOCKED");
    expect(result.deployment.blockers.join(" ")).toContain("no confirmed completion standard");
    // No task exists yet, so the task layer is not answerable — and says so rather than guessing.
    expect(result.task).toBeNull();
  });

  it("A14 a deployment with no verifier is READY for a task that does not need one", () => {
    const standard = standardWith([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...TEST_COMMAND]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "--version"]), predicate: "lint_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]);
    const contract = deriveAttemptCompletionContract({
      standard,
      task: { write_paths: ["src/a.ts"], required_artifacts: [] },
      envelope: {
        write_paths: ["src/a.ts"],
        required_artifacts: [],
        allowed_commands: [...ALLOWED, { executable: "node", argv_prefix: ["--version"] }],
      },
      capabilities: BARE,
    });
    expect(contract.verification.required).toBe(false);
    const result = readiness({ standard, authorizedCommands: ALLOWED, capabilities: BARE, contract });
    // The deployment honestly reports the absence...
    expect(result.deployment.independentVerifierAvailable).toBe(false);
    // ...and the TASK is still READY, because it does not require what is absent.
    expect(result.task?.verificationRequired).toBe(false);
    expect(result.task?.verificationSatisfiable).toBe(true);
    expect(result.task?.state).toBe("READY");
  });

  it("A14 a task that DOES need verification is BLOCKED before the work starts, not at promotion", () => {
    const contract = contractFor({ writePaths: ["src/schema/models.ts"], capabilities: BARE });
    const result = readiness({
      standard: TEST_STANDARD,
      authorizedCommands: ALLOWED,
      capabilities: BARE,
      contract,
    });
    expect(result.task?.state).toBe("BLOCKED");
    expect(result.task?.verificationSatisfiable).toBe(false);
    expect(result.task?.blockers.join(" ")).toContain("requires independent verification");
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

    // The deployment layer is READY (standard confirmed, commands authorized, repository bound), and
    // the task layer now exists because a task is running.
    expect(first.deployment.standardConfirmed).toBe(true);
    expect(first.deployment.commandsAuthorized).toBe(true);
    expect(first.task).not.toBeNull();
    // No verifier is composed in this fixture, and this task's mechanical bar is ONE command — which
    // the derivation reads as thin evidence (`single_evidence`). The honest verdict is therefore
    // BLOCKED for the TASK while the deployment merely reports the absence: the two layers disagree
    // on purpose, and the task layer is the one that decides. In phase 2B this requirement becomes
    // enforceable at promotion; until then readiness is the only place it is visible, which is why it
    // is stated here rather than discovered later.
    expect(first.deployment.independentVerifierAvailable).toBe(false);
    expect(first.task?.verificationRequired).toBe(true);
    expect(first.task?.verificationReasons.join(" ")).toContain("single_evidence");
    expect(first.task?.verificationSatisfiable).toBe(false);
    expect(first.task?.state).toBe("BLOCKED");

    // The contract itself is reachable and deterministic for the same attempt.
    const direct = installed.controller.completionContract(created.entityId);
    expect(direct).not.toBeNull();
    expect(direct?.basisDigest).toBe(installed.controller.completionContract(created.entityId)?.basisDigest);
    expect(countEvents()).toBe(before);
  }, 60000);
});
