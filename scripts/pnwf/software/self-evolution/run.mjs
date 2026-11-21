/** Qualify, run, or continue the maintenance pilot under the host-owned installation slot. */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { docker } from "../../container_runtime.mjs";
import { PAID_MODE } from "../../bounded_provider.mjs";
import { readOpenCodeGoKey, requireOpenCodeGoProbe } from "../../opencode_go.mjs";
import { digest, git, readJson, writeJson } from "../../energy/contract.mjs";
import { admitBasis, checkpoint } from "../../energy/product.mjs";
import { answer, closeoutChecks, regression, scoreReview, tool } from "./judge.mjs";
import { prepare, retainCandidate, session, window } from "./session.mjs";
import { MaintenanceSlot, sealOf } from "./slot.mjs";
import { buildCommand, copyDatabases, firstGoal, inspectedSource, makeEvidence, makeSource, makeVolume, manifest, offline, pack,
  projectId, quote, referencePatch, repo, secondGoal, seedSource, source, stateProbe, success, verifyInstallation } from "./workspace.mjs";

const [action, directory, prerequisite] = process.argv.slice(2);
assert(directory && (["qualify", "recover"].includes(action) || (["live", "continue"].includes(action) && prerequisite)),
  "Usage: self-evolution/run.mjs qualify <new-dir> | live <new-dir> <qualified-dir> | continue <live-dir> <owner-approval.json> | recover <live-dir>");
assert(inspectedSource());
const root = resolve(directory);
const image = docker(["image", "inspect", "palimpsest-cold-handover:local", "--format", "{{.Id}}"]);
const here = fileURLToPath(new URL(".", import.meta.url));
const code = ["run.mjs", "workspace.mjs", "session.mjs", "slot.mjs", "judge.mjs", "../../container_adapter.mjs",
  "../../container_runtime.mjs", "../../world_preflight.mjs", "../../mock_provider.mjs", "../../bounded_provider.mjs",
  "../../execution_budget.mjs", "../../opencode_go.mjs", "../../energy/product.mjs", "../../energy/evidence.mjs", "../../analyze_energy_trajectory.mjs"];
const frozen = { source, projectId, image, window, firstGoalSha256: digest(firstGoal), secondGoalSha256: digest(secondGoal),
  code: Object.fromEntries(code.map(file => [file, digest(readFileSync(join(here, file)))])) };
const installId = ({ candidate, buildSha256, image }) => ({ candidate, buildSha256, image });
const resultFile = join(root, "candidate.json");
const slotPath = join(root, "slot.sqlite");
const sourceBundle = join(root, "source.bundle");
const heap = [];
const volume = () => { const world = makeVolume(image); heap.push(world); return world; };
let slot;

function providerConfig() {
  const profile = requireOpenCodeGoProbe(readJson(join(repo, "research-evidence/pnwf-work-revision/2026-11-18/opencode-go-tooled-t3-055602/opencode-probe.json")));
  readOpenCodeGoKey(profile);
  return profile;
}

const checkpointDigest = state => sealOf(manifest(state).filter(([file]) => file.endsWith(".sqlite")));

function putEvidence(world, runtime, prepared, signal, basis, start) {
  const info = stateProbe(world, runtime, prepared.state, prepared.deployment, {
    ...(start ? { start: basis, goal: "Maintain Palimpsest from observable project results and keep its decisions and tests available for the next session." } : {}),
    entry: { kind: "REFERENCE_NOTE", title: "Sealed maintenance input", body: `The newly sealed material is available under evidence/. Digest ${signal.reconciliationDigest}.`,
      provenance: "Maintenance evidence intake", relatedRefs: [{ kind: "sealed_run", id: signal.signalId }, { kind: "git_commit", id: basis }] },
  });
  assert.equal(info.project, projectId);
  assert(info.journal.some(entry => entry.refs?.some(ref => ref.id === signal.signalId)), "WAKE_EVIDENCE_NOT_IN_PROJECT");
  return info;
}

