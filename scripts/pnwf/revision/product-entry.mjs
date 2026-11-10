import { readFileSync } from "node:fs";
import { launchDeployment as launch } from "../dist/src/advanced.js";

export * from "../dist/src/advanced.js";
export { inspectWorkRevision } from "../dist/src/product.js";

// Compose the trusted contract and the qualified transport. Tool registration stays ordinary.
export function launchDeployment(profile, options) {
  const taskObligations = JSON.parse(readFileSync(new URL("./task-obligations.json", import.meta.url)));
  return launch(profile, {
    ...options,
    host: {
      ...options.host,
      taskObligations,
      workWorkerPort: () => ({
        adapterId: "pnwf-revision-container",
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
}
