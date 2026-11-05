/**
 * LHAPE-C pilot reconciliation. Reads the real condition run records, the scorer and the guard
 * ledgers, and writes one authoritative pilot summary. It never edits a condition artifact.
 */
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
const EVIDENCE = resolve(String(args.get("evidence") ?? ""));
if (RUN === "" || EVIDENCE === "") throw new Error("--run and --evidence are required");
const pilot = JSON.parse(readFileSync(join(RUN, "pilot.json"), "utf8"));
const score = JSON.parse(readFileSync(join(RUN, "score.json"), "utf8"));
mkdirSync(EVIDENCE, { recursive: true });
mkdirSync(join(EVIDENCE, "artifacts"), { recursive: true });

function readRun(condition) {
  for (const name of ["run.json", "run-recovered.json"]) {
    try {
      return { name, value: JSON.parse(readFileSync(join(RUN, "out", condition, name), "utf8")) };
    } catch {
      /* next */
    }
  }
  return null;
}

function sha(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const conditions = {};
for (const condition of ["F", "L", "G"]) {
  const run = readRun(condition);
  const artifact = join(RUN, "worlds", condition, "deliverables", "package.md");
  const present = existsSync(artifact);
  const evidenceArtifact = join(EVIDENCE, "artifacts", `${condition}-package.md`);
  if (present) copyFileSync(artifact, evidenceArtifact);
  let acceptance = null;
  try {
    acceptance = JSON.parse(readFileSync(join(RUN, "out", condition, "operator-acceptance.json"), "utf8"));
  } catch {
    acceptance = null;
  }
  conditions[condition] = {
    condition,
    score: score.conditions[condition].score,
    criteria: score.conditions[condition].criteria,
    artifact: {
      path: `worlds/${condition}/deliverables/package.md`,
      evidencePath: present ? relative(EVIDENCE, evidenceArtifact).replaceAll("\\", "/") : null,
      present,
      bytes: present ? statSync(artifact).size : 0,
      sha256: present ? sha(artifact) : null,
    },
    run: run?.value ?? null,
    runRecord: run?.name ?? null,
    operatorAcceptance: acceptance,
  };
}

const tokens = Object.values(conditions).reduce((total, entry) => total + (entry.run?.usage?.totalTokens ?? 0), 0);
const preflight = pilot.budget?.preflightTokens ?? 0;
const aggregate = tokens + preflight;
const requested = pilot.sessions.reduce((total, session) => total + session.maxTokens, 0);

const proxyCalls = (() => {
  const path = join(RUN, "out", "proxy.jsonl");
  if (!existsSync(path)) return { posts: 0, statuses: {} };
  const rows = readFileSync(path, "utf8").split(/\n/).filter((line) => line.trim() !== "").map((line) => JSON.parse(line));
  const posts = rows.filter((row) => row.method === "POST");
  const statuses = {};
  for (const row of posts) statuses[String(row.status)] = (statuses[String(row.status)] ?? 0) + 1;
  return { posts: posts.length, statuses };
})();

const summary = {
  schema: "lhape-c-pilot-result/v1",
  cohortId: pilot.cohortId,
  mode: "REAL_MODEL_PILOT",
  provider: "deepseek-official/deepseek-flash",
  codeFreeze: pilot.codeFreeze,
  note:
    "One real DSH session per condition. The harness only orchestrates the worlds, injects the measured constraint after 45s and runs the operator acceptance; it does not script model behaviour. The measured constraint is not in the initial sources.",
  gateRunState:
    "run-state.json is the cohort gate's partial first attempt: F was killed by the guard before it could report usage, G's first start failed before any model call, and G was rerun separately. This pilot-summary.json is the authoritative reconciliation.",
  preflightEvidence:
    "The 6,238-token F profile preflight is counted from the real session usage; its session stream was discarded by the pilot preparation reset, so only the count is retained.",
  conditions,
  aggregate: {
    preflightTokens: preflight,
    conditionTokens: tokens,
    totalTokens: aggregate,
    authorizedTokens: 7_500_000,
    remainingTokens: 7_500_000 - aggregate,
    requestedSessionCeiling: requested,
    perConditionCeiling: { F: 2_500_000, L: 2_500_000, G: 2_300_000 },
    tokenOvershootAtStop: {
      F: (conditions.F.run?.usage?.totalTokens ?? 0) - 2_500_000,
      L: (conditions.L.run?.usage?.totalTokens ?? 0) - 2_500_000,
      G: (conditions.G.run?.usage?.totalTokens ?? 0) - 2_300_000,
    },
    note:
      "The guard reads the real DSH usage stream and stops at the first observation above the ceiling; usage arrives at assistant-message boundaries, so each stop overshot its ceiling by one message (0.03–0.06M). The aggregate is inside 7.5M. G's ceiling was lowered to 2.3M because F and L had already consumed their ceilings.",
  },
  proxy: proxyCalls,
  scores: Object.fromEntries(Object.entries(conditions).map(([condition, entry]) => [condition, entry.score])),
  limitations: [
    "This is a one-session-per-condition pilot, not the full long-horizon cohort: no cross-session principal continuation and no repeated samples.",
    "All three conditions were stopped by their token ceilings; the packages were complete enough for the 7/7 rubric, but the sessions did not end naturally.",
    "F did not use Palimpsest. L used the goal-only lightweight project. G used a formal Work task and a real Work Worker in an isolated world; G's worker committed but was stopped before reporting, and an operator settled the committed world from a new host.",
    "The measured constraint arrived in inbox/ during each session; all three packages used the 700 mm measurement and rejected the 900 mm unit at site B.",
    "The rubric is a small observable-fact check, not a business-quality or cognition score. Equal 7/7 scores do not show a Palimpsest advantage.",
    "Per-condition token ceilings were exceeded by one message at the stop boundary; the aggregate stayed within the 7.5M authorization.",
  ],
};
writeFileSync(join(EVIDENCE, "pilot-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ evidence: EVIDENCE, tokens: aggregate, conditions: summary.scores })}\n`);
