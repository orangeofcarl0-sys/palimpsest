/** Independent host probes. This module and all expected results stay outside the model container. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { digest, readJson, sha, writeJson } from "../../energy/contract.mjs";
import { prepare, session } from "./session.mjs";
import { copyDatabases, makeVolume, offline, original, quote, replayBasis, stateProbe, success } from "./workspace.mjs";

export const reviewFile = "MAINTENANCE-REVIEW.md";
const judgeGoal = "留存本次 gRPC 冷交接评审的工作成果。";
const resultText = request => {
  const result = request.messages.flatMap(message => Array.isArray(message.content) ? message.content : [])
    .findLast(block => block.type === "tool_result")?.content;
  return typeof result === "string" ? result : (result ?? []).map(block => block.text ?? "").join("\n");
};
export const tool = (ordinal, name, input) => [{ type: "tool_use", id: `maintenance_${ordinal}`, name, input }];
export const answer = text => [{ type: "text", text }];
const closeoutCue = text => /\bDELIVER\b/u.test(text) && /conclud|conclusion|record|结论|交付/iu.test(text);

function replayReply(condition, head) {
  let tried = false;
  return (request, ordinal) => {
    if (ordinal === 0) return tool(ordinal, "palimpsest_continuity", { action: "pulse" });
    if (ordinal === 1) return tool(ordinal, "bash", { description: "Reproduce original committed state", command:
      `git merge --quiet --ff-only replay && test "$(git rev-parse HEAD)" = ${head}` +
      (condition === "dirty" ? ` && printf '\nUnfinished local changes\n' >> ${reviewFile}` : "") + " && echo ORIGINAL_COMMIT_PRESENT" });
    const conclude = () => {
      tried = true;
      return tool(ordinal, "palimpsest_work", { action: "conclude", intent: "DELIVER", artifacts: [reviewFile],
        statement: "The committed cold-handover review is the result for this session." });
    };
    if (ordinal === 2) {
      const result = resultText(request);
      assert.match(result, /ORIGINAL_COMMIT_PRESENT/u);
      const initialUsers = request.messages.filter(message => message.role === "user").flatMap(message =>
        typeof message.content === "string" ? [message.content] : message.content.filter(block => block.type === "text").map(block => block.text));
      if (condition === "already-recorded" || (condition === "clean" && closeoutCue(JSON.stringify(initialUsers))) || closeoutCue(result)) return conclude();
      return answer("The review was committed.");
    }
    if (tried) return answer("The recorded work is ready for review.");
    const latest = request.messages.findLast(message => message.role === "user");
    if (closeoutCue(JSON.stringify(latest))) return conclude();
    return answer("The review was committed.");
  };
}

async function replay(root, { runtime, image, arm, condition }) {
  const input = join(original, "live", arm);
  const archive = readJson(join(input, "result.json"));
  assert(!archive.delivery && archive.basis === replayBasis && sha(archive.candidate));
  const world = makeVolume(image);
  try {
    success(offline(world, [
      "git init -q -b handover", "git fetch -q /basis.bundle HEAD", "git reset -q --hard FETCH_HEAD",
      "git fetch -q /candidate.bundle HEAD:refs/heads/replay", "chown -R 1001:1001 /work",
    ].join("\n"), [`${join(original, "inherited.bundle")}:/basis.bundle:ro`, `${join(input, "candidate.bundle")}:/candidate.bundle:ro`], { root: true }));
    const prepared = prepare(root, "grpc-migration-continuation");
    copyDatabases(join(input, "owners"), prepared.state);
    if (condition === "blocked") stateProbe(world, runtime, prepared.state, prepared.deployment, { entry: {
      kind: "OPEN_QUESTION", title: "Verification is still pending", body: "The new work requires a separately observed result.",
      provenance: "Independent negative control", relatedRefs: [{ kind: "git_commit", id: archive.candidate }],
    } });
    const row = await session(prepared, { world, runtime, basis: replayBasis, brief: judgeGoal, reply: replayReply(condition, archive.candidate) });
    const recorded = row.trajectory?.calls.filter(call => call.intent === "DELIVER" && call.recorded) ?? [];
    const check = row.conclusion?.body.split("\n").find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
    const expectedBlob = digest(readFileSync(join(input, "review-committed.md")));
    const exact = row.conclusion?.intent === "DELIVER" && check && JSON.parse(check).check.artifacts.some(artifact =>
      artifact.path === reviewFile && artifact.commit === archive.candidate && artifact.committed && artifact.digest === expectedBlob);
    const log = readFileSync(join(prepared.out, "run.log"), "utf8");
    const finish = { arm, condition, sourceGrade: archive.grade.passed, head: archive.candidate, natural: row.execution.natural,
      reconciled: row.reconciled, delivered: Boolean(exact), recorded, offers: (log.match(/^PALIMPSEST_CLOSEOUT_OFFER /gmu) ?? []).length,
      mockErrors: row.mockErrors, paidRequests: row.execution.paidRequestsAdmitted, requests: row.accounting.requests };
    writeJson(join(root, "observation.json"), finish);
    assert(finish.natural && finish.reconciled && finish.mockErrors.length === 0 && finish.paidRequests === 0, "CLOSEOUT_PROBE_INFRASTRUCTURE_FAILED");
    return finish;
  } finally { world.close(); }
}

export async function closeoutChecks(root, { runtime, image, candidate }) {
  mkdirSync(root);
  const cases = [["WITHOUT", "clean"], ["WITH", "clean"], ...(candidate ? [
    ["WITHOUT", "dirty"], ["WITHOUT", "blocked"], ["WITHOUT", "already-recorded"],
  ] : [])];
  const rows = [], errors = [];
  // The adapter performs synchronous Docker setup on this process. Leave the Mock HTTP server
  // free to answer while a probe is running.
  for (const [arm, condition] of cases) {
    try { rows.push(await replay(join(root, `${arm}-${condition}`), { runtime, image, arm, condition })); }
    catch (error) { errors.push({ case: [arm, condition], detail: error.message }); }
  }
  const pass = errors.length === 0 && rows.every(row => {
    if (row.condition === "clean") return row.delivered === candidate && row.recorded.length === Number(candidate);
    if (row.condition === "already-recorded") return row.delivered && row.recorded.length === 1 && row.requests === 4 && row.offers === 0;
    return !row.delivered && row.recorded.length === 0 && row.requests === 3 && row.offers === 0;
  });
  writeJson(join(root, "checks.json"), { pass, rows, errors });
  return { pass, rows, errors };
}

export function regression(world, output) {
  const suites = ["test/alhs_episode_convergence.test.ts", "test/pnwf_cq_direct_governed.test.ts", "test/pnwf_cq_basis_admission.test.ts"];
  const result = offline(world, `node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache --maxWorkers 1 ${suites.join(" ")}`);
  const log = stripVTControlCharacters(result.stdout + result.stderr);
  writeFileSync(output, log);
  return { exit: result.status, suites, passed: Number(log.match(/^\s*Tests\s+(\d+) passed/mu)?.[1] ?? 0) };
}

export function scoreReview(world, input, output, expectedPassed, expectedScope) {
  const program = `import fs from 'node:fs';
import {score} from './scripts/pnwf/software/continuity-reuse/case.mjs';
const text=fs.readFileSync('/case/review-committed.md','utf8');
const retained=text.slice(text.indexOf('## Retained evidence\\n'));
const fixed=text.replace(/release\\r?\\nauthorization/u,'release authorization');
const missing=text.replace(/This \`READY\` is limited to maintenance continuation[\\s\\S]*?(?=## Retained evidence)/u,'');
console.log('SCORE '+JSON.stringify({archived:score({text,retained}),joined:score({text:fixed,retained}),missing:score({text:missing,retained})}));`;
  const result = offline(world, `node --input-type=module -e ${quote(program)}`, [`${input}:/case:ro`]);
  writeFileSync(output, result.stdout + result.stderr);
  const line = result.stdout.split(/\r?\n/u).find(value => value.startsWith("SCORE "));
  const scores = line ? JSON.parse(line.slice(6)) : null;
  const pass = result.status === 0 && scores?.archived.passed === expectedPassed && scores.archived.checks.releaseScope === expectedScope &&
    scores.joined.passed === 7 && scores.joined.checks.releaseScope === true && scores.missing.checks.releaseScope === false;
  return { pass, exit: result.status, scores };
}
