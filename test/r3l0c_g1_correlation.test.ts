/**
 * R3-L0C-G1 §5/§6/§7 — ATTEMPT CORRELATION, DURABLE EVIDENCE AND THE ARTIFACT LOCATOR.
 *
 * §5 requires the correlation to come from the ACTUAL `prepared.attemptId`, §6 requires a durable record whose
 * bytes are re-read and verified, and §7 requires a locator whose rules are refusals. This file drives the REAL
 * Work Delegation service with a REAL controller and a REAL local Node child stub, so the AttemptId in the
 * correlation is one the product actually minted.
 *
 * SAFETY. The stub is local and non-model; no DSH binary, provider route or remote service is invoked.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import { makeWorkDelegationService, type CorrelatedHostObservation } from "../src/interaction/work_delegation.js";
import { EVIDENCE_STATE } from "../scripts/r3l0c_g1/contract.mjs";
import {
  buildObservationRecord,
  correlateObservationRecord,
  createObservationRecorder,
  readObservationRecord,
  readRunIdentity,
  writeObservationRecord,
} from "../scripts/r3l0c_g1/observation-correlation.mjs";
import {
  attemptIdFromArtifactPath,
  attemptIdFromSlug,
  discoverScheduledArtifact,
  LOCATOR_OUTCOMES,
  locatorEvidenceLevel,
} from "../scripts/r3l0c_g1/artifact-locator.mjs";
import type { ProjectStandard } from "../src/domain/standard.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
/**
 * §6: the states as named constants. `EVIDENCE_STATES` is the ordered declaration (asserted in the contract
 * test); these names index it so a typo is a load-time failure rather than a silently unmatched string.
 */
const STATE = EVIDENCE_STATE;
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function workspace(): { repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-g1-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
  return { repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

interface Connection {
  prepare: (sql: string) => { get: (...args: never[]) => unknown; all: (...args: never[]) => unknown };
}

function makeStack(repo: string) {
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "g1",
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    } as never,
  );
  cleanups.push(() => void installed.dispose());
  const connection = installed.controller.store.connection as unknown as Connection;
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
  return { installed, controller: installed.controller, connection, call };
}

