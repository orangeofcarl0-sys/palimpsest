/**
 * APS — complete and accept the tasks that the contribution's actual plan revision ADDED.
 *
 * This is a deterministic test-owned worker on the REAL Work/Promotion path (the same role as the
 * host principal, but no model). It exists to close the observable chain:
 *
 *     contribution -> REVISE_PLAN -> added tasks -> completed Work -> operator promotion
 *
 * The artifacts are deterministic; this is not a model result.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");

const ARTIFACTS = {
  "site-b-coastal": {
    path: "deliverables/site-b-coastal.md",
    text:
      "# Site B coastal selection\n\nNo vendor in the declared source carries a 2026 coastal rating. The only coastal column is 2024, and every entry is 'no'. The selection is withheld pending a current rating; Halcyon V4 has a 10-year warranty but is not coastal-rated.\n",
  },
  "capacity-refresh": {
    path: "deliverables/capacity-refresh.md",
    text:
      "# Capacity refresh\n\nRe-read sources/vendor-capabilities.csv. Columns: vendor, chemistry, min_c, max_c, warranty_years, coastal_2024, width_mm, lead_weeks. No 2026 coastal rating column is present. The earlier finding is confirmed.\n",
  },
};

function git(cwd, args) {
  return execFileSync("git", ["-c", "user.email=aps@fixture.invalid", "-c", "user.name=APS fixture", ...args], {
    cwd,
    encoding: "utf8",
  }).trim();
}

const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "aps",
    repository: WORLD,
    stateDir: STATE,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard: {
      statement: "Each selection must stay inside its declared write scope, name the vendor, and record the deciding constraint.",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["APS run profile"],
      confirmed: true,
      notes: [],
    },
  },
);

const records = [];
for (const taskId of Object.keys(ARTIFACTS)) {
  const artifact = ARTIFACTS[taskId];
  let status = installed.controller.status();
  const task = status.tasks.find((entry) => entry.task_id === taskId);
  if (task === undefined) {
    records.push({ taskId, state: "ABSENT", detail: "the task is not in the project" });
    continue;
  }
  if (task.state === "SATISFIED") {
    records.push({ taskId, state: "SATISFIED", detail: "already accepted" });
    continue;
  }
  let attemptId = status.attempts.find(
    (entry) => entry.task_id === taskId && (entry.state === "CREATED" || entry.state === "LEASED"),
  )?.attempt_id;
  for (let step = 0; step < 6 && attemptId === undefined; step += 1) {
    const event = installed.controller.step();
    status = installed.controller.status();
    attemptId = status.attempts.find(
      (entry) => entry.task_id === taskId && (entry.state === "CREATED" || entry.state === "LEASED"),
    )?.attempt_id;
    if (event === null && attemptId === undefined) break;
  }
  if (attemptId === undefined) {
    records.push({ taskId, state: task.state, detail: "no claimable attempt was created" });
    continue;
  }
  await installed.controller.claim(attemptId);
  mkdirSync(join(WORLD, "deliverables"), { recursive: true });
  writeFileSync(join(WORLD, artifact.path), artifact.text);
  git(WORLD, ["add", "-A"]);
  git(WORLD, ["commit", "-qm", `work: ${taskId}`]);
  const completed = await installed.controller.finish({ summary: `deterministic completion of ${taskId}` });
  installed.controller.step();
  const promotion = await installed.controller.promoteAttempt({ attemptId, gateId: "gate-release" });
  installed.controller.step();
  await installed.controller.reconcileProjectHead();
  const after = installed.controller.status();
  records.push({
    taskId,
    state: after.tasks.find((entry) => entry.task_id === taskId)?.state ?? "UNKNOWN",
    attemptId,
    resultCommit: completed.resultCommit ?? null,
    promotionId: promotion.promotionId,
    resultingHeadCommit: promotion.resultingHeadCommit,
    artifact: artifact.path,
  });
}

const final = installed.controller.status();
writeFileSync(
  join(RUN, "downstream-completion.json"),
  `${JSON.stringify(
    {
      schema: "aps-downstream-completion/v1",
      note: "Deterministic test-owned worker on the real Work/Promotion path; not a model result.",
      records,
      revision: final.revision,
      projectHead: final.headCommit,
      tasks: final.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
    },
    null,
    2,
  )}\n`,
);
process.stdout.write(`${JSON.stringify({ records, revision: final.revision, tasks: final.tasks })}\n`);
await installed.dispose();
