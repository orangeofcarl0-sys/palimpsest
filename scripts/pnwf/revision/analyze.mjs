/** Attribute paid T2 requests and compare each replay against its original same-basis control. */
import { deepStrictEqual, equal, ok } from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { analyzeAttributedStage } from "../analyze_energy_trajectory.mjs";
import { digest, readJson } from "../energy/contract.mjs";

const [root, grpcControl, energyControl] = process.argv.slice(2);
ok(root && grpcControl && energyControl, "Usage: node scripts/pnwf/revision/analyze.mjs <run> <grpc-control-T2> <energy-control-T2>");

function grpcEvidence(result) {
  const { trajectory, workerReceipts } = result;
  const usage = {};
  for (const role of Object.values(trajectory.usageByRole)) {
    for (const [key, field] of Object.entries({ input_tokens: "input", cache_read_input_tokens: "cacheRead",
      cache_creation_input_tokens: "cacheWrite", output_tokens: "output" })) usage[key] = (usage[key] ?? 0) + role[field];
  }
  return { ...trajectory, workerReceipts, usage, traces: trajectory.streams,
    usageQualified: result.usageKnown && trajectory.requestIdsBound && trajectory.tupleMatch && trajectory.unresolvedRequests === 0 };
}

function analyze(stage, result) {
  const evidence = result.evidence ?? grpcEvidence(result);
  const out = join(stage, "out/T2");
  const facts = result.facts ?? result.product;
  const candidatePath = join(stage, "candidate.json");
  const candidate = existsSync(candidatePath) ? readJson(candidatePath) : result.candidate;
  const conclusion = typeof facts?.conclusion === "string" ? facts.conclusion : facts?.conclusion?.intent ?? null;
  const rows = readdirSync(join(out, "attribution")).filter(name => name.endsWith(".timeline.json"))
    .map(name => readJson(join(out, "attribution", name)).summary);
  const attributed = analyzeAttributedStage(stage, "T2", { context: true, result: { ...result, evidence } });
  const traces = attributed.traces.map(trace => {
    const timeline = rows.find(row => row.session.id === trace.sessionId);
    ok(timeline);
    const results = new Map(timeline.results.map(row => [row.callId, row]));
    const actions = timeline.calls.filter(call => /^(?:work:|continuity:|relay:|subagent|workflow|palimpsest_worker_)/u.test(call.kind))
      .map(call => {
        const result = results.get(call.callId);
        const details = trace.activity.find(entry => entry.callId === call.callId);
        return { callId: call.callId, seq: call.seq, resultSeq: result?.seq ?? null, kind: call.kind.split(" ", 1)[0],
          offsetMs: call.offsetMs, resultOffsetMs: result?.offsetMs ?? null, state: result?.state ?? null,
          refusal: result?.refusalReason ?? result?.refusal ?? null, ok: result?.ok ?? null, details,
          taskId: call.args.taskId, attemptId: call.args.attemptId, intent: call.args.intent,
          outcome: call.args.kind, candidate: result?.facts?.resultCommit };
      });
    const pairs = timeline.calls.map(call => {
      const result = results.get(call.callId);
      return { callId: call.callId, callSeq: call.seq, resultSeq: result?.seq ?? null, tool: call.kind.split(" ", 1)[0],
        ok: result?.ok ?? null, state: result?.state ?? null, refusal: result?.refusalReason ?? result?.refusal ?? null };
    });
    return { ...trace, actions, pairs };
  });
  return {
    passed: result.passed, reason: result.reason ?? null, basis: result.basis,
    candidateQualified: result.candidateQualified ?? result.passed,
    ...(result.originalResultSha256 ? { originalResultSha256: result.originalResultSha256, originalReason: result.originalReason, addedPaidRequests: 0 } : {}),
    candidate: result.receipt?.candidate ?? candidate?.commit ?? null,
    route: result.route ?? (candidate?.commit && evidence.workerReceipts.some(worker => worker.result === candidate.commit) ? "formal-worker" : null),
    conclusion, gate: result.gate?.verdict ?? candidate?.gate ?? null,
    naturalExit: result.execution?.natural ?? evidence.natural, elapsedMs: evidence.elapsedMs,
    receipt: result.receipt ?? null, workers: evidence.workerReceipts,
    frozenScore: result.frozenScore ?? null,
    ledgerSha256: digest(readFileSync(join(out, "request-accounting.json"))), ...attributed, traces,
  };
}

const comparisons = Object.entries({ grpc: grpcControl, energy: energyControl }).map(([scenario, control]) => {
  const stage = join(root, scenario);
  const seal = readJson(join(stage, "contract.json"));
  const priorPath = join(control, "result.json");
  equal(digest(readFileSync(priorPath)), seal.originalResultSha256);
  const previous = analyze(control, readJson(priorPath));
  const original = join(stage, "result.json");
  const review = join(stage, "review-result.json");
  const result = readJson(existsSync(review) ? review : original);
  if (existsSync(review)) equal(result.originalResultSha256, digest(readFileSync(original)));
  if (!result.evidence?.usageQualified) return { scenario, seal, previous, live: {
    basis: result.basis, passed: result.passed, reason: result.reason, usageKnown: result.usageKnown, accounting: result.accounting,
  } };
  const live = analyze(stage, result);
  equal(live.basis, previous.basis);
  const delta = { requests: live.boundRequests - previous.boundRequests, elapsedMs: live.elapsedMs - previous.elapsedMs,
    ...Object.fromEntries(Object.entries(live.totals).map(([key, value]) => [key, value - previous.totals[key]])) };
  if (live.receipt) for (const trace of live.traces) for (const activity of trace.activity) {
    for (const binding of [activity.binding, ...(activity.summaries ?? [])]) {
      if (binding?.receiptId && binding.candidate === live.receipt.candidate) {
        deepStrictEqual([binding.basis, binding.receiptId], [live.basis, live.receipt.receiptId]);
      }
    }
  }
  return { scenario, seal, previous, live, delta };
});
console.log(JSON.stringify({ schema: "pnwf-work-revision-live-t2/v1", requestBinding: "provider-response-id",
  toolBinding: "tool-call-id", comparisons }, null, 2));
