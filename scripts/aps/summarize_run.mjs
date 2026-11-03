/**
 * APS real-host run — summarize the deterministic run WITHOUT scoring a model.
 *
 * It reads the mock request log and the product's own final pulse. Every model-shaped fact is
 * labelled MOCK_MODEL. The subagent sessions are real DSH child sessions; their content is scripted.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-run")));
const OUT = join(RUN, "out");
const finalPulse = JSON.parse(readFileSync(join(RUN, "final-pulse.json"), "utf8"));
const acceptance = existsSync(join(RUN, "operator-acceptance.json"))
  ? JSON.parse(readFileSync(join(RUN, "operator-acceptance.json"), "utf8"))
  : null;
const downstream = existsSync(join(RUN, "downstream-completion.json"))
  ? JSON.parse(readFileSync(join(RUN, "downstream-completion.json"), "utf8"))
  : null;
const mockLines = existsSync(join(OUT, "mock.jsonl"))
  ? readFileSync(join(OUT, "mock.jsonl"), "utf8").split(/\n/).filter((line) => line.trim() !== "")
  : [];
const requests = mockLines.map((line) => JSON.parse(line));

const principal = requests.filter((entry) => String(entry.match).startsWith("APS_PRINCIPAL_SESSION_"));
const children = requests.filter((entry) => String(entry.match).startsWith("APS_CHILD_"));
const principalTools = new Set();
for (const entry of principal) {
  for (const name of entry.toolNames ?? []) if (String(name).startsWith("palimpsest_")) principalTools.add(name);
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
        sessionFiles.push({
          session,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  }
}

const contributions = finalPulse.pulse.contributions;
const assessed = contributions.filter((entry) => entry.status !== "UNASSESSED");
const summary = {
  schema: "aps-host-run-summary/v1",
  runId: String(args.get("runId") ?? "aps-host-2026-11-03"),
  createdAt: new Date().toISOString(),
  mode: "MOCK_MODEL_REAL_DSH_HOST",
  note:
    "The DSH host, Palimpsest product, SQLite state, native subagent child sessions and tool calls are real. The model is a deterministic Messages stand-in and produces NO model-cognition evidence. No provider was called and no paid tokens were spent.",
  providerCalls: 0,
  modelSpendTokens: 0,
  codeFreeze: String(args.get("codeFreeze") ?? ""),
  normalPalimpsestTools: [...principalTools].sort(),
  principalSessions: principal.map((entry) => ({
    match: entry.match,
    sessionId: entry.sessionId,
    turnCount: principal.filter((row) => row.sessionId === entry.sessionId && row.match === entry.match).length,
  })),
  subagentSessions: [...new Set(children.map((entry) => entry.sessionId))].map((sessionId) => {
    const rows = children.filter((entry) => entry.sessionId === sessionId);
    const first = rows[0];
    const lastText = [...rows].reverse().find((entry) => typeof entry.turn?.text === "string");
    return {
      match: first.match,
      sessionId,
      requestCount: rows.length,
      toolCalls: (first.turn?.tool_calls ?? []).map((call) => call.name),
      returnedText: lastText?.turn?.text ?? null,
    };
  }),
  plan: {
    goal: finalPulse.project.goal,
    revision: finalPulse.project.revision,
    decisions: finalPulse.project.decisions,
    tasks: finalPulse.project.tasks,
    status: finalPulse.status.tasks,
  },
  contributions: contributions.map((entry) => ({
    contributionId: entry.record.contributionId,
    sourceKind: entry.record.sourceKind,
    sourceRef: entry.record.sourceRef,
    observation: entry.record.observation,
    readFootprintObservation: entry.record.readFootprintObservation,
    independentVerification: entry.record.independentVerification,
    status: entry.status,
    basisState: entry.basisState,
    latestDecision: entry.latestDecision?.record.decision ?? null,
    planChange: entry.latestDecision?.record.planChange ?? null,
    downstream: entry.downstream,
  })),
  assessedContributions: assessed.length,
  unassessedContributions: contributions.length - assessed.length,
  decisionQueue: finalPulse.pulse.decisionQueue,
  mechanicalNextActions: finalPulse.pulse.nextActions.mechanical,
  artifact: {
    path: finalPulse.artifact.path,
    present: finalPulse.artifact.present,
    sha256: finalPulse.artifact.sha256,
  },
  artifacts: ["deliverables/site-a.md", "deliverables/site-b-coastal.md", "deliverables/capacity-refresh.md"].map((relative) => {
    const file = join(RUN, "world", relative);
    return existsSync(file)
      ? { path: relative, present: true, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }
      : { path: relative, present: false, sha256: null };
  }),
  operatorAcceptance: acceptance === null
    ? null
    : {
        promoted: acceptance.promoted === true,
        taskId: acceptance.taskId,
        result: acceptance.result ?? null,
        after: acceptance.after ?? null,
        note: acceptance.note ?? null,
      },
  downstreamCompletion: downstream === null
    ? null
    : {
        records: downstream.records,
        revision: downstream.revision,
        projectHead: downstream.projectHead,
        tasks: downstream.tasks,
      },
  sessionFiles,
  limitations: [
    "The model is a deterministic Messages stand-in, not a language model. No cognition, quality, cost or comparative benefit is claimed.",
    "The native DSH subagents are real child sessions with real read tool calls; their content is scripted by the test.",
    "The product cannot observe a native subagent's read footprint; the contribution records what the principal declared and says so.",
    "No operator acceptance was performed, so site-a remains VERIFYING. This is a real Work state, not a completed promotion.",
    "The APS-C F/L/G paid comparison is BLOCKED: no APS spend authorization exists.",
  ],
};
writeFileSync(join(RUN, "run-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ run: RUN, summary: "run-summary.json", contributions: contributions.length, subagents: children.length })}\n`);