function firstMock() {
  const file = join(root, "mock-source.patch");
  referencePatch(file);
  const patch = readFileSync(file).toString("base64");
  const note = "# Maintenance investigation\n\nScripted qualification exercises the retained source and a candidate commit.\n";
  return (request, ordinal) => {
    if (ordinal === 0) return tool(ordinal, "palimpsest_continuity", { action: "pulse" });
    if (ordinal === 1) {
      assert(JSON.stringify(request.messages).includes("Sealed maintenance input"), "MOCK_WAKE_ENTRY_NOT_OBSERVED");
      return tool(ordinal, "bash", { description: "Exercise isolated candidate creation", command:
        `test -r evidence/case-1/session.jsonl && ! touch evidence/.integrity-probe && test ! -e docs/engineering/CONTINUITY-REUSE-METHOD.md && ! git cat-file -e e47b7c10 2>/dev/null &&\n` +
        `printf %s ${quote(patch)} | base64 -d | git apply && mkdir -p maintenance && printf %s ${quote(note)} > maintenance/review.md && git add -A && git commit -qm 'Submit the scripted maintenance candidate' && echo SUBMITTED` });
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
  const provider = mode === PAID_MODE ? providerConfig() : undefined;
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
    activation = { old, readByNew, accepted, basisAdmission, checkpoint: before,
      active: slot.activate({ switchId, observedRelease: row.release, checkpoint: before, readback: true }) };
    writeJson(join(root, "activation.json"), activation);
  } catch (error) {
    const transition = slot.current().transition;
    if (transition?.phase === "PREPARED" && transition.id === switchId) slot.recover(switchId, checkpointDigest(firstState), error.message);
    throw error;
  }
  const { signal } = slot.publish("next-maintenance", seal.sha256);
  let execution;
  await slot.dispatch(signal, row.release, async () => {
    writeJson(join(prepared.run, "intake.json"), putEvidence(world, runtime, prepared, signal, head, false));
    execution = await session(prepared, { world, runtime, basis: head, brief: secondGoal,
      input: nextInput, provider, reply: provider ? undefined : nextMock(row.signalId) });
    return { reconciled: execution.reconciled, natural: execution.execution.natural, requests: execution.accounting.requests };
  });
  assert(execution, "SUCCESSOR_SESSION_NOT_DISPATCHED");
  const submission = retainCandidate(prepared, world, head, "next");
  const priorRead = execution.trajectory?.calls.some(call => call.wakeRefs?.includes(row.signalId)) ?? false;
  let quality = null;
  if (provider && submission.valid) {
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
  writeJson(resultFile, row);
  if (!execution.reconciled || !execution.execution.natural || !submission.valid || execution.mockErrors.length) return row;

  try {
    const candidateWorld = volume();
    const imported = seedSource(candidateWorld, root, info, join(root, "first/candidate.bundle"));
    assert.deepEqual(imported, { basis, head: submission.candidate });
    const release = pack(candidateWorld, submission.candidate, join(root, "accepted-build"));
    const runtime = verifyInstallation(join(root, "accepted-build"), release);
    const probes = await closeoutChecks(join(root, "candidate-probes"), { runtime, image, candidate: true });
    const tests = regression(candidateWorld, join(root, "candidate-regression.log"));
    const oldState = join(root, "readback-old"), newState = join(root, "readback-new");
    copyDatabases(prepared.state, oldState);
    copyDatabases(prepared.state, newState);
    const old = stateProbe(candidateWorld, priorRuntime, oldState, prepared.deployment, {});
    const readByNew = stateProbe(candidateWorld, runtime, newState, prepared.deployment, {});
    const readback = JSON.stringify(old) === JSON.stringify(readByNew) && old.project === projectId && old.basis === basis && old.head === submission.candidate;
    const testsObserved = execution.trajectory?.calls.filter(call => call.testCommand && call.result !== null) ?? [];
    const sourceChanged = submission.changed.some(file => /^(?:src|host\/dsh)\//u.test(file));
    const authoredTest = submission.changed.some(file => /(?:^tests?\/|test|probe|repro|regress)/iu.test(file) && !file.endsWith(".md"));
    const maintainerEvidence = { sourceChanged, authoredTest, testsObserved: testsObserved.map(({ call, result, request }) => ({ call, result, request })),
      report: submission.changed.some(path => path.endsWith(".md")),
      automatedTestObservation: Boolean(execution.trajectory?.calls.some(call => call.testCommand && call.result !== null &&
        /\b(?:pass(?:ed)?|fail(?:ed)?|tests?|assertion|not ok|ok \d)\b/iu.test(call.output))) };
    const independent = probes.pass && tests.exit === 0 && tests.passed > 0 && readback;
    const pass = independent && sourceChanged && authoredTest && maintainerEvidence.report && (!qualified || maintainerEvidence.automatedTestObservation);
    const verification = { pass, exactSha: submission.candidate, buildSha256: release.buildSha256, tests, probes,
      readback, old, readByNew, maintainerEvidence };
    Object.assign(row, { release, verification, qualification: digest(JSON.stringify(verification)),
      stateCheckpoint: checkpointDigest(prepared.state), passed: pass });
    writeJson(resultFile, row);
    if (!pass) return row;
    if (qualified) {
      const request = { approval: approvalFor(row, mode) };
      writeJson(join(root, "approval-request.json"), request);
      console.log("AWAIT_OWNER", JSON.stringify({ candidate: release.candidate, buildSha256: release.buildSha256, qualification: row.qualification }));
    } else {
      assert(concurrentWriterDenied);
      const next = await successor(row, approvalFor(row, mode), mode);
      const pass = next.reconciliation && next.natural && next.submission.valid && next.paidRequests === 0 && next.successorCheck.length >= 8;
      writeJson(join(root, "qualification.json"), { pass, frozen, initial: installId(predecessor), inputs: { source: info, evidence, nextEvidence },
        control, first: installId(release), next: installId(next.loadedRelease), concurrentWriterDenied, mockPaidRequests: 0,
        firstWakeId: wake.signal.signalId, nextWakeId: next.signalId });
      assert(pass, "MOCK_SUCCESSION_FAILED");
      console.log("QUALIFIED", root);
    }
  } catch (error) {
    writeJson(join(root, "verification-error.json"), { error: error.message });
    throw error;
  }
  return row;
}

try {
  if (action === "recover") {
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
    const decision = readJson(resolve(prerequisite));
    assert(decision.actor === "owner" && decision.decision === "APPROVE" && typeof decision.recordedAt === "string", "OWNER_DECISION_REQUIRED");
    assert.deepEqual(decision.approval, approvalFor(row, PAID_MODE), "OWNER_DECISION_WRONG_BUILD");
    slot = new MaintenanceSlot(slotPath, { projectId, mode: PAID_MODE, initial: row.predecessor });
    writeJson(join(root, "owner-approval.json"), decision);
    await successor(row, decision.approval, PAID_MODE);
  } else {
    const qualified = action === "live" ? readJson(join(resolve(prerequisite), "qualification.json")) : null;
    if (qualified) {
      assert(qualified.pass && qualified.mockPaidRequests === 0, "REQUIRE_ZERO_PAID_MOCK");
      assert.deepEqual(qualified.frozen, frozen, "QUALIFIED_RUNNER_CHANGED");
    }
    mkdirSync(root);
    const row = await first(qualified);
    if (!row.passed) { console.log("STOPPED_WITHOUT_APPROVAL_ADMISSION", root); process.exitCode = 1; }
  }
} finally {
  if (slot) { writeJson(join(root, "slot.json"), slot.view()); slot.close(); }
  for (const world of heap.reverse()) world.close();
}
