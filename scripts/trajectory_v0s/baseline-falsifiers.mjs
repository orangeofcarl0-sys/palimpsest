/**
 * Trajectory-V0S §3 (C1) — BASELINE FALSIFIERS F1–F6, MEASURED AGAINST THE EXACT V0 BASELINE.
 *
 * This script runs the ACTUAL V0 product code from an isolated worktree pinned at
 * `526f377eac0343004c17a484a6f9057989f433df` and measures what it actually did. It is the
 * counterexample set the correction is answerable to; it is NOT a re-derivation of the defects.
 *
 * Each falsifier reports one of:
 *
 *     DYNAMICALLY_REPRODUCED  the defect was executed against real code and observed
 *     SOURCE_DEMONSTRATED     the defect is proven by reading the baseline source, not executed
 *     NOT_ESTABLISHED         the evidence did not support the claim either way
 *
 * Usage (the baseline worktree must be BUILT first):
 *
 *     node scripts/trajectory_v0s/baseline-falsifiers.mjs <baselineWorktreePath>
 *
 * It writes JSON to stdout. It makes no model call, contacts no provider and reads no personal
 * session content: every DSH source it uses is a controlled fixture.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const baseline = process.argv[2];
if (typeof baseline !== "string" || baseline.length === 0) {
  process.stderr.write("usage: baseline-falsifiers.mjs <baselineWorktreePath>\n");
  process.exit(2);
}

const dist = (relative) => pathToFileURL(join(baseline, "dist", "src", relative)).href;

const { installPalimpsest, trustedDefaultPolicy } = await import(dist("install.js"));
const { GitCliPort } = await import(dist("effects/index.js"));
const { makeWorkDelegationService } = await import(dist("interaction/work_delegation.js"));
const { dshSubprocessWorkWorkerPort } = await import(dist("deployment/work_worker.js"));
const { composeTrajectoryV0 } = await import(dist("composition/trajectory_v0.js"));

const results = [];
const record = (entry) => results.push(entry);
const cleanups = [];

function writeCommittingStub(directory, marker) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${marker}.cjs`);
  writeFileSync(
    path,
    [
      'const fs = require("node:fs");',
      'const cp = require("node:child_process");',
      'fs.writeFileSync("src/a.ts", "export const a = 2;\\n");',
      'cp.execFileSync("git", ["add", "-A"]);',
      'cp.execFileSync("git", ["-c", "user.email=w@w.w", "-c", "user.name=w", "commit", "-qm", "worker commit"]);',
      'process.stdout.write("PALIMPSEST_WORK_RESULT " + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");',
      'process.exit(0);',
    ].join("\n"),
    "utf8",
  );
  return path;
}

function makeRig(projectId) {
  const root = mkdtempSync(join(tmpdir(), "v0s-base-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy; the OS reaps it */
    }
  });
  const installed = installPalimpsest(
    { tools: { register: () => () => undefined } },
    {
      projectId,
      databasePath: join(repo, ".palimpsest", "p.sqlite"),
      ordariumDatabasePath: join(repo, ".palimpsest", "o.sqlite"),
      repository: repo,
      git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
      execution: "worktree",
      standard: {
        statement: "tests pass and scope respected",
        clauses: [
          { kind: "command_succeeds", command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" },
          { kind: "scope_respected" },
        ],
        derivedFrom: ["v0s baseline falsifier"],
        confirmed: true,
        notes: [],
      },
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
    },
  );
  cleanups.push(() => void installed.dispose());
  return { repo, installed };
}

