import assert from "node:assert/strict";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launchDeployment, loadDeploymentProfile } from "../../../../dist/src/advanced.js";
import { captureDirectCloseout, directCloseoutAdvice } from "../../../../host/dsh/lib/direct_closeout.js";
import { readStream } from "../../analyze_energy_trajectory.mjs";
import { digest, git, readJson, writeJson } from "../../energy/contract.mjs";
import { file, repo } from "./case.mjs";

export const originalCase = join(repo, "research-evidence/pnwf-software/2026-11-22/continuity-reuse");

export async function replayCloseout(root, seed) {
  const regressions = [];
  for (const [arm, grade] of [["WITHOUT", 7], ["WITH", 5]]) {
    const original = join(originalCase, "live", arm);
    const recorded = readJson(join(original, "result.json"));
    assert.equal(recorded.grade.passed, grade);
    assert.equal(recorded.delivery, false);
    assert.equal(recorded.basis, seed.head);
    assert(recorded.execution.natural);
    const streamDigest = recorded.evidence.traces.find(row => row.role === "principal").digest;
    const trace = readStream(join(original, "trajectory", recorded.trajectory.stream), streamDigest);
    const calls = trace.filter(event => event.type === "tool/call");
    const call = calls.findLast(event => event.data.name === "bash" && /\bgit commit\b/u.test(JSON.parse(event.data.arguments).command));
    const result = trace.find(event => event.type === "tool/result" && event.data.message.toolCallId === call.data.callId);
    assert(result && !result.data.message.isError);
    assert(!calls.some(event => event.data.name === "palimpsest_work" && ["readiness", "conclude"].includes(JSON.parse(event.data.arguments).action)));
    const lastAssistant = trace.findLast(event => event.type === "assistant/message");
    assert(lastAssistant.seq > result.seq);

    const location = join(root, "regression", arm);
    const world = join(location, "world"), state = join(location, "state");
    mkdirSync(location, { recursive: true });
    cpSync(seed.world, world, { recursive: true });
    cpSync(join(original, "owners"), state, { recursive: true });
    const config = readJson(seed.profile);
    const profile = loadDeploymentProfile(writeProfile(location, {
      ...config, repository: world, transport: { ...config.transport, databasePath: join(state, "transport.sqlite") },
      databases: Object.fromEntries(Object.entries(config.databases).map(([key, path]) => [key, join(state, path.split(/[\\/]/u).at(-1))])),
    }));
    const host = launchDeployment(profile);
    try {
      const workspace = host.installed.application.projectWorkspace;
      const controller = host.installed.controller;
      const initial = await captureDirectCloseout(world, workspace);
      const advise = (view = workspace) => directCloseoutAdvice(world, initial, view, controller);
      assert.equal(initial.head, seed.head);
      assert.equal(await advise(), null, "An unchanged checkout should close normally");
      git(world, "fetch", "--quiet", join(original, "candidate.bundle"), "HEAD");
      git(world, "checkout", "--quiet", "--detach", recorded.candidate);
      assert.equal(git(world, "status", "--porcelain"), "");
      const advice = await advise();
      assert.equal(advice?.head, recorded.candidate);
      const readiness = await host.installed.application.work.outcomeReadiness();
      assert.equal(readiness.action, "SEMANTIC_JUDGEMENT");
      assert(readiness.next.some(step => step.includes("intent=DELIVER")));
      const artifact = join(world, file);
      const bytes = readFileSync(artifact);
      writeFileSync(artifact, Buffer.concat([bytes, Buffer.from("\n")]));
      assert.equal(await advise(), null, "Dirty changes should receive no advisory");
      writeFileSync(artifact, bytes);
      const pulse = await workspace.pulse();
      assert.equal((await advise({ pulse: async () => ({ ...pulse, episode: { ...pulse.episode,
        state: "OPEN", current: true, conclusion: null,
      } }) }))?.head, recorded.candidate, "An OPEN episode without a conclusion should receive advice");
      assert.equal(await advise({ pulse: async () => ({ ...pulse, episode: { ...pulse.episode, readiness: {
        ...pulse.episode.readiness, deliveryBlockers: ["open work"],
      } } }) }), null, "Open work should receive no advisory");
      assert.equal(await advise({ pulse: async () => ({ ...pulse, episode: { ...pulse.episode, current: true } }) }), null,
        "An existing current conclusion should receive no advisory");
      assert.equal(await advise({ pulse: async () => {
        git(world, "update-ref", "HEAD", initial.head, recorded.candidate);
        return pulse;
      } }), null, "Moved HEAD should receive no advisory");
      regressions.push({ arm, originalGrade: grade, originalDelivery: false, streamDigest, initialHead: seed.head,
        commitCall: call.seq, result: result.seq, candidate: recorded.candidate, assistantFinal: lastAssistant.seq, offer: advice.reason,
        readiness: { action: readiness.action, next: readiness.next },
        controls: ["unchanged", "dirty", "open without conclusion", "blocked", "recorded", "head drift"] });
    } finally { await host.close(); }
  }
  return regressions;
}

function writeProfile(location, config) {
  const path = join(location, "profile.json");
  writeJson(path, config);
  return path;
}
