import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { readStream } from "../analyze_energy_trajectory.mjs";
import { digest, readJson } from "../energy/contract.mjs";
import { composeProcedurePorts } from "../../../dist/src/composition/procedures.js";
import { FOCUSED_VITEST_CAPABILITY } from "../../../dist/src/composition/focused_testing.js";
import { buildRunResult } from "../../../dist/src/experiment/index.js";
import {
  makeOrganizationMemoryService, materializeExperiment, materializeMetric, materializeScenario, materializeVariant,
  SqliteOrganizationMemoryStore,
} from "../../../dist/src/organization_memory/index.js";
import { makeProcedureService, SqliteProcedureStore } from "../../../dist/src/procedures/index.js";

export const COMMAND = "node node_modules/vitest/vitest.mjs run --configLoader runner --no-cache";
const history = [
  ["live/P", [[83, "STARTUP_FAILURE"], [91, "PASS"], [121, "PASS"], [129, "ASSERTION_FAILURE"]]],
  ["live/F", [[69, "STARTUP_FAILURE"], [77, "PASS"], [91, "PASS"], [105, "ASSERTION_FAILURE"]]],
  ["followup/OLD", [[251, "BUILD_FAILURE"], [321, "STARTUP_FAILURE"], [337, "ASSERTION_FAILURE"], [351, "PASS"]]],
  ["followup/ACCEPTED", [[199, "STARTUP_FAILURE"], [215, "PASS"]]],
];

export function testActivity(stream, summary) {
  const events = readStream(stream, digest(readFileSync(stream)));
  const bySeq = new Map(events.map(event => [event.seq, event]));
  const outcomes = new Map(summary.results.map(row => [row.callId, row]));
  return summary.calls.flatMap(call => {
    const command = call.args?.command;
    if (typeof command !== "string" || !["bash", "shell"].includes(call.kind.split(" ")[0]) ||
      !/\bvitest\b|\btest:focused\b|\b(?:pnpm|npm)\s+(?:run\s+)?test\b/u.test(command)) return [];
    const result = outcomes.get(call.callId);
    const message = bySeq.get(result?.seq)?.data?.message;
    if (message) assert.equal(message.toolCallId, call.callId);
    const output = stripVTControlCharacters((message?.content ?? []).map(block => block.text ?? "").join("\n"));
    const testsPassed = Number(output.match(/^\s*Tests\s+(\d+) passed(?:\s+\(\d+\))?\s*$/mu)?.[1] ?? 0);
    const startupError = output.match(/^.*(?:EACCES|EROFS|ENOENT):.*(?:\.vite-temp|\.local).*$/mu)?.[0]?.trim() ?? null;
    const buildFailure = /\berror TS\d+:/u.test(output) && !/\bRUN\s+v\d/u.test(output);
    const state = !message ? "UNPAIRED" : startupError ? "STARTUP_FAILURE" : buildFailure ? "BUILD_FAILURE"
      : /AssertionError|^\s*Tests\s+.*\bfailed\b/mu.test(output) ? "ASSERTION_FAILURE"
        : testsPassed > 0 && result.ok && !message.isError && !/^\s*(?:EXIT|TEST_EXIT)\s*[:=]\s*[1-9]/mu.test(output) ? "PASS" : "OTHER";
    const step = bySeq.get(call.seq)?.data?.step;
    const direct = /(?:^|&&|[;\n])\s*node\s+(?:\.\/)?node_modules\/vitest\/vitest\.mjs\s+run\b/u.test(command);
    const runnerLoader = /\bvitest\b/u.test(command) && /--configLoader[ =]+runner\b/u.test(command);
    const equivalent = runnerLoader && /--no-cache\b/u.test(command);
    return [{ callId: call.callId, callSeq: call.seq, resultSeq: result?.seq ?? null, step, offsetMs: result?.offsetMs ?? null,
      command, state, testsPassed, startupError, method: direct && equivalent ? "EXACT" : equivalent ? "EQUIVALENT" : runnerLoader ? "RUNNER_LOADER"
        : /\bnode\s+--run\s+test:focused\b/u.test(command) ? "PACKAGE_SCRIPT" : null }];
  });
}

export function archivedGrounds(repo) {
  const archive = join(repo, "research-evidence/pnwf-software/2026-11-21/self-maintenance");
  return history.map(([slot, checks]) => {
    const folder = join(archive, slot);
    const result = readJson(join(folder, "result.json"));
    const trace = result.attribution.traces.find(row => row.role === "principal");
    const stream = join(folder, "trajectory", readdirSync(join(folder, "trajectory")).find(name => name.endsWith(".zstd")));
    const streamSha256 = digest(readFileSync(stream));
    assert.equal(streamSha256, trace.digest);
    const timelinePath = join(folder, "attribution/0.timeline.json");
    const summary = readJson(timelinePath).summary;
    const activities = testActivity(stream, summary);
    const witnesses = checks.map(([seq, expected]) => {
      const row = activities.find(activity => activity.callSeq === seq);
      assert.equal(row?.state, expected, `${slot} at ${seq}: ${JSON.stringify(row)}`);
      return row;
    });
    assert(witnesses.some(row => row.state === "PASS" && row.method) && witnesses.some(row => row.state === "STARTUP_FAILURE"));
    return { slot, basis: result.basis, sessionId: trace.id, streamSha256, timelineSha256: digest(readFileSync(timelinePath)),
      firstStep: summary.modelSteps[0].at, lastStep: summary.modelSteps.at(-1).at,
      originalResult: result.result, unresolvedRequests: result.accounting.unresolved, witnesses };
  });
}

