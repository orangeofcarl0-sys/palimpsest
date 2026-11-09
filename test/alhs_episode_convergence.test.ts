/**
 * ALHS-A — episode-level convergence over the existing project facts.
 *
 * These are deterministic qualifications of the PRODUCT mechanics, not observations of model
 * behaviour: the test records the same conclusion a principal would record and checks what the
 * product does with it. The scenario run shows a real DSH host using the same path.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import { installProduct } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";
import {
  evaluateEpisodeReadiness,
  validateEpisodeConclusion,
  type EpisodeReadiness,
} from "../src/project_continuity/index.js";

const gitObservation = vi.hoisted(() => ({ afterBlob: null as ((args: readonly string[]) => void) | null }));
vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFileSync: (...args: Parameters<typeof actual.execFileSync>) => {
    const result = Reflect.apply(actual.execFileSync, undefined, args);
    if (args[0] === "git" && args[1]?.[2] === "cat-file" && args[1][3] === "blob") gitObservation.afterBlob?.(args[1]);
    return result;
  } };
});

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const standard: ProjectStandard = Object.freeze({
  statement: "stay inside the declared write scope and leave the required artifact",
  clauses: Object.freeze([Object.freeze({ kind: "scope_respected" as const })]),
  derivedFrom: Object.freeze(["ALHS fixture"]),
  confirmed: true,
  notes: Object.freeze([]),
});

function workspace(name: string): { root: string; repo: string; stateDir: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), `palimpsest-alhs-${name}-`));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "README.md"), "# ALHS base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a SQLite handle; the OS reaps the temp tree */
    }
  });
  return {
    root,
    repo,
    stateDir: join(root, "state"),
    head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(),
  };
}

function install(repo: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "alhs",
      repository: repo,
      stateDir,
      execution: "in-place",
      standard,
      toolProfile: "normal",
    },
  );
  cleanups.push(() => void installed.dispose());
  return installed;
}

async function call(
  installed: ReturnType<typeof install>,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const definition = installed.tools.find((entry) => entry.name === name) as DshToolDefinition | undefined;
  if (definition === undefined) throw new Error(`missing tool ${name}`);
  const context: DshToolRunContext = {
    callId: `c-${name}`,
    rootCallId: `r-${name}`,
    arguments: args,
    name,
    signal: new AbortController().signal,
  };
  return (await definition.execute(args, context)) as Record<string, unknown>;
}

const TASKS = [
  {
    task_id: "capacity",
    objective: "Write the capacity assessment for site A.",
    depends_on: [],
    write_paths: ["docs/capacity.md"],
    required_artifacts: ["docs/capacity.md"],
  },
];

async function start(installed: ReturnType<typeof install>, head: string, tasks: readonly unknown[] = TASKS): Promise<void> {
  await call(installed, "palimpsest_start", {
    projectId: "alhs",
    goal: "produce a defensible multi-site deployment package",
    headCommit: head,
    tasks,
  });
}

type Conclude = {
  state: string;
  blockers: string[];
  detail: string;
  warnings?: string[];
  conclusion: {
    intent: string;
    conclusionId: string;
    check?: { artifacts?: Array<{ path: string; present: boolean; tracked: boolean; committed: boolean; commit?: string | null; digest?: string }> };
  } | null;
  episode: { state: string; current: boolean; changedSince: string[]; conclusion: { intent: string } | null } | null;
  session: { mayEnd: boolean; detail: string };
};

type Pulse = {
  episode: {
    state: string;
    current: boolean;
    changedSince: string[];
    conclusion: { intent: string; conclusionId: string } | null;
    readiness: { deliveryBlockers: string[]; awaitingOperator: string[]; mechanicalActions: string[] };
    detail: string;
  };
  openQuestions: Array<{ title: string }>;
  decisionQueue: Array<{ kind: string }>;
};

