/**
 * LHAPE-C pilot recovery for the G condition only.
 *
 * G's first host start failed with a Windows process-initialization error before any model call,
 * attempt or artifact (0 tokens). This resets ONLY G's project state and lowers its session cap to
 * the aggregate budget still available. It does not touch F/L artifacts or state.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { installProduct, trustedDefaultPolicy } from "../../dist/src/product.js";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const RUN = resolve(String(args.get("run") ?? ""));
if (RUN === "") throw new Error("--run is required");
const world = join(RUN, "worlds", "G");
const state = join(RUN, "state-G");
rmSync(state, { recursive: true, force: true });

const standard = {
  statement: "Stay inside the declared write scope and leave the required package artifact.",
  clauses: [{ kind: "scope_respected" }],
  derivedFrom: ["LHAPE-C pilot G standard"],
  confirmed: true,
  notes: [],
};
const installed = installProduct(
  { tools: { register: () => () => undefined } },
  {
    projectId: "lhape-pilot",
    repository: world,
    stateDir: state,
    execution: "in-place",
    policy: trustedDefaultPolicy({ allowed_commands: [] }),
    toolProfile: "normal",
    standard,
    advanced: { concurrency: 2 },
  },
);
const head = execFileSync("git", ["-C", world, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
installed.controller.start({
  projectId: "lhape-pilot",
  goal: "Evaluate a multi-site energy deployment and produce ONE reviewable package covering technical capacity, vendor compliance, cost, implementation schedule, risk/uncertainty, and an integrated decision. Respect every binding requirement. Do not treat an unverified claim as accepted. Do not approve expenditure without authority.",
  headCommit: head,
  requirements: [
    { requirement_id: "R1", statement: "The package must name the deciding constraint for each site.", priority: "critical", acceptance_refs: [] },
    { requirement_id: "R2", statement: "A 2024 coastal column is not a current coastal certificate; an expected certificate is not a current certificate.", priority: "critical", acceptance_refs: [] },
  ],
  tasks: [
    {
      task_id: "package",
      objective: "Produce the complete multi-site energy deployment package in deliverables/package.md, including capacity, compliance, cost, schedule, risk and an integrated decision.",
      depends_on: [],
      write_paths: ["deliverables/package.md"],
      required_artifacts: ["deliverables/package.md"],
    },
  ],
});
await installed.dispose();

const pilotPath = join(RUN, "pilot.json");
const pilot = JSON.parse(readFileSync(pilotPath, "utf8"));
pilot.sessions = pilot.sessions.map((session) =>
  session.condition === "G" ? { ...session, maxTokens: 2_300_000 } : session,
);
pilot.budget = { ...pilot.budget, gCapAfterFAndL: 2_300_000 };
pilot.codeFreeze = execFileSync("git", ["-C", process.cwd(), "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
writeFileSync(pilotPath, `${JSON.stringify(pilot, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ reset: "G", head, gMaxTokens: 2_300_000 })}\n`);
