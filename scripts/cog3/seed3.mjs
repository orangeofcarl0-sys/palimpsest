#!/usr/bin/env node
/**
 * COG-3 operator seeding. NOT a model tool and never counted as model behaviour.
 *
 *   node scripts/cog3/seed3.mjs --dir=<run dir> --carrier=journal|file
 *
 * journal  the P world: no ordinary prior-notes file; the historical conclusions are journal entries
 *          written through the product's own project workspace.
 * file     the S/F world: the same conclusions live in sources/prior-notes.md; no ProjectIR, no journal.
 *
 * Creates the test-owned world, composes the real deployment in-process for the journal carrier,
 * creates the ProjectIR through the controller's own `start`, and appends journal entries through the
 * project workspace's own write. Writes nothing to the real runtime home.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildWorld,
  ensureDir,
  ensureSharedModules,
  seedProject,
  withDeployment,
  worldHead,
  writeJson,
  writePalimpsestProfile,
} from "./rig3.mjs";

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.replace(/^--/u, "").split("=");
    return [key, rest.join("=")];
  }),
);
const DIR = String(args.get("dir") ?? "");
const CARRIER = String(args.get("carrier") ?? "");
if (DIR === "") throw new Error("--dir=<run dir> is required");
if (!["journal", "file"].includes(CARRIER)) throw new Error("--carrier=journal|file is required");

const HOME = join(DIR, "home");
const STATE = join(DIR, "state");
const WORK = join(DIR, "work");
const UNIT = "cog3-programme";
const PROJECT = "wrenfield";

const ENTRIES = [
  {
    kind: "NEGATIVE_RESULT",
    title: "2024 nitrate pilot failed at CRO",
    body:
      "1,200 nitrate frames were scanned in the CRO imaging suite in July 2024. Humidity rose to 62% by the afternoon, condensation appeared on 14 frames, and the conservator stopped the run. CRO is not suitable for nitrate in summer. Do not repeat the pilot unchanged.",
    provenance: "2024 pilot review",
    role: "prior-negative",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "2025 open day attendance",
    body: "The 2025 open day drew 2,340 visitors.",
    provenance: "communications note, September 2025",
    role: "irrelevant",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "Harrow estate permission outstanding",
    body:
      "Estate permission for collection C was still outstanding at the last check in August 2025. The solicitor said a decision was unlikely before autumn 2026; the liaison officer recorded a verbal assurance that it would be resolved by spring.",
    provenance: "rights check, August 2025",
    role: "uncertain",
  },
  {
    kind: "REFERENCE_NOTE",
    title: "Grant conditions",
    body:
      "The Heritage Digitisation Fund award is 84,000 pounds for January-June 2026. At least two collections must be digitised and published by 30 June. Orphan works need a rights risk assessment before publication. Nitrate handling must follow the conservation policy.",
    provenance: "grant award letter",
    role: "grant",
  },
];

if (CARRIER === "file") {
  buildWorld(WORK, { withNotes: true });
  ensureDir(join(WORK, "deliverables"));
  writeJson(join(DIR, "seed.json"), {
    schema: "cog3-seed/v1",
    carrier: "file",
    worldHead: worldHead(WORK),
    priorNotes: "sources/prior-notes.md",
  });
  console.log(JSON.stringify({ carrier: "file", head: worldHead(WORK).slice(0, 12) }));
} else {
  buildWorld(WORK, { withNotes: false });
  ensureSharedModules(HOME);
  const { deploymentPath } = writePalimpsestProfile(HOME, {
    unit: UNIT,
    stateDir: STATE,
    workDir: WORK,
    projectId: PROJECT,
    activation: "dsh",
  });
  const result = await withDeployment({ stateDir: STATE }, async (deployment) => {
    const start = seedProject(deployment, {
      projectId: PROJECT,
      goal: "Digitise and publish the priority collections within the 84,000 pound grant and the January-June 2026 window.",
      headCommit: worldHead(WORK),
    });
    const journal = deployment.installed.projectWorkspace;
    if (journal === undefined) throw new Error("the deployment composed no project workspace");
    const recorded = [];
    for (const entry of ENTRIES) {
      const written = await journal.recordJournalEntry({
        projectId: PROJECT,
        kind: entry.kind,
        title: entry.title,
        body: entry.body,
        provenance: entry.provenance,
      });
      recorded.push({ entryId: written.entryId, kind: written.kind, title: written.title, bodyBytes: written.body.length, role: entry.role });
    }
    const view = await journal.view();
    const readBack = await journal.journal();
    return {
      startEventType: start.event_type,
      projectId: view.projectId,
      revision: view.revision,
      goal: view.goal,
      journalCount: readBack.length,
      bodies: readBack.map((entry) => ({ entryId: entry.entry.entryId, kind: entry.entry.kind, title: entry.entry.title, bodyBytes: entry.entry.body.length })),
      recorded,
    };
  });
  writeJson(join(DIR, "seed.json"), {
    schema: "cog3-seed/v1",
    carrier: "journal",
    seededAt: new Date().toISOString(),
    projectId: PROJECT,
    worldHead: worldHead(WORK),
    deploymentPath,
    entries: ENTRIES,
    readBack: result,
  });
  console.log(JSON.stringify({ carrier: "journal", projectId: result.projectId, revision: result.revision, journalCount: result.journalCount }));
}
writeFileSync(join(DIR, "seed.complete"), "1\n");
