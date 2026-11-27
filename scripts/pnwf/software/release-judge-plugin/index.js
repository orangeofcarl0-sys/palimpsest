export const name = "pnwf-release-judge";
export const inject = ["tools"];

const string = { type: "string" };
export function apply(ctx) {
  function tool(name, action, description, properties) {
    ctx.tools.register({
      name, description,
      parameters: { type: "object", properties, required: Object.keys(properties), additionalProperties: false },
      output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
      async execute(args, context) {
        const response = await fetch("http://127.0.0.1:18080/pnwf/desk", {
          method: "POST", body: JSON.stringify({ action, ...args }),
        });
        const result = await response.json();
        if (action === "submit" && result.ok && result.remaining.length === 0) context.concludeTurn();
        return result;
      },
    });
  }
  tool("release_judge_cases", "list", "List the cases, the versioned rubric and its digest.", {});
  tool("release_judge_read", "read", "Read the numbered report or one independent evidence record for this case.",
    { caseId: string, part: { type: "string", enum: ["report", "release", "ci", "history"] } });
  tool("release_judge_submit", "submit", "Record all six judgments for the exact document hash, rubric version and rubric digest with report line citations.",
    { caseId: string, documentHash: string, rubricVersion: string, rubricDigest: string,
      judgments: { type: "array", items: { type: "object", additionalProperties: false,
        required: ["criterion", "verdict", "reason", "lines"], properties: {
          criterion: string, verdict: { type: "string", enum: ["PASS", "FAIL", "UNCERTAIN"] },
          reason: string, lines: { type: "array", items: { type: "integer" } },
        } } } });
}
