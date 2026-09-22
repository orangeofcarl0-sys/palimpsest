/**
 * PLMP-LEAN-1 phase 2B / B-r1, slice 3c — the attempt-result verification RUNTIME.
 * Acceptance LEAN-A19 (full), A36 (concurrent adversarial), A37 (bidirectional runtime firewall).
 *
 * A19 closes the loop the phase exists for: a real attempt completes with a canonical result commit,
 * `verifyAttemptResult` derives the subject from canonical Work, materializes that exact commit in
 * isolation, runs the patch verifier and records a durable run.
 *
 * A36 is the adversarial one, and it is concurrent on purpose: the verifier is HELD while the ambient
 * repository moves on to RB. The run must still be CURRENT, because an attempt result's freshness is
 * `SameCanonicalAttemptResult` — the repository moving says nothing about whether the result is still
 * the same result. That is machine proof that verification freshness is not promotion authority
 * freshness.
 *
 * A37 is the firewall in both directions, at runtime rather than at identity: a head PASS must not be
 * reused for an attempt result, and an attempt PASS must not turn the head's status into PASS.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  FIRST_PARTY_ATTEMPT_RESULT_VERIFIER_REF,
  SqliteProjectVerificationStore,
  commandVerifierDefinition,
  firstPartyAttemptResultVerificationSource,
  gitAttemptResultMaterializer,
  makeProjectVerificationService,
  materializeProjectVerifierRawResult,
  verifierRegistryFromPorts,
  type ProjectVerifierPort,
} from "../src/project_verification/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];
const ALLOWED = [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }];
const GOAL = "rewrite dedupe with a Set";
const SCOPE = ["src/dedupe.ts"];
const CLEAN_EDIT = "export const dedupe = (v: number[]) => [...new Set(v)].sort((a, b) => a - b);\n";

function standard(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown[] };
}

function workspace(): { repo: string; base: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-arr-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "dedupe.ts"), "export const dedupe = (v: number[]) => [...new Set(v)];\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a handle is open; the OS reaps it.
    }
  });
  return { repo, base: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim() };
}

function install(repo: string, extra: Record<string, unknown> = {}) {
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "arr",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worktrees")),
      execution: "in-place",
      standard: standard(),
      policy: trustedDefaultPolicy({ allowed_commands: ALLOWED }),
      // The verification plane is composed only when its store is provided; without this the whole
      // surface is absent rather than stubbed (which is the product's honest behaviour, and why the
      // first version of this fixture found no `verification` at all).
      projectVerificationStore: new SqliteProjectVerificationStore(join(repo, ".palimpsest", "v.sqlite")),
      ...extra,
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

function commit(repo: string, body: string, message: string): string {
  writeFileSync(join(repo, "src", "dedupe.ts"), body);
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", message], { cwd: repo });
  return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim();
}

/** The real direct path: begin → work → commit → finish. */
async function completedAttempt(installed: { controller: unknown }, repo: string): Promise<{ attemptId: string; result: string }> {
  const controller = installed.controller as { begin(i: unknown): Promise<unknown>; finish(i?: unknown): Promise<unknown> };
  await controller.begin({ goal: GOAL, writePaths: SCOPE });
  const result = commit(repo, CLEAN_EDIT, "RA");
  await controller.finish({ summary: "done" });
  const connection = (installed as { controller: { store: { connection: unknown } } }).controller.store.connection as Connection;
  const row = connection.prepare("SELECT attempt_id FROM attempts ORDER BY attempt_id").all() as { attempt_id: string }[];
  return { attemptId: row[0]!.attempt_id, result };
}

/** A verifier whose protocol the TEST drives: it blocks until released, then reports PASS. */
function gateableVerifier(ref: string): {
  port: ProjectVerifierPort;
  entered: Promise<void>;
  release: () => void;
  calls: () => number;
} {
  let releaseGate: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    releaseGate = resolve;
  });
  let enteredResolve: () => void = () => undefined;
  const entered = new Promise<void>((resolve) => {
    enteredResolve = resolve;
  });
  let calls = 0;
  const definition = commandVerifierDefinition({
    verifierRef: ref,
    command: "git",
    args: ["diff", "--check", "<baseCommit>..<resultCommit>"],
    supportedSubjects: ["ATTEMPT_RESULT"],
    protocolNote: "test-only gateable protocol: holds the run open until the test releases it",
    provider: "test-gateable",
    providerVersion: "1",
    implementation: "test-only gateable protocol",
  });
  const port: ProjectVerifierPort = Object.freeze({
    definition,
    async verify(input: { readonly subject: { readonly digest: string } }) {
      calls += 1;
      enteredResolve();
      await gate;
      return materializeProjectVerifierRawResult({
        verifierRef: ref,
        verdict: "PASS",
        detail: `gated PASS over ${input.subject.digest.slice(0, 12)}`,
      });
    },
  });
  return { port, entered, release: releaseGate, calls: () => calls };
}

