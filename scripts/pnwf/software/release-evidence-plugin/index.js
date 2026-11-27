import { readFileSync } from "node:fs";
import { releaseContactBasis } from "./contact.js";

export const name = "pnwf-maintenance-release";
export const inject = ["tools"];
const { reviewer, pinnedBasis } = JSON.parse(readFileSync(new URL("./role.json", import.meta.url)));
const string = { type: "string" };

export function apply(ctx) {
  function register(name, description, properties, required, action) {
    ctx.tools.register({
      name, description, parameters: { type: "object", properties, required, additionalProperties: false },
      output: { schema: {}, render: (_args, value) => [{ type: "text", text: JSON.stringify(value) }] },
      async execute(args, context) {
        const res = await fetch("http://127.0.0.1:18080/pnwf/desk", {
          method: "POST", body: JSON.stringify({ action, ...args }),
        });
        const result = await res.json();
        if (reviewer && action === "return" && result.ok === true && result.basis === pinnedBasis &&
            args.basis === pinnedBasis && /^[0-9a-f]{64}$/u.test(result.receiptId ?? "")) context.concludeTurn();
        return result;
      },
    });
  }
  register("release_archive", "Find archived records for the previous shift's Palimpsest PR #303 release. Omit record to list the catalogue.",
    { record: string }, [], "archive");
  if (reviewer) {
    register("release_return", "Return the relevant records you opened for this pinned review. A valid return completes the review turn.",
      { basis: string, records: { type: "array", items: string } }, ["basis", "records"], "return");
  } else {
    register("release_contact", "Ask the previous release maintenance role to investigate a question using its PR #303 archive on an independent checkout of the full Git HEAD at the start of the handover.",
      { basis: releaseContactBasis, question: string }, ["basis", "question"], "contact");
  }
}
