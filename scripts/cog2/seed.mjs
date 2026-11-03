#!/usr/bin/env node
/**
 * COG-2 operator seeding. NOT a model tool and never counted as model behaviour.
 *
 *   node scripts/cog2/seed.mjs --dir <run dir> --mode matrix|inheritance
 *
 * matrix       all five prior conclusions are already project knowledge (C/D/positive control)
 * inheritance  only the three traps are present; the Round-1 model must produce the two lessons
 *
 * Creates the test-owned world, composes the real deployment in-process, creates the ProjectIR
 * through the controller's own `start`, and appends journal entries through the project workspace's
 * own write. Writes nothing to the real runtime home or any non-test resource.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  RIG,
  buildWorld,
  ensureDir,
  ensureSharedModules,
  seedProject,
  withDeployment,
  worldHead,
  writePalimpsestProfile,
} from "./rig.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const DIR = String(args.get("dir") ?? "");
const MODE = String(args.get("mode") ?? "");
if (DIR === "") throw new Error("--dir=<run dir> is required");
if (!["matrix", "inheritance"].includes(MODE)) throw new Error("--mode=matrix|inheritance is required");

const HOME = join(DIR, "home");
const STATE = join(DIR, "state");
const WORK = join(DIR, "work");
const UNIT = "cog2-project";
const PROJECT = "harrowgate";

const ENTRIES = [
  {
    kind: "NEGATIVE_RESULT",
    title: "2023 evening pilot failed",
    body:
      "Three Friday evening screenings in October-December 2023 drew 37, 23 and 19 people. The last scheduled minibus leaves the square at 18:40 and the pilot had no transport arrangement. Do not fund Friday evening opening again unless transport is in place.",
    provenance: "2023 pilot review",
    role: "relevant-negative",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "Saturday childcare raised attendance",
    body:
      "From September 2024, free childcare alongside the Saturday family workshop raised average attendance from about 27 in the first eight months of 2024 to about 40 in the last four. The family fund paid 180 pounds per session.",
    provenance: "2024 attendance review",
    role: "relevant-positive",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "East hall is climate-controlled",
    body:
      "The 2019 building survey recorded the east hall as climate-controlled and suitable for sensitive textiles and paper.",
    provenance: "2019 building survey, carried forward",
    role: "stale-claim",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "Members want evening events",
    body:
      "61 percent of members say transport is the main barrier and 44 percent say they would attend an evening event if transport were available. This supports an evening series.",
    provenance: "2025 member survey, headline figures",
    role: "misleading-claim",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "Website migration",
    body: "The website moved to a new domain in March 2024 and traffic rose 12 percent.",
    provenance: "2024 communications note",
    role: "irrelevant",
  },
];

buildWorld(WORK, { withNotes: false });
// This script seeds the JOURNAL carrier. The ordinary-file carrier is never present in the same
// world (and is not in its first commit), so the two conditions cannot be solved by reading the
// other one's copy.
ensureSharedModules(HOME);
const { deploymentPath } = writePalimpsestProfile(HOME, {
  unit: UNIT,
  stateDir: STATE,
  workDir: WORK,
  projectId: PROJECT,
  activation: "none",
});

const seeded = MODE === "matrix" ? ENTRIES : ENTRIES.filter((entry) => !["relevant-negative", "relevant-positive"].includes(entry.role));

const result = await withDeployment(
  { unit: UNIT, stateDir: STATE, workDir: WORK, projectId: PROJECT },
  async (deployment) => {
    const start = seedProject(deployment, {
      projectId: PROJECT,
      goal: "Reverse the attendance decline and produce a six-month programme plan within the programming budget.",
      headCommit: worldHead(WORK),
    });
    const journal = deployment.installed.projectWorkspace;
    if (journal === undefined) throw new Error("the deployment composed no project workspace");
    const recorded = [];
    for (const entry of seeded) {
      const written = await journal.recordJournalEntry({
        projectId: PROJECT,
        kind: entry.kind,
        title: entry.title,
        body: entry.body,
        provenance: entry.provenance,
      });
      recorded.push({
        entryId: written.entryId,
        kind: written.kind,
        title: written.title,
        role: entry.role,
        bodyDigest: written.body.length > 0 ? "recorded" : "empty",
      });
    }
    const view = await journal.view();
    const readBack = await journal.journal();
    return {
      startEventType: start.event_type,
      projectId: view.projectId,
      revision: view.revision,
      goal: view.goal,
      journalCount: readBack.length,
      recorded,
    };
  },
);

const record = {
  schema: "cog2-seed/v1",
  seededAt: new Date().toISOString(),
  mode: MODE,
  projectId: PROJECT,
  worldHead: worldHead(WORK),
  deploymentPath,
  entries: seeded.map((entry) => ({ kind: entry.kind, title: entry.title, role: entry.role, body: entry.body, provenance: entry.provenance })),
  readBack: result,
};
writeFileSync(join(DIR, "seed.json"), JSON.stringify(record, null, 2));
console.log(JSON.stringify({ mode: MODE, projectId: result.projectId, revision: result.revision, journalCount: result.journalCount, entries: result.recorded.length }));
