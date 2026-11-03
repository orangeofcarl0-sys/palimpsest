/**
 * LHAPE — summarize one deterministic real-host run without scoring a model.
 *
 * Every model-shaped fact is labelled MOCK_MODEL. Worker and subagent sessions are REAL DSH
 * sessions; their scripted content is test-owned. No provider was called.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "lhape-run")));
const SCENARIO = String(args.get("scenario") ?? "main");
const RUN_ID = String(args.get("runId") ?? `lhape-${SCENARIO}-2026-11-03`);
const OUT = join(RUN, "out");
const finalPulse = JSON.parse(readFileSync(join(RUN, "final-pulse.json"), "utf8"));
const promotions = existsSync(join(RUN, "operator-promotions.json"))
  ? JSON.parse(readFileSync(join(RUN, "operator-promotions.json"), "utf8")).records
  : [];
const mockPath = join(OUT, "mock.jsonl");
const requests = existsSync(mockPath)
  ? readFileSync(mockPath, "utf8")
      .split(/\n/u)
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line))
  : [];

const bySession = new Map();
for (const entry of requests) {
  const previous = bySession.get(entry.sessionId);
  if (previous === undefined) {
    bySession.set(entry.sessionId, {
      sessionId: entry.sessionId,
      match: entry.match,
      firstAt: entry.at,
      lastAt: entry.at,
      requests: 1,
      toolCalls: (entry.turn?.tool_calls ?? []).map((call) => call.name),
      toolNames: entry.toolNames ?? [],
    });
  } else {
    previous.lastAt = entry.at;
    previous.requests += 1;
    for (const call of entry.turn?.tool_calls ?? []) if (!previous.toolCalls.includes(call.name)) previous.toolCalls.push(call.name);
    previous.toolNames = entry.toolNames ?? previous.toolNames;
  }
}
const sessions = [...bySession.values()];
const workerSessions = sessions.filter((session) => String(session.match).startsWith("Your task:") || String(session.match).startsWith("Continuation context"));
const principalSessions = sessions.filter((session) => String(session.match).startsWith("LHAPE_PRINCIPAL_"));
const childSessions = sessions.filter((session) => String(session.match).startsWith("LHAPE_CHILD_"));

function overlap(left, right) {
  return Date.parse(left.firstAt) <= Date.parse(right.lastAt) && Date.parse(right.firstAt) <= Date.parse(left.lastAt);
}
const overlapPairs = [];
for (let i = 0; i < workerSessions.length; i += 1) {
  for (let j = i + 1; j < workerSessions.length; j += 1) {
    if (overlap(workerSessions[i], workerSessions[j])) {
      overlapPairs.push([workerSessions[i].sessionId, workerSessions[j].sessionId]);
    }
  }
}

const sessionsDir = join(RUN, "home", "sessions");
const sessionFiles = [];
if (existsSync(sessionsDir)) {
  for (const workspace of readdirSync(sessionsDir)) {
    const workspaceDir = join(sessionsDir, workspace);
    for (const session of readdirSync(workspaceDir)) {
      const file = join(workspaceDir, session, "session.v4.jsonl.zstd");
      if (existsSync(file)) {
        const bytes = readFileSync(file);
        sessionFiles.push({ session, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
      }
    }
  }
}

const artifacts = finalPulse.artifacts.map((artifact) => ({
  path: artifact.path,
  present: artifact.present,
  sha256: artifact.sha256,
  bytes: artifact.text === null ? null : Buffer.byteLength(artifact.text, "utf8"),
}));

const summary = {
  schema: "lhape-host-run-summary/v1",
  runId: RUN_ID,
  scenario: SCENARIO,
  createdAt: new Date().toISOString(),
  mode: "MOCK_MODEL_REAL_DSH_HOST",
  note:
    "The DSH host, Palimpsest product, SQLite state, worker subprocesses, native subagent sessions, tool calls and Git effects are real. The model is a deterministic Messages stand-in and produces NO model-cognition evidence. No provider was called and no paid tokens were spent.",
  providerCalls: 0,
  modelSpendTokens: 0,
  codeFreeze: String(args.get("codeFreeze") ?? ""),
  project: {
    revision: finalPulse.project.revision,
    headCommit: finalPulse.project.headCommit,
    goal: finalPulse.project.goal,
    decisions: finalPulse.project.decisions,
    tasks: finalPulse.project.tasks,
    status: finalPulse.status.tasks,
    nextAction: finalPulse.status.nextAction,
  },
  execution: finalPulse.workers,
  continuation: finalPulse.results,
  sessions: {
    principal: principalSessions.map((session) => ({
      match: session.match,
      sessionId: session.sessionId,
      firstAt: session.firstAt,
      lastAt: session.lastAt,
      requests: session.requests,
      toolCalls: session.toolCalls,
    })),
    workers: workerSessions.map((session) => ({
      match: session.match,
      sessionId: session.sessionId,
      firstAt: session.firstAt,
      lastAt: session.lastAt,
      requests: session.requests,
      toolCalls: session.toolCalls,
    })),
    nativeSubagents: childSessions.map((session) => ({
      match: session.match,
      sessionId: session.sessionId,
      firstAt: session.firstAt,
      lastAt: session.lastAt,
      requests: session.requests,
    })),
    sessionFiles,
  },
  workerOverlapPairs: overlapPairs,
  artifacts,
  operatorPromotions: promotions.map((record) => ({
    label: record.label,
    taskId: record.taskId,
    promoted: record.promoted,
    attemptId: record.attemptId,
    result: record.result ?? null,
    eligibility: record.eligibility ?? null,
    after: record.after ?? null,
  })),
  pulse: {
    contributions: finalPulse.pulse.contributions.map((entry) => ({
      contributionId: entry.record.contributionId,
      sourceKind: entry.record.sourceKind,
      sourceRef: entry.record.sourceRef,
      status: entry.status,
      basisState: entry.basisState,
      latestDecision: entry.latestDecision?.record.decision ?? null,
      planChange: entry.latestDecision?.record.planChange ?? null,
      downstream: entry.downstream,
    })),
    decisionQueue: finalPulse.pulse.decisionQueue,
    execution: finalPulse.pulse.execution,
    nextActions: finalPulse.pulse.nextActions,
  },
  limitations: [
    "The model is a deterministic Messages stand-in, not a language model. No cognition, quality, cost or comparative benefit is claimed.",
    "The native subagent is a real child DSH session; its content is scripted. The product cannot observe its read footprint, so the contribution records the principal's declaration and says so.",
    "The operator promotions are real canonical promotions, executed by a test-owned operator script that names only the task; the product derives attempt, source commit and expected head.",
    "This is deterministic engineering qualification, not the LHAPE F/L/G model cohort. That cohort remains BLOCKED without a new spend authorization.",
  ],
};
writeFileSync(join(RUN, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(
  `${JSON.stringify({ run: RUN, scenario: SCENARIO, summary: "run-summary.json", workers: workerSessions.length, promotions: promotions.length })}\n`,
);
