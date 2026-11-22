/** Qualify, run, or continue the maintenance pilot under the host-owned installation slot. */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { docker } from "../../container_runtime.mjs";
import { PAID_MODE } from "../../bounded_provider.mjs";
import { readOpenCodeGoKey, requireOpenCodeGoProbe } from "../../opencode_go.mjs";
import { digest, git, readJson, writeJson } from "../../energy/contract.mjs";
import { admitBasis, checkpoint, conclusion } from "../../energy/product.mjs";
import { answer, closeoutChecks, regression, scoreReview, tool } from "./judge.mjs";
import { prepare, retainCandidate, session, window } from "./session.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";
import { checkStopRefusals, prepareDraftInputs, restoreDraft, resumeGoal, resumeWindow, stoppedDraft } from "./draft-resume.mjs";
import { archivedRejection, prepareRejectionInputs, queuedRejection, rejectionGoal, rejectionOf, verifyRejectionSlot } from "./rejection.mjs";
import { archivedQueueDraft, prepareQueueDraft, restoreQueueDraft } from "./queue-draft.mjs";
import { verifyInterrupted } from "./interruption.mjs";
import { buildCommand, copyDatabases, firstGoal, inspectedSource, makeEvidence, makeSource, makeVolume, manifest, offline, pack,
  projectId, quote, referencePatch, repo, secondGoal, seedSource, source, stateProbe, success, verifiedArchiveDigest, verifyInstallation } from "./workspace.mjs";

const [action, directory, prerequisite, previousRun] = process.argv.slice(2);
const isDraftLoop = ["draft-loop-qualify", "draft-loop-live"].includes(action);
const isLoop = isDraftLoop || ["loop-qualify", "loop-live", "loop-approve", "loop-resume"].includes(action);
assert(directory && (["qualify", "recover"].includes(action) || (["live", "continue", "resume-qualify", "reject-qualify"].includes(action) && prerequisite) ||
  (["resume", "reject", "loop-live", "draft-loop-live"].includes(action) && prerequisite && previousRun) ||
  (isLoop && !action.endsWith("-live") && (prerequisite || action === "loop-resume"))),
  "Usage: self-evolution/run.mjs qualify <new-dir> | live <new-dir> <qualified-dir> | resume-qualify <new-dir> <stopped-dir> | " +
  "resume <new-dir> <qualified-dir> <stopped-dir> | reject-qualify <new-dir> <rejected-dir> [prior-slot-snapshot] | reject <new-dir> <qualified-dir> <rejected-dir> | " +
  "continue <live-dir> <owner-approval.json> | recover <live-dir> | loop-qualify <dir> <archived-parent> | " +
  "loop-live <dir> <qualified-dir> <archived-parent> | loop-resume <dir> | loop-approve <dir> <owner-approval.json> | " +
  "draft-loop-qualify <dir> <stopped-campaign> | draft-loop-live <dir> <qualified-dir> <stopped-campaign>");
assert(inspectedSource());
const campaignRoot = resolve(directory);
let root = campaignRoot;
const originFile = join(root, "resume-origin.json");
const origin = ["continue", "recover"].includes(action) && existsSync(originFile) ? readJson(originFile) : null;
const isRework = isLoop || ["reject", "reject-qualify"].includes(action) || origin?.kind === "rejection";
const isResume = ["resume", "resume-qualify"].includes(action) || (origin !== null && !isRework);
const requestWindow = isResume || isRework ? resumeWindow : window;
const goal = isRework ? rejectionGoal : isResume ? resumeGoal : firstGoal;
const image = docker(["image", "inspect", "palimpsest-cold-handover:local", "--format", "{{.Id}}"]);
const here = fileURLToPath(new URL(".", import.meta.url));
const code = ["run.mjs", "workspace.mjs", "session.mjs", "slot.mjs", "judge.mjs", "draft-resume.mjs", "rejection.mjs", "queue-draft.mjs", "../../container_adapter.mjs",
  "../../container_runtime.mjs", "../../container_bridge.mjs", "../../world_preflight.mjs", "../../mock_provider.mjs", "../../bounded_provider.mjs",
  "../../execution_budget.mjs", "../../opencode_go.mjs", "../../energy/product.mjs", "../../energy/evidence.mjs", "../../analyze_energy_trajectory.mjs"];
const frozen = { source, projectId, image, window: requestWindow, firstGoalSha256: digest(goal), draftGoalSha256: digest(resumeGoal), secondGoalSha256: digest(secondGoal),
  code: Object.fromEntries(code.map(file => [file, digest(readFileSync(join(here, file)))])) };
const installId = ({ candidate, buildSha256, image }) => ({ candidate, buildSha256, image });
let resultFile = join(root, "candidate.json");
const slotPath = origin ? join(origin.slotDirectory ?? origin.previousRun, "slot.sqlite") : join(root, "slot.sqlite");
let sourceBundle = join(root, "source.bundle");
const heap = [];
const volume = () => { const world = makeVolume(image); heap.push(world); return world; };
let slot;
let consumer;

function useRound(directory) {
  root = directory;
  resultFile = join(root, "candidate.json");
  sourceBundle = join(root, "source.bundle");
}

