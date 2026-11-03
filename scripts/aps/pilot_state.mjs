/**
 * APS-C pilot — read the G condition's durable project state after the real-model session.
 *
 * This is a derived read, not a model run and not an acceptance. It shows whether the governed
 * condition actually used Work/Contribution and what remained pending.
 */
import { writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-pilot")));
const CONDITION = String(args.get("condition") ?? "G");
const WORLD = join(RUN, "worlds", CONDITION);
const STATE = join(RUN, `state-${CONDITION}`);

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
      statement: "Each selection or withholding decision must stay inside its declared write scope and cite the deciding constraint.",
      clauses: [{ kind: "scope_respected" }],
      derivedFrom: ["APS pilot G standard"],
      confirmed: true,
      notes: [],
    },
  },
);
const project = installed.controller.work.project();
const status = installed.controller.status();
const pulse = await installed.application.projectWorkspace.pulse();
const journal = await installed.projectWorkspace.journal("aps");
writeFileSync(
  join(RUN, `pilot-${CONDITION}-state.json`),
  `${JSON.stringify(
    {
      schema: "aps-pilot-state/v1",
      condition: CONDITION,
      note: "Derived product read after the real-model session. Not a new run and not an acceptance.",
      project: {
        goal: project.goal,
        revision: project.revision,
        digest: project.digest,
        headCommit: project.head_commit,
        tasks: project.tasks.map((task) => ({ taskId: task.task_id, objective: task.objective })),
      },
      status: {
        tasks: status.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
        attempts: status.attempts.map((attempt) => ({ attemptId: attempt.attempt_id, taskId: attempt.task_id, state: attempt.state })),
        nextAction: status.nextAction,
      },
      contributions: pulse.contributions.map((entry) => ({
        contributionId: entry.record.contributionId,
        sourceKind: entry.record.sourceKind,
        sourceRef: entry.record.sourceRef,
        observation: entry.record.observation,
        status: entry.status,
        basisState: entry.basisState,
        decisions: entry.decisions.map((decision) => decision.record.decision),
        planChange: entry.latestDecision?.record.planChange ?? null,
        downstream: entry.downstream,
      })),
      decisionQueue: pulse.decisionQueue,
      journal: journal.map((entry) => ({
        entryId: entry.entry.entryId,
        kind: entry.entry.kind,
        title: entry.entry.title,
        provenance: entry.entry.provenance,
      })),
    },
    null,
    2,
  )}\n`,
);
await installed.dispose();
process.stdout.write(`${JSON.stringify({ condition: CONDITION, revision: project.revision, tasks: status.tasks })}\n`);