describe("LEAN-A19: an attempt's result is verified through the Work-backed subject and an isolated checkout", () => {
  it("derives the subject from canonical Work, materializes RA, runs the patch protocol, records a run", async () => {
    const { repo } = workspace();
    const installed = install(repo);
    const { attemptId, result } = await completedAttempt(installed as never, repo);

    const verification = (installed as { verification: { service: { verifyAttemptResult(i: unknown): Promise<unknown> } } }).verification;
    const outcome = (await verification.service.verifyAttemptResult({
      attemptId,
      requestedBy: "operator:test",
    })) as {
      status: string;
      typedReasonCode: string;
      run: {
        verdict: string;
        freshness: string;
        independence: string;
        verifierRef: string;
        subject: { kind: string; attemptId?: string; resultCommit?: string };
      } | null;
    };

    expect(outcome.status).toBe("recorded");
    expect(outcome.run).not.toBeNull();
    const run = outcome.run!;
    expect(run.subject.kind).toBe("ATTEMPT_RESULT");
    expect(run.subject.attemptId).toBe(attemptId);
    expect(run.subject.resultCommit).toBe(result);
    expect(run.verifierRef).toBe(FIRST_PARTY_ATTEMPT_RESULT_VERIFIER_REF);
    expect(run.independence).toBe("MECHANICAL_INDEPENDENT");
    expect(run.freshness).toBe("CURRENT");
    // A clean single-line edit: the patch protocol passes on it.
    expect(run.verdict).toBe("PASS");
  });

  it("refuses an explicitly named verifier that cannot serve an attempt result, rather than swapping it", async () => {
    const { repo } = workspace();
    const installed = install(repo);
    const { attemptId } = await completedAttempt(installed as never, repo);
    const verification = (installed as { verification: { service: { verifyAttemptResult(i: unknown): Promise<unknown> } } }).verification;

    // The HEAD ref cannot serve ATTEMPT_RESULT. Naming it must be refused, never silently replaced.
    const outcome = (await verification.service.verifyAttemptResult({
      attemptId,
      verifierRef: "project.head.git-diff-check.v1",
      requestedBy: "operator:test",
    })) as { status: string; typedReasonCode: string; run: unknown };
    expect(outcome.status).toBe("blocked");
    expect(outcome.typedReasonCode).toBe("unsupported_verification_subject");
    expect(outcome.run).toBeNull();
  });
});

describe("LEAN-A36: ambient HEAD movement during verification does NOT make an attempt run stale", () => {
  it("holds the verifier while HEAD moves to RB, and the run stays CURRENT over RA", async () => {
    const { repo } = workspace();
    const installed = install(repo, { projectVerifierProviders: undefined });
    const { attemptId, result } = await completedAttempt(installed as never, repo);

    const ref = "project.attempt.gated.v1";
    const gated = gateableVerifier(ref);
    // A service wired to the TEST's verifier, over the SAME canonical Work and materializer.
    const service = makeProjectVerificationService({
      projectId: "arr",
      // The head source is not used on this path; a minimal one keeps the seam explicit rather than
      // pretending the service can be built without it.
      source: { current: () => { throw new Error("the head source is not used by verifyAttemptResult"); } },
      store: (installed as unknown as { verification: { store: never } }).verification.store,
      registry: verifierRegistryFromPorts([gated.port]),
      providers: [gated.port],
      repository: repo,
      attemptResultSource: firstPartyAttemptResultVerificationSource(
        (installed as unknown as { controller: never }).controller,
      ),
      attemptResultMaterializer: gitAttemptResultMaterializer({ repository: repo }),
    } as never);

    const pending = service.verifyAttemptResult({ attemptId, requestedBy: "operator:test" });
    // Wait until the protocol is genuinely in flight, then move the ambient repository on.
    await gated.entered;
    const rb = commit(repo, `${CLEAN_EDIT}// RB\n`, "RB");
    expect(rb).not.toBe(result);
    gated.release();
    const outcome = await pending;

    expect(outcome.run).not.toBeNull();
    const run = outcome.run!;
    expect(run.subject.kind).toBe("ATTEMPT_RESULT");
    expect((run.subject as { resultCommit: string }).resultCommit).toBe(result);
    // CURRENT, not STALE: the attempt rule rematerializes canonical Work and never reads ambient HEAD.
    expect(run.freshness).toBe("CURRENT");
    expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim()).toBe(rb);
  }, 60000);
});

describe("LEAN-A37: the firewall holds at runtime, in both directions", () => {
  it("a head PASS is not reused for an attempt result — the attempt protocol really runs", async () => {
    const { repo } = workspace();
    const installed = install(repo);
    const { attemptId } = await completedAttempt(installed as never, repo);
    const verification = (installed as {
      verification: {
        service: { verifyCurrentHead(i?: unknown): Promise<unknown>; verifyAttemptResult(i: unknown): Promise<unknown> };
        store: { list(projectId: string): readonly { subject: { kind: string } }[] };
      };
    }).verification;

    // A head verification exists first.
    await verification.service.verifyCurrentHead({ requestedBy: "operator:test" });
    const before = verification.store.list("arr").length;

    const outcome = (await verification.service.verifyAttemptResult({ attemptId, requestedBy: "operator:test" })) as {
      run: { subject: { kind: string } } | null;
    };
    // It ran: a NEW run was recorded, and it is about the attempt, not the head.
    expect(verification.store.list("arr").length).toBe(before + 1);
    expect(outcome.run!.subject.kind).toBe("ATTEMPT_RESULT");
  });

  it("an attempt PASS does not turn the current-head status into PASS", async () => {
    const { repo } = workspace();
    const installed = install(repo);
    const { attemptId } = await completedAttempt(installed as never, repo);
    const verification = (installed as {
      verification: {
        service: {
          verifyAttemptResult(i: unknown): Promise<{ run: { verdict: string } | null }>;
          status(): Promise<{ state: string; currentSubjectRun: unknown; freshIndependentRun: unknown; subject: unknown }>;
        };
      };
    }).verification;

    const attempt = await verification.service.verifyAttemptResult({ attemptId, requestedBy: "operator:test" });
    expect(attempt.run!.verdict).toBe("PASS");

    const head = await verification.service.status();
    // The head was never verified. An attempt-result PASS says nothing about it — status stays
    // head-specific, and the head run views do not pick the attempt run up.
    expect(head.state).not.toBe("PASS");
    expect(head.currentSubjectRun).toBeNull();
    expect(head.freshIndependentRun).toBeNull();
  });
});
