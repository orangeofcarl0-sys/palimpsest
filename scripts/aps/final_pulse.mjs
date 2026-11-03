/**
 * APS real-host run — read the FINAL project reality after all principal sessions.
 *
 * This opens the same durable state the host used and asks the PRODUCT for its derived pulse. It
 * does not score a model and does not modify the project.
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
const RUN = resolve(String(args.get("run") ?? join(process.env.HOME ?? ".", "aps-run")));
const WORLD = join(RUN, "world");
const STATE = join(RUN, "state");

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
const project = installed.controller.work.project();
const status = installed.controller.status();
const pulse = await installed.application.projectWorkspace.pulse();
const journal = await installed.projectWorkspace.journal("aps");
const artifactPath = join(WORLD, "deliverables", "site-a.md");
const artifact = existsSync(artifactPath) ? readFileSync(artifactPath) : null;
writeFileSync(
  join(RUN, "final-pulse.json"),
  `${JSON.stringify(
    {
      schema: "aps-final-pulse-run/v1",
      note: "Derived product read after the deterministic host run. No model result is claimed.",
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
        attempts: status.attempts.map((attempt) => ({ attemptId: attempt.attempt_id, taskId: attempt.task_id, state: attempt.state })),
        nextAction: status.nextAction,
      },
      journal: journal.map((entry) => ({
        entryId: entry.entry.entryId,
        kind: entry.entry.kind,
        title: entry.entry.title,
        provenance: entry.entry.provenance,
        digest: entry.entry.digest,
      })),
      artifact: {
        path: "deliverables/site-a.md",
        present: artifact !== null,
        sha256: artifact === null ? null : createHash("sha256").update(artifact).digest("hex"),
        text: artifact === null ? null : artifact.toString("utf8"),
      },
      pulse,
    },
    null,
    2,
  )}\n`,
);
await installed.dispose();
process.stdout.write(`${JSON.stringify({ run: RUN, pulse: "final-pulse.json", revision: project.revision })}\n`);
