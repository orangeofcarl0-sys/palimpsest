/**
 * ALHS deterministic host summary.
 *
 * Reads the product's own derived state after the run and writes the evidence record. It makes no
 * model call and accepts nothing: the operator promotions already happened through the ordinary
 * operator path.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
if (RUN === "") throw new Error("--run is required");
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");
const PROJECT = "alhs";

const STANDARD = {
  statement:
    "Stay inside the declared write scope, leave the required artifact, and do not treat an unverified source claim as accepted.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["ALHS deterministic host scenario"],
  confirmed: true,
  notes: [],
};

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: PROJECT,
    repository: WORLD,
    stateDir: STATE,
    execution: "worktree",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: STANDARD,
  },
);

const status = installed.controller.status();
const pulse = await installed.application.projectWorkspace.pulse();
const results = await installed.application.work.results({ taskId: "cost" });
const journal = await installed.projectWorkspace.journal(PROJECT);
const taskByAttempt = new Map(status.attempts.map((attempt) => [attempt.attempt_id, attempt.task_id]));
const promotionFacts = (() => {
  try {
    return installed.controller.promotions.promotionFactsSync();
  } catch {
    return [];
  }
})();
const promotions = promotionFacts.map((fact) => ({
  promotionId: fact.promotionId,
  taskId: taskByAttempt.get(fact.attemptId) ?? null,
  attemptId: fact.attemptId,
  sourceCommit: fact.sourceCommit,
  resultingHeadCommit: fact.resultingHeadCommit,
}));

function artifact(relative) {
  const file = join(WORLD, relative);
  if (!existsSync(file)) return { path: relative, present: false, sha256: null, text: null };
  const bytes = readFileSync(file);
  return {
    path: relative,
    present: true,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    text: bytes.toString("utf8"),
  };
}

const capacity = artifact("deliverables/capacity.md");
const costV2 = artifact("deliverables/cost-v2.md");
const costBaseline = artifact("deliverables/cost.md");
const result = results.results[0] ?? null;
const oldCommit = result?.resultCommit ?? null;
const reuse = result?.reuse ?? null;

function exitCode(name) {
  const file = join(RUN, "out", `session-${name}`, "exit-code.txt");
  if (!existsSync(file)) return null;
  const value = Number(readFileSync(file, "utf8").trim());
  return Number.isSafeInteger(value) ? value : null;
}

const exits = Object.fromEntries(["A1", "A2", "A3", "A4"].map((name) => [name, exitCode(name)]));
const naturalExit = Object.values(exits).every((code) => code === 0) && !existsSync(join(RUN, "STOPPED.json"));

const summary = {
  schema: "alhs-host-run/v1",
  mode: "DETERMINISTIC_MODEL_SUBSTITUTE_REAL_HOST",
  note:
    "The DSH host, worker processes, Git effects, Palimpsest Work/Promotion and operator actions are real. The model content is a deterministic Messages stand-in; this run makes no cognitive, quality or cost claim.",
  project: {
    id: PROJECT,
    revision: installed.controller.work.project().revision,
    headCommit: installed.controller.work.project().head_commit,
  },
  tasks: status.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
  attempts: status.attempts.map((attempt) => ({
    attemptId: attempt.attempt_id,
    taskId: attempt.task_id,
    state: attempt.state,
    taskState: attempt.task_state ?? null,
  })),
  promotions,
  episode: {
    state: pulse.episode.state,
    current: pulse.episode.current,
    conclusion: pulse.episode.conclusion,
    readiness: pulse.episode.readiness,
    changedSince: pulse.episode.changedSince,
  },
  reuse,
  oldResult: {
    taskId: result?.taskId ?? null,
    taskState: result?.taskState ?? null,
    compatibility: result?.compatibility ?? null,
    currentness: result?.currentness ?? null,
    resultCommit: oldCommit,
    actions: result?.actions ?? null,
  },
  artifacts: {
    capacity,
    costV2,
    costBaseline,
    costV2ReusesVendorPrice: costV2.text !== null && /1200\s*EUR/u.test(costV2.text),
    costV2UsesMeasurement: costV2.text !== null && /700\s*mm/u.test(costV2.text),
    costV2NamesOldCommit: costV2.text !== null && oldCommit !== null && costV2.text.includes(oldCommit),
  },
  journal: journal.map((entry) => ({
    entryId: entry.entry.entryId,
    kind: entry.entry.kind,
    title: entry.entry.title,
    provenance: entry.entry.provenance,
  })),
  naturalExit,
  sessionExits: exits,
  checks: {
    baselineCostWasProduced:
      status.attempts.some((attempt) => attempt.task_id === "cost" && attempt.state === "COMPLETED"),
    capacityPromoted: promotions.some((promotion) => promotion.taskId === "capacity-v2"),
    costV2Promoted: promotions.some((promotion) => promotion.taskId === "cost-v2"),
    oldCostRetiredNotPromoted:
      status.tasks.find((task) => task.task_id === "cost")?.state === "STALE" &&
      !promotions.some((promotion) => promotion.taskId === "cost"),
    reuseFactsPresent:
      reuse !== null &&
      reuse.unaffectedPaths.includes("deliverables/cost.md") &&
      reuse.conflictedPaths.includes("deliverables/assumptions.md"),
    deliveredEpisode: pulse.episode.state === "DELIVERED" && pulse.episode.current === true,
  },
};

await installed.dispose();
writeFileSync(join(RUN, "alhs-summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ summary: join(RUN, "alhs-summary.json"), checks: summary.checks, naturalExit })}\n`);
