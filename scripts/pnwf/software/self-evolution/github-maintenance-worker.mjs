
/** Entry executed from the actual accepted installation, using the ordinary DSH session port. */
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { digest, readJson, sha } from "../../energy/contract.mjs";
import { launchDeployment, loadDeploymentProfile } from "../../../../dist/src/advanced.js";
import { admitBasis, checkpoint, conclusion, profileFor } from "../../energy/product.mjs";
import { prepare, retainCandidate, session, sessionSettlement } from "./session.mjs";
import { copyDatabases, dependencyRoot, makeVolume, offline, quote, success } from "./workspace.mjs";
import { sealOf } from "./slot.mjs";

export function materialize(world, bundle, source, { name, email } = { name: "Palimpsest Build", email: "build@example.invalid" }) {
  assert(sha(source), "GITHUB_COLD_SOURCE_SHA_REQUIRED");
  const head = success(offline(world, [
    "git init -q", "git config core.autocrlf false", "git config user.name " + quote(name), "git config user.email " + quote(email),
    "git fetch -q /source.bundle refs/palimpsest/source/" + source,
    "git sparse-checkout set src architecture host scripts test tools fixtures web maintenance",
    "git checkout -q --detach FETCH_HEAD", "test ! -e dist",
    "printf '\\n/node_modules\\n/evidence/\\n' >> .git/info/exclude",
    "ln -s " + dependencyRoot + " node_modules", "mkdir -p evidence", "chown -R 1001:1001 /work",
    "test -z \"$(git status --porcelain)\"", "git rev-parse HEAD",
  ].join("\n"), [bundle + ":/source.bundle:ro"], { root: true }));
  assert.equal(head, source, "GITHUB_COLD_SOURCE_SHA_CHANGED");
}

export function gitHubSessionFacts(row, submission, previousConclusion, requiredArtifacts) {
  const current = row.conclusion;
  const record = current?.body?.split("\n").find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
  const artifacts = record ? JSON.parse(record).check?.artifacts ?? [] : [];
  const delivery = current?.intent === "DELIVER" && current.eventId !== previousConclusion &&
    requiredArtifacts.length && requiredArtifacts.every(path => artifacts.some(artifact =>
      artifact.path === path && artifact.commit === submission?.candidate && artifact.committed === true))
    ? current.eventId : null;
  const pulse = row.trajectory?.calls?.find(call => call.tool === "palimpsest_continuity" && call.action === "pulse" && call.ok);
  return {
    transportSettled: row.reconciled === true, natural: row.execution?.natural === true,
    candidateSaved: submission?.valid === true, delivery, projectReadCall: pulse?.callId ?? null,
  };
}