export async function approveFocusedMethod({ directory, grounds, verification }) {
  assert.equal(grounds.length, 4);
  const experimentId = "readonly-focused-vitest-archive";
  const projectId = "focused-testing-maintenance";
  const memoryStore = new SqliteOrganizationMemoryStore(join(directory, "memory.sqlite"));
  const procedurePath = join(directory, "focused-procedure.sqlite");
  const store = new SqliteProcedureStore(procedurePath);
  const clock = () => "2026-11-21T00:00:00.000Z";
  const organizationMemory = makeOrganizationMemoryService({ store: memoryStore, clock });
  const scenario = materializeScenario({ scenarioId: "readonly-vitest", scenarioRevision: 0, kind: "S1_LOW_COUPLING",
    classification: "SCRIPTED_MECHANICAL", task: "Recount archived test startup and assertion outcomes by call ID",
    successCriteria: ["Startup fault and focused runner pass both observable"], bounds: { maxWallClockMs: 30_000, maxModelCalls: 0, maxRunsPerVariant: 4 } });
  const variant = materializeVariant({ variantId: "archived-maintenance", kind: "SINGLE_LOCUS", description: "Offline recount of archived Principal test calls" });
  const experiment = materializeExperiment({ experimentId, revision: 0, objective: "Establish a scoped test startup workaround",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: [{ variantId: variant.variantId, digest: variant.digest }],
    measurementPlan: { metricIds: ["witnesses"], primaryValidatorRef: "paired-test-tools", objectives: ["quality"], objectiveNote: "decision_aid_not_truth" },
    runPolicy: { minRunsPerVariantPerScenario: 4, maxRuns: 4, maxWallClockMs: 30_000, maxModelCalls: 0, maxAttemptsPerRun: 1, randomizeOrder: false, seed: 1 } });
  const content = { schemaVersion: 1, title: "Focused Vitest checks with read-only dependencies",
    purpose: "Start a targeted test in a constrained Palimpsest checkout and preserve the real exit outcome",
    applicability: ["Palimpsest focused Vitest checks on Linux with read-only dependencies"],
    preconditions: ["Node 24 or newer", "Pinned local Vitest 4.1.10 and tracked project configuration are readable"],
    steps: [{ instruction: "Use the local Vitest entry with the runner configuration loader and disable the test cache. Provide the intended test paths." },
      { instruction: "Observe the runner exit status and the named assertions." }],
    checks: ["The requested suite actually ran", "A deliberately failing assertion exits nonzero"], expectedOutputs: ["Named focused suite outcome"],
    limitations: ["Does not provide full CI coverage", "A real test failure is distinct from a startup fault", "The prior learned package script is absent from the common baseline"],
    capabilityHints: [FOCUSED_VITEST_CAPABILITY], recommendedRecipeRefs: [] };
  const policyRef = { policyId: "focused-setup-verification", version: "1" };
  let approvedDigest;
  const admission = { policyRef, async decide(input) {
    const publish = input.candidateDigest === approvedDigest && input.validation.groundsResolved && input.validation.groundCount === 4 &&
      verification.standardStartupFailed && verification.focusedPassed && verification.assertionExit === 1;
    return { decision: publish ? "PUBLISH" : "REJECT", candidateDigest: input.candidateDigest, policyRef,
      rationale: publish ? "Exact candidate, four archived runs, observed startup fault, focused success and nonzero assertion failure verified by host." : "Exact candidate or independent verification has not been approved." };
  } };
  try {
    await organizationMemory.recordExperiment(experiment);
    await organizationMemory.recordScenario(experimentId, scenario);
    await organizationMemory.recordVariant(experimentId, variant);
    const runs = [];
    for (const [index, ground] of grounds.entries()) {
      const run = buildRunResult({ spec: { experiment, scenario, variant, orderIndex: index, seed: index + 1, warmup: false, attempt: 1 },
        provenance: { provider: "offline-archive", model: "none", hostVersion: "dsh-0.2.1-rc.5", palimpsestSha: ground.basis,
          ordariumVersion: "1.3.1", profileDigest: ground.timelineSha256, repoShas: [ground.basis],
          unknowns: ground.unresolvedRequests ? ["prior session usage unresolved"] : [] },
        execution: { outcome: "PASS", failureClassification: "NONE", measurements: [materializeMetric({ metricId: "witnesses",
          unit: "count", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: ground.witnesses.length, provenance: ground.streamSha256 })],
          artifactRefs: [`sha256:${ground.streamSha256}`, `sha256:${ground.timelineSha256}`], validatorResults: [] },
        startedAt: new Date(ground.firstStep).toISOString(), endedAt: new Date(ground.lastStep).toISOString() });
      await organizationMemory.recordRun(experimentId, run);
      runs.push({ ...ground, runRef: run.runRef, runDigest: run.digest });
    }
    const ports = composeProcedurePorts({ projectId, organizationMemory });
    const authoring = { origin: "host-reviewed-archive-recount", propose: async () => ({ outcome: "proposal", content }) };
    const service = makeProcedureService({ store, ports, authoring, admission, clock });
    const prepared = await service.prepare({ grounds: runs.map(run => ({ kind: "RUN_RESULT", ref: run.runRef })),
      projectContext: { projectId, projectRevision: 1, projectDigest: digest(JSON.stringify(runs)), objective: experiment.objective } });
    assert.equal((await service.publish(prepared)).status, "rejected");
    approvedDigest = prepared.candidate.digest;
    const published = await service.publish(prepared);
    assert.equal(published.status, "published");
    assert.equal((await service.history(published.ref.procedureId)).current.standing, "ACTIVE");
    return { procedurePath, runs, candidate: prepared.candidate, revision: published.revision, ref: published.ref, verification, unapprovedRejected: true };
  } finally {
    store.close();
    memoryStore.close();
  }
}
