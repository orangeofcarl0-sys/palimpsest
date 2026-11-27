import { readFileSync } from "node:fs";

export const name = "pnwf-maintenance-release";
export const inject = ["tools"];
const { reviewer } = JSON.parse(readFileSync(new URL("./role.json", import.meta.url)));
const string = { type: "string" };

export function apply(ctx) {
  function register(name, description, properties, required, action) {
    ctx.tools.register({
      name, description, parameters: { type: "object", properties, required, additionalProperties: false },
      output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
      async execute(args) {
        const res = await fetch("http://127.0.0.1:18080/pnwf/desk", {
          method: "POST", body: JSON.stringify({ action, ...args }),
        });
        return res.json();
      },
    });
  }
  register("release_archive", "Find archived records for the previous shift's Palimpsest PR #303 release. Omit record to list the catalogue.",
    { record: string }, [], "archive");
  if (reviewer) {
    register("release_return", "Return release records you have opened in this review of the pinned handover basis.",
      { basis: string, records: { type: "array", items: string } }, ["basis", "records"], "return");
  } else {
    register("release_contact", "Ask the previous release maintenance role to investigate a question using its PR #303 archive on an independent checkout.",
      { basis: string, question: string }, ["basis", "question"], "contact");
  }
}