function providerConfig() {
  const profile = requireOpenCodeGoProbe(readJson(join(repo, "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
  readOpenCodeGoKey(profile);
  return profile;
}

const checkpointDigest = state => sealOf(manifest(state).filter(([file]) => file.endsWith(".sqlite")));

function putEvidence(world, runtime, prepared, signal, basis, start, rejection, draft) {
  const refs = [{ kind: "sealed_run", id: signal.signalId }, { kind: "git_commit", id: basis }];
  const entry = rejection ? {
    kind: draft ? "REFERENCE_NOTE" : "NEGATIVE_RESULT",
    title: draft ? "Archived maintenance draft restored" : "Independent acceptance rejected the maintenance candidate",
    body: draft ? `Restored worktree at ${draft.head}. The checkpoint and stopped run are under evidence/draft-stop/. Earlier replay receipts are under evidence/rejection/.` :
      `Candidate ${rejection.candidate}, build ${rejection.buildSha256}. Independent replay receipts and traces are under evidence/rejection/.`,
    provenance: draft ? "Stopped maintenance checkpoint" : "Independent maintenance acceptance",
    relatedRefs: [...refs, { kind: "sealed_run", id: rejection.signalId },
      ...rejection.receipts.map(receipt => ({ kind: "verification_receipt", id: receipt.id }))],
  } : {
    kind: "REFERENCE_NOTE", title: "Sealed maintenance input", body: `The newly sealed material is available under evidence/. Digest ${signal.reconciliationDigest}.`,
    provenance: "Maintenance evidence intake", relatedRefs: refs,
  };
  const info = stateProbe(world, runtime, prepared.state, prepared.deployment, {
    ...(start ? { start: basis, goal: "Maintain Palimpsest from observable project results and keep its decisions and tests available for the next session." } : {}),
    entry,
  });
  assert.equal(info.project, projectId);
  assert(info.journal.some(entry => entry.refs?.some(ref => ref.id === signal.signalId)), "WAKE_EVIDENCE_NOT_IN_PROJECT");
  return info;
}

function firstMock(prior = null) {
  const file = join(root, "mock-source.patch");
  referencePatch(file, prior !== null);
  const patch = readFileSync(file).toString("base64");
  const note = "# Maintenance investigation\n\nScripted qualification exercises the retained source and a candidate commit.\n";
  return (request, ordinal) => {
    if (ordinal === 0) return prior
      ? tool(ordinal, "palimpsest_project", { action: "journal_entries" })
      : tool(ordinal, "palimpsest_continuity", { action: "pulse" });
    if (ordinal === 1) {
      assert(JSON.stringify(request.messages).includes("Sealed maintenance input"), "MOCK_WAKE_ENTRY_NOT_OBSERVED");
      if (prior) assert(JSON.stringify(request.messages).includes(prior.proof.signalId), "MOCK_PRIOR_JOURNAL_ENTRY_MISSING");
      const restored = prior
        ? `test -r evidence/prior-run/session.jsonl && test "$(git diff --binary | sha256sum | cut -d ' ' -f 1)" = ${prior.proof.files[prior.patch]} &&\n`
        : "";
      return tool(ordinal, "bash", { description: "Exercise isolated candidate creation", command:
        `test -r evidence/case-1/session.jsonl && ! touch evidence/.integrity-probe && test ! -e docs/engineering/CONTINUITY-REUSE-METHOD.md && ! git cat-file -e e47b7c10 2>/dev/null &&\n` +
        restored + `printf %s ${quote(patch)} | base64 -d | git apply && mkdir -p maintenance && printf %s ${quote(note)} > maintenance/review.md && git add -A && git commit -qm 'Submit the scripted maintenance candidate' && echo SUBMITTED` });
    }
    if (ordinal === 2) {
      assert(JSON.stringify(request.messages).includes("SUBMITTED"), "MOCK_CANDIDATE_NOT_COMMITTED");
      return tool(ordinal, "palimpsest_work", { action: "conclude", intent: "DELIVER", artifacts: ["maintenance/review.md"], statement: "Send the candidate for independent verification." });
    }
    return answer("The qualification candidate is submitted.");
  };
}

function nextMock(priorSignal) {
  return (request, ordinal) => {
    if (ordinal === 0) return tool(ordinal, "palimpsest_project", { action: "journal_entries" });
    if (ordinal === 1) {
      assert(JSON.stringify(request.messages).includes(priorSignal), "MOCK_SUCCESSOR_DID_NOT_READ_PRIOR_EVIDENCE");
      return tool(ordinal, "bash", { description: "Leave a successor work artifact", command:
        "test -r evidence/review-committed.md && git log -1 --oneline && printf 'Read the inherited record and the next sealed input.\\n' > maintenance/next.md && git add -- maintenance/next.md && git commit -qm 'Record the successor readback'" });
    }
    if (ordinal === 2 && JSON.stringify(request.messages.at(-1)).includes("DELIVER")) return tool(ordinal, "palimpsest_work", {
      action: "conclude", intent: "DELIVER", artifacts: ["maintenance/next.md"], statement: "Submit the successor readback." });
    if (ordinal === 3 && !JSON.stringify(request.messages).includes("Submit the successor readback")) return tool(ordinal, "palimpsest_work", {
      action: "conclude", intent: "DELIVER", artifacts: ["maintenance/next.md"], statement: "Submit the successor readback." });
    return answer("The successor readback is committed.");
  };
}

function approvalFor(row, mode) {
  return { mode, predecessor: installId(row.predecessor), release: installId(row.release), qualification: row.qualification };
}

function verifyRecord(row) {
  assert(row.passed && row.verification.pass && row.submission.valid && row.reconciled, "CANDIDATE_NOT_INDEPENDENTLY_QUALIFIED");
  assert.equal(digest(JSON.stringify(row.verification)), row.qualification, "QUALIFICATION_CHANGED");
  assert.equal(row.verification.buildSha256, row.release.buildSha256, "VERIFICATION_BUILD_CHANGED");
  assert.equal(row.submission.candidate, row.release.candidate, "COMMIT_CHANGED");
  assert.equal(digest(readFileSync(join(root, "first/candidate.bundle"))), row.submission.bundleSha256, "CANDIDATE_BUNDLE_CHANGED");
}

function mountApprovalWorld(prepared, row) {
  const cwd = join(prepared.run, "owner-world");
  mkdirSync(cwd);
  git(cwd, "init", "-q");
  git(cwd, "config", "core.autocrlf", "false");
  git(cwd, "fetch", "-q", sourceBundle, "refs/heads/source-basis:refs/heads/source-basis");
  git(cwd, "fetch", "-q", join(root, "first/candidate.bundle"), "HEAD");
  git(cwd, "checkout", "--quiet", "--detach", row.release.candidate);
  return cwd;
}

function verifyFaults(row, checkpoint) {
  const path = join(root, "faults.sqlite");
  const { predecessor, release, qualification } = row;
  const init = { projectId, mode: "mock", initial: predecessor };
  const approval = approvalFor(row, "mock");
  const request = { predecessor, release, qualification, checkpoint, approval };
  let fault = new MaintenanceSlot(path, init);
  const checks = [];
  try {
    for (const [key, value] of [["candidate", "0".repeat(40)], ["buildSha256", "0".repeat(64)]]) {
      assert.throws(() => fault.prepare({ ...request, approval: { ...approval, release: { ...approval.release, [key]: value } } }),
        /APPROVAL_DOES_NOT_MATCH_QUALIFIED_INSTALLATION/u);
      checks.push(`wrong ${key}`);
    }
    const interrupted = fault.prepare(request);
    assert(interrupted);
    fault.close();
    fault = new MaintenanceSlot(path, init);
    assert.deepEqual(fault.current().active, installId(predecessor));
    assert.throws(() => fault.activate({ switchId: interrupted, observedRelease: predecessor, checkpoint, readback: true }), /WRONG_LOADED_BUILD/u);
    assert.throws(() => fault.activate({ switchId: interrupted, observedRelease: release, checkpoint, readback: false }), /SWITCH_NOT_READY/u);
    assert(fault.recover(interrupted, checkpoint, "Interrupted before candidate state was activated"));
    checks.push("restart with a prepared switch", "unloadable installation", "old role restored");
    const retry = fault.prepare(request);
    assert(retry);
    assert.throws(() => fault.activate({ switchId: interrupted, observedRelease: release, checkpoint, readback: true }), /SWITCH_NOT_READY/u);
    fault.activate({ switchId: retry, observedRelease: release, checkpoint, readback: true });
    assert.equal(fault.prepare(request), false);
    assert(fault.recover(retry, checkpoint, "Failure before successor state was written"));
    const advanced = fault.prepare(request);
    assert(advanced);
    fault.activate({ switchId: advanced, observedRelease: release, checkpoint, readback: true });
    assert.equal(fault.recover(advanced, digest(checkpoint), "Failure after successor state changed"), false);
    assert.equal(fault.current().blocked, "STATE_ADVANCED_REQUIRES_REVIEW");
    checks.push("stale transition cannot activate", "duplicate activation", "rollback before writes", "rollback blocked after writes");
    writeJson(join(root, "faults.json"), { checks, ...fault.view() });
  } finally { fault.close(); }
  return checks;
}

async function successor(row, approval, mode) {
  verifyRecord(row);
  assert.deepEqual(approval, approvalFor(row, mode), "OWNER_APPROVAL_MISMATCH");
  const nextInput = join(root, "input-next");
  const seal = existsSync(nextInput) ? { entries: manifest(nextInput), sha256: sealOf(manifest(nextInput)) } : makeEvidence(nextInput, "next");
  assert.deepEqual(seal, row.nextEvidence, "SUCCESSOR_EVIDENCE_DRIFT");
  const provider = mode === PAID_MODE && !isLoop ? providerConfig() : undefined;
  const firstState = join(root, "first/stages/MAINTAIN/state");
  checkpoint(firstState);
  const before = checkpointDigest(firstState);
  assert.equal(before, row.stateCheckpoint, "QUIESCENT_STATE_CHANGED");
  const successorCheck = mode === "mock" ? verifyFaults(row, before) : [];
  let attempt = 1;
  while (existsSync(join(root, attempt === 1 ? "next" : `next-${attempt}`))) attempt += 1;
  const prepared = prepare(join(root, attempt === 1 ? "next" : `next-${attempt}`));
  const sourceInfo = readJson(join(root, "source.json"));
  const world = volume();
  const { head } = seedSource(world, root, sourceInfo, join(root, "first/candidate.bundle"));
  assert.equal(head, row.release.candidate);
  const runtime = verifyInstallation(join(root, "accepted-build"), row.release);
  const priorRuntime = verifyInstallation(join(root, "initial-build"), row.predecessor);
  const switchRequest = { predecessor: row.predecessor, release: row.release, qualification: row.qualification, checkpoint: before, approval };
  const switchId = slot.prepare(switchRequest);
  assert(switchId, "INSTALLATION_ALREADY_ACTIVE");
  let activation;
  try {
    const oldCopy = join(prepared.run, "old-probe");
    copyDatabases(firstState, oldCopy);
    copyDatabases(firstState, prepared.state);
    const old = stateProbe(world, priorRuntime, oldCopy, prepared.deployment, {});
    const readByNew = stateProbe(world, runtime, prepared.state, prepared.deployment, {});
    assert.deepEqual(readByNew, old, "ACCEPTED_BUILD_CANNOT_READ_PREDECESSOR_STATE");
    assert(old.journal.some(item => item.refs?.some(ref => ref.id === row.signalId)), "PREDECESSOR_SIGNAL_NOT_RETAINED");
    const approvalWorld = mountApprovalWorld(prepared, row);
    const basisAdmission = await admitBasis({ world: approvalWorld, state: prepared.state, approved: head, mode, projectId,
      operatorNamespace: "maintenance-installation", reason: `Accept verified maintenance build ${row.release.buildSha256}` });
    const accepted = stateProbe(world, runtime, prepared.state, prepared.deployment, {});
    assert(accepted.basis === head && accepted.head === head && accepted.project === old.project &&
      old.journal.every(entry => accepted.journal.some(other => other.id === entry.id)), "ACCEPTED_STATE_NOT_RECONCILED");
    checkpoint(prepared.state);
    const readback = { old, readByNew, accepted, basisAdmission, checkpoint: before };
    const next = isLoop ? { name: "next-" + row.signalId, seal: seal.sha256,
      input: { kind: "successor", directory: root, attempt, state: checkpointDigest(prepared.state), release: installId(row.release), readback } } : undefined;
    activation = { ...readback, active: slot.activate({ switchId, observedRelease: row.release, checkpoint: before, readback: true, next }) };
    writeJson(join(root, "activation.json"), activation);
  } catch (error) {
    const transition = slot.current().transition;
    if (transition?.phase === "PREPARED" && transition.id === switchId) slot.recover(switchId, checkpointDigest(firstState), error.message);
    throw error;
  }
  if (isLoop) return;
  const { signal } = slot.publish("next-maintenance", seal.sha256);
  return runSuccessor({ row, mode, attempt, prepared, world, head, runtime, signal, nextInput, seal, provider, successorCheck, activation, sourceInfo });
}

async function runSuccessor({ row, mode, attempt, prepared, world, head, runtime, signal, nextInput, seal, provider, successorCheck, activation, sourceInfo }) {
  let execution;
  await slot.dispatch(signal, row.release, async () => {
    writeJson(join(prepared.run, "intake.json"), putEvidence(world, runtime, prepared, signal, head, false));
    execution = await session(prepared, { world, runtime, basis: head, brief: secondGoal,
      input: nextInput, provider, reply: provider ? undefined : nextMock(row.signalId), requestWindow });
    if (isLoop) writeJson(join(prepared.run, "submission.json"), retainCandidate(prepared, world, head, "next"));
    return { reconciled: execution.reconciled, natural: execution.execution.natural, requests: execution.accounting.requests };
  });
  assert(execution, "SUCCESSOR_SESSION_NOT_DISPATCHED");
  return finishSuccessor({ row, mode, attempt, prepared, world, head, signal, nextInput, seal, provider, successorCheck, activation, sourceInfo, execution });
}

function finishSuccessor({ row, mode, attempt, prepared, head, signal, nextInput, seal, provider, successorCheck, activation, sourceInfo, execution, world }) {
  const submission = isLoop ? readJson(join(prepared.run, "submission.json")) : retainCandidate(prepared, world, head, "next");
  const priorRead = execution.trajectory?.calls.some(call => call.wakeRefs?.includes(row.signalId)) ?? false;
  let quality = null;
  if (mode === PAID_MODE && submission.valid) {
    const checkWorld = volume();
    const rebuilt = seedSource(checkWorld, root, sourceInfo, join(root, "first/candidate.bundle"));
    assert.equal(rebuilt.head, head);
    success(offline(checkWorld, `git fetch -q /next.bundle HEAD && git reset -q --hard FETCH_HEAD && test "$(git rev-parse HEAD)" = ${submission.candidate}\n${buildCommand}`,
      [`${join(prepared.run, "candidate.bundle")}:/next.bundle:ro`]));
    quality = scoreReview(checkWorld, nextInput, join(prepared.run, "review-check.log"), 7, true);
  }
  const result = { mode, attempt, previousRelease: installId(row.predecessor), loadedRelease: installId(row.release), activation, signalId: signal.signalId,
    latestInput: seal, successorCheck, submission, priorRead, quality, delivery: execution.conclusion?.intent ?? null,
    reconciliation: execution.reconciled, paidRequests: execution.execution.paidRequestsAdmitted, natural: execution.execution.natural };
  writeJson(join(root, "successor.json"), result);
  console.log("SUCCESSOR", JSON.stringify({ active: row.release.candidate, candidate: submission.candidate, quality, natural: result.natural }));
  return result;
}

async function first(qualified) {
  const mode = qualified ? PAID_MODE : "mock";
  const provider = qualified ? providerConfig() : undefined;
  const info = makeSource(root);
  const inputs = join(root, "input-first");
  const evidence = makeEvidence(inputs, "first");
  const nextEvidence = makeEvidence(join(root, "next-seal"), "next");
  if (qualified) assert.deepEqual({ source: info, evidence, nextEvidence }, qualified.inputs, "FROZEN_MOCK_INPUTS_CHANGED");
  const oldBuild = volume();
  const { basis } = seedSource(oldBuild, root, info);
  const predecessor = pack(oldBuild, basis, join(root, "initial-build"));
  if (qualified) assert.deepEqual(installId(predecessor), qualified.initial, "FROZEN_STABLE_BUILD_CHANGED");
  success(offline(oldBuild, "git bundle create /output/source.bundle refs/heads/source-basis", [`${root}:/output`]));
  const priorRuntime = verifyInstallation(join(root, "initial-build"), predecessor);
  const control = qualified ? qualified.control : await closeoutChecks(join(root, "baseline"), { runtime: priorRuntime, image, candidate: false });
  assert(control.pass, "ORIGINAL_BEHAVIOR_DID_NOT_REPRODUCE");
  const oldScore = scoreReview(oldBuild, join(root, "next-seal"), join(root, "baseline-score.log"), 6, false);
  assert(oldScore.pass, "SECOND_TICKET_NO_LONGER_REPRODUCES");

  const world = volume();
  const projected = seedSource(world, root, info);
  assert.deepEqual(projected, { basis, head: basis });
  const prepared = prepare(join(root, "first"));
  slot = new MaintenanceSlot(slotPath, { projectId, mode, initial: predecessor });
  const wake = slot.publish("first-maintenance", evidence.sha256);
  assert(wake.inserted && !slot.publish("first-maintenance", evidence.sha256).inserted);
  let execution, concurrentWriterDenied = false;
  await slot.dispatch(wake.signal, predecessor, async () => {
    if (!qualified) {
      const extra = slot.publish("concurrent-negative-control", digest("not an admitted successor"));
      const contender = new MaintenanceSlot(slotPath);
      try {
        await assert.rejects(contender.dispatch(extra.signal, predecessor, () => { throw Error("second writer ran"); }), /MAINTENANCE_WRITER_BUSY_OR_STOPPED/u);
        concurrentWriterDenied = true;
      } finally { contender.close(); }
    }
    writeJson(join(prepared.run, "intake.json"), putEvidence(world, priorRuntime, prepared, wake.signal, basis, true));
    execution = await session(prepared, { world, runtime: priorRuntime, basis, brief: firstGoal, input: inputs,
      provider, reply: provider ? undefined : firstMock() });
    return { reconciled: execution.reconciled, natural: execution.execution.natural, requests: execution.accounting.requests };
  });
  assert.equal(await slot.dispatch(wake.signal, predecessor, () => { throw Error("duplicate wake ran"); }), null);
  assert.deepEqual(manifest(inputs), evidence.entries, "SEALED_INPUT_CHANGED");
  const submission = retainCandidate(prepared, world, basis, "first");
  const row = { mode, frozen, predecessor, submission, evidence, nextEvidence, signalId: wake.signal.signalId,
    reconciled: execution.reconciled, session: execution.execution, accounting: execution.accounting, passed: false };
  await evaluateSubmission({ row, execution, prepared, info, priorRuntime });
  if (!row.passed) return row;
  if (qualified) requestApproval(row);
  else {
    assert(concurrentWriterDenied);
    const next = await successor(row, approvalFor(row, mode), mode);
    const pass = next.reconciliation && next.natural && next.submission.valid && next.paidRequests === 0 && next.successorCheck.length >= 8;
    writeJson(join(root, "qualification.json"), { pass, frozen, initial: installId(predecessor), inputs: { source: info, evidence, nextEvidence },
      control, first: installId(row.release), next: installId(next.loadedRelease), concurrentWriterDenied, mockPaidRequests: 0,
      firstWakeId: wake.signal.signalId, nextWakeId: next.signalId });
    assert(pass, "MOCK_SUCCESSION_FAILED");
    console.log("QUALIFIED", root);
  }
  return row;
}

async function evaluateSubmission({ row, execution, prepared, info, priorRuntime }) {
  const { submission } = row;
  const { basis } = submission;
  writeJson(resultFile, row);
  if (!execution.reconciled || !execution.execution.natural || !submission.valid || execution.mockErrors.length) return;

  try {
    const candidateWorld = volume();
    const imported = seedSource(candidateWorld, root, info, join(root, "first/candidate.bundle"));
    const admittedBasis = row.rework ? row.predecessor.candidate : basis;
    assert.deepEqual(imported, { basis: admittedBasis, head: submission.candidate });
    const release = pack(candidateWorld, submission.candidate, join(root, "accepted-build"));
    const runtime = verifyInstallation(join(root, "accepted-build"), release);
    const probes = await closeoutChecks(join(root, "candidate-probes"), { runtime, image, candidate: true });
    const tests = regression(candidateWorld, join(root, "candidate-regression.log"));
    const oldState = join(root, "readback-old"), newState = join(root, "readback-new");
    copyDatabases(prepared.state, oldState);
    copyDatabases(prepared.state, newState);
    const old = stateProbe(candidateWorld, priorRuntime, oldState, prepared.deployment, {});
    const readByNew = stateProbe(candidateWorld, runtime, newState, prepared.deployment, {});
    const readback = JSON.stringify(old) === JSON.stringify(readByNew) && old.project === projectId &&
      old.basis === admittedBasis && old.head === submission.candidate;
    const testsObserved = execution.trajectory?.calls.filter(call => call.testCommand && call.result !== null) ?? [];
    const sourceChanged = submission.changed.some(file => /^(?:src|host\/dsh)\//u.test(file));
    const authoredTest = submission.changed.some(file => /(?:^tests?\/|test|probe|repro|regress)/iu.test(file) && !file.endsWith(".md"));
    const maintainerEvidence = { sourceChanged, authoredTest, testsObserved: testsObserved.map(({ call, result, request }) => ({ call, result, request })),
      report: submission.changed.some(path => path.endsWith(".md")),
      automatedTestObservation: Boolean(execution.trajectory?.calls.some(call => call.testCommand && call.result !== null &&
        /\b(?:pass(?:ed)?|fail(?:ed)?|tests?|assertion|not ok|ok \d)\b/iu.test(call.output))) };
    const independent = probes.pass && tests.exit === 0 && tests.passed > 0 && readback;
    const pass = independent && sourceChanged && authoredTest && (row.resume || row.rework || maintainerEvidence.report) &&
      (row.mode !== PAID_MODE || maintainerEvidence.automatedTestObservation);
    const verification = { pass, exactSha: submission.candidate, buildSha256: release.buildSha256, tests, probes,
      readback, old, readByNew, maintainerEvidence };
    Object.assign(row, { release, verification, qualification: digest(JSON.stringify(verification)),
      stateCheckpoint: checkpointDigest(prepared.state), passed: pass });
    writeJson(resultFile, row);
    if (!isLoop) {
      const rejection = rejectionOf(row, root);
      if (rejection) enqueueRejection(rejection, row.predecessor);
    }
  } catch (error) {
    writeJson(join(root, "verification-error.json"), { error: error.message });
    throw error;
  }
}

function enqueueRejection(rejection, predecessor, stem = "rejection") {
  writeJson(join(root, stem + ".json"), rejection);
  const wake = slot.publishRejection(rejection, predecessor);
  writeJson(join(root, stem + "-wake.json"), wake.signal);
  return wake;
}

function requestApproval(row) {
  writeJson(join(root, "approval-request.json"), { approval: approvalFor(row, row.mode) });
  console.log("AWAIT_OWNER", JSON.stringify({ candidate: row.release.candidate, buildSha256: row.release.buildSha256, qualification: row.qualification }));
}

async function resumeFirst(prior, qualified) {
  const mode = qualified ? PAID_MODE : "mock";
  const inputs = join(root, "input-first");
  const sealed = prepareDraftInputs(prior, root, inputs, join(root, "next-seal"));
  if (qualified) assert.deepEqual(sealed, qualified.inputs, "RESUME_QUALIFIED_INPUT_CHANGED");
  const { source: info, evidence, nextEvidence } = sealed;
  const { predecessor } = prior.oldRecord;
  const { basis } = prior.proof;
  assert.equal(image, predecessor.image, "PREDECESSOR_IMAGE_CHANGED");
  const priorRuntime = verifyInstallation(join(root, "initial-build"), predecessor);
  const world = volume();
  assert.deepEqual(seedSource(world, root, info), { basis, head: basis });
  const prepared = prepare(join(root, "first"));
  const restoration = restoreDraft(prior, world, prepared);
  writeJson(join(root, "draft-restoration.json"), restoration);
  const stopChecks = qualified ? qualified.stopChecks : checkStopRefusals(prior);

  const previousSlotPath = join(prior.directory, "slot.sqlite");
  const previousSlot = readJson(join(prior.directory, "slot.json"));
  assert(existsSync(previousSlotPath), "ORIGINAL_MAINTENANCE_SLOT_MISSING");
  const activeSlotPath = qualified ? previousSlotPath : slotPath;
  slot = new MaintenanceSlot(activeSlotPath, { projectId, mode, initial: predecessor });
  if (qualified) {
    assert.deepEqual(slot.view(), previousSlot, "PREDECESSOR_SLOT_CHANGED");
    writeJson(originFile, { previousRun: prior.directory, stopProof: digest(JSON.stringify(prior.proof)) });
  } else {
    const snapshot = join(root, "predecessor-slot.sqlite");
    copyFileSync(previousSlotPath, snapshot);
    const reopened = new MaintenanceSlot(snapshot);
    try { assert.deepEqual(reopened.view(), previousSlot, "PREDECESSOR_SLOT_CHANGED"); }
    finally { reopened.close(); }
    const { signal } = slot.publish("first-maintenance", prior.oldRecord.evidence.sha256);
    assert.equal(signal.signalId, prior.proof.signalId);
    await slot.dispatch(signal, predecessor, () => ({ reconciled: true, natural: false, requests: prior.proof.requests }));
    assert.throws(() => slot.publishDraft({ ...prior.proof, unresolved: 1 }, evidence.sha256, predecessor), /INVALID_DRAFT_STOP_PROOF/u);
    assert.throws(() => slot.publishDraft({ ...prior.proof, requests: 63 }, evidence.sha256, predecessor), /DRAFT_PREDECESSOR_STOP_MISMATCH/u);
    stopChecks.push("persisted slot matches its archive", "slot with unresolved use", "slot with different prior request count");
  }
  const provider = qualified ? providerConfig() : undefined;
  const wake = slot.publishDraft(prior.proof, evidence.sha256, predecessor);
  assert(wake.inserted && !slot.publishDraft(prior.proof, evidence.sha256, predecessor).inserted);
  let execution;
  await slot.dispatch(wake.signal, predecessor, async () => {
    const intake = putEvidence(world, priorRuntime, prepared, wake.signal, basis, false);
    assert(intake.basis === basis && intake.head === basis &&
      intake.journal.some(item => item.refs?.some(ref => ref.id === prior.proof.signalId)), "ORIGINAL_PROJECT_NOT_READ_BACK");
    writeJson(join(prepared.run, "intake.json"), intake);
    execution = await session(prepared, { world, runtime: priorRuntime, basis, brief: resumeGoal, input: inputs, provider,
      reply: provider ? undefined : firstMock(prior), requestWindow });
    assert.notEqual(execution.execution.cohortId, prior.proof.cohortId, "REUSED_STOPPED_COHORT");
    assert.notEqual(execution.execution.home, prior.session.execution.home, "REUSED_STOPPED_DSH_HOME");
    return { reconciled: execution.reconciled, natural: execution.execution.natural, requests: execution.accounting.requests };
  });
  assert.equal(await slot.dispatch(wake.signal, predecessor, () => { throw Error("duplicate draft wake ran"); }), null);
  assert.deepEqual(manifest(inputs), evidence.entries, "SEALED_INPUT_CHANGED");
  const submission = retainCandidate(prepared, world, basis, "first");
  const row = { mode, frozen, predecessor, submission, evidence, nextEvidence, signalId: wake.signal.signalId,
    resume: { prior: prior.proof, restoration, priorRead: execution.trajectory?.calls.some(call => call.wakeRefs?.includes(prior.proof.signalId)) ?? false },
    reconciled: execution.reconciled, session: execution.execution, accounting: execution.accounting, passed: false };
  await evaluateSubmission({ row, execution, prepared, info, priorRuntime });
  if (!row.passed) return row;
  if (qualified) requestApproval(row);
  else {
    assert(row.resume.priorRead, "MOCK_DRAFT_HISTORY_NOT_READ");
    const next = await successor(row, approvalFor(row, mode), mode);
    const pass = next.priorRead && next.reconciliation && next.natural && next.submission.valid && next.paidRequests === 0;
    writeJson(join(root, "qualification.json"), { pass, frozen, initial: installId(predecessor), inputs: sealed,
      first: installId(row.release), next: installId(next.loadedRelease), mockPaidRequests: 0,
      firstWakeId: wake.signal.signalId, nextWakeId: next.signalId, stopChecks });
    assert(pass, "MOCK_DRAFT_SUCCESSION_FAILED");
    console.log("QUALIFIED", root);
  }
  return row;
}

function rejectionMock(rejection, reject = false, draft) {
  const file = join(root, "mock-source.patch");
  referencePatch(file, true);
  const patch = readFileSync(file).toString("base64");
  const testPath = reject ? "maintenance/initial-rework.test.mjs" : "maintenance/rejection-intake.test.mjs";
  const testSource = [
    "import assert from 'node:assert/strict';",
    "import {readFileSync} from 'node:fs';",
    "import test from 'node:test';",
    "test('both rejected replay receipts are available', () => {",
    `  const expected = ${JSON.stringify(rejection.receipts.map(receipt => receipt.id))};`,
    "  const load = arm => JSON.parse(readFileSync('evidence/rejection/' + arm + '/receipt.json'));",
    "  assert.deepEqual(['without', 'with'].map(arm => load(arm).id), expected);",
    "});",
  ].join("\n") + "\n";
  return (request, ordinal) => {
    if (ordinal === 0) return tool(ordinal, "palimpsest_project", { action: "journal_entries" });
    if (ordinal === 1) {
      const observed = JSON.stringify(request.messages);
      assert(rejection.receipts.every(receipt => observed.includes(receipt.id)), "BOTH_REJECTIONS_NOT_READ_FROM_JOURNAL");
      return tool(ordinal, "bash", { description: "Verify receipt intake and submit the Mock candidate", command: [
        `test "$(git rev-parse HEAD)" = ${rejection.candidate}`,
        ...(draft ? [
          `test "$(git diff --binary | sha256sum | cut -d ' ' -f 1)" = ${draft.tracked}`,
          ...draft.untracked.map(file => `test "$(sha256sum ${quote(file.path)} | cut -d ' ' -f 1)" = ${file.digest}`),
          "test -r evidence/draft-stop/session.jsonl",
        ] : ['test -z "$(git status --porcelain)"']),
        "! touch evidence/rejection/.write-probe && test -r evidence/rejection/without/session.jsonl && test -r evidence/rejection/with/session.jsonl",
        reject ? "printf '\\n// First Mock revision preserves the independently failing behavior.\\n' >> host/dsh/lib/runner.js" :
          `printf %s ${quote(patch)} | base64 -d | git apply`,
        `mkdir -p maintenance && printf %s ${quote(Buffer.from(testSource).toString("base64"))} | base64 -d > ${testPath}`,
        `node --test ${testPath}`,
        "git add -A && git commit -qm 'Submit the scripted rejection continuation' && echo REWORK_SUBMITTED",
      ].join(" && ") });
    }
    if (ordinal === 2) {
      assert(JSON.stringify(request.messages).includes("REWORK_SUBMITTED"), "MOCK_REWORK_NOT_SUBMITTED");
      return tool(ordinal, "palimpsest_work", { action: "conclude", intent: "DELIVER",
        artifacts: [testPath, "host/dsh/lib/runner.js"], statement: "Submit the Mock revision for independent verification." });
    }
    return answer("The Mock revision is submitted.");
  };
}

async function rehearsalSlot(prior, predecessor) {
  const originalSlot = previousRun ? resolve(previousRun) : join(prior.draft.directory, "slot.sqlite");
  assert(existsSync(originalSlot), "ORIGINAL_MAINTENANCE_SLOT_MISSING");
  copyFileSync(originalSlot, join(root, "predecessor-slot.sqlite"));
  const persisted = new MaintenanceSlot(join(root, "predecessor-slot.sqlite"));
  try { verifyRejectionSlot(prior.snapshot, persisted.view(), prior.rejection); }
  finally { persisted.close(); }
  slot = new MaintenanceSlot(slotPath, { projectId, mode: "mock", initial: predecessor });
  const firstWake = slot.publish("first-maintenance", prior.draft.oldRecord.evidence.sha256).signal;
  assert.equal(firstWake.signalId, prior.draft.proof.signalId);
  await slot.dispatch(firstWake, predecessor, () => ({ reconciled: true, natural: false, requests: prior.draft.proof.requests }));
  const parent = slot.publishDraft(prior.draft.proof, prior.row.evidence.sha256, predecessor).signal;
  assert.equal(parent.signalId, prior.rejection.signalId);
  await slot.dispatch(parent, predecessor, () => ({ reconciled: true, natural: true, requests: prior.rejection.requests }));
  const { rejection } = prior;
  assert.throws(() => slot.publishRejection({ ...rejection, unresolved: 1 }, predecessor), /INVALID_REJECTION_PROOF/u);
  assert.throws(() => slot.publishRejection({ ...rejection, receipts: [] }, predecessor), /INVALID_REJECTION_PROOF/u);
  assert.throws(() => slot.publishRejection({ ...rejection, candidate: "0".repeat(40) }, predecessor), /REJECTION_RECEIPT_NOT_BOUND/u);
  assert.throws(() => slot.publishRejection({ ...rejection, buildSha256: "0".repeat(64) }, predecessor), /REJECTION_RECEIPT_NOT_BOUND/u);
  assert.throws(() => slot.publishRejection({ ...rejection, signalId: prior.draft.proof.signalId }, predecessor), /REJECTED_RUN_TERMINAL_MISMATCH/u);
  assert.throws(() => slot.publishRejection({ ...rejection, requests: rejection.requests - 1 }, predecessor), /REJECTED_RUN_TERMINAL_MISMATCH/u);
  return ["persisted slot matches original", "unresolved usage", "missing receipts", "different candidate", "different build",
    "non-natural predecessor", "different request count"];
}

async function resumeRejected(prior, qualified) {
  const mode = qualified ? PAID_MODE : "mock";
  const sealed = prepareRejectionInputs(prior, root);
  if (qualified) assert.deepEqual(sealed, qualified.inputs, "REJECTION_QUALIFIED_INPUT_CHANGED");
  const { source: info, evidence, nextEvidence } = sealed;
  const { rejection, row: previous } = prior;
  const { predecessor } = previous;
  const { basis, candidate } = rejection;
  assert.equal(image, predecessor.image, "PREDECESSOR_IMAGE_CHANGED");
  const priorRuntime = verifyInstallation(join(root, "initial-build"), predecessor);
  const world = volume();
  assert.deepEqual(seedSource(world, root, info, join(prior.directory, "first/candidate.bundle")), { basis, head: candidate });
  const prepared = prepare(join(root, "first"));
  copyDatabases(join(prior.directory, "first/stages/MAINTAIN/state"), prepared.state);
  assert.deepEqual(manifest(prepared.state), prior.proof.states, "REJECTED_CHECKPOINT_COPY_CHANGED");
  writeJson(join(root, "prior-rejection.json"), prior.proof);
  let faultChecks;
  if (qualified) {
    const activeSlotPath = join(prior.draft.directory, "slot.sqlite");
    assert(existsSync(activeSlotPath), "ORIGINAL_MAINTENANCE_SLOT_MISSING");
    slot = new MaintenanceSlot(activeSlotPath, { projectId, mode, initial: predecessor });
    verifyRejectionSlot(prior.snapshot, slot.view(), rejection);
    writeJson(originFile, { kind: "rejection", previousRun: prior.directory, slotDirectory: prior.draft.directory, prior: sealOf(prior.proof) });
  } else faultChecks = await rehearsalSlot(prior, predecessor);
  const beforeWake = slot.view();
  const wake = enqueueRejection(rejection, predecessor, "incoming");
  if (!qualified) {
    assert(wake.inserted);
    slot.close();
    slot = new MaintenanceSlot(slotPath);
    verifyRejectionSlot(beforeWake, slot.view(), rejection);
    assert.throws(() => slot.publishRejection({ ...rejection, checkpoint: "f".repeat(64) }, predecessor), /EVIDENCE_CHANGED_ON_REPLAY/u);
    faultChecks.push("restart with pending receipt", "changed seal on redelivery");
  }
  const replay = slot.publishRejection(rejection, predecessor);
  assert(!replay.inserted && replay.signal.signalId === wake.signal.signalId, "DUPLICATE_REJECTION_WAKE");

  const provider = qualified ? providerConfig() : undefined;
  const inputs = join(root, "input-first");
  let execution;
  await slot.dispatch(wake.signal, predecessor, async () => {
    const intake = putEvidence(world, priorRuntime, prepared, wake.signal, candidate, false, rejection);
    const item = intake.journal.find(entry => entry.refs?.some(ref => ref.id === wake.signal.signalId));
    assert(intake.basis === basis && intake.head === candidate &&
      previous.verification.old.journal.every(entry => intake.journal.some(added => added.id === entry.id)) &&
      rejection.receipts.every(receipt => item?.refs.some(ref => ref.id === receipt.id)), "REJECTION_NOT_IN_SAME_PROJECT");
    assert.deepEqual(conclusion(prepared.state), prior.session.conclusion, "PREDECESSOR_DELIVERY_NOT_RETAINED");
    writeJson(join(prepared.run, "intake.json"), intake);
    execution = await session(prepared, { world, runtime: priorRuntime, basis: candidate, brief: rejectionGoal, input: inputs, provider,
      reply: provider ? undefined : rejectionMock(rejection), requestWindow });
    assert.notEqual(execution.execution.cohortId, rejection.cohortId, "REUSED_REJECTED_COHORT");
    assert.notEqual(execution.execution.home, prior.session.execution.home, "REUSED_REJECTED_DSH_HOME");
    return { reconciled: execution.reconciled, natural: execution.execution.natural, requests: execution.accounting.requests };
  });
  assert(execution, "REJECTION_ALREADY_DISPATCHED");
  assert.equal(await slot.dispatch(wake.signal, predecessor, () => { throw Error("duplicate rejection ran"); }), null);
  assert.deepEqual(manifest(inputs), evidence.entries, "SEALED_INPUT_CHANGED");
  const submission = retainCandidate(prepared, world, candidate, "first", { bundleBasis: basis });
  const read = execution.trajectory?.calls.some(call => call.wakeRefs?.includes(wake.signal.signalId)) ?? false;
  const row = { mode, frozen, predecessor, submission, evidence, nextEvidence, signalId: wake.signal.signalId,
    rework: { prior: prior.proof, read }, reconciled: execution.reconciled, session: execution.execution,
    accounting: execution.accounting, passed: false };
  await evaluateSubmission({ row, execution, prepared, info, priorRuntime });
  if (!row.passed) return row;
  if (qualified) requestApproval(row);
  else {
    const next = await successor(row, approvalFor(row, mode), mode);
    const pass = read && next.priorRead && next.reconciliation && next.natural && next.submission.valid && next.paidRequests === 0;
    writeJson(join(root, "qualification.json"), { pass, frozen, initial: installId(predecessor), inputs: sealed,
      first: installId(row.release), next: installId(next.loadedRelease), mockPaidRequests: 0,
      firstWakeId: wake.signal.signalId, nextWakeId: next.signalId, faultChecks: [...faultChecks, "no second dispatch after exit"] });
    assert(pass, "MOCK_REJECTION_SUCCESSION_FAILED");
    console.log("QUALIFIED", root);
  }
  return row;
}

function historicStop(prior) {
  const history = "817070da5709e0da0729e163582acd8a7c3dcc30";
  const archive = "research-evidence/pnwf-software/2026-11-22/rejection-retry/live";
  const previous = join(repo, archive);
  const observation = verifyInterrupted(previous, readJson(join(previous, "interruption.json")));
  for (const file of ["interruption.json", "incoming.json", "slot.json", "first/cohort.json", ...Object.keys(observation.files)]) {
    verifiedArchiveDigest(previous, history, archive, file);
  }
  const stopped = readJson(join(previous, "slot.json"));
  assert(!stopped.slot.writer && stopped.slot.blocked === "USAGE_UNCONFIRMED");
  assert.deepEqual(readJson(join(previous, "incoming.json")), prior.rejection);
  return { history, archive, observation: sealOf(observation), cohort: observation.usage.cohortId,
    unknown: observation.usage.requests.filter(request => request.state === "UNKNOWN").map(request => request.id) };
}

function enqueueLoop(prior, archived = false) {
  return slot.publishRejection(prior.rejection, prior.row.predecessor, {
    kind: "rejection", directory: prior.directory, archived, proof: sealOf(prior.proof),
  });
}

async function startLoop(prior, mode, qualified) {
  const stop = historicStop(prior);
  if (qualified) assert.deepEqual({ prior: sealOf(prior.proof), stop }, qualified.origin, "LOOP_QUALIFIED_INPUT_CHANGED");
  mkdirSync(campaignRoot);
  writeJson(join(campaignRoot, "campaign.json"), { mode, frozen, origin: { prior: sealOf(prior.proof), stop } });
  writeJson(join(campaignRoot, "prior-unknown.json"), stop);
  slot = new MaintenanceSlot(slotPath, { projectId, mode, initial: prior.row.predecessor });
  // Import sealed completed observations into the new accounting scope. The original slot remains blocked.
  const completed = [
    slot.publish("first-maintenance", prior.draft.oldRecord.evidence.sha256).signal,
  ];
  const release = prior.row.predecessor;
  assert.equal(completed[0].signalId, prior.draft.proof.signalId);
  await slot.dispatch(completed[0], release, () => ({ reconciled: true, natural: false, requests: prior.draft.proof.requests }));
  const parent = slot.publishDraft(prior.draft.proof, prior.row.evidence.sha256, release).signal;
  assert.equal(parent.signalId, prior.rejection.signalId);
  await slot.dispatch(parent, release, () => ({ reconciled: true, natural: true, requests: prior.rejection.requests }));
  enqueueLoop(prior, true);
}

function startDraftLoop(previous, mode, qualified) {
  const prior = archivedQueueDraft(previous);
  const origin = { prior: sealOf(prior.proof), stop: prior.proof.stop };
  if (qualified) assert.deepEqual(origin, qualified.origin, "LOOP_QUALIFIED_INPUT_CHANGED");
  mkdirSync(campaignRoot);
  writeJson(join(campaignRoot, "campaign.json"), { mode, frozen, origin });
  writeJson(join(campaignRoot, "prior-unknown.json"), origin.stop);
  slot = new MaintenanceSlot(slotPath, { projectId, mode, initial: prior.row.predecessor });
  const wake = slot.publishArchivedDraft(prior.proof, prior.row.predecessor, previous);
  assert(wake.inserted);
  assert(!slot.publishArchivedDraft(prior.proof, prior.row.predecessor, previous).inserted);
}

function openLoop() {
  assert(existsSync(slotPath), "MAINTENANCE_SLOT_MISSING");
  const campaign = readJson(join(campaignRoot, "campaign.json"));
  assert.deepEqual(campaign.frozen, frozen, "LOOP_RUNNER_CHANGED");
  slot = new MaintenanceSlot(slotPath);
  assert(slot.current().project === projectId && slot.current().mode === campaign.mode);
  return campaign;
}

function restartMockInbox() {
  const before = slot.queued();
  slot.close();
  slot = new MaintenanceSlot(slotPath);
  assert.deepEqual(slot.queued(), before, "QUEUE_RESTART_CHANGED");
}

async function runQueuedRejection(job, mode) {
  const { signal, input } = job;
  const restoring = input.kind === "draft";
  const prior = restoring ? archivedQueueDraft(input.directory) :
    input.archived ? archivedRejection(input.directory) : queuedRejection(input.directory);
  assert.equal(input.proof, sealOf(prior.proof), "QUEUED_PREDECESSOR_CHANGED");
  const { rejection, row: previous } = prior;
  assert.equal(signal.reconciliationDigest, sealOf(restoring ? prior.proof : rejection), "QUEUED_REJECTION_CHANGED");
  const predecessor = previous.predecessor;
  const provider = mode === PAID_MODE ? providerConfig() : undefined;
  await slot.dispatch(signal, predecessor, async () => {
    mkdirSync(root, { recursive: true });
    const sealed = restoring ? prepareQueueDraft(prior, root) : prepareRejectionInputs(prior, root);
    const prepared = prepare(join(root, "first"));
    const inputs = join(root, "input-first");
    const world = volume();
    assert.deepEqual(seedSource(world, root, sealed.source, prior.bundle ?? join(prior.directory, "first/candidate.bundle")),
      { basis: rejection.basis, head: rejection.candidate });
    copyDatabases(join(prior.directory, "first/stages/MAINTAIN/state"), prepared.state);
    assert.deepEqual(manifest(prepared.state), prior.proof.states, "REJECTED_CHECKPOINT_COPY_CHANGED");
    writeJson(join(root, "prior-rejection.json"), prior.proof);
    writeJson(join(root, "incoming.json"), rejection);
    writeJson(join(root, "incoming-wake.json"), signal);
    const runtime = verifyInstallation(join(root, "initial-build"), predecessor);
    const restored = restoring ? restoreQueueDraft(prior, world) : null;
    if (restored) writeJson(join(root, "draft-restored.json"), restored);
    const intake = putEvidence(world, runtime, prepared, signal, rejection.candidate, false, rejection, restoring ? prior.proof : undefined);
    const entry = intake.journal.find(item => item.refs?.some(ref => ref.id === signal.signalId));
    assert(intake.basis === rejection.basis && intake.head === rejection.candidate &&
      previous.verification.old.journal.every(item => intake.journal.some(current => current.id === item.id)) &&
      rejection.receipts.every(receipt => entry?.refs.some(ref => ref.id === receipt.id)), "REJECTION_NOT_IN_SAME_PROJECT");
    assert.deepEqual(conclusion(prepared.state), prior.session.conclusion, "PREDECESSOR_DELIVERY_NOT_RETAINED");
    writeJson(join(prepared.run, "intake.json"), intake);
    const execution = await session(prepared, { world, runtime, basis: rejection.candidate, brief: restoring ? resumeGoal : rejectionGoal, input: inputs,
      provider, reply: provider ? undefined : rejectionMock(rejection, input.archived, restoring ? prior.proof : undefined), requestWindow });
    assert.notEqual(execution.execution.cohortId, rejection.cohortId, "REUSED_REJECTED_COHORT");
    if (restoring) assert.notEqual(execution.execution.cohortId, prior.proof.stop.cohort, "REUSED_STOPPED_COHORT");
    assert.notEqual(execution.execution.home, prior.session.execution.home, "REUSED_REJECTED_DSH_HOME");
    assert.deepEqual(manifest(inputs), sealed.evidence.entries, "SEALED_INPUT_CHANGED");
    const submission = retainCandidate(prepared, world, rejection.candidate, "first", { bundleBasis: rejection.basis });
    const read = execution.trajectory?.calls.some(call => call.wakeRefs?.includes(signal.signalId)) ?? false;
    writeJson(resultFile, { mode, frozen, predecessor, submission, evidence: sealed.evidence, nextEvidence: sealed.nextEvidence,
      signalId: signal.signalId, rework: { prior: prior.proof, read, ...(restored ? { restored } : {}) }, reconciled: execution.reconciled,
      session: execution.execution, accounting: execution.accounting, passed: false });
    return { reconciled: execution.reconciled, natural: execution.execution.natural, requests: execution.accounting.requests };
  });
}

function settlement(job, execution) {
  assert.deepEqual(JSON.parse(job.result), { reconciled: execution.reconciled, natural: execution.execution.natural,
    requests: execution.accounting.requests }, "QUEUED_SETTLEMENT_CHANGED");
}

function retainPartialReview() {
  const names = ["accepted-build", "candidate-probes", "candidate-regression.log", "readback-old", "readback-new", "verification-error.json"]
    .filter(name => existsSync(join(root, name)));
  if (!names.length) return;
  let version = 1;
  while (existsSync(join(root, "partial-review-" + version))) version += 1;
  const saved = join(root, "partial-review-" + version);
  mkdirSync(saved);
  for (const name of names) renameSync(join(root, name), join(saved, name));
}

async function reviewQueuedRejection(job) {
  const prepared = { state: join(root, "first/stages/MAINTAIN/state"), deployment: join(root, "first/profile.json") };
  const execution = readJson(join(root, "first/session.json"));
  const row = readJson(resultFile);
  settlement(job, execution);
  assert.deepEqual(row.session, execution.execution);
  assert.equal(row.signalId, job.id);
  if (!row.verification) {
    retainPartialReview();
    const priorRuntime = verifyInstallation(join(root, "initial-build"), row.predecessor);
    await evaluateSubmission({ row, execution, prepared, info: readJson(join(root, "source.json")), priorRuntime });
  }
  if (row.passed) {
    verifyRecord(row);
    requestApproval(row);
    return { state: "AWAIT_OWNER", candidate: row.release.candidate, buildSha256: row.release.buildSha256, directory: root };
  }
  const rejection = row.verification && rejectionOf(row, root);
  if (!rejection) return { state: "STOPPED", directory: root };
  const prior = queuedRejection(root);
  const { signal } = enqueueLoop(prior);
  // The immutable work payload and the event already exist if the host restarts before this summary is written.
  writeJson(join(root, "rejection.json"), rejection);
  writeJson(join(root, "rejection-wake.json"), signal);
  return { state: "REJECTED", directory: root, next: signal.signalId };
}

async function consumeSuccessor(job, mode) {
  useRound(job.input.directory);
  const row = readJson(resultFile);
  verifyRecord(row);
  const active = slot.current();
  assert.deepEqual(active.active, job.input.release);
  assert.deepEqual(active.transition?.approval, approvalFor(row, mode));
  const activation = { ...job.input.readback, active: active.transition };
  const { attempt } = job.input;
  const run = join(root, attempt === 1 ? "next" : `next-${attempt}`);
  const nextInput = join(root, "input-next");
  const seal = { entries: manifest(nextInput), sha256: job.seal };
  assert.equal(sealOf(seal.entries), job.seal);
  assert.deepEqual(seal, row.nextEvidence);
  const sourceInfo = readJson(join(root, "source.json"));
  const successorCheck = mode === "mock" ? readJson(join(root, "faults.json")).checks : [];
  const common = { row, mode, attempt, head: row.release.candidate, signal: job.signal, nextInput, seal,
    successorCheck, activation, sourceInfo };
  if (job.status === "DONE" || job.status === "STOPPED") {
    if (!existsSync(join(run, "submission.json"))) return { state: "STOPPED", directory: root };
    const execution = readJson(join(run, "session.json"));
    settlement(job, execution);
    finishSuccessor({ ...common, prepared: { run }, execution });
  } else {
    assert.equal(checkpointDigest(join(run, "stages/MAINTAIN/state")), job.input.state, "QUEUED_ACTIVATION_STATE_DRIFT");
    const prepared = prepare(run, projectId, { reopen: true });
    const world = volume();
    assert.equal(seedSource(world, root, sourceInfo, join(root, "first/candidate.bundle")).head, row.release.candidate);
    const runtime = verifyInstallation(join(root, "accepted-build"), row.release);
    await runSuccessor({ ...common, prepared, world, runtime, provider: mode === PAID_MODE ? providerConfig() : undefined });
  }
  const next = readJson(join(root, "successor.json"));
  return { state: next.reconciliation && next.natural && next.submission.valid ? "DELIVERED_NEXT" : "STOPPED", directory: root };
}

async function drainLoop(mode) {
  while (true) {
    const jobs = slot.queued();
    assert(!jobs.some(job => job.status === "RUNNING"), "IN_FLIGHT_WORK_REQUIRES_OBSERVED_EXIT");
    // Review the producer before consuming its child, including after a crash between enqueue and review.
    const job = jobs.find(item => !item.outcome && item.status !== "PENDING") ??
      jobs.find(item => !item.outcome && item.status === "PENDING");
    if (!job) return jobs.at(-1)?.outcome;
    const start = heap.length;
    try {
      if (job.input.kind === "successor") {
        const outcome = await consumeSuccessor(job, mode);
        slot.completeWork(job.id, outcome);
        return outcome;
      }
      assert(["rejection", "draft"].includes(job.input.kind), "UNKNOWN_MAINTENANCE_WORK");
      useRound(join(campaignRoot, "r", String(job.sequence)));
      if (job.status === "PENDING") { await runQueuedRejection(job, mode); continue; }
      const outcome = job.status === "DONE" ? await reviewQueuedRejection(job) : { state: "STOPPED", directory: root };
      slot.completeWork(job.id, outcome);
      if (outcome.state !== "REJECTED") return outcome;
      if (mode === "mock") restartMockInbox();
    } finally {
      for (const world of heap.splice(start).reverse()) world.close();
    }
  }
}

async function activateDecision(row, decision, mode) {
  assert(decision.actor === "owner" && decision.decision === "APPROVE" && typeof decision.recordedAt === "string", "OWNER_DECISION_REQUIRED");
  assert.deepEqual(decision.approval, approvalFor(row, mode), "OWNER_DECISION_WRONG_BUILD");
  const state = slot.current();
  if (state.active.candidate === row.release.candidate) {
    assert.deepEqual(state.transition?.approval, decision.approval);
    return;
  }
  if (state.transition?.phase === "PREPARED") {
    assert.deepEqual(state.transition.approval, decision.approval);
    assert(slot.recover(state.transition.id, checkpointDigest(join(root, "first/stages/MAINTAIN/state")),
      "Retry approved activation after interrupted readback"));
  }
  await successor(row, decision.approval, mode);
}

async function maintenanceLoop() {
  const qualifying = action.endsWith("-qualify");
  if (qualifying || action.endsWith("-live")) {
    const qualified = qualifying ? null : readJson(join(resolve(prerequisite), "qualification.json"));
    if (qualified) {
      assert(qualified.pass && qualified.mockPaidRequests === 0);
      assert.deepEqual(qualified.frozen, frozen, "QUALIFIED_RUNNER_CHANGED");
    }
    const previous = resolve(qualifying ? prerequisite : previousRun), mode = qualifying ? "mock" : PAID_MODE;
    if (isDraftLoop) startDraftLoop(previous, mode, qualified);
    else await startLoop(archivedRejection(previous), mode, qualified);
    if (qualifying) restartMockInbox();
  } else openLoop();
  consumer = slot.claimConsumer();
  const { mode, origin: seal } = readJson(join(campaignRoot, "campaign.json"));

  if (action === "loop-approve") {
    const job = slot.queued().find(item => item.outcome?.state === "AWAIT_OWNER");
    assert(job && mode === PAID_MODE, "NO_REAL_CANDIDATE_AWAITING_OWNER");
    useRound(job.outcome.directory);
    const row = readJson(resultFile);
    const decision = readJson(resolve(prerequisite));
    assert(decision.actor === "owner" && decision.decision === "APPROVE" && typeof decision.recordedAt === "string", "OWNER_DECISION_REQUIRED");
    assert.deepEqual(decision.approval, approvalFor(row, mode), "OWNER_DECISION_WRONG_BUILD");
    writeJson(join(root, "owner-approval.json"), decision);
  }
  const waiting = slot.queued().find(item => item.outcome?.state === "AWAIT_OWNER");
  if (waiting) {
    useRound(waiting.outcome.directory);
    const ownerPath = join(root, "owner-approval.json");
    if (existsSync(ownerPath)) await activateDecision(readJson(resultFile), readJson(ownerPath), mode);
  }
  const result = await drainLoop(mode);
  if (qualifying) {
    assert.equal(result?.state, "AWAIT_OWNER");
    const work = slot.queued();
    assert.deepEqual(work.map(item => item.outcome?.state), isDraftLoop ? ["AWAIT_OWNER"] : ["REJECTED", "AWAIT_OWNER"]);
    const first = readJson(join(work[0].outcome.directory, "candidate.json"));
    useRound(result.directory);
    const row = readJson(resultFile);
    if (isDraftLoop) assert(row.rework.read && row.rework.restored.untracked.length > 0 && row.rework.restored.head === row.submission.basis);
    else assert(first.rework.read && row.rework.read && first.submission.candidate === row.submission.basis &&
      first.session.cohortId !== row.session.cohortId && first.session.home !== row.session.home, "MOCK_REWORK_NOT_CONTINUOUS");
    const approval = approvalFor(row, mode);
    await assert.rejects(successor(row, { ...approval, release: { ...approval.release, buildSha256: "0".repeat(64) } }, mode),
      /OWNER_APPROVAL_MISMATCH/u);
    assert.deepEqual(slot.current().active, installId(row.predecessor));
    const decision = { actor: "owner", decision: "APPROVE", recordedAt: new Date().toISOString(), approval };
    writeJson(join(root, "owner-approval.json"), decision);
    await activateDecision(row, decision, mode);
    restartMockInbox();
    const next = await drainLoop(mode);
    assert.equal(next?.state, "DELIVERED_NEXT");
    const delivered = readJson(join(root, "successor.json"));
    assert(delivered.priorRead && delivered.paidRequests === 0 && first.session.paidRequestsAdmitted === 0 && row.session.paidRequestsAdmitted === 0);
    assert.equal(slot.view().events.filter(event => event.type === "WAKE_DISPATCHED" && work.some(job => job.id === event.detail.id)).length, work.length);
    const before = sealOf(slot.view());
    restartMockInbox();
    assert.deepEqual(await drainLoop(mode), next);
    assert.equal(sealOf(slot.view()), before, "DUPLICATE_WORK_AFTER_RESTART");
    writeJson(join(campaignRoot, "qualification.json"), { pass: true, frozen, origin: seal, mockPaidRequests: 0,
      work: slot.queued().map(item => ({ id: item.id, outcome: item.outcome })), prior: installId(row.predecessor), accepted: installId(row.release) });
    console.log("QUALIFIED_LOOP", campaignRoot);
  } else console.log("LOOP_RESULT", JSON.stringify(result));
}

try {
  if (isLoop) {
    await maintenanceLoop();
  } else if (action === "recover") {
    assert(existsSync(slotPath), "MAINTENANCE_SLOT_MISSING");
    slot = new MaintenanceSlot(slotPath);
    const transition = slot.current().transition;
    assert(transition?.phase === "PREPARED", "ONLY_UNACTIVATED_SWITCH_CAN_BE_RECOVERED_HERE");
    const state = join(root, "first/stages/MAINTAIN/state");
    assert(slot.recover(transition.id, checkpointDigest(state), "Host recovered a switch interrupted before activation"));
    console.log("PREDECESSOR_RESTORED", slot.current().active.candidate);
  } else if (action === "continue") {
    const row = readJson(resultFile);
    assert.equal(row.mode, PAID_MODE);
    assert.deepEqual(frozen, row.frozen, "APPROVAL_RUNNER_CHANGED");
    verifyRecord(row);
    if (row.resume) {
      assert(origin && existsSync(slotPath), "ORIGINAL_MAINTENANCE_SLOT_MISSING");
      assert.equal(origin.stopProof, digest(JSON.stringify(row.resume.prior)), "APPROVED_RESUME_ORIGIN_CHANGED");
      assert.deepEqual(stoppedDraft(origin.previousRun).proof, row.resume.prior, "SEALED_PREDECESSOR_DRIFT");
    }
    if (row.rework) {
      assert(origin?.kind === "rejection" && existsSync(slotPath), "ORIGINAL_MAINTENANCE_SLOT_MISSING");
      const prior = archivedRejection(origin.previousRun);
      assert.equal(origin.slotDirectory, prior.draft.directory, "REJECTION_SLOT_ORIGIN_CHANGED");
      assert.equal(origin.prior, sealOf(prior.proof), "APPROVED_REJECTION_ORIGIN_CHANGED");
      assert.deepEqual(prior.proof, row.rework.prior, "SEALED_REJECTION_DRIFT");
    }
    const decision = readJson(resolve(prerequisite));
    assert(decision.actor === "owner" && decision.decision === "APPROVE" && typeof decision.recordedAt === "string", "OWNER_DECISION_REQUIRED");
    assert.deepEqual(decision.approval, approvalFor(row, PAID_MODE), "OWNER_DECISION_WRONG_BUILD");
    slot = new MaintenanceSlot(slotPath, { projectId, mode: PAID_MODE, initial: row.predecessor });
    writeJson(join(root, "owner-approval.json"), decision);
    await successor(row, decision.approval, PAID_MODE);
  } else {
    const qualified = ["live", "resume", "reject"].includes(action) ? readJson(join(resolve(prerequisite), "qualification.json")) : null;
    if (qualified) {
      assert(qualified.pass && qualified.mockPaidRequests === 0, "REQUIRE_ZERO_PAID_MOCK");
      assert.deepEqual(qualified.frozen, frozen, "QUALIFIED_RUNNER_CHANGED");
    }
    mkdirSync(root);
    const priorPath = isResume || isRework ? resolve(qualified ? previousRun : prerequisite) : null;
    const row = isRework ? await resumeRejected(archivedRejection(priorPath), qualified)
      : isResume ? await resumeFirst(stoppedDraft(priorPath), qualified) : await first(qualified);
    if (!row.passed) { console.log("STOPPED_WITHOUT_APPROVAL_ADMISSION", root); process.exitCode = 1; }
  }
} finally {
  if (slot) {
    try {
      if (!isLoop || consumer) writeJson(join(isLoop ? campaignRoot : root, "slot.json"), slot.view());
      if (isLoop && consumer) writeJson(join(campaignRoot, "queue.json"), slot.queued());
    } finally {
      if (consumer) slot.releaseConsumer(consumer);
      slot.close();
    }
  }
  for (const world of heap.reverse()) world.close();
}