describe("ALHS-A episode conclusion", () => {
  it("refuses DELIVER while a planned task is still open, naming the contradiction", async () => {
    const { repo, head, stateDir } = workspace("open");
    const installed = install(repo, stateDir);
    await start(installed, head);
    writeFileSync(join(repo, "docs", "capacity.md"), "# Capacity\n\nSite A capacity assessment.\n");

    const refused = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The capacity assessment is complete and reviewable.",
      artifacts: ["docs/capacity.md"],
    })) as unknown as Conclude;
    expect(refused.state).toBe("REFUSED");
    expect(refused.blockers.join(" ")).toMatch(/capacity/iu);
    expect(refused.blockers.join(" ")).toMatch(/READY/iu);
    expect(refused.session.mayEnd).toBe(false);
  });

  it("refuses DELIVER when the named artifact does not exist", async () => {
    const { repo, head, stateDir } = workspace("missing-artifact");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    const refused = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "Everything is done.",
      artifacts: ["docs/does-not-exist.md"],
    })) as unknown as Conclude;
    expect(refused.state).toBe("REFUSED");
    expect(refused.blockers.join(" ")).toMatch(/does not exist/iu);
  });

  it("records WAIT_FOR_OPERATOR after delivery, and DELIVER stays refused until acceptance", async () => {
    const { repo, head, stateDir } = workspace("operator");
    const installed = install(repo, stateDir);
    await start(installed, head);
    await call(installed, "palimpsest_work", { action: "next" });
    await call(installed, "palimpsest_work", { action: "start" });
    writeFileSync(join(repo, "docs", "capacity.md"), "# Capacity\n\nSite A capacity assessment.\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "capacity"], { cwd: repo });
    const completed = (await call(installed, "palimpsest_work", {
      action: "complete",
      summary: "Capacity assessment written.",
    })) as { state: string; nextActions: string[] };
    expect(completed.state).toBe("COMPLETED");
    expect(installed.controller.status().tasks[0]!.state).toBe("VERIFYING");

    const deliver = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The capacity assessment is complete and reviewable.",
      artifacts: ["docs/capacity.md"],
    })) as unknown as Conclude;
    expect(deliver.state).toBe("REFUSED");
    expect(deliver.blockers.join(" ")).toMatch(/operator acceptance/iu);

    const waiting = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "WAIT_FOR_OPERATOR",
      statement: "The capacity assessment is delivered and awaits the operator's acceptance decision.",
      waitingOn: "operator acceptance of the delivered capacity assessment",
      artifacts: ["docs/capacity.md"],
    })) as unknown as Conclude;
    expect(waiting.state).toBe("RECORDED");
    expect(waiting.session.mayEnd).toBe(true);
    expect(waiting.conclusion?.intent).toBe("WAIT_FOR_OPERATOR");

    const pulse = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as unknown as Pulse;
    expect(pulse.episode.state).toBe("AWAITING_OPERATOR");
    expect(pulse.episode.current).toBe(true);
    expect(pulse.episode.readiness.awaitingOperator).toContain("task:capacity");

    // The conclusion is advisory: the task is still VERIFYING, not promoted.
    expect(installed.controller.status().tasks[0]!.state).toBe("VERIFYING");
    expect(installed.controller.status().promotions).toHaveLength(0);
  });

  it("delivers a lightweight project with no formal tasks, then reopens after a new project fact", async () => {
    const { repo, head, stateDir } = workspace("lightweight");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    mkdirSync(join(repo, "deliverables"), { recursive: true });
    writeFileSync(join(repo, "deliverables", "package.md"), "# Package\n\nA reviewable deployment package.\n");

    const delivered = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The deployment package is complete and covers the requested dimensions.",
      artifacts: ["deliverables/package.md"],
      evidenceRefs: ["commit:initial"],
    })) as unknown as Conclude;
    expect(delivered.state).toBe("RECORDED");
    expect(delivered.session.mayEnd).toBe(true);
    expect(delivered.warnings?.join(" ")).toMatch(/not tracked/iu);
    expect(delivered.conclusion?.check?.artifacts?.[0]).toMatchObject({
      path: "deliverables/package.md",
      present: true,
      tracked: false,
      committed: false,
    });

    const before = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as unknown as Pulse;
    expect(before.episode.state).toBe("DELIVERED");
    expect(before.episode.current).toBe(true);
    expect(before.openQuestions.every((question) => !question.title.startsWith("Episode conclusion"))).toBe(true);

    await installed.application.projectWorkspace!.recordJournalEntry({
      kind: "REFERENCE_NOTE",
      title: "New measured corridor constraint",
      body: "The site-B corridor was measured at 700 mm on 2026-11-03.",
      provenance: "field measurement",
    });

    const after = (await call(installed, "palimpsest_continuity", { action: "pulse" })) as unknown as Pulse;
    expect(after.episode.state).toBe("REOPENED");
    expect(after.episode.current).toBe(false);
    expect(after.episode.changedSince.join(" ")).toMatch(/journal/iu);
    expect(after.decisionQueue.some((item) => item.kind === "EPISODE_REOPENED")).toBe(true);
  });

  it("reports a committed artifact without a provenance warning", async () => {
    const { repo, head, stateDir } = workspace("committed");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    mkdirSync(join(repo, "deliverables"), { recursive: true });
    writeFileSync(join(repo, "deliverables", "package.md"), "# Package\n\nA committed deployment package.\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "package"], { cwd: repo });

    const delivered = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "DELIVER",
      statement: "The committed package is complete for this episode.",
      artifacts: ["deliverables/package.md"],
    })) as unknown as Conclude;
    expect(delivered.state).toBe("RECORDED");
    expect(delivered.warnings ?? []).toEqual([]);
    expect(delivered.conclusion?.check?.artifacts?.[0]).toMatchObject({
      path: "deliverables/package.md",
      present: true,
      tracked: true,
      committed: true,
    });
  });

  it("binds each DELIVER to the bytes of its current Git commit on the same Host", async () => {
    const { repo, head, stateDir } = workspace("artifact-head");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    const args = { action: "conclude", intent: "DELIVER", statement: "Deliver the current project artifacts.", artifacts: ["README.md"] };
    const deliver = async () => (await call(installed, "palimpsest_work", args)) as unknown as Conclude;
    expect((await deliver()).conclusion?.check?.artifacts?.[0]?.commit).toBe(head);

    writeFileSync(join(repo, "README.md"), "# Revised package\n");
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qam", "revise"], { cwd: repo });
    const revised = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim();
    const bytes = execFileSync("git", ["cat-file", "blob", `${revised}:README.md`], { cwd: repo });
    expect((await deliver()).conclusion?.check?.artifacts?.[0]).toMatchObject({
      commit: revised, committed: true, digest: createHash("sha256").update(bytes).digest("hex"),
    });

    gitObservation.afterBlob = (command) => {
      if (command[1] === repo && command[4] === `${revised}:README.md`) throw new Error("Git object read failed");
    };
    try {
      expect((await deliver()).conclusion?.check?.artifacts?.[0]).toMatchObject({ tracked: true, commit: null, committed: false });
    } finally {
      gitObservation.afterBlob = null;
    }

    gitObservation.afterBlob = (command) => {
      if (command[1] === repo && command[4] === `${revised}:README.md`) {
        gitObservation.afterBlob = null;
        execFileSync("git", ["update-ref", "HEAD", head, revised], { cwd: repo });
      }
    };
    try {
      expect((await deliver()).conclusion?.check?.artifacts?.[0]).toMatchObject({ commit: null, committed: false });
      expect(execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim()).toBe(head);
      expect((await deliver()).conclusion?.check?.artifacts?.[0]).toMatchObject({ tracked: true, commit: null, committed: false });
    } finally {
      gitObservation.afterBlob = null;
    }
  });

  it("CONTINUE requires a next step and does not pretend the episode ended", async () => {
    const { repo, head, stateDir } = workspace("continue");
    const installed = install(repo, stateDir);
    await start(installed, head, []);
    const withoutStep = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "CONTINUE",
      statement: "More work remains before the goal is handled.",
    })) as unknown as Conclude;
    expect(withoutStep.state).toBe("REFUSED");
    expect(withoutStep.blockers.join(" ")).toMatch(/nextStep/iu);

    const withStep = (await call(installed, "palimpsest_work", {
      action: "conclude",
      intent: "CONTINUE",
      statement: "More work remains before the goal is handled.",
      nextStep: "Measure the site-B corridor and update the vendor screening.",
    })) as unknown as Conclude;
    expect(withStep.state).toBe("RECORDED");
    expect(withStep.session.mayEnd).toBe(false);
  });

  it("a negative DELIVER is allowed only when it cites a recorded negative finding", () => {
    const readiness: EpisodeReadiness = evaluateEpisodeReadiness({
      tasks: [{ taskId: "survey", state: "FAILED" }],
      attempts: [],
      awaitingOperator: [],
      unresolvedQuestions: [],
      blockedEffects: [],
      negativeFindingRefs: ["journal:pje-negative"],
      mechanicalActions: [],
    });
    const withoutEvidence = validateEpisodeConclusion({
      conclusion: { intent: "DELIVER", statement: "The survey found no admissible unit." },
      readiness,
      artifactExists: undefined,
    });
    expect(withoutEvidence.ok).toBe(false);
    expect(withoutEvidence.blockers.join(" ")).toMatch(/negative finding/iu);

    const withEvidence = validateEpisodeConclusion({
      conclusion: {
        intent: "DELIVER",
        statement: "The survey found no admissible unit; the negative finding is recorded.",
        evidenceRefs: ["journal:pje-negative"],
      },
      readiness,
      artifactExists: undefined,
    });
    expect(withEvidence.ok).toBe(true);
  });
});
