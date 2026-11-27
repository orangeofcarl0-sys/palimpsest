/** Recover a draft in a fresh world while keeping the verified installation and Git basis fixed. */
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { launchDeployment, loadDeploymentProfile } from "../../../../dist/src/advanced.js";
import { digest } from "../../energy/contract.mjs";
import { checkpoint, conclusion, profileFor } from "../../energy/product.mjs";
import { sealOf } from "./slot.mjs";
import { copyDatabases, makeVolume, manifest, offline, quote, success } from "./workspace.mjs";

export async function projectFailure({ project, basis, state, world, profilePath, failure, receipt, replace, followups = [] }) {
  profileFor({ path: profilePath, world, state, projectId: project, localPeer: "github-maintenance-principal" });
  const deployment = launchDeployment(loadDeploymentProfile(profilePath));
  try {
    const controller = deployment.installed.controller;
    const workspace = deployment.installed.application.projectWorkspace;
    const current = controller.work.project();
    assert.equal(current.head_commit, basis, "GITHUB_FAILURE_PROJECT_BASIS_CHANGED");
    const journal = await workspace.journal();
    const record = async (id, kind, title, body) => {
      const saved = journal.find(({ entry }) => entry.relatedRefs.some(ref => ref.kind === "sealed_evidence" && ref.id === id));
      if (saved) return saved.entry;
      return workspace.recordJournalEntry({ projectId: project, kind, title, body, provenance: "Independent maintenance investigation",
        relatedRefs: [{ kind: "sealed_evidence", id }, { kind: "git_commit", id: basis }] });
    };
    const codes = receipt.facts.findings.filter(item => item.blocking).map(item => item.code);
    const negative = await record(failure.id, "NEGATIVE_RESULT", "Maintenance acceptance " + failure.input.verdict.state + " for #" + failure.input.issue,
      "Original gate " + failure.input.verdict.reason + ". Independently observed: " + codes.join(", ") + ". Investigation " + receipt.seal + ".");
    for (const item of followups) {
      await record(item.id ?? sealOf({ case: failure.id, title: item.title }), "OPPORTUNITY", item.title, item.detail);
    }
    if (replace && current.tasks.some(task => task.task_id === replace)) {
      const task = controller.status().tasks.find(row => (row.taskId ?? row.task_id) === replace);
      assert(task?.state === "READY" && controller.work.openAttempts().length === 0,
        "GITHUB_FOLLOWUP_OLD_TASK_NOT_QUIESCENT");
      controller.plan({ tasks: current.tasks.filter(task => task.task_id !== replace),
        reason: "Replace the rejected maintenance task in a new isolated recovery checkpoint." });
    }
    const pulse = await workspace.pulse();
    assert(pulse.negativeFindings.some(item => item.id === "journal:" + negative.entryId),
      "GITHUB_FAILURE_PULSE_READBACK_MISSING");
  } finally { await deployment.close(); }
  checkpoint(state);
}

export async function prepareFailureDraft({ root, state, original, accepted, evidence, investigation, caseId, basis,
  patch, selected, project, world, followups }) {
  const sourceState = join(original, "stages", "MAINTAIN", "state");
  assert.equal(sealOf(manifest(sourceState)), evidence.checkpoint, "GITHUB_FOLLOWUP_CHECKPOINT_CHANGED");
  const patchPath = join(root, "draft.patch"), sha256 = digest(patch);
  assert(patch.length && selected.length, "GITHUB_FOLLOWUP_DRAFT_EMPTY");
  mkdirSync(root, { recursive: true });
  if (!existsSync(patchPath)) writeFileSync(patchPath, patch, { flag: "wx", flush: true });
  assert.equal(digest(readFileSync(patchPath)), sha256, "GITHUB_FOLLOWUP_PATCH_CHANGED");
  const marker = "github-project-initialized";
  if (!existsSync(join(state, marker))) {
    copyDatabases(sourceState, state);
    copyFileSync(join(accepted, marker), join(state, marker));
  }
  assert.equal(conclusion(state)?.eventId, investigation.facts.delivery.previous, "GITHUB_FOLLOWUP_CONCLUSION_CHANGED");
  await projectFailure({ project, basis, state, world, profilePath: join(root, "draft-profile.json"),
    failure: { id: caseId, input: evidence }, receipt: investigation, replace: evidence.work, followups });
  return { basis, sha256, paths: selected };
}

export async function runFailureDraft(args, code, patch) {
  const { directory, state, release, runtime, bundle, scope, spec, input, window, provider, mock, author } = args;
  const basis = release.candidate;
  assert.equal(input.draft.basis, basis, "GITHUB_FOLLOWUP_EXECUTION_BASIS_CHANGED");
  assert.equal(digest(readFileSync(patch)), input.draft.sha256, "GITHUB_FOLLOWUP_PATCH_CHANGED");
  const from = pathToFileURL(join(runtime, "scripts/pnwf/software/self-evolution/session.mjs")).href;
  const { prepare, session, retainCandidate, sessionSettlement } = await import(from);
  const prepared = prepare(directory, scope.projectId);
  copyDatabases(state, prepared.state);
  const world = makeVolume(release.image);
  try {
    code.materialize(world, bundle, basis, author);
    const paths = success(offline(world, "git apply --index --check /draft.patch\ngit apply --index /draft.patch\n" +
      "test \"$(git rev-parse HEAD)\" = " + basis + "\ngit diff --cached --no-renames --name-only -z",
    [patch + ":/draft.patch:ro"])).split("\0").filter(Boolean);
    assert.deepEqual(paths, input.draft.paths, "GITHUB_FOLLOWUP_DRAFT_PATHS_CHANGED");
    const reply = mock && ((_request, ordinal) => {
      const action = (name, input) => [{ type: "tool_use", id: "failure_recovery_" + ordinal, name, input }];
      const work = input => action("palimpsest_work", input);
      switch (ordinal) {
        case 0: return action("palimpsest_continuity", { action: "pulse" });
        case 1: {
          const edit = mock.returnText === undefined ? "" : "printf %s " + quote(mock.returnText) + " > " + quote(mock.path) +
            " && git add -- " + quote(mock.path) + " && ";
          return action("bash", { description: "Confirm and submit the restored draft",
            command: "test \"$(git rev-parse HEAD)\" = " + basis + " && " + edit +
              "git diff --cached --name-only && git commit -qm 'Submit restored maintenance draft'" });
        }
        case 2:
        case 4: return work({ action: "readiness" });
        case 3: return work({ action: "plan", tasks: [], changeClass: "metadata_only", reason: "Retire the task covered by the direct draft." });
        case 5: return work({ action: "conclude", intent: "DELIVER", artifacts: spec.artifacts, statement: "The restored draft is ready for independent review." });
        default: return [{ type: "text", text: "Submitted the restored draft." }];
      }
    });
    const row = await session(prepared, { world, runtime, basis, brief: spec.goal + "\n\n封存材料见 evidence/。",
      input: input.evidencePath, requestWindow: window, projectIndex: true, ...(provider ? { provider } : { reply }) });
    const submission = retainCandidate(prepared, world, basis, "first", { allowPath: path => spec.paths.includes(path) });
    const facts = code.gitHubSessionFacts(row, submission, input.previousConclusion, spec.artifacts);
    const report = { release, work: spec.id, checkpoint: input.checkpoint, facts, submission, summary: sessionSettlement(row) };
    writeFileSync(join(directory, "submission-facts.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx", flush: true });
    return code.settlement(directory);
  } finally { world.close(); }
}