export async function runAcceptedSession({ directory, state, release, runtime, bundle, scope, spec, input, window, provider, mock, author, recovery }) {
  const prepared = prepare(directory, scope.projectId);
  copyDatabases(state, prepared.state);
  const world = makeVolume(release.image);
  try {
    const head = recovery?.install.candidate ?? release.candidate;
    materialize(world, bundle, head, author);
    const reply = mock && ((_request, ordinal) => {
      if (recovery) {
        if (ordinal === 0 || ordinal === 2) return [{ type: "tool_use", id: "recovery_readiness_" + ordinal, name: "palimpsest_work",
          input: { action: "readiness" } }];
        if (ordinal === 1) return [{ type: "tool_use", id: "recovery_retire", name: "palimpsest_work",
          input: { action: "plan", tasks: [], changeClass: "metadata_only", reason: "The direct candidate completes the redundant task." } }];
        if (ordinal === 3) return [{ type: "tool_use", id: "recovery_deliver", name: "palimpsest_work",
          input: { action: "conclude", intent: "DELIVER", artifacts: spec.artifacts, statement: "The recovered candidate is ready for review." } }];
        return [{ type: "text", text: "The recovered candidate is ready." }];
      }
      if (ordinal === 0) return [{ type: "tool_use", id: "github_pulse", name: "palimpsest_continuity", input: { action: "pulse" } }];
      if (ordinal === 1) return [{ type: "tool_use", id: "github_edit", name: "bash", input: { description: "Prepare the maintenance result",
        command: "mkdir -p maintenance && printf %s " + quote(mock.text) + " > " + quote(mock.path) +
          " && git add -- " + quote(mock.path) + " && git commit -qm 'Record maintenance result'" } }];
      if (ordinal === 2) return [{ type: "tool_use", id: "github_retire", name: "palimpsest_work", input: {
        action: "plan", tasks: [], reason: "Retire the redundant task after the direct Git outcome is committed.",
      } }];
      if (ordinal === 3) return [{ type: "tool_use", id: "github_deliver", name: "palimpsest_work", input: {
        action: "conclude", intent: "DELIVER", artifacts: spec.artifacts, statement: "The maintenance result is ready for review.",
      } }];
      return [{ type: "text", text: "The maintenance result was prepared." }];
    });
    const resumed = recovery ? " 已恢复先前提交 " + recovery.candidate + " 和该项目的 CHECKPOINT，安装包含已验证的续修准备提交。" : "";
    const row = await session(prepared, { world, runtime, basis: head, brief: spec.goal + "\n\n封存材料见 evidence/。" + resumed,
      input: input.evidencePath, requestWindow: window, projectIndex: true, ...(provider ? { provider } : { reply }) });
    const allowed = new Set([...spec.paths, ...(recovery?.paths ?? [])]);
    const submission = retainCandidate(prepared, world, release.candidate, "first", { allowPath: path => allowed.has(path) });
    const facts = gitHubSessionFacts(row, submission, input.previousConclusion, spec.artifacts);
    const report = { release, work: spec.id, checkpoint: input.checkpoint, facts, submission, summary: sessionSettlement(row) };
    writeFileSync(join(directory, "submission-facts.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    return settlement(directory);
  } finally {
    world.close();
  }
}

export function settlement(directory) {
  const path = join(directory, "submission-facts.json");
  if (!existsSync(path)) return null;
  const row = readJson(path), ledger = readFileSync(join(directory, "request-ledger.sqlite"));
  const archive = sealOf({ ledger: digest(ledger), report: row, session: digest(readFileSync(join(directory, "session.json"))) });
  return { ...row.summary, archive };
}

export async function observeProject({ profilePath, world, state, project, basis, oldBasis, work, mode }) {
  profileFor({ path: profilePath, world, state, projectId: project, localPeer: "github-maintenance-principal" });
  if (oldBasis && oldBasis !== basis) {
    const prior = launchDeployment(loadDeploymentProfile(profilePath));
    let head;
    try { head = prior.installed.controller.work.project().head_commit; }
    finally { await prior.close(); }
    assert(head === oldBasis || head === basis, "GITHUB_PROJECT_ADMISSION_BASIS_CHANGED");
    if (head === oldBasis) {
      await admitBasis({ world, state, approved: basis, mode, projectId: project, operatorNamespace: "github-maintenance",
        reason: "Accept the independently verified source revision merged by the repository owner." });
    }
  }
  const deployment = launchDeployment(loadDeploymentProfile(profilePath));
  let view, intakeEntry;
  try {
    const controller = deployment.installed.controller, workspace = deployment.installed.application.projectWorkspace;
    if (!existsSync(join(state, "github-project-initialized"))) {
      await controller.start({ projectId: project, goal: "Maintain Palimpsest with independently verified evidence.", headCommit: basis, tasks: [] });
      writeFileSync(join(state, "github-project-initialized"), basis, { flag: "wx" });
    }
    if (work) {
      const taskId = work.id, evidence = work.evidence;
      const journal = (await workspace.journal()).find(row => row.entry.relatedRefs.some(ref =>
        ref.kind === "sealed_evidence" && ref.id === evidence));
      const entry = journal?.entry ?? await workspace.recordJournalEntry({
        projectId: project, kind: "OPPORTUNITY", title: work.title, body: work.goal,
        provenance: "Trusted GitHub maintenance intake",
        relatedRefs: [{ kind: "sealed_evidence", id: evidence }, { kind: "git_commit", id: basis }],
      });
      intakeEntry = entry.entryId;
      if (!controller.status().tasks.some(row => (row.taskId ?? row.task_id) === taskId)) {
        await workspace.promoteOpportunity({ projectId: project, entryId: entry.entryId,
          taskSpec: { task_id: taskId, objective: work.goal, depends_on: [], write_paths: work.paths, required_artifacts: work.artifacts } });
      }
    }
    const pulse = await workspace.pulse();
    const status = controller.status();
    assert.equal(pulse.projectId, project, "GITHUB_PROJECT_ID_CHANGED");
    assert.equal(pulse.basis.headCommit, basis, "GITHUB_PROJECT_BASIS_CHANGED");
    view = { project, basis, revision: pulse.basis.projectRevision,
      tasks: status.tasks.map(task => task.taskId ?? task.task_id), ...(intakeEntry ? { intakeEntry } : {}),
      journal: (await workspace.journal()).map(row => row.entry.entryId),
      previousConclusion: conclusion(state)?.eventId ?? null };
  } finally {
    await deployment.close();
  }
  checkpoint(state);
  return view;
}
