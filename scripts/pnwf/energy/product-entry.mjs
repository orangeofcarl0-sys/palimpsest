/** Host-only composition for the experiment. The ordinary host entry is unchanged. */
import { join } from "node:path";
import { launchDeployment as launch } from "../dist/src/advanced.js";
import { assert, head, readJson } from "./contract.mjs";
import { briefPulseTool } from "./context-variants.mjs";
import { revisionReceipt, revisionReviewTool } from "./revision-review.mjs";
import { requireRevisionScope } from "./revision-scope.mjs";
import { guardRevisionWork } from "./revision-work.mjs";

export * from "../dist/src/advanced.js";

const { variant } = readJson(new URL("./variant.json", import.meta.url));

function settledRevision(controller, repository, taskId) {
  const status = controller.status();
  const verifying = new Set(status.tasks.filter(task => task.state === "VERIFYING" &&
    (taskId === undefined || task.task_id === taskId)).map(task => task.task_id));
  const matches = status.attempts.filter(attempt => attempt.state === "COMPLETED" && verifying.has(attempt.task_id));
  if (matches.length !== 1) return null;
  const id = matches[0].attempt_id;
  const record = controller.attemptWorkRecord(id);
  const basis = record?.envelope?.base_commit;
  assert(/^[a-zA-Z0-9_-]+$/u.test(id) && record?.state === "COMPLETED" &&
    basis === status.headCommit && basis === head(repository), "REVISION_REVIEW_WORK_BASIS_MISMATCH");
  requireRevisionScope(record.envelope.write_paths);
  return { repo: join(repository, ".palimpsest", "worlds", id), basis, candidate: record.report?.result_commit, settlement: "SETTLED" };
}

export function launchDeployment(profile, options) {
  const tools = options.context.tools;
  const controller = () => deployment.installed.controller;
  const resolveReview = taskId => settledRevision(controller(), profile.repository, taskId);
  const deployment = launch(profile, {
    ...options,
    context: {
      ...options.context,
      tools: {
        register(definition) {
          if (definition.name === "palimpsest_continuity" && variant === "brief-pulse") {
            return tools.register(briefPulseTool(definition));
          }
          if (definition.name !== "palimpsest_work") return tools.register(definition);
          const guarded = guardRevisionWork(definition, () => controller().work.project().tasks);
          if (variant !== "receipt") return tools.register(guarded);
          const unregisterWork = tools.register({
            ...guarded,
            async execute(input, context) {
              const value = await guarded.execute(input, context);
              const subject = input?.action === "run" ? resolveReview(input.taskId) : null;
              if (!subject) return value;
              const receipt = revisionReceipt(subject);
              return { ...value, resultCommit: receipt.candidate, revisionReceipt: receipt };
            },
          });
          const unregisterReview = tools.register(revisionReviewTool(resolveReview));
          return () => { unregisterReview?.(); unregisterWork?.(); };
        },
      },
    },
    host: {
      ...options.host,
      workWorkerPort: () => ({
        adapterId: "pnwf-energy-container-worker",
        async run({ workDir, context, signal }) {
          const response = await fetch("http://127.0.0.1:18080/pnwf/work", {
            method: "POST", signal, headers: { "content-type": "application/json" },
            body: JSON.stringify({ workDir, context }),
          });
          const outcome = await response.json();
          if (!["READY_FOR_SETTLEMENT", "NEEDS_ESCALATION", "HOST_FAILURE"].includes(outcome?.kind)) {
            throw new Error("WORKER_BROKER_RESPONSE_INVALID");
          }
          return outcome;
        },
      }),
    },
  });
  return deployment;
}