async function waitFor<T>(read: () => Promise<T> | T, done: (value: T) => boolean, label: string): Promise<T> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const value = await read();
    if (done(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** A local, non-model Node stub the real port launches. */
function stub(body: string): string {
  const dir = mkdtempSync(join(tmpdir(), "r3l0c-g1-p2stub-"));
  cleanups.push(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
  const path = join(dir, "stub.cjs");
  writeFileSync(path, body, "utf8");
  return path;
}

/** A worker port that launches the real stub AND forwards the observation sink, exactly as the deployment port does. */
function observingPort(stubPath: string, observeRef: { current: ((observation: any) => void) | undefined }) {
  return {
    adapterId: "test-observing-worker",
    async run(runInput: any) {
      const { dshSubprocessWorkWorkerPort } = await import("../src/deployment/work_worker.js");
      const port = dshSubprocessWorkWorkerPort({ dshBin: stubPath, profile: "g1-stub", timeoutMs: 20_000 });
      observeRef.current = runInput.observe;
      return port.run({ workDir: runInput.workDir, context: runInput.context, observe: runInput.observe });
    },
  };
}

/**
 * §5: a local non-model Node stub that edits and commits INSIDE the execution world it was handed — the real
 * worker discipline, and what lets the product's own settlement machinery observe a result. It reports through
 * the worker result tool and exits; it never invokes a model, a provider or a remote service.
 */
const READY_STUB = [
  'const fs = require("node:fs");',
  'const cp = require("node:child_process");',
  'fs.writeFileSync("src/a.ts", "export const a = 2;\n");',
  'cp.execFileSync("git", ["add", "-A"]);',
  'cp.execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "worker commit"]);',
  'process.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\n");',
  'process.exit(0);',
].join(String.fromCharCode(10));

describe("R3-L0C-G1 §5/§6 P2-A/B — a real Work preparation correlates to exactly that Attempt", () => {
  it("P2-A: the observation is associated with the AttemptId the product actually minted", async () => {
    const { repo, head } = workspace();
    const { controller, call } = makeStack(repo);
    await call("palimpsest_start", {
      projectId: "g1",
      goal: "tidy",
      headCommit: head,
      tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });

    const correlated: CorrelatedHostObservation[] = [];
    const stubPath = stub(READY_STUB);
    const observeRef: { current: ((observation: any) => void) | undefined } = { current: undefined };
    const service = makeWorkDelegationService({
      controller,
      workerFor: () => observingPort(stubPath, observeRef) as never,
      onCorrelatedObservation: (entry) => { correlated.push(entry); },
    });

    const started = await service.start({ expectedTaskId: "t1" });
    const view = await waitFor(() => service.followup({ jobId: started.jobId }), (value) => "phase" in value && value.phase === "FINISHED", "job FINISHED");

    expect("attemptId" in view ? view.attemptId : null).not.toBeNull();
    const attemptId = "attemptId" in view ? view.attemptId : null;
    // §5: the correlation names exactly the canonical AttemptId the product minted.
    expect(correlated.length).toBeGreaterThan(0);
    expect(correlated.every((entry) => entry.attemptId === attemptId)).toBe(true);
    expect(correlated.every((entry) => entry.hostLocalJobId === started.jobId)).toBe(true);
    // §4: the direct child's pid was observed.
    const spawned = correlated.find((entry) => entry.observation.eventKind === "DIRECT_CHILD_SPAWN_OBSERVED");
    expect(typeof spawned?.observation.directChildPid).toBe("number");
    expect(correlated.some((entry) => entry.observation.eventKind === "DIRECT_CHILD_EXIT_OBSERVED")).toBe(true);
  });

  it("P2-B: two distinct host jobs are not merged", async () => {
    /**
     * §5: two REAL delegations in one project are sequenced by the product's own scheduler — after t1
     * settles the next decision is TASK_VERIFYING, not t2 — so the property under test is proven across two
     * independent stacks instead: each mints its own AttemptId, and neither observation set is attributed to the
     * other's job or attempt.
     */
    const correlated: CorrelatedHostObservation[] = [];
    const stubPath = stub(READY_STUB);

    const runOne = async (): Promise<{ jobId: string; attemptId: string | null }> => {
      const { repo, head } = workspace();
      const { controller, call } = makeStack(repo);
      await call("palimpsest_start", {
        projectId: "g1",
        goal: "tidy",
        headCommit: head,
        tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
      });
      const observeRef: { current: ((observation: any) => void) | undefined } = { current: undefined };
      const service = makeWorkDelegationService({
        controller,
        workerFor: () => observingPort(stubPath, observeRef) as never,
        onCorrelatedObservation: (entry) => { correlated.push(entry); },
      });
      const started = await service.start({ expectedTaskId: "t1" });
      const view = await waitFor(() => service.followup({ jobId: started.jobId }), (value) => "phase" in value && value.phase === "FINISHED", "job FINISHED");
      return { jobId: started.jobId, attemptId: "attemptId" in view ? view.attemptId : null };
    };

    const first = await runOne();
    const second = await runOne();

    expect(second.jobId).not.toBe(first.jobId);
    expect(second.attemptId).not.toBe(first.attemptId);
    const jobIds = new Set(correlated.map((entry) => entry.hostLocalJobId));
    expect(jobIds.size).toBe(2);
    const attempts = new Set(correlated.map((entry) => entry.attemptId));
    expect(attempts.size).toBe(2);
    /** §5: no observation is attributed to the wrong job. */
    const job1Attempts = new Set(correlated.filter((entry) => entry.hostLocalJobId === first.jobId).map((entry) => entry.attemptId));
    const job2Attempts = new Set(correlated.filter((entry) => entry.hostLocalJobId === second.jobId).map((entry) => entry.attemptId));
    expect([...job1Attempts]).toEqual([first.attemptId]);
    expect([...job2Attempts]).toEqual([second.attemptId]);
  });

  it("P2-E/P2-G: an observer cannot settle Work, and the service is unchanged when absent", async () => {
    const { repo, head } = workspace();
    const { controller, call } = makeStack(repo);
    await call("palimpsest_start", {
      projectId: "g1",
      goal: "tidy",
      headCommit: head,
      tasks: [{ task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
    });

    const stubPath = stub(READY_STUB);
    const observeRef: { current: ((observation: any) => void) | undefined } = { current: undefined };
    // §5: an observer that THROWS on every observation must not change the job's phase.
    const service = makeWorkDelegationService({
      controller,
      workerFor: () => observingPort(stubPath, observeRef) as never,
      onCorrelatedObservation: () => { throw new Error("observer exploded"); },
    });
    const started = await service.start({ expectedTaskId: "t1" });
    const view = await waitFor(() => service.followup({ jobId: started.jobId }), (value) => "phase" in value && value.phase === "FINISHED", "job FINISHED");
    expect("phase" in view ? view.phase : null).toBe("FINISHED");
  });
});

/**
 * R3-L0C-G1-B §2: THIS BLOCK WAS CORRECTED, and the reason is recorded here as §2 requires.
 *
 * REASON. G1's P3 block used a SYNTHETIC FLATTENED journal fixture (`{type, runId}` / `{type, sessionId,
 * attemptId}`) and a synchronous `correlateObservationRecord`. Both were test-only schemas the real frozen journal
 * never produces, so the block passed while the correlator could not read an actual journal.
 *
 * REPRODUCING BASELINE COUNTEREXAMPLE. Measured in `scripts/r3l0c_g1b/baseline/falsifiers.mjs` F3: a real journal
 * written with the frozen `appendRecord()` and read with `readJournal()` yields records shaped
 * `{seq, kind, at, payload, digest}`, and G1's readers returned `MISSING_RUN_STARTED` with an empty trial map.
 * F4 additionally showed a forged record reaching RUN_ATTEMPT_CORRELATED through that flattened fixture.
 *
 * WHAT CHANGED. The fixtures now use the REAL record shape and the REAL frozen writer, the correlator is awaited,
 * and origin is established by trusted ingestion rather than by a marker string. The expected evidence STRENGTH is
 * unchanged or higher: the positive case must now also carry real events and a verified claim.
 */
describe("R3-L0C-G1-B §6 — durable host evidence and run correlation over the REAL journal schema", () => {
  const identity = { attemptId: "attempt-".concat("a".repeat(32)), hostLocalJobId: "wdj-test" };

  /** §6: one real observation, emitted through the recorder so ingestion is trusted. */
  function eventFor(invocationId: string, sequence: number, eventKind: string, extra: Record<string, unknown> = {}) {
    return {
      schemaVersion: 1, producer: "dshSubprocessWorkWorkerPort", eventKind,
      invocationId, sequence, observedAt: new Date().toISOString(),
      directChildPid: 4242, processRole: "DIRECT_CHILD", exitCode: null, exitSignal: null, hostFailureDetail: null,
      executableIdentity: { adapterId: "a", nodeExecutableDigest: "d".repeat(64), workerBinBasename: "stub.cjs", workerBinDigest: "e".repeat(64) },
      proves: ["x"], doesNotProve: ["y"], ...extra,
    };
  }

  function recordFor(runId: string | null, sessionId: string | null) {
    const recorder = createObservationRecorder({ invocationId: "wpi-test" });
    recorder.sink(eventFor("wpi-test", 1, "DIRECT_CHILD_SPAWN_ATTEMPTED"));
    recorder.sink(eventFor("wpi-test", 2, "DIRECT_CHILD_SPAWN_OBSERVED"));
    recorder.sink(eventFor("wpi-test", 3, "DIRECT_CHILD_EXIT_OBSERVED", { exitCode: 0 }));
    return buildObservationRecord({ recorder, hostLocalJobId: identity.hostLocalJobId, attemptId: identity.attemptId, runId, sessionId });
  }

  /** §6: a REAL journal written through the frozen writer, plus a verified claim. */
  async function realJournal(runId: string, attemptId: string, sessionId: string, hostJobId: string) {
    const journal = await import("../scripts/r3l0cf/journal.mjs");
    const failStop = await import("../scripts/r3l0cf/fail-stop.mjs");
    const runRoot = mkdtempSync(join(tmpdir(), "r3l0c-g1b-realjournal-"));
    cleanups.push(() => { try { rmSync(runRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch { /* OS reaps it */ } });
    const claim = failStop.claimRunRoot({ runRoot, runId });
    const journalPath = join(runRoot, "generation-journal.jsonl");
    journal.appendRecord({ journalPath, kind: "RUN_STARTED", payload: { runId, claimNonce: claim.claimNonce } });
    journal.appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId, record: { sessionId, attemptId, hostJobId } } });
    const read = journal.readJournal(journalPath);
    return { runRoot, journalPath, claimNonce: claim.claimNonce, records: read.records };
  }

  it("P3-A: a valid non-model host observation correlates to one Attempt over a REAL journal", async () => {
    const real = await realJournal("run-g1", identity.attemptId, "s1", identity.hostLocalJobId);
    const result = await correlateObservationRecord({
      record: recordFor("run-g1", "s1"), journalRecords: real.records,
      journalPath: real.journalPath, runRoot: real.runRoot, claimNonce: real.claimNonce,
      trustedIngestion: true,
    });
    expect(result.state).toBe(STATE.RUN_ATTEMPT_CORRELATED);
    expect(result.correlated).toBe(true);
    expect(result.chain).toContain("JOURNAL_INTEGRITY_VERIFIED");
    expect(result.chain).toContain("RUN_CLAIM_VERIFIED");
    expect(result.chain).toContain("DURABLE_TRIAL_ATTEMPT_IDENTITY");
    // §8: correlation is not live-primary provenance.
    expect(result.livePrimary).toBe(false);
  });

  it("P3-B: a missing RUN_STARTED is refused", async () => {
    const journal = await import("../scripts/r3l0cf/journal.mjs");
    const runRoot = mkdtempSync(join(tmpdir(), "r3l0c-g1b-norun-"));
    cleanups.push(() => { try { rmSync(runRoot, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    const journalPath = join(runRoot, "generation-journal.jsonl");
    journal.appendRecord({ journalPath, kind: "TRIAL_RECORDED", payload: { sessionId: "s1", record: { attemptId: identity.attemptId } } });
    const read = journal.readJournal(journalPath);
    const result = await correlateObservationRecord({ record: recordFor("run-g1", "s1"), journalRecords: read.records, journalPath, trustedIngestion: true });
    expect(result.state).toBe(STATE.PROVENANCE_CONFLICT);
    expect(result.problems.join(" ")).toContain("no RUN_STARTED");
  });

  it("P3-C: a conflicting RunId is refused", async () => {
    const journal = await import("../scripts/r3l0cf/journal.mjs");
    const runRoot = mkdtempSync(join(tmpdir(), "r3l0c-g1b-conflict-"));
    cleanups.push(() => { try { rmSync(runRoot, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    const journalPath = join(runRoot, "generation-journal.jsonl");
    journal.appendRecord({ journalPath, kind: "RUN_STARTED", payload: { runId: "run-A" } });
    journal.appendRecord({ journalPath, kind: "RUN_STARTED", payload: { runId: "run-B" } });
    const read = journal.readJournal(journalPath);
    const run = readRunIdentity({ journalRecords: read.records });
    expect(run.ok).toBe(false);
    expect(run.verdict).toBe("CONFLICTING_RUN_IDENTITY");
    const result = await correlateObservationRecord({ record: recordFor("run-A", "s1"), journalRecords: read.records, journalPath, trustedIngestion: true });
    expect(result.state).toBe(STATE.PROVENANCE_CONFLICT);
  });

  it("P3-D: a HostJob/Attempt disagreement is refused", async () => {
    const real = await realJournal("run-g1", "attempt-".concat("b".repeat(32)), "s1", identity.hostLocalJobId);
    const result = await correlateObservationRecord({
      record: recordFor("run-g1", "s1"), journalRecords: real.records,
      journalPath: real.journalPath, runRoot: real.runRoot, claimNonce: real.claimNonce, trustedIngestion: true,
    });
    expect(result.state).toBe(STATE.PROVENANCE_CONFLICT);
    expect(result.problems.join(" ")).toContain("disagrees with the durable trial's AttemptId");
  });

  it("P3-E/F: a caller-built JSON object is never host observation", async () => {
    const real = await realJournal("run-g1", identity.attemptId, "s1", identity.hostLocalJobId);
    const fake = { ...recordFor("run-g1", "s1"), origin: "G1_LOCAL_RECORDER" };
    // Without trusted ingestion the origin relationship is not established, whatever the marker says.
    const result = await correlateObservationRecord({ record: fake, journalRecords: real.records, journalPath: real.journalPath, runRoot: real.runRoot, claimNonce: real.claimNonce });
    expect(result.state).toBe(STATE.ORIGIN_NOT_ESTABLISHED);
    expect(result.correlated).toBe(false);
  });

  it("P3-G: an observation altered after persistence fails content binding", async () => {
    const real = await realJournal("run-g1", identity.attemptId, "s1", identity.hostLocalJobId);
    const altered = { ...recordFor("run-g1", "s1"), attemptId: "attempt-".concat("c".repeat(32)) };
    const result = await correlateObservationRecord({ record: altered, journalRecords: real.records, journalPath: real.journalPath, runRoot: real.runRoot, claimNonce: real.claimNonce, trustedIngestion: true });
    expect(result.state).toBe(STATE.PROVENANCE_CONFLICT);
    expect(result.problems.join(" ")).toContain("altered after it was recorded");
  });

  it("P3: the recorder writes per invocation, re-reads, verifies the bytes and refuses a duplicate", () => {
    const runRoot = mkdtempSync(join(tmpdir(), "r3l0c-g1b-durable-"));
    cleanups.push(() => { try { rmSync(runRoot, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    const record = recordFor("run-g1", "s1");
    const write = writeObservationRecord({ runRoot, record });
    expect(write.written).toBe(true);
    expect(write.durabilityVerified).toBe(true);
    const read = readObservationRecord({ runRoot, invocationId: record.invocationId });
    expect(read?.digestOk).toBe(true);
    expect(read?.contentBindingFailed).toBe(false);
    // §5: a duplicate write is refused rather than overwriting preserved evidence.
    const again = writeObservationRecord({ runRoot, record });
    expect(again.written).toBe(false);
    expect(again.conflict).toBe(true);
  });

  it("P3: a record that is not ingested cannot reach RUN_ATTEMPT_CORRELATED", async () => {
    const real = await realJournal("run-g1", identity.attemptId, "s1", identity.hostLocalJobId);
    const record = recordFor("run-g1", "s1");
    const result = await correlateObservationRecord({ record, journalRecords: real.records, journalPath: real.journalPath, runRoot: real.runRoot, claimNonce: real.claimNonce });
    expect([STATE.ORIGIN_NOT_ESTABLISHED, STATE.DECLARATION_ONLY]).toContain(result.state);
  });
});

describe("R3-L0C-G1 §7 P4 — the source-grounded artifact locator", () => {
  const SLUG = "--C-Users-x-repo-.palimpsest-worlds-attempt-a07384dd03aa9f5c4597b61e8f929771--";
  const ATTEMPT = "a07384dd03aa9f5c4597b61e8f929771";
  const REAL = `C:/x/home/sessions/${SLUG}/worker-c7e88db3/session.v4.jsonl.zstd`;

  it("P4-A: a valid source-grounded CWD slug resolves to the canonical AttemptId", () => {
    expect(attemptIdFromArtifactPath(REAL)).toBe(ATTEMPT);
  });

  it("P4-B: an AttemptId prefix collision is rejected", () => {
    expect(attemptIdFromSlug(`C-repo-.palimpsest-worlds-attempt-${ATTEMPT}0`)).toBeNull();
  });

  it("P4-C: extra or missing hexadecimal characters are rejected", () => {
    expect(attemptIdFromSlug(`C-repo-.palimpsest-worlds-attempt-${ATTEMPT}ff`)).toBeNull();
    expect(attemptIdFromSlug("C-repo-.palimpsest-worlds-attempt-a07384dd03aa9f5c4597b61e8f92977")).toBeNull();
  });

  it("P4-D: a wrong Worker directory is rejected", () => {
    expect(attemptIdFromArtifactPath(REAL.replace("/worker-", "/wrk-"))).toBeNull();
  });

  it("P4-E: two candidates for one Attempt are AMBIGUOUS, never a pick", () => {
    const home = mkdtempSync(join(tmpdir(), "r3l0c-g1-amb-"));
    cleanups.push(() => { try { rmSync(home, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    for (const worker of ["worker-a", "worker-b"]) {
      const dir = join(home, "sessions", SLUG, worker);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "session.v4.jsonl.zstd"), "x");
    }
    const result = discoverScheduledArtifact({ dshHomePath: home, expectedAttemptId: ATTEMPT });
    expect(result.outcome).toBe(LOCATOR_OUTCOMES.AMBIGUOUS);
    expect(result.discovered).toBe(false);
    expect(result.selectedLatestByMtime).toBe(false);
  });

  it("P4-F: no Artifact yields ABSENT", () => {
    const home = mkdtempSync(join(tmpdir(), "r3l0c-g1-abs-"));
    cleanups.push(() => { try { rmSync(home, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    const result = discoverScheduledArtifact({ dshHomePath: home, expectedAttemptId: ATTEMPT });
    expect(result.outcome).toBe(LOCATOR_OUTCOMES.ABSENT);
  });

  it("P4-G: a missing AttemptId in the path is not a candidate", () => {
    expect(attemptIdFromArtifactPath("C:/x/home/sessions/--C-repo--/worker-a/session.v4.jsonl.zstd")).toBeNull();
  });

  it("P4-H: an artifact path outside the scoped Home is refused", () => {
    const home = mkdtempSync(join(tmpdir(), "r3l0c-g1-out-"));
    cleanups.push(() => { try { rmSync(home, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    const outside = mkdtempSync(join(tmpdir(), "r3l0c-g1-outside-"));
    cleanups.push(() => { try { rmSync(outside, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    const dir = join(outside, SLUG, "worker-a");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "session.v4.jsonl.zstd"), "x");
    // A link from inside the scoped home to the outside candidate must be refused (§7 rule 9).
    const linkDir = join(home, "sessions", SLUG);
    mkdirSync(join(home, "sessions"), { recursive: true });
    try { symlinkSync(dir, linkDir, "junction"); } catch { /* if the platform refuses the link, the escape is unreachable */ }
    const result = discoverScheduledArtifact({ dshHomePath: home, expectedAttemptId: ATTEMPT });
    expect(result.discovered).toBe(false);
  });

  it("P4-I: no candidate is selected by recency", () => {
    const home = mkdtempSync(join(tmpdir(), "r3l0c-g1-rec-"));
    cleanups.push(() => { try { rmSync(home, { recursive: true, force: true }); } catch { /* OS reaps it */ } });
    const dir = join(home, "sessions", SLUG, "worker-a");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "session.v4.jsonl.zstd"), "x");
    const result = discoverScheduledArtifact({ dshHomePath: home, expectedAttemptId: ATTEMPT });
    expect(result.selectedLatestByMtime).toBe(false);
    expect(result.discovered).toBe(true);
  });

  it("P4-J: the locator never claims authentic PRIMARY compatibility", () => {
    const level = locatorEvidenceLevel();
    expect(level.provedByGrammarTests).toBe("ARTIFACT_LOCATOR_GRAMMAR_TESTED");
    expect(level.requiresAuthenticEvidence).toBe("REAL_DSH_ARTIFACT_COMPATIBILITY");
    expect(level.realCompatibilityEstablished).toBe(false);
  });
});