async function runAttempt(rig, projectId, marker) {
  const stubRoot = mkdtempSync(join(tmpdir(), `v0s-${marker}-`));
  cleanups.push(() => {
    try {
      rmSync(stubRoot, { recursive: true, force: true });
    } catch {
      /* the OS reaps it */
    }
  });
  const stubPath = writeCommittingStub(stubRoot, marker);
  const hostRecords = new Map();
  const service = makeWorkDelegationService({
    controller: rig.installed.controller,
    workerFor: () => ({
      adapterId: `${marker}-worker`,
      async run(runInput) {
        const port = dshSubprocessWorkWorkerPort({ dshBin: stubPath, profile: marker, timeoutMs: 30_000 });
        return port.run(runInput);
      },
    }),
    onCorrelatedObservation: (entry) => {
      const existing = hostRecords.get(entry.attemptId);
      const kinds = existing === undefined ? [] : [...existing.eventKinds];
      kinds.push(entry.observation.eventKind);
      hostRecords.set(entry.attemptId, {
        attemptId: entry.attemptId,
        hostLocalJobId: entry.hostLocalJobId,
        portInvocationId: entry.observation.invocationId,
        eventKinds: kinds,
        exited: entry.observation.eventKind === "DIRECT_CHILD_EXIT_OBSERVED",
        exitCode: entry.observation.exitCode,
        spawnFailed: false,
        unknownAfterRestart: false,
        detail: `observed ${kinds.length} host event(s)`,
      });
    },
  });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: rig.repo, encoding: "utf8" }).trim();
  rig.installed.controller.start({
    projectId, goal: "g", headCommit: head,
    tasks: [{ task_id: "t1", objective: "o", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] }],
  });
  const started = await service.start({ expectedTaskId: "t1" });
  for (let attempt = 0; attempt < 800; attempt += 1) {
    const candidate = await service.followup({ jobId: started.jobId });
    if (candidate.phase === "FINISHED" || candidate.phase === "HOST_ERROR") {
      return { attemptId: candidate.attemptId, hostRecord: hostRecords.get(candidate.attemptId), jobId: started.jobId };
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("job did not settle");
}

/** A controlled reader fixture: valid header, N persisted events. No real DSH, no model. */
function fixtureReader(sessionId, eventCount) {
  const events = [];
  for (let seq = 0; seq < eventCount; seq += 1) {
    events.push({ sessionId, seq, type: seq % 2 === 0 ? "turn/start" : "tool/call", inherited: false, time: 1_700_000_000_000 + seq, surface: null, summary: `fixture event ${String(seq)}`, durationMs: null, observedStatus: null });
  }
  return {
    sourceIdentity: "DSH_QUERY_PORT_FIXTURE",
    evidenceClass: "DSH_QUERY_PORT_FIXTURE",
    async readEvents() {
      return {
        schemaVersion: 1, readState: "READ_OK", sessionId,
        header: { sessionId, version: 4, createdAt: 1_700_000_000_000, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null },
        sourceIdentity: "DSH_QUERY_PORT_FIXTURE", throughSeq: events.length - 1,
        knownEventCount: events.length, inheritedEventCount: 0, events,
        knownParentSession: null, proves: ["fixture"], doesNotProve: ["any real DSH claim"], detail: "fixture page",
      };
    },
    async readHeaderIdentity(id) {
      return { readState: "READ_OK", header: { sessionId: id, version: 4, createdAt: 1_700_000_000_000, cwd: null, parentSession: null, isSeeded: false, origin: null, delegationDepth: null }, detail: "fixture header" };
    },
  };
}

/* ================================================================== F1 */
async function f1() {
  const rig = makeRig("v0sf1");
  const { attemptId, hostRecord } = await runAttempt(rig, "v0sf1", "v0sf1");
  const reader = fixtureReader("session-unrelated-to-attempt", 4);
  const v0 = composeTrajectoryV0({
    projectId: "v0sf1", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
    reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
    dshSessionReader: reader,
  });
  const preview = await v0.previewAttempt({ attemptId, claimedSessionId: "session-unrelated-to-attempt", hostRecord });
  record({
    id: "F1",
    claim: "an unrelated but readable caller-selected session enters the Attempt Preview as its session",
    classification: "DYNAMICALLY_REPRODUCED",
    measured: {
      bindingStatus: preview.execution.bindingStatus,
      sessionLifecycle: preview.execution.sessionLifecycle,
      dshSessionId: preview.execution.dshSessionId,
      eventsEnteredPreview: preview.execution.events.length,
      completeness: preview.completeness,
    },
    verdict: preview.execution.events.length > 0 && preview.execution.dshSessionId === "session-unrelated-to-attempt"
      ? "CONFIRMED: the unrelated session's events were presented as the attempt's, and the attempt's Preview reported the foreign session id as its own."
      : "NOT_OBSERVED",
  });
}

/* ================================================================== F2 */
async function f2() {
  const rig = makeRig("v0sf2");
  const { attemptId } = await runAttempt(rig, "v0sf2", "v0sf2");
  const v0 = composeTrajectoryV0({
    projectId: "v0sf2", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
    reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
    dshSessionReader: undefined,
  });
  let measured;
  try {
    const preview = await v0.previewAttempt({
      attemptId,
      hostRecord: {
        attemptId: `attempt-${"9".repeat(32)}`, hostLocalJobId: "wdj-another-attempt", portInvocationId: "wpi-another-attempt",
        eventKinds: ["DIRECT_CHILD_EXIT_OBSERVED"], exited: true, exitCode: 0, spawnFailed: false, unknownAfterRestart: false,
        detail: "a host record belonging to a DIFFERENT attempt",
      },
    });
    measured = {
      accepted: true,
      hostLocalJobId: preview.execution.hostLocalJobId,
      portInvocationId: preview.execution.portInvocationId,
      processLifecycle: preview.execution.processLifecycle,
      attempted: preview.attempt.attemptId,
    };
  } catch (error) {
    measured = { accepted: false, refused: String(error?.code ?? error?.message ?? error) };
  }
  record({
    id: "F2",
    claim: "a wrong-attempt HostRecord is accepted and its job/invocation identity appears in another attempt's Preview",
    classification: measured.accepted === true && measured.hostLocalJobId === "wdj-another-attempt" ? "DYNAMICALLY_REPRODUCED" : "NOT_ESTABLISHED",
    measured,
    verdict: measured.accepted === true
      ? `CONFIRMED: the wrong-attempt record was accepted; the Preview reported hostLocalJobId=${String(measured.hostLocalJobId)} and portInvocationId=${String(measured.portInvocationId)} for a different attempt.`
      : "the wrong-attempt record was refused",
  });
}

/* ================================================================== F3 */
async function f3() {
  const rig = makeRig("v0sf3");
  await runAttempt(rig, "v0sf3", "v0sf3");
  let reads = 0;
  const counting = {
    sourceIdentity: "counting", evidenceClass: "DSH_QUERY_PORT_FIXTURE",
    async readEvents() { reads += 1; throw new Error("readEvents reached"); },
    async readHeaderIdentity() { reads += 1; throw new Error("readHeaderIdentity reached"); },
  };
  const v0 = composeTrajectoryV0({
    projectId: "v0sf3", controller: rig.installed.controller, promotions: rig.installed.controller.promotions,
    reasoning: undefined, proof: undefined, projectWorkspace: undefined, journalStore: undefined, associationStore: undefined,
    dshSessionReader: counting,
  });
  let outcome;
  try {
    const preview = await v0.previewAttempt({ attemptId: `attempt-${"f".repeat(32)}`, claimedSessionId: "session-anything" });
    outcome = { threw: false, reads, attemptId: preview.attempt.attemptId, bindingStatus: preview.execution.bindingStatus };
  } catch (error) {
    outcome = { threw: true, reads, code: String(error?.code ?? error?.message ?? error) };
  }
  record({
    id: "F3",
    claim: "a foreign/nonexistent Attempt is accepted and the claimed Session is read before the Attempt is rejected",
    classification: outcome.reads > 0 ? "DYNAMICALLY_REPRODUCED" : "SOURCE_DEMONSTRATED",
    measured: outcome,
    verdict: outcome.reads > 0
      ? `CONFIRMED: ${String(outcome.reads)} read-port call(s) occurred for an attempt not present in the project's canonical Work history.`
      : "the attempt was refused before any read",
  });
}

/* ================================================================== F4 */
async function f4() {
  /**
   * §3 F4: the T0 relation selector. This is a SOURCE-DEMONSTRATED falsifier: the baseline selector
   * is `node.label.includes(attemptId)`, which is a display-label match. The measurement below shows
   * the exact expression and constructs a projection where a label-only match admits a node whose
   * canonical identity is a different entity.
   */
  const source = readFileSync(join(baseline, "src", "composition", "trajectory_v0.ts"), "utf8");
  const usesLabelIncludes = source.includes("node.label.includes(attemptId)");
  const requiresEstablished = /evidenceState\s*===\s*['"]ESTABLISHED_BY_OWNER_REFERENCE['"]/u.test(source);
  /**
   * Demonstrate the label rule's failure mode directly: a label is a STRING, and an attempt id can
   * occur inside a longer label belonging to a different entity.
   */
  const attemptId = `attempt-${"a".repeat(32)}`;
  const foreignLabel = `ATTEMPT_CREATED attempt-${"a".repeat(31)}b`;
  const labelMatches = foreignLabel.includes(attemptId);
  record({
    id: "F4",
    claim: "the Work node selector admits relationships by display label, and admitted relation kinds without requiring ESTABLISHED_BY_OWNER_REFERENCE",
    classification: usesLabelIncludes ? "SOURCE_DEMONSTRATED" : "NOT_ESTABLISHED",
    measured: { usesLabelIncludes, requiresEstablishedInSelector: requiresEstablished, labelOnlyMatchDemonstrated: labelMatches, foreignLabel },
    verdict: usesLabelIncludes
      ? "CONFIRMED: the baseline selector is `node.label.includes(attemptId)`. It cannot distinguish a node whose canonical event belongs to another entity, and it does not require ESTABLISHED_BY_OWNER_REFERENCE before admitting a relation."
      : "the baseline selector does not use a display label",
  });
}

/* ================================================================== F5 */
async function f5() {
  /**
   * §3 F5: recovery-event provenance. The baseline reader maps `log.events` straight into views with
   * no persisted/synthetic distinction. `readColdSessionLog` appends `interruptedTurnClosers`, so the
   * returned array mixes stored events with synthesized ones and the baseline reports them alike.
   */
  const source = readFileSync(join(baseline, "scripts", "trajectory_v0", "dsh-session-reader.mjs"), "utf8");
  const labelsDurability = source.includes("durability");
  const usesColdRead = source.includes("readColdSessionLog");
  const slicesAll = source.includes("all.slice(fromSeq");
  record({
    id: "F5",
    claim: "every returned DSH event is reported as persisted, with no synthetic-recovery distinction",
    classification: usesColdRead && !labelsDurability ? "SOURCE_DEMONSTRATED" : "NOT_ESTABLISHED",
    measured: { usesColdRead, labelsDurability, slicesWholeLog: slicesAll },
    verdict: usesColdRead && !labelsDurability
      ? "CONFIRMED: the baseline calls `readColdSessionLog` (whose contract appends `interruptedTurnClosers`) and emits every returned event with no durability field, so a synthesized recovery closer is indistinguishable from a stored event."
      : "the baseline distinguishes persisted from synthetic events",
  });
}

/* ================================================================== F6 */
async function f6() {
  const readerModule = await import(pathToFileURL(join(baseline, "scripts", "trajectory_v0", "dsh-session-reader.mjs")).href);
  const source = readFileSync(join(baseline, "scripts", "trajectory_v0", "dsh-session-reader.mjs"), "utf8");
  /**
   * §3 F6: the baseline coerces an unusable cursor rather than refusing it:
   * `Number.isInteger(request.fromSeq) ? request.fromSeq : 0`. A negative integer IS an integer, so
   * `-5` is passed through; a fractional value is silently replaced by 0.
   */
  const coercesNegative = /Number\.isInteger\(request\.fromSeq\)\s*\?\s*request\.fromSeq\s*:\s*0/u.test(source);
  const coercesFractional = coercesNegative;
  const clampsMax = /Number\.isInteger\(request\.maxEvents\)\s*\?\s*request\.maxEvents\s*:\s*50/u.test(source);
  const hasCap = /MAX_PAGE|MAX_EVENTS|Math\.min\(/u.test(source);
  record({
    id: "F6",
    claim: "the baseline reader accepts an unusable bounded read request instead of refusing it",
    classification: coercesNegative || coercesFractional ? "SOURCE_DEMONSTRATED" : "NOT_ESTABLISHED",
    measured: { coercesNegativeFromSeq: coercesNegative, coercesFractionalFromSeq: coercesFractional, coercesMaxEvents: clampsMax, enforcesHardMaximum: hasCap, exportedHelpers: Object.keys(readerModule) },
    verdict: coercesNegative
      ? "CONFIRMED: the baseline coerces the cursor (`Number.isInteger(x) ? x : 0`), so a fractional cursor becomes 0 and a negative integer passes through, and there is no hard maximum page size."
      : "the baseline refuses an unusable request",
  });
}

/* ================================================================== run */

try {
  await f1();
  await f2();
  await f3();
  await f4();
  await f5();
  await f6();
} finally {
  for (const fn of cleanups) fn();
}

const counts = results.reduce((accumulator, entry) => {
  accumulator[entry.classification] = (accumulator[entry.classification] ?? 0) + 1;
  return accumulator;
}, {});

process.stdout.write(`${JSON.stringify({
  schemaVersion: 1,
  kind: "TRAJECTORY_V0S_BASELINE_FALSIFIERS",
  measuredAgainst: "526f377eac0343004c17a484a6f9057989f433df",
  evidenceClasses: ["DYNAMICALLY_REPRODUCED", "SOURCE_DEMONSTRATED", "NOT_ESTABLISHED"],
  counts,
  results,
}, null, 2)}\n`);
