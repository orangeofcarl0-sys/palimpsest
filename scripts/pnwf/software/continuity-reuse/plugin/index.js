export const name = "pnwf-handover-review";
export const inject = ["tools"];

export function apply(ctx) {
  ctx.tools.register({
    name: "handover_readback",
    description: "Ask the maintenance verifier for its independent cold-handover check at an exact owner-accepted project SHA. This lookup has no write or release authority.",
    parameters: { type: "object", properties: { sha: { type: "string" }, question: { type: "string" } }, required: ["sha", "question"], additionalProperties: false },
    output: { schema: {}, render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }] },
    async execute(args) {
      const result = await fetch("http://127.0.0.1:18080/pnwf/desk", { method: "POST", body: JSON.stringify(args) });
      return result.json();
    },
  });
}
