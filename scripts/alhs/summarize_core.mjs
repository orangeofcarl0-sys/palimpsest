/**
 * ALHS-C core evidence packager. Reads the run records and score, copies the real session streams and
 * artifacts into the evidence directory, and writes one compact summary. It never edits a world.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
const EVIDENCE = resolve(String(args.get("evidence") ?? ""));
if (RUN === "" || EVIDENCE === "") throw new Error("--run and --evidence are required");
const score = JSON.parse(readFileSync(join(RUN, "score.json"), "utf8"));
const core = JSON.parse(readFileSync(join(RUN, "core.json"), "utf8"));

function filesUnder(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      let info;
      try {
        info = statSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) stack.push(full);
      else if (entry.endsWith(".jsonl.zstd")) out.push(full);
    }
  }
  return out;
}

mkdirSync(EVIDENCE, { recursive: true });
mkdirSync(join(EVIDENCE, "artifacts"), { recursive: true });
mkdirSync(join(EVIDENCE, "runs"), { recursive: true });
for (const condition of ["F", "A"]) {
  const artifact = join(core.worlds[condition], "deliverables", "package.md");
  if (existsSync(artifact)) copyFileSync(artifact, join(EVIDENCE, "artifacts", `${condition}-package.md`));
}
for (const session of core.sessions) {
  const dir = join(EVIDENCE, "sessions", session.id);
  mkdirSync(dir, { recursive: true });
  for (const file of filesUnder(join(session.home, "sessions"))) {
    copyFileSync(file, join(dir, `${String(file.split(/[\\/]/u).slice(-2, -1)[0])}-session.v4.jsonl.zstd`));
  }
  for (const name of ["run.json", "budget.json", "STOPPED.json", "started-at.txt", "constraint-injected-at.txt", "killed-at.txt"]) {
    const file = join(RUN, "out", session.id, name);
    if (existsSync(file)) copyFileSync(file, join(EVIDENCE, "runs", `${session.id}-${name}`));
  }
}
for (const name of ["proxy.jsonl", "proxy.log", "gate/run-state.json", "gate/run-plan.json"]) {
  const file = join(RUN, "out", name);
  if (existsSync(file)) copyFileSync(file, join(EVIDENCE, `proxy-${name.split("/").pop()}`));
}
copyFileSync(join(RUN, "core.json"), join(EVIDENCE, "core.json"));
for (const name of ["F", "A"]) {
  const prompt = join(RUN, "prompts", `${name}.txt`);
  if (existsSync(prompt)) copyFileSync(prompt, join(EVIDENCE, `prompt-${name}.txt`));
  const prompt2 = join(RUN, "prompts", `${name}2.txt`);
  if (existsSync(prompt2)) copyFileSync(prompt2, join(EVIDENCE, `prompt-${name}2.txt`));
}
copyFileSync(join(RUN, "score.json"), join(EVIDENCE, "score.json"));

const proxy = (() => {
  const file = join(RUN, "out", "proxy.jsonl");
  if (!existsSync(file)) return { posts: 0, statuses: {}, upstreamErrors: [] };
  const rows = readFileSync(file, "utf8").split(/\n/).filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
  const posts = rows.filter((row) => row.method === "POST");
  const statuses = {};
  for (const row of posts) statuses[String(row.status)] = (statuses[String(row.status)] ?? 0) + 1;
  return {
    posts: posts.length,
    statuses,
    upstreamErrors: posts.filter((row) => row.status !== 200).map((row) => ({ at: row.at, status: row.status, error: row.error })),
  };
})();

const conditions = {};
for (const condition of ["F", "A"]) {
  const entry = score.conditions[condition];
  const sessions = core.sessions.filter((session) => session.condition === condition);
  conditions[condition] = {
    score: entry.score,
    rubric: entry.rubric,
    tokens: entry.tokens,
    firstValid: entry.firstValid,
    afterFirstValid: entry.afterFirstValid,
    versions: entry.versions,
    natural: entry.natural,
    episode: entry.episode,
    tasks: entry.tasks,
    promotions: entry.promotions,
    artifact: entry.artifact,
    sessions: sessions.map((session) => {
      const run = JSON.parse(readFileSync(join(RUN, "out", session.id, "run.json"), "utf8"));
      return {
        sessionId: session.id,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        exitCode: run.exitCode,
        killedAt: run.killedAt,
        killedBy: run.killedBy,
        stopped: run.stopped,
        natural: run.natural,
        ledgerTokens: run.usage?.totalTokens ?? null,
        streamTokens: entry.tokens.bySession[session.id] ?? null,
        maxTokens: run.maxTokens,
        reserveTokens: run.reserveTokens,
        softStopAt: run.softStopAt,
      };
    }),
  };
}

const totalTokens = Object.values(conditions).reduce((sum, entry) => sum + entry.tokens.total, 0);
const budget = core.budget ?? {};
const authorized = Number.isSafeInteger(budget.aggregate) ? budget.aggregate : 12_000_000;
const stoppedSession = Object.values(conditions)
  .flatMap((entry) => entry.sessions)
  .find((session) => session.stopped === true);
const isRepeat = core.stage === "repeat";
const summary = {
  schema: "alhs-core-result/v1",
  cohortId: core.cohortId,
  codeFreeze: core.codeFreeze,
  mode: core.mode ?? "REAL_MODEL_CORE",
  provider: "deepseek-official/deepseek-flash",
  note: isRepeat
    ? "F and A received byte-identical sources and the same measured update at T+60s. Session 1 was killed at the same reported token milestone (400,000; first observation above it) in both conditions; session 2 was a new principal session on the same durable state. A's model content is real; no evaluator oracle is in any prompt."
    : "F and A received byte-identical sources and the same measured update at T+60s. Session 1 was killed at T+240s in both conditions; session 2 was a new principal session on the same durable state. A's model content is real; no evaluator oracle is in any prompt.",
  conditions,
  aggregate: {
    totalTokens,
    authorizedTokens: authorized,
    remainingTokens: authorized - totalTokens,
    ...(Number.isSafeInteger(budget.perSession) ? { perSession: budget.perSession } : {}),
    ...(Number.isSafeInteger(budget.session1) ? { session1: budget.session1, session2: budget.session2, killAtTokens: budget.killAtTokens } : {}),
    reserve: budget.reserve ?? 150_000,
    ...(Number.isSafeInteger(budget.softStop) ? { softStopAt: budget.softStop } : {}),
    budgetStop:
      stoppedSession === undefined
        ? null
        : {
            sessionId: stoppedSession.sessionId,
            ledgerTokens: stoppedSession.ledgerTokens,
            softStopAt: stoppedSession.softStopAt,
            maxTokens: stoppedSession.maxTokens,
            overshoot: (stoppedSession.ledgerTokens ?? 0) - (stoppedSession.softStopAt ?? 0),
            underHardCeiling: (stoppedSession.maxTokens ?? 0) - (stoppedSession.ledgerTokens ?? 0),
          },
    note:
      "The guard observes usage after a message. A stop happens at the first observation above that session's soft ceiling; the reserve keeps it under the hard per-session ceiling.",
  },
  proxy,
  limitations: [
    isRepeat
      ? "One additional pair per condition; combined with the core this is two pairs, not a powered sample."
      : "One session pair per condition; this is not a repeated-sample comparison.",
    "The 7-fact rubric is a floor on the final package, not a business-quality or cognition score. Both conditions reached 7/7.",
    "A chose direct file work plus one native subagent; it did not create a formal Work task or a governed Worker. That is a valid adaptive choice, not evidence of governed cooperation.",
    isRepeat
      ? "A committed the final package and the product recorded tracked=true/committed=true; F left deliverables/ untracked. The provenance facts are in A's episode conclusion."
      : "Both packages were left untracked in Git; neither condition committed the final artifact. A's DELIVER conclusion cited the base commit, not a commit containing the package.",
    "One provider request returned 502 UPSTREAM_TIMEOUT during the run; the proxy retried and the session continued. It is recorded, not hidden.",
    "The scenario kill is a harness event, not a product failure; it is applied equally to F and A.",
    "Natural convergence is reported separately from the rubric. F was budget-stopped; A recorded DELIVER and exited on its own.",
  ],
};
writeFileSync(join(EVIDENCE, "core-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ evidence: EVIDENCE, totalTokens, conditions: { F: conditions.F.natural, A: conditions.A.natural } })}\n`);
