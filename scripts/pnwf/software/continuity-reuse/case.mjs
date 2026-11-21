import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { launchDeployment, loadDeploymentProfile } from "../../../../dist/src/advanced.js";
import { makeProcedureService, SqliteProcedureStore } from "../../../../dist/src/procedures/index.js";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { digest, git, readJson, writeJson } from "../../energy/contract.mjs";

export const here = fileURLToPath(new URL(".", import.meta.url));
export const repo = fileURLToPath(new URL("../../../../", import.meta.url));
export const hostSha = "3883ae732e31502c98ad904d80a1b1f2d2827a5b";
export const archive = join(repo, "research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live");
export const accepted = readJson(join(archive, "acceptance.json"));
export const episodeId = "episode-e7050e9ddf64ccebde7f08f6";
export const file = "MAINTENANCE-REVIEW.md";
export const correction = "updates/2026-11-10/fleet-default-limit.md";
export const brief = "接手这份 gRPC 迁移的冷交接维护评审。上一班留下了 HOLD，交付团队现在需要知道接续是否可用。请根据当前证据将 Readback decision 标为 READY 或 HOLD，说明旧记录与当前接受版本的关系和核验记录的状态。保留评审末尾的 Retained evidence 区块。把决定和可追溯的依据写入并提交 MAINTENANCE-REVIEW.md，只改这份评审。评审供维护交接，不是发布授权。";
export const hint = "For a resumed handover, compare the previous decision at its recorded basis with the owner's accepted revision. Where a historical blocker may be stale, verify it against current evidence bound to the accepted SHA. Preserve the old outcome and still-valid artifacts when revising the active decision.";
const priorCallId = "call_ccfc97275a064338a47c1acb";
const capture = command => execFileSync(process.execPath, command, { encoding: "utf8", timeout: 120_000 });

export function historical() {
  const old = readJson(join(archive, "observations.json")).RESUME;
  const call = old.traces.find(trace => trace.role === "principal").calls.find(row => row.callId === priorCallId);
  const manifest = readJson(join(archive, "manifest.json"));
  const path = Object.keys(manifest).find(key => key.includes(`/${old.sessionId}/`) && key.endsWith(".zstd"));
  const events = readStream(join(archive, path), manifest[path]);
  const invoked = events.find(row => row.seq === call.callSeq);
  const returned = events.find(row => row.seq === call.resultSeq);
  assert.equal(returned.data.message.toolCallId, priorCallId);
  const args = JSON.parse(invoked.data.arguments);
  const response = JSON.parse(returned.data.message.content.map(block => block.text).join("\n"));
  assert(args.subject.includes(episodeId));
  assert.equal(response.found, false);
  assert.equal(response.standing, "UNKNOWN");
  return { sessionId: old.sessionId, callId: priorCallId, callSeq: call.callSeq, resultSeq: call.resultSeq,
    subject: args.subject, found: false, standing: "UNKNOWN", streamSha256: manifest[path], accepted: accepted.acceptedHead };
}

export function restore(directory) {
  capture([join(here, "../autonomy-archive.mjs"), `--verify=${archive}`, `--restore=${directory}`]);
  return { profile: join(directory, "profile.json"), world: join(directory, "world"), state: join(directory, "state") };
}

export function workEvents(state) {
  const db = new DatabaseSync(join(state, "palimpsest.sqlite"), { readOnly: true });
  try { return db.prepare("SELECT * FROM events ORDER BY event_id").all(); }
  finally { db.close(); }
}

export function journalEvents(state) {
  const db = new DatabaseSync(join(state, "journal.sqlite"), { readOnly: true });
  try { return db.prepare("SELECT * FROM project_journal_events ORDER BY seq").all(); }
  finally { db.close(); }
}

function atCommitArtifact(world, artifact) {
  const content = execFileSync("git", ["-C", world, "cat-file", "blob", `${artifact.commit}:${artifact.path}`], { timeout: 20_000 });
  return { path: artifact.path, commit: artifact.commit, sha256: digest(content), matches: digest(content) === artifact.digest };
}

