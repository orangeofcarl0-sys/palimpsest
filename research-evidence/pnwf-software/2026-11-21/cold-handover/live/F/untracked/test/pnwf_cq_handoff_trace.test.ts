/**
 * PNWF-CQ handoff trace — an accepted direct delivery must survive a restart as a traversable
 * handoff, not as an open question or an unresolvable episode id.
 *
 * The first case is the REAL archived gRPC project from
 * `docs/engineering/GRPC-AUTONOMOUS-CONTINUITY.md` ("真实项目的接受与接续"): its Work and Journal
 * SQLite snapshots plus the Git bundle are restored into a temporary directory, so the regression
 * measures the exact project that failed rather than a lookalike. The second case builds a new
 * project through the same public product path, proving the repair is not archive-specific.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import type { OperatorAuthorityPort } from "../src/project_review/types.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ARCHIVE = join(REPO, "research-evidence", "pnwf-software", "2026-11-19", "autonomous-continuity", "live");
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups.reverse()) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "the declared result exists and every write stays inside its task scope",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["PNWF-CQ handoff trace fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

const authority: OperatorAuthorityPort = {
  policyRef: { policyId: "test-verified-operator", version: "1" },
  authorize: (actor) => ({ authorized: actor === "operator:alice", role: actor === "operator:alice" ? "operator" : "unknown" }),
};

function tempRoot(name: string): string {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-pnwf-cq-handoff-${name}-`));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a SQLite handle; the OS reaps the temp tree */
    }
  });
  return root;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function install(input: {
  readonly name: string;
  readonly projectId: string;
  readonly repository: string;
  readonly stateDir: string;
  readonly operatorAuthority?: OperatorAuthorityPort | undefined;
}): ReturnType<typeof installProduct> {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: input.projectId,
      repository: input.repository,
      stateDir: input.stateDir,
      execution: "in-place",
      standard,
      toolProfile: "normal",
      ...(input.operatorAuthority === undefined ? {} : { operatorAuthority: input.operatorAuthority }),
    },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

async function call(installed: ReturnType<typeof installProduct>, name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const definition = installed.tools.find((entry) => entry.name === name) as DshToolDefinition | undefined;
  if (definition === undefined) throw new Error(`missing tool ${name}`);
  const context: DshToolRunContext = {
    callId: `c-${name}`,
    rootCallId: `r-${name}`,
    name,
    arguments: args,
    signal: new AbortController().signal,
  };
  return (await definition.execute(args, context)) as Record<string, unknown>;
}

type TraceItem = {
  readonly id: string;
  readonly standing: string;
  readonly title: string;
  readonly detail: string;
  readonly sourceRefs: readonly string[];
  readonly currentApplicability?: string | undefined;
};
type TracePulse = {
  episode: {
    state: string;
    current: boolean;
    changedSince: readonly string[];
    conclusion: { conclusionId: string } | null;
    deliveredVersion?: string | null;
    acceptedVersion?: string | null;
  };
  openQuestions: TraceItem[];
  episodeConclusions: TraceItem[];
  recordedObservations: TraceItem[];
  acceptedAssets: TraceItem[];
  decisionQueue: Array<{ kind: string; ref: string }>;
};

