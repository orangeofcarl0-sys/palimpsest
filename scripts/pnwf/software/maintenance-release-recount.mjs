/** Offline, role-aware reconciliation for the release handover comparison. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { USAGE_FIELDS } from "../execution_budget.mjs";
import { readStream } from "../analyze_energy_trajectory.mjs";
import { digest, readJson, writeJson } from "../energy/contract.mjs";

const root = resolve(process.argv[2]);
const stage = "RELEASE";
const tuple = usage => USAGE_FIELDS.map(key => usage[key] ?? 0).join("/");
const fromReplay = usage => Object.fromEntries(USAGE_FIELDS.map((key, index) => [
  key, usage[["inputTokens", "cacheReadTokens", "cacheWriteTokens", "outputTokens"][index]],
]));

function summarize(run) {
  const row = readJson(join(run, "result.json"));
  const out = join(run, "out", stage);
  const desk = readJson(join(out, "release-desk.json"));
  const observation = join(out, "request-observations.jsonl");
  const observations = existsSync(observation) ? readFileSync(observation, "utf8").trim().split("\n").map(JSON.parse) : [];
  const terminal = observations.filter(event => event.kind === "TERMINAL");
  const admissions = observations.filter(event => event.kind === "ADMITTED");
  const ledger = new Map(row.accounting.requests.map(record => [record.id, record]));
  const jobs = row.evidence?.workerReceipts ?? [];
  const roots = [join(run, "runtime-" + stage, "sessions"), ...jobs.map(job => join(out, "worker-" + job.attemptId, "home", "sessions"))];
  const streams = roots.filter(path => existsSync(path)).flatMap(path => readdirSync(path, { recursive: true })
    .filter(file => file.endsWith(".jsonl.zstd")).map(file => join(path, file)));
  const attribution = join(out, "attribution");
  const timelines = existsSync(attribution) ? readdirSync(attribution).filter(file => file.endsWith(".timeline.json"))
    .map(file => readJson(join(attribution, file)).summary) : [];
  const bound = new Set();
  const usageProblems = [];
  const traces = (row.evidence?.traces ?? []).map(trace => {
    const path = streams.find(file => file.split(/[\\/]/u).includes(trace.id));
    const timeline = timelines.find(item => item.session.id === trace.id);
    assert(path && timeline, "Recorded stream missing for " + trace.id);
    const stream = readStream(path, trace.digest);
    const messages = stream.filter(event => event.type === "assistant/message" && event.data?.usage);
    const actor = trace.role === "worker" ? "worker" : "principal-container";
    const requests = messages.map(({ data, seq, at }, index) => {
      const signatures = (data.message.source?.replayState?.blocks ?? []).map(block => block.signature).filter(Boolean);
      const usage = fromReplay(timeline.modelSteps[index].usage);
      const byId = terminal.filter(event => signatures.includes(event.messageId));
      const byTuple = terminal.filter(event => event.actor === actor && tuple(event.usage) === tuple(usage));
      const matches = byId.length || signatures.some(id => id.startsWith("msg_")) ? byId : byTuple;
      const [observed] = matches;
      if (matches.length !== 1 || observed.actor !== actor || tuple(observed.usage) !== tuple(usage) ||
          bound.has(observed.requestId) || ledger.get(observed.requestId)?.state !== "SETTLED" ||
          tuple(ledger.get(observed.requestId).usage) !== tuple(usage)) {
        usageProblems.push({ trace: trace.id, seq, candidates: matches.length });
        return { step: index + 1, seq, at, usage, requestId: null };
      }
      bound.add(observed.requestId);
      return { step: index + 1, seq, at, usage, requestId: observed.requestId,
        binding: byId.length ? "response-id" : "unique-actor-usage-tuple" };
    });
    const actorOrder = requests.filter(step => step.requestId).map(step => admissions.findIndex(event =>
      event.requestId === step.requestId && event.actor === actor));
    if (actorOrder.some((position, index) => position < 0 || (index > 0 && position <= actorOrder[index - 1]))) {
      usageProblems.push({ trace: trace.id, reason: "gateway admission order differs" });
    }
    const results = new Map(timeline.results.map(item => [item.callId, item]));
    const calls = timeline.calls.map(call => {
      const result = results.get(call.callId);
      return { step: requests.findLast(step => step.seq < call.seq)?.step, ...call,
        result: result ? { seq: result.seq, offsetMs: result.offsetMs, ok: result.ok, refusal: result.refusal,
          reason: result.refusalReason } : null };
    });
    return { role: trace.role === "worker" ? "maintainer" : trace.role, trace: trace.id, digest: trace.digest,
      durationMs: timeline.session.durationMs, counts: timeline.counts, byKind: timeline.byKind, failedJobs: timeline.failedJobs,
      calls, requests };
  });
  const usage = Object.fromEntries([...new Set(terminal.map(item => item.actor))].map(actor => {
    const events = terminal.filter(item => item.actor === actor);
    return [actor === "worker" ? "maintainer" : "principal", { requests: events.length, ...Object.fromEntries(
      USAGE_FIELDS.map(key => [key, events.reduce((sum, event) => sum + event.usage[key], 0)])) }];
  }));
  const artifactFile = join(run, "report-submitted.md");
  const artifact = existsSync(artifactFile) ? readFileSync(artifactFile) : null;
  if (artifact) {
    const blob = createHash("sha1").update("blob " + artifact.length + "\0").update(artifact).digest("hex");
    assert.equal(blob, row.blob, "Archived report differs from the candidate Git blob");
  }
  const encoded = row.conclusion?.body?.split("\n").find(line => line.startsWith('{"schema":"pc1-episode-conclusion/v1"'));
  const receipt = encoded ? JSON.parse(encoded) : null;
  const artifactEvidence = receipt?.check?.artifacts?.find(item => row.paths?.includes(item.path));
  const conclusionBound = Boolean(receipt?.intent === "DELIVER" && artifact && artifactEvidence?.committed &&
    artifactEvidence.commit === row.candidate && artifactEvidence.digest === digest(artifact));
  return { arm: row.name, basis: row.basis, parent: row.parent, candidate: row.candidate, blob: row.blob, paths: row.paths,
    score: row.score ?? 0, checks: row.checks, natural: row.execution.natural, stoppedBy: row.execution.killedBy,
    conclusion: row.conclusion?.intent ?? null, conclusionBound, artifactEvidence,
    elapsedMs: Date.parse(row.execution.endedAt) - Date.parse(row.execution.startedAt),
    ledgerRequests: row.accounting.requests.length, knownTokens: row.accounting.confirmed, unknown: row.accounting.unresolvedRequests,
    usage, boundRequests: bound.size, usageProblems, priorAnalyzerError: row.attributionError ?? null, traces, desk, jobs };
}

const qualification = readJson(join(root, "qualification.json"));
const arms = ["P", "F"].filter(arm => existsSync(join(root, "live", arm, "result.json"))).map(arm => summarize(join(root, "live", arm)));
writeJson(join(root, "comparison.json"), { qualification, arms });
