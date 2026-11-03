/**
 * LHAPE — read the final project reality after all host sessions.
 *
 * Read-only. It opens the same durable state the host used and asks the PRODUCT for its derived pulse,
 * execution view and continuation assessment. No model is called and no project fact is changed.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "lhape-run")));
const PROJECT = String(args.get("project") ?? "lhape");
const SCENARIO = String(args.get("scenario") ?? "main");
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");

const STANDARD = {
  statement: "Stay inside the declared write scope, leave the required artifact, and do not treat an unverified source claim as accepted.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["LHAPE deterministic host scenario"],
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

const project = installed.controller.work.project();
const status = installed.controller.status();
const pulse = await installed.application.projectWorkspace.pulse();
const workers = await installed.application.work.workers();
const results = await installed.application.work.results();
const journal = await installed.projectWorkspace.journal(PROJECT);

const artifacts = [
  "deliverables/capacity.md",
  "deliverables/cost.md",
  "deliverables/capacity-v2.md",
  "deliverables/cost-v2.md",
  "deliverables/integration.md",
  "deliverables/interrupted.md",
].map((relative) => {
  const file = join(WORLD, relative);
  if (!existsSync(file)) return { path: relative, present: false, sha256: null, text: null };
  const bytes = readFileSync(file);
  return { path: relative, present: true, sha256: createHash("sha256").update(bytes).digest("hex"), text: bytes.toString("utf8") };
});

const body = {
  schema: "lhape-final-pulse/v1",
  scenario: SCENARIO,
  note: "Derived product read after the deterministic host run. The model content is scripted; the host, workers and effects are real.",
  project: {
    goal: project.goal,
    revision: project.revision,
    digest: project.digest,
    headCommit: project.head_commit,
    decisions: project.decisions.map((decision) => ({
      decisionId: decision.decision_id,
      statement: decision.statement,
      rationale: decision.rationale,
    })),
    tasks: project.tasks.map((task) => ({
      taskId: task.task_id,
      objective: task.objective,
      dependsOn: task.depends_on,
      requiredArtifacts: task.required_artifacts,
    })),
  },
  status: {
    tasks: status.tasks.map((task) => ({ taskId: task.task_id, state: task.state })),
    attempts: status.attempts.map((attempt) => ({
      attemptId: attempt.attempt_id,
      taskId: attempt.task_id,
      state: attempt.state,
      orphaned: attempt.orphaned === true,
      taskState: attempt.task_state ?? null,
    })),
    nextAction: status.nextAction,
  },
  journal: journal.map((entry) => ({
    entryId: entry.entry.entryId,
    kind: entry.entry.kind,
    title: entry.entry.title,
    provenance: entry.entry.provenance,
    digest: entry.entry.digest,
  })),
  artifacts,
  pulse,
  workers,
  results,
};
writeFileSync(join(RUN, "final-pulse.json"), `${JSON.stringify(body, null, 2)}\n`);
await installed.dispose();
process.stdout.write(
  `${JSON.stringify({
    run: RUN,
    revision: project.revision,
    head: project.head_commit,
    tasks: status.tasks.map((task) => `${task.task_id}:${task.state}`),
    artifacts: artifacts.map((artifact) => `${artifact.path}:${String(artifact.present)}`),
  })}\n`,
);