function expectTraversableHandoff(input: {
  readonly pulse: TracePulse;
  readonly summary: {
    readonly basis: { readonly headCommit: string };
    readonly acceptedResults: readonly TraceItem[];
    readonly episodeConclusions: readonly TraceItem[];
    readonly recordedObservations: readonly TraceItem[];
    readonly openQuestions: readonly TraceItem[];
  };
  readonly conclusionId: string;
  readonly conclusionJournalId: string;
  readonly verificationJournalId: string;
  readonly delivered: string;
}): void {
  const { pulse, summary, conclusionId, conclusionJournalId, verificationJournalId, delivered } = input;
  expect(summary.basis.headCommit).toBe(delivered);
  expect(summary.openQuestions).toEqual([]);
  expect(pulse.openQuestions).toEqual([]);

  const accepted = summary.acceptedResults.find((item) => item.sourceRefs.includes(`commit:${delivered}`));
  expect(accepted).toMatchObject({ standing: "ACCEPTED_FOR_PURPOSE", currentApplicability: "APPLICABLE" });
  expect(accepted?.sourceRefs).toContain(`journal:${verificationJournalId}`);

  const historical = summary.episodeConclusions.find((item) => item.id === `episode:${conclusionId}`);
  expect(historical).toBeDefined();
  expect(historical?.sourceRefs).toEqual(
    expect.arrayContaining([`journal:${conclusionJournalId}`, `commit:${delivered}`, `journal:${verificationJournalId}`]),
  );
  expect(historical?.detail).toContain(delivered);
  expect(historical?.currentApplicability).toBe("APPLICABLE");

  const verification = summary.recordedObservations.find((item) => item.id === `journal:${verificationJournalId}`);
  expect(verification).toMatchObject({ standing: "OBSERVED_SOURCE" });
  expect(verification?.sourceRefs).toContain(`commit:${delivered}`);

  expect(pulse.episode).toMatchObject({
    state: "DELIVERED",
    current: true,
    deliveredVersion: delivered,
    acceptedVersion: delivered,
  });
  expect(pulse.episode.changedSince).toEqual([]);
  expect(pulse.decisionQueue).toEqual([]);
  expect(pulse.episodeConclusions.map((item) => item.id)).toContain(`episode:${conclusionId}`);
  expect(pulse.recordedObservations.map((item) => item.id)).toContain(`journal:${verificationJournalId}`);
}

describe("PNWF-CQ handoff trace: archived accepted direct project", () => {
  it("resolves the old conclusion, its delivered commit, the current accepted commit and the version note", async () => {
    const root = tempRoot("archive");
    const repository = join(root, "world");
    const stateDir = join(root, "state");
    mkdirSync(repository, { recursive: true });
    mkdirSync(stateDir, { recursive: true });
    git(repository, "init", "-q");
    git(repository, "fetch", "--quiet", join(ARCHIVE, "fleet.bundle"), "refs/heads/accepted");
    git(repository, "checkout", "--quiet", "--detach", "FETCH_HEAD");
    const accepted = git(repository, "rev-parse", "HEAD");
    expect(accepted).toBe("95b83e71ee9a37041b9918b5e8b797eebabf69c9");
    copyFileSync(join(ARCHIVE, "owners", "palimpsest.sqlite"), join(stateDir, "palimpsest.sqlite"));
    copyFileSync(join(ARCHIVE, "owners", "journal.sqlite"), join(stateDir, "journal.sqlite"));

    const installed = install({ name: "archive", projectId: "grpc-migration-continuation", repository, stateDir });
    const summary = await installed.application.projectWorkspace!.summary();
    const pulse = (await installed.application.projectWorkspace!.pulse()) as unknown as TracePulse;
    expectTraversableHandoff({
      pulse,
      summary,
      conclusionId: "episode-e7050e9ddf64ccebde7f08f6",
      conclusionJournalId: "pje-ee0141283028401089832410680085bb",
      verificationJournalId: "pje-d0c977aae7bb8bfeca9159f76e14a7d1",
      delivered: accepted,
    });

    const byEpisode = await installed.application.projectWorkspace!.explain("episode:episode-e7050e9ddf64ccebde7f08f6");
    expect(byEpisode.found).toBe(true);
    expect(byEpisode.item?.id).toBe("episode:episode-e7050e9ddf64ccebde7f08f6");
    expect(byEpisode.item?.sourceRefs).toContain("commit:95b83e71ee9a37041b9918b5e8b797eebabf69c9");

    const byBareId = await installed.application.projectWorkspace!.explain("episode-e7050e9ddf64ccebde7f08f6");
    expect(byBareId.found).toBe(true);

    const byJournal = await installed.application.projectWorkspace!.explain("journal:pje-d0c977aae7bb8bfeca9159f76e14a7d1");
    expect(byJournal.found).toBe(true);
    expect(byJournal.standing).toBe("OBSERVED_SOURCE");
    expect(byJournal.item?.detail).toContain(`Accepted project version ${accepted}`);

    const byCommit = await installed.application.projectWorkspace!.explain(`commit:${accepted}`);
    expect(byCommit.found).toBe(true);
    expect(byCommit.item?.currentApplicability).toBe("APPLICABLE");
  });
});

