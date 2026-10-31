/**
 * COG-1 §16 — A project-scoped WRITE must require the project that every READ requires.
 *
 * THE OBSERVED FAILURE (measured, not hypothesised). A real Palimpsest principal
 * was given the shipped `palimpsest_project` tool and asked to record a journal
 * entry. It had never called `palimpsest_start`, so the project had no ProjectIR.
 * Every READ refused with `unknown_project`:
 *
 *     palimpsest_project{action:"overview"}  -> Error: project "riversdale" has no ProjectIR
 *     palimpsest_status                       -> Error: project does not exist
 *     palimpsest_manage                       -> Error: project "riversdale" has no ProjectIR
 *
 * and the WRITE was ACCEPTED:
 *
 *     palimpsest_project{action:"journal", ...} -> pje-8a0e144be9490360b3e49577a4a23e3b
 *
 * That asymmetry is the defect this file pins. Durable project knowledge was
 * recorded into a project the product cannot load, and it becomes visible to any
 * later ProjectIR created under the same id — a silent cross-time adoption with no
 * provenance that it predates the project.
 *
 * WHY IT MATTERS FOR COG-1. The compounding chain is
 * earlier work -> retained asset -> discovery -> delivery -> use. A write that no
 * read can reach breaks the chain at its first link: the asset is durable but not
 * discoverable, and nothing in the write's response says so.
 *
 * The fence added is deliberately small and fail-closed: the SAME predicate the
 * reads already use (`readProject()`, which raises `unknown_project`). It grants no
 * new authority, creates no project, and changes no valid call.
 */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { launchDeployment, type Deployment } from "../src/deployment/index.js";

const closers: Array<() => Promise<void> | void> = [];
const dirs: string[] = [];

afterEach(async () => {
  while (closers.length > 0) await closers.pop()!();
  while (dirs.length > 0) {
    try {
      rmSync(dirs.pop()!, { recursive: true, force: true });
    } catch {
      // Windows refuses while a SQLite handle lingers; the run's global temp sweep
      // removes what is left (the directory carries the palimpsest- prefix for it).
    }
  }
});

function rig(): Deployment {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-cog1-workspace-fence-"));
  dirs.push(dir);
  const database = (name: string): string => join(dir, `${name}.sqlite`);
  const deployment = launchDeployment({
    schemaVersion: 1,
    profileId: "cog1-fence",
    projectId: "riversdale",
    localPeer: "peer-riversdale",
    transport: { namespace: "cog1-fence", databasePath: database("transport") },
    databases: {
      orchestration: database("orchestration"),
      ordarium: database("ordarium"),
      coordination: database("coordination"),
      transportCursors: database("cursors"),
      projectAssociations: database("associations"),
      projectJournal: database("journal"),
    },
  });
  closers.push(() => deployment.close());
  return deployment;
}

const journalWrite = {
  projectId: "riversdale",
  kind: "REFERENCE_NOTE" as const,
  title: "a note recorded before the project exists",
  body: "this entry must not be accepted against a project with no ProjectIR",
  provenance: "cog1-fence-test",
};

describe("COG-1 — the workspace write/read fence", () => {
  it("refuses a journal entry for a project that has no ProjectIR", async () => {
    const deployment = rig();
    const workspace = deployment.installed.projectWorkspace;
    expect(workspace).toBeDefined();

    // The reads already refuse; this is the predicate the write must share.
    await expect(workspace!.view()).rejects.toThrow(/has no ProjectIR/u);

    // THE FALSIFIER: before the fence this resolved with an entryId, and a durable
    // row existed in a project the product could not load.
    await expect(workspace!.recordJournalEntry(journalWrite)).rejects.toMatchObject({
      kind: "unknown_project",
    });

    // And nothing was durably written: a later `start` must not inherit knowledge
    // that predates the project. The journal read is the product's own accessor,
    // so an empty list here is the product's answer, not a store-level peek.
    const entries = await workspace!.journal();
    expect(entries).toEqual([]);
  });

  it("refuses an asset association for a project that has no ProjectIR", async () => {
    const deployment = rig();
    const workspace = deployment.installed.projectWorkspace;

    await expect(
      workspace!.associateAsset({
        projectId: "riversdale",
        assetKind: "REASONING_CELL",
        canonicalRef: { kind: "reasoning-cell", id: "rc-seeded-before-the-project" },
        associationKind: "MANUAL",
        provenance: "cog1-fence-test",
      }),
    ).rejects.toMatchObject({ kind: "unknown_project" });
  });

  it("still records a journal entry once the project exists", async () => {
    const deployment = rig();
    const workspace = deployment.installed.projectWorkspace;

    deployment.installed.controller.start({
      projectId: "riversdale",
      goal: "Improve participation and service accessibility over the next quarter.",
      tasks: [{ task_id: "t1", objective: "produce the plan", depends_on: [], write_paths: ["deliverables/**"], required_artifacts: [] }],
    });

    const entry = await workspace!.recordJournalEntry(journalWrite);
    expect(entry.entryId).toMatch(/^pje-/u);
    const entries = await workspace!.journal();
    expect(entries.map((view) => view.entry.entryId)).toContain(entry.entryId);

    /**
     * THE COMPOUNDING EDGE (COG-1 §16). The same deployment's MODEL surface must be
     * able to read the body back. Before the correction `history` returned only the
     * title and no action returned `body`, so a later agent could not discover what an
     * earlier agent recorded; the asset existed and was unreachable.
     */
    const projectTool = deployment.installed.tools.find((definition) => definition.name === "palimpsest_project");
    expect(projectTool).toBeDefined();
    const readBack = (await projectTool!.execute({ action: "journal_entries" }, {} as never)) as readonly {
      readonly entry: { readonly entryId: string; readonly body: string };
    }[];
    const found = readBack.find((view) => view.entry.entryId === entry.entryId);
    expect(found).toBeDefined();
    expect(found!.entry.body).toBe(journalWrite.body);
  });
});
