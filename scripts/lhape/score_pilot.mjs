/**
 * LHAPE-C pilot scorer. OUTSIDE the worlds; never mounted into a condition.
 *
 * It applies a small, pre-registered rubric to the final package. It is not an evaluator oracle in
 * the prompt and it does not score "model cognition"; it checks whether the requested business
 * artifact contains the required, observable facts and whether the measured constraint was used.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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
const pilot = JSON.parse(readFileSync(join(RUN, "pilot.json"), "utf8"));
const standard = {
  statement: "Stay inside the declared write scope and leave the required package artifact.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["LHAPE-C pilot G standard"],
  confirmed: true,
  notes: [],
};

function criteriaFor(text) {
  const lower = text.toLowerCase();
  const has900 = lower.includes("900");
  const rejects900 =
    !has900 ||
    /900[^.\n]{0,120}(not admissible|not allowed|excluded|cannot|ineligible|superseded|not usable)/u.test(lower) ||
    /(not admissible|not allowed|exclude|cannot use|ineligible)[^.\n]{0,120}900/u.test(lower);
  return [
    ["package_present", text.length > 200],
    ["both_sites", lower.includes("site a") && lower.includes("site b")],
    ["measured_700mm_used", /700\s*mm/u.test(lower)],
    ["baseline_900mm_rejected", rejects900],
    ["coastal_claim_not_accepted", /(2024|2026)/u.test(lower) && /(not current|not a current|no (?:current )?certificate|unverified|not on file|expected)/u.test(lower)],
    ["cost_and_schedule", /(cost|budget)/u.test(lower) && /(schedule|timeline|lead time)/u.test(lower)],
    ["risk_and_decision", /(risk|uncertainty)/u.test(lower) && /(decision|recommend)/u.test(lower)],
  ];
}

async function projectView(condition) {
  if (condition === "F") return null;
  const installed = installProduct(
    { tools: { register: () => () => undefined } },
    {
      projectId: "lhape-pilot",
      repository: join(RUN, "worlds", condition),
      stateDir: join(RUN, `state-${condition}`),
      execution: condition === "G" ? "worktree" : "in-place",
      policy: trustedDefaultPolicy({ allowed_commands: [] }),
      toolProfile: "normal",
      ...(condition === "G" ? { standard } : {}),
    },
  );
  const status = installed.controller.status();
  let pulse = null;
  try {
    pulse = await installed.application.projectWorkspace.pulse();
  } catch {
    pulse = null;
  }
  const view = {
    revision: installed.controller.work.project().revision,
    headCommit: installed.controller.work.project().head_commit,
    tasks: status.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
    contributions: pulse?.contributions?.length ?? 0,
    decisionQueue: pulse?.decisionQueue ?? [],
  };
  await installed.dispose();
  return view;
}

const conditions = {};
for (const condition of ["F", "L", "G"]) {
  const world = join(RUN, "worlds", condition);
  const artifactPath = join(world, "deliverables", "package.md");
  const text = existsSync(artifactPath) ? readFileSync(artifactPath, "utf8") : "";
  const criteria = criteriaFor(text);
  const passed = criteria.filter(([, ok]) => ok).length;
  let run = null;
  try {
    run = JSON.parse(readFileSync(join(RUN, "out", condition, "run.json"), "utf8"));
  } catch {
    run = null;
  }
  let acceptance = null;
  try {
    acceptance = JSON.parse(readFileSync(join(RUN, "out", condition, "operator-acceptance.json"), "utf8"));
  } catch {
    acceptance = null;
  }
  conditions[condition] = {
    condition,
    artifact: {
      path: "deliverables/package.md",
      present: text.length > 0,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: text.length === 0 ? null : createHash("sha256").update(text).digest("hex"),
    },
    criteria: Object.fromEntries(criteria),
    score: `${String(passed)}/${String(criteria.length)}`,
    run,
    operatorAcceptance: acceptance,
    project: await projectView(condition),
  };
}

const record = {
  schema: "lhape-pilot-score/v1",
  cohortId: pilot.cohortId,
  codeFreeze: pilot.codeFreeze,
  scoredAt: new Date().toISOString(),
  rubric: [
    "package present and non-trivial",
    "both sites addressed",
    "measured 700 mm constraint used",
    "baseline 900 mm unit rejected at site B where 900 is mentioned",
    "2024/expected coastal claim not accepted as current",
    "cost and schedule present",
    "risk and integrated decision present",
  ],
  conditions,
};
try {
  mkdirSync(join(RUN, "out"), { recursive: true });
} catch {
  /* exists */
}
writeFileSync(join(RUN, "score.json"), `${JSON.stringify(record, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ score: Object.fromEntries(Object.entries(conditions).map(([key, value]) => [key, { score: value.score, present: value.artifact.present, tokens: value.run?.usage?.totalTokens ?? null, stopped: value.run?.stopped ?? null, promoted: value.operatorAcceptance?.promoted ?? null }])) })}\n`);
