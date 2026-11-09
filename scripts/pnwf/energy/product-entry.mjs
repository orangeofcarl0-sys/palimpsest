/** Host-only composition for the experiment. The ordinary host entry is unchanged. */
import { launchDeployment as launch } from "../dist/src/advanced.js";

export * from "../dist/src/advanced.js";

export function launchDeployment(profile, options) {
  return launch(profile, {
    ...options,
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
}