describe("PNWF-CQ handoff trace: a new project gets the same shape", () => {
  it("keeps a genuine open question visible while the accepted delivery remains traversable", async () => {
    const root = tempRoot("new");
    const repository = join(root, "repo");
    const stateDir = join(root, "state");
    mkdirSync(join(repository, "docs"), { recursive: true });
    writeFileSync(join(repository, "README.md"), "# base\n");
    git(repository, "init", "-q");
    git(repository, "add", "-A");
    git(repository, "-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "base");
    const base = git(repository, "rev-parse", "HEAD");

    const first = install({ name: "new", projectId: "pnwf-cq-handoff-new", repository, stateDir, operatorAuthority: authority });
    await call(first, "palimpsest_start", {
      projectId: "pnwf-cq-handoff-new",
      goal: "keep a traversable handoff after acceptance",
      headCommit: base,
      tasks: [],
    });

    writeFileSync(join(repository, "docs", "result.md"), "# Delivered result\n");
    git(repository, "add", "-A");
    git(repository, "-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "direct delivery");
    const delivered = git(repository, "rev-parse", "HEAD");

    const concluded = (await call(first, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The direct committed result is the delivery for this episode.",
      artifacts: ["docs/result.md"],
    })) as {
      state: string;
      conclusion: { conclusionId: string; check: { artifacts: Array<{ commit?: string | null }> } } | null;
    };
    expect(concluded.state).toBe("RECORDED");
    expect(concluded.conclusion?.check.artifacts[0]?.commit).toBe(delivered);
    const conclusionId = concluded.conclusion!.conclusionId;

    const verification = await first.application.projectWorkspace!.recordJournalEntry({
      projectId: "pnwf-cq-handoff-new",
      kind: "REFERENCE_NOTE",
      title: "Release verification",
      body: `Verified the delivered result at ${delivered}.`,
      provenance: "Independent release verifier / DIRECT_BASIS",
      relatedRefs: [{ kind: "git_commit", id: delivered }],
    });

    const current = first.controller.work.project();
    first.controller.planReconciled(
      { tasks: current.tasks.map((task) => ({ ...task })), reason: "accept the delivered direct basis" },
      { headAdvance: { source: "DIRECT_BASIS", toHead: delivered, operator: "operator:alice", reason: "owner accepted the delivered result" } },
    );
    await first.dispose();

    const restarted = install({ name: "new-restart", projectId: "pnwf-cq-handoff-new", repository, stateDir, operatorAuthority: authority });
    const summary = await restarted.application.projectWorkspace!.summary();
    const pulse = (await restarted.application.projectWorkspace!.pulse()) as unknown as TracePulse;
    const conclusionEntry = (await restarted.application.projectWorkspace!.journal()).find(({ entry }) =>
      entry.body.includes(`"conclusionId":"${conclusionId}"`),
    );
    expect(conclusionEntry).toBeDefined();
    expectTraversableHandoff({
      pulse,
      summary,
      conclusionId,
      conclusionJournalId: conclusionEntry!.entry.entryId,
      verificationJournalId: verification.entryId,
      delivered,
    });

    // A real open question remains a question; the verification record does not.
    await restarted.application.projectWorkspace!.recordJournalEntry({
      projectId: "pnwf-cq-handoff-new",
      kind: "OPEN_QUESTION",
      title: "Which deployment target is authoritative?",
      body: "The owner has not yet chosen the target.",
      provenance: "operator question",
    });
    const after = (await restarted.application.projectWorkspace!.pulse()) as unknown as TracePulse;
    expect(after.openQuestions.map((item) => item.title)).toContain("Which deployment target is authoritative?");
    expect(after.openQuestions.map((item) => item.title)).not.toContain("Release verification");
    expect(after.decisionQueue).toContainEqual(expect.objectContaining({ kind: "OPEN_QUESTION" }));
    expect(after.decisionQueue.some((item) => item.kind === "EPISODE_REOPENED")).toBe(true);
  });
});
