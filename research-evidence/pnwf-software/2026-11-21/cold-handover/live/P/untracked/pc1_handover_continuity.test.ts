/**
 * Handover continuity regression.
 *
 * The first half projects a recorded DELIVER at commit A while the project has since accepted
 * commit B. It pins the identities a later session needs: the conclusion id, its journal entry, the
 * delivered artifact commit, the current accepted version and the verifier's source note.
 *
 * The second half replays the REAL archived gRPC handover. The archive is restored from its Git
 * bundle and owner databases through the existing archive tool, then read through the product. It
 * reproduces the reported failure directly instead of approximating it with a new fixture.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import {
  episodeConclusionBody,
  evaluateEpisodeReadiness,
  makeEpisodeConclusion,
  makeProjectContinuityService,
  type EpisodeReadiness,
} from "../src/project_continuity/index.js";
import type { ProjectIr } from "../src/schema/models.js";
import { materializeProjectJournalEntry, type ProjectJournalViewEntry } from "../src/project_workspace/index.js";
import { launchDeployment } from "../src/deployment/launch.js";
import { parseDeploymentProfile } from "../src/deployment/profile.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups.reverse()) fn();
});

const EMPTY_READINESS: EpisodeReadiness = evaluateEpisodeReadiness({
  tasks: [],
  attempts: [],
  awaitingOperator: [],
  unresolvedQuestions: [],
  blockedEffects: [],
  negativeFindingRefs: [],
  mechanicalActions: [],
});

function projectAt(revision: number, digest: string, headCommit: string): ProjectIr {
  return {
    schema_version: 1,
    project_id: "handover",
    goal: "keep a traceable handover",
    requirements: [],
    decisions: [],
    tasks: [],
    head_commit: headCommit,
    revision,
    parent_revision: revision === 0 ? null : revision - 1,
    parent_digest: revision === 0 ? null : "parent",
    digest,
    committed_at: "2026-11-20T00:00:00.000Z",
  } as unknown as ProjectIr;
}

describe("PC1 handover continuity", () => {
  it("keeps the old conclusion, its delivered commit, the current version and the verifier note distinct", async () => {
    const delivered = "a".repeat(40);
    const accepted = "b".repeat(40);
    const conclusion = makeEpisodeConclusion({
      conclusion: {
        intent: "DELIVER",
        statement: "The direct delivery is ready for the owner's acceptance.",
        artifacts: ["docs/delivery.md"],
        evidenceRefs: [`commit:${delivered}`],
      },
      readiness: EMPTY_READINESS,
      basis: { projectRevision: 1, projectDigest: "old-digest", headCommit: delivered },
      recordedAt: "2026-11-20T01:00:00.000Z",
      artifactStates: [
        {
          path: "docs/delivery.md",
          present: true,
          tracked: true,
          committed: true,
          digest: "delivered-digest",
          source: "WORKTREE",
          commit: delivered,
          detail: "committed at HEAD",
        },
      ],
    });
    const conclusionEntry = materializeProjectJournalEntry({
      projectId: "handover",
      kind: "REFERENCE_NOTE",
      title: "Episode conclusion: DELIVER",
      body: episodeConclusionBody(conclusion),
      provenance: `episode:${conclusion.conclusionId}`,
      createdAt: "2026-11-20T01:00:00.000Z",
    });
    const versionEntry = materializeProjectJournalEntry({
      projectId: "handover",
      kind: "REFERENCE_NOTE",
      title: "Release verification",
      body: `Verified the delivered bytes and accepted project version ${accepted}.`,
      provenance: "independent release verifier / DIRECT_BASIS",
      relatedRefs: [{ kind: "git_commit", id: accepted }],
      createdAt: "2026-11-20T02:00:00.000Z",
    });
    const entries: readonly ProjectJournalViewEntry[] = [{ entry: conclusionEntry }, { entry: versionEntry }];
    const basis = { projectRevision: 2, projectDigest: "new-digest", headCommit: accepted };
    const service = makeProjectContinuityService({
      work: {
        project: () => projectAt(2, "new-digest", accepted),
        status: () => ({
          revision: 2,
          headCommit: accepted,
          schedulerState: "RUNNING",
          tasks: [],
          attempts: [],
          evidence: [],
          promotions: [],
          promotionFence: [],
        }),
        promotionFacts: () => [],
      },
      workspace: {
        journal: async () => entries,
        openLoops: async () => [],
      },
      authority: { operatorIntentAdmission: false, sourceIntake: "operator_only", promotion: "operator_only" },
      clock: () => "2026-11-20T03:00:00.000Z",
    });

    const summary = await service.summary();
    expect(summary.openQuestions).toEqual([]);
    expect(summary.episodeConclusions).toHaveLength(1);
    expect(summary.episodeConclusions[0]).toMatchObject({
      id: `episode:${conclusion.conclusionId}`,
      standing: "AGENT_INTERPRETATION",
    });
    expect(summary.episodeConclusions[0]!.sourceRefs).toEqual(
      expect.arrayContaining([`journal:${conclusionEntry.entryId}`, `commit:${delivered}`]),
    );
    expect(summary.episodeConclusions[0]!.detail).toContain(delivered);
    expect(summary.acceptedVersions).toHaveLength(1);
    expect(summary.acceptedVersions[0]).toMatchObject({ id: `version:${accepted}`, standing: "ACCEPTED_FOR_PURPOSE" });
    expect(summary.acceptedVersions[0]!.sourceRefs).toEqual(
      expect.arrayContaining([`commit:${accepted}`, `journal:${versionEntry.entryId}`]),
    );
    expect(summary.references).toHaveLength(1);
    expect(summary.references[0]).toMatchObject({ id: `journal:${versionEntry.entryId}`, standing: "OBSERVED_SOURCE" });

    const old = await service.explain(conclusion.conclusionId);
    expect(old.found).toBe(true);
    expect(old.item?.id).toBe(`episode:${conclusion.conclusionId}`);
    expect(old.item?.sourceRefs).toEqual(
      expect.arrayContaining([`journal:${conclusionEntry.entryId}`, `commit:${delivered}`]),
    );
    expect(old.basis.headCommit).toBe(accepted);

    const oldByJournal = await service.explain(`journal:${conclusionEntry.entryId}`);
    expect(oldByJournal.found).toBe(true);
    expect(oldByJournal.item?.id).toBe(`episode:${conclusion.conclusionId}`);

    const note = await service.explain(`journal:${versionEntry.entryId}`);
    expect(note.found).toBe(true);
    expect(note.item?.id).toBe(`journal:${versionEntry.entryId}`);
    expect(note.standing).toBe("OBSERVED_SOURCE");
    expect(note.item?.sourceRefs).toEqual(expect.arrayContaining([`commit:${accepted}`]));

    const version = await service.explain(`commit:${accepted}`);
    expect(version.found).toBe(true);
    expect(version.item?.id).toBe(`version:${accepted}`);

    const deliveredCommit = await service.explain(`commit:${delivered}`);
    expect(deliveredCommit.found).toBe(true);
    expect(deliveredCommit.item?.id).toBe(`episode:${conclusion.conclusionId}`);
  });

  it("replays the archived gRPC handover from its real owners without losing the old trace", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-handover-archive-"));
    const restored = join(root, "restored");
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const archive = join(REPO, "research-evidence/pnwf-software/2026-11-19/autonomous-continuity/live");
    execFileSync(
      process.execPath,
      ["scripts/pnwf/software/autonomy-archive.mjs", `--verify=${archive}`, `--restore=${restored}`],
      { cwd: REPO, stdio: "pipe" },
    );
    const profile = parseDeploymentProfile(JSON.parse(readFileSync(join(restored, "profile.json"), "utf8")));
    const deployment = launchDeployment(profile, {
      context: { tools: { register: () => () => undefined } } as never,
    });
    try {
      const workspace = deployment.installed.application.projectWorkspace;
      expect(workspace).toBeDefined();
      const accepted = "95b83e71ee9a37041b9918b5e8b797eebabf69c9";
      const oldConclusion = "episode-e7050e9ddf64ccebde7f08f6";
      const oldJournal = "pje-ee0141283028401089832410680085bb";
      const versionNote = "pje-d0c977aae7bb8bfeca9159f76e14a7d1";

      const pulse = await workspace!.pulse();
      expect(pulse.basis.headCommit).toBe(accepted);
      expect(pulse.episode.conclusion?.conclusionId).toBe(oldConclusion);
      expect(pulse.episode.journalEntryId).toBe(oldJournal);
      expect(pulse.episode.current).toBe(false);
      expect(pulse.episode.changedSince.join(" ")).toMatch(/project revision moved/iu);
      expect(pulse.openQuestions).toEqual([]);
      expect(pulse.references).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: `journal:${versionNote}`, standing: "OBSERVED_SOURCE" }),
        ]),
      );
      expect(pulse.acceptedVersions).toEqual(
        expect.arrayContaining([expect.objectContaining({ id: `version:${accepted}` })]),
      );
      expect(pulse.decisionQueue.some((item) => item.kind === "OPEN_QUESTION")).toBe(false);

      const summary = await workspace!.summary();
      expect(summary.openQuestions).toEqual([]);
      expect(summary.acceptedVersions[0]!.sourceRefs).toEqual(
        expect.arrayContaining([`commit:${accepted}`, `journal:${versionNote}`]),
      );
      expect(summary.episodeConclusions[0]!.sourceRefs).toEqual(
        expect.arrayContaining([`journal:${oldJournal}`, `commit:${accepted}`]),
      );

      const old = await workspace!.explain(oldConclusion);
      expect(old.found).toBe(true);
      expect(old.item?.id).toBe(`episode:${oldConclusion}`);
      expect(old.item?.sourceRefs).toEqual(
        expect.arrayContaining([`journal:${oldJournal}`, `commit:${accepted}`]),
      );
      expect(old.item?.detail).toContain(accepted);
      expect(old.basis.headCommit).toBe(accepted);

      const note = await workspace!.explain(`journal:${versionNote}`);
      expect(note.found).toBe(true);
      expect(note.item?.id).toBe(`journal:${versionNote}`);
      expect(note.standing).toBe("OBSERVED_SOURCE");
      expect(note.item?.sourceRefs).toEqual(expect.arrayContaining([`commit:${accepted}`]));

      const version = await workspace!.explain(`commit:${accepted}`);
      expect(version.found).toBe(true);
      expect(version.item?.id).toBe(`version:${accepted}`);

      const capsule = await workspace!.contextCapsule({ maxBytes: 8_192 });
      expect(capsule.text).toContain(oldConclusion);
      expect(capsule.text).toContain(accepted);
      expect(capsule.text).not.toContain("Fleet rollout verification: Fleet source");
    } finally {
      await deployment.close();
    }
  });
});