export async function replay(location, prior) {
  assert.equal(git(location.world, "rev-parse", "HEAD"), accepted.acceptedHead);
  const installed = launchDeployment(loadDeploymentProfile(location.profile));
  const workspace = installed.installed.application.projectWorkspace;
  const receipt = { reviewer: "cold-handover-maintenance-verifier", runtime: hostSha, sha: accepted.acceptedHead,
    prior, kind: "same-sha cold readback" };
  try {
    const pulse = await workspace.pulse();
    const [plain, typed, note, absent] = await Promise.all([workspace.explain(episodeId), workspace.explain(`episode:${episodeId}`),
      workspace.explain(`journal:${accepted.note.id}`), workspace.explain("episode:episode-unregistered-readback")]);
    receipt.readback = { episodeId, found: plain.found && typed.found, state: typed.episode?.state,
      formerHead: typed.episode?.conclusion.basis.headCommit, currentHead: pulse.basis.headCommit,
      acceptance: typed.headAcceptance, verificationNote: note.item?.id, openQuestions: pulse.openQuestions.length,
      unknownControl: !absent.found && absent.standing === "UNKNOWN" };
    receipt.artifacts = typed.episode.conclusion.check.artifacts.map(artifact => atCommitArtifact(location.world, artifact));
    const r = receipt.readback;
    assert(r.found && r.state === "REOPENED" && r.formerHead === accepted.basis && r.currentHead === accepted.acceptedHead);
    assert(r.acceptance?.kind === accepted.source && r.acceptance?.eventId === accepted.acceptance.eventId && r.acceptance?.commit === accepted.acceptedHead);
    assert(r.verificationNote?.includes(accepted.note.id) && r.openQuestions === 0 && r.unknownControl);
    assert(receipt.artifacts.length === 4 && receipt.artifacts.every(artifact => artifact.matches));
  } finally { await installed.close(); }
  assert.deepEqual(workEvents(location.state), workEvents(join(archive, "owners")));
  assert.deepEqual(journalEvents(location.state), journalEvents(join(archive, "owners")));
  const tests = execFileSync(process.execPath, ["--test", "--test-reporter=tap"], { cwd: location.world, encoding: "utf8", timeout: 120_000 });
  assert.match(tests, /^# pass 18$/mu);
  assert.match(tests, /^# fail 0$/mu);
  return { receipt: { ...receipt, publicTests: 18, workPreserved: true, journalPreserved: true }, tests };
}

export async function admit(root, prior, receipt) {
  const sources = new Map([["archived-readback", prior], ["current-cold-replay", receipt]]);
  const store = new SqliteProcedureStore(join(root, "procedure.sqlite"));
  const policyRef = { policyId: "continuity-reuse-scoped-pilot", version: "1" };
  let exact;
  const ground = { async observe(kind, ref) {
    if (kind !== "RUN_RESULT" || !sources.has(ref)) return undefined;
    return { kind, ref, digest: digest(JSON.stringify(sources.get(ref))), subject: ref };
  } };
  const admission = { policyRef, async decide(input) {
    const approved = exact === input.candidateDigest && input.validation.groundsResolved && input.empiricalGrounds.length === 2 &&
      prior.standing === "UNKNOWN" && receipt.readback.found && receipt.workPreserved && receipt.journalPreserved;
    return { decision: approved ? "PUBLISH" : "REJECT", policyRef, candidateDigest: input.candidateDigest,
      rationale: approved ? "Scoped cold handover method grounded in the original refusal and a verified same-SHA replay." : "No exact verified approval." };
  } };
  const authoring = { origin: "archive-maintainer", async propose() { return { outcome: "proposal", content: {
    schemaVersion: 1, title: "Revalidate an inherited handover decision", purpose: "Separate the historical finding from current admissibility",
    applicability: ["A resumed handover with a recorded owner-accepted version and an inherited blocker"],
    preconditions: ["Archived outcome and accepted SHA can be checked"], steps: [{ instruction: hint }],
    checks: ["Old finding retained", "Current sources are pinned to the accepted revision"], expectedOutputs: ["A maintenance review"],
    limitations: ["No operator release authority", "Unknown or unreadable source remains unresolved"], capabilityHints: [], recommendedRecipeRefs: [],
  } }; } };
  try {
    const service = makeProcedureService({ store, ports: { grounds: ground }, authoring, admission, clock: () => "2026-11-22T00:00:00.000Z" });
    const prepared = await service.prepare({ grounds: [...sources.keys()].map(ref => ({ kind: "RUN_RESULT", ref })),
      projectContext: { projectId: "cold-handover-method", projectRevision: 1, projectDigest: digest(JSON.stringify(prior)), objective: brief } });
    assert.equal((await service.publish(prepared)).status, "rejected");
    exact = prepared.candidate.digest;
    const published = await service.publish(prepared);
    assert.equal(published.status, "published");
    const current = (await service.history(published.ref.procedureId)).current;
    assert.equal(current.standing, "ACTIVE");
    return { ref: published.ref, revision: published.revision, candidate: prepared.candidate, unapprovedRejected: true };
  } finally { store.close(); }
}

export function noteSeed(world, prior) {
  const retained = `## Retained evidence\n\n- Archived cold-session lookup: ${episodeId}, ${prior.standing}, call ${prior.callId}.\n` +
    `- Owner-accepted tree: ${accepted.acceptedHead}, Work DIRECT_BASIS event ${accepted.acceptance.eventId}.\n` +
    `- Original release verification reference: ${accepted.note.id}.\n- Fleet source: ${correction}.\n` +
    "- Retained verification: zero or omitted limit returns the first three available readings. Positive limits, unary, wire compatibility and REST remain in scope for preservation.\n";
  const text = "# Cold handover maintenance review\n\nReadback decision: HOLD\n\n" +
    "The previous cold handover returned UNKNOWN for the old Episode and surfaced the release verification entry as a question. Revalidate the release handover on the accepted revision before relying on it.\n\n" + retained;
  git(world, "config", "user.name", "Maintenance review pilot");
  git(world, "config", "user.email", "maintenance-review@example.invalid");
  git(world, "config", "core.autocrlf", "false");
  git(world, "config", "core.eol", "lf");
  // Seed the frozen text fixture from Git objects so Windows checkout conversion cannot leak into Linux.
  for (const path of git(world, "ls-files", "-z").split("\0").filter(Boolean)) {
    const bytes = execFileSync("git", ["-C", world, "cat-file", "blob", `HEAD:${path}`], { timeout: 20_000 });
    writeFileSync(join(world, path), bytes);
  }
  git(world, "add", "--update");
  assert.equal(git(world, "status", "--porcelain"), "");
  writeFileSync(join(world, file), text);
  git(world, "switch", "-c", "maintenance-review");
  git(world, "add", "--", file);
  execFileSync("git", ["-C", world, "commit", "-m", "Carry forward the cold-handover investigation"], {
    env: { ...process.env, GIT_AUTHOR_DATE: "2026-11-22T00:00:00+08:00", GIT_COMMITTER_DATE: "2026-11-22T00:00:00+08:00" },
    stdio: ["ignore", "pipe", "pipe"], timeout: 20_000,
  });
  return { head: git(world, "rev-parse", "HEAD"), retained, text };
}

export function score({ text, retained }) {
  const anchor = text.indexOf("## Retained evidence\n");
  const active = anchor < 0 ? text : text.slice(0, anchor);
  const checks = {
    revisedDecision: /^Readback decision:\s*READY\s*$/mu.test(active) && !/^Readback decision:\s*HOLD\s*$/mu.test(active),
    preciseAcceptedBasis: active.includes(accepted.acceptedHead) && /DIRECT_BASIS/u.test(active) && /(?:event|事件)[^\r\n\d]{0,25}8\b/iu.test(active),
    oldEpisodeTraceable: active.includes(episodeId) && /REOPENED/u.test(active),
    oldUnknownPreserved: /UNKNOWN/u.test(active) && anchor >= 0 && text.slice(anchor) === retained,
    verificationTraceable: active.includes(accepted.note.id) && active.includes(correction),
    issueResolved: /open[_\s]*questions?[^\r\n\d]{0,12}(?:0|\[\s*\])|0\s+(?:open|unresolved) questions?|no (?:open|unresolved) questions?|未决(?:问题|事项)[^\r\n\d]{0,10}0|无未决(?:问题|事项)|待办[^\r\n\d]{0,10}0|(?:核验|验证).{0,20}(?:不是|不属于|未列为|未被列为).{0,14}(?:待办|未决)/iu.test(active),
    releaseScope: /(?:release|发布).{0,45}(?:authori[sz]|approv|授权|批准)|(?:only|仅).{0,35}(?:handover|交接)/iu.test(active),
  };
  return { checks, passed: Object.values(checks).filter(Boolean).length, expected: Object.keys(checks).length };
}
