/** Host-only composition for the experiment. The ordinary host entry is unchanged. */
import { launchDeployment as launch } from "../dist/src/advanced.js";
import { guardRevisionWork } from "./revision-work.mjs";

export * from "../dist/src/advanced.js";

export function launchDeployment(profile, options) {
  const tools = options.context.tools;
  const deployment = launch(profile, {
    ...options,
    context: {
      ...options.context,
      tools: {
        register(definition) {
          return tools.register(definition.name === "palimpsest_work"
            ? guardRevisionWork(definition, () => deployment.installed.controller.work.project().tasks)
            : definition);
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
