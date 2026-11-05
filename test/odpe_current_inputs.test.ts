/**
 * ODPE-A — current reality as a delivered input.
 *
 * The PWRS-R runs showed the gap this file pins: a measured source existed in the canonical tree,
 * the attempt's basis did not contain it, and the only product response was a boolean the model had
 * to set. These tests exercise the ODPE-A path end to end at the owner level:
 *
 *   - the observation distinguishes untracked / tracked-modified / committed-since-basis inputs and
 *     carries a content digest for each;
 *   - an unreadable repository is UNAVAILABLE, never an empty "no change";
 *   - the context manifest binds the exact digest and exposes a pull-only handle;
 *   - the pull delivers those bytes, and refuses to deliver NEW bytes under the old binding.
 *
 * Deterministic; no model, no network.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { makeContextService, type ContextServicePorts } from "../src/context/service.js";
import { observeProjectInputs, readProjectInput } from "../src/work/unseen_inputs.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups.reverse()) fn();
});

function git(repo: string, args: readonly string[]): string {
  return execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
}

function workspace(): { readonly repo: string; readonly base: string; readonly head: string } {
  const repo = mkdtempSync(join(tmpdir(), "palimpsest-odpe-inputs-"));
  cleanups.push(() => {
    try {
      rmSync(repo, { recursive: true, force: true });
    } catch {
      /* windows keeps the directory busy; the OS reaps it */
    }
  });
  git(repo, ["init", "-q", "-b", "main"]);
  git(repo, ["config", "user.email", "odpe@example.invalid"]);
  git(repo, ["config", "user.name", "odpe"]);
  git(repo, ["config", "core.autocrlf", "false"]);
  mkdirSync(join(repo, "docs"), { recursive: true });
  writeFileSync(join(repo, "docs", "spec.md"), "# spec\n\nbaseline assumption: 1200 mm\n", "utf8");
  git(repo, ["add", "."]);
  git(repo, ["commit", "-q", "-m", "baseline"]);
  const base = git(repo, ["rev-parse", "HEAD"]);
  // Reality changes three ways after the basis.
  writeFileSync(join(repo, "inbox-measured.md"), "measured corridor: 700 mm\n", "utf8");
  writeFileSync(join(repo, "docs", "spec.md"), "# spec\n\nbaseline assumption: 1200 mm\n\nedited after the basis\n", "utf8");
  writeFileSync(join(repo, "docs", "after.md"), "committed after the basis\n", "utf8");
  git(repo, ["add", "docs/after.md"]);
  git(repo, ["commit", "-q", "-m", "after the basis"]);
  return { repo, base, head: git(repo, ["rev-parse", "HEAD"]) };
}

describe("ODPE-A — project input observation", () => {
  it("names untracked, tracked-modified and committed-since-basis inputs with exact digests", () => {
    const { repo, base, head } = workspace();
    const observation = observeProjectInputs({ repository: repo, baseCommit: base });
    expect(observation.state).toBe("OBSERVED");
    expect(observation.headCommit).toBe(head);
    const byPath = new Map(observation.inputs.map((entry) => [entry.path, entry]));

    const untracked = byPath.get("inbox-measured.md");
    expect(untracked?.identity).toBe("UNTRACKED");
    expect(untracked?.content).toBe("WORKTREE");
    expect(untracked?.digest).toBe(createHash("sha256").update("measured corridor: 700 mm\n").digest("hex"));

    const modified = byPath.get("docs/spec.md");
    expect(modified?.identity).toBe("TRACKED_MODIFIED");
    expect(modified?.content).toBe("WORKTREE");

    const committed = byPath.get("docs/after.md");
    expect(committed?.identity).toBe("COMMITTED_SINCE_BASE");
    expect(committed?.content).toBe("COMMIT");
    expect(committed?.revision).toBe(head);
    expect(committed?.digest).toBe(createHash("sha256").update("committed after the basis\n").digest("hex"));

    // The limitations are stated, not implied away.
    expect(observation.limitations.join(" ")).toMatch(/ignored files/iu);
    expect(observation.limitations.join(" ")).toMatch(/relevance/iu);
  });

  it("reports an unobservable repository as UNAVAILABLE instead of an empty observation", () => {
    const observation = observeProjectInputs({ repository: join(tmpdir(), "does-not-exist-odpe"), baseCommit: "0".repeat(40) });
    expect(observation.state).toBe("UNAVAILABLE");
    expect(observation.inputs).toEqual([]);
    expect(observation.limitations.join(" ")).toMatch(/UNKNOWN, not an absence/iu);
  });

  it("delivers the exact bytes once, and refuses to substitute changed bytes", () => {
    const { repo, base } = workspace();
    const observation = observeProjectInputs({ repository: repo, baseCommit: base });
    const input = observation.inputs.find((entry) => entry.path === "inbox-measured.md")!;
    const delivered = readProjectInput({
      repository: repo,
      path: input.path,
      content: input.content,
      revision: input.revision,
      expectedDigest: input.digest!,
    });
    expect(delivered.state).toBe("DELIVERED");
    if (delivered.state !== "DELIVERED") throw new Error("unreachable");
    expect(delivered.text).toBe("measured corridor: 700 mm\n");

    writeFileSync(join(repo, "inbox-measured.md"), "measured corridor: 650 mm\n", "utf8");
    const changed = readProjectInput({
      repository: repo,
      path: input.path,
      content: input.content,
      revision: input.revision,
      expectedDigest: input.digest!,
    });
    expect(changed.state).toBe("CHANGED");
    if (changed.state !== "CHANGED") throw new Error("unreachable");
    expect(changed.currentDigest).not.toBe(input.digest);
    expect(changed.detail).toMatch(/NEW fact/iu);
  });
});

describe("ODPE-A — current inputs reach the attempt context", () => {
  function serviceFor(repo: string, base: string): { service: ReturnType<typeof makeContextService>; ports: ContextServicePorts } {
    let stored: import("../src/context/index.js").ContextManifest | null = null;
    const ports = {
      projectId: "p-odpe",
      project: () => ({
        revision: 1,
        headCommit: base,
        tasks: [
          {
            taskId: "package",
            objective: "write the deployment package",
            requiredArtifacts: ["package.md"],
            writePaths: ["package.md"],
            dependsOn: [],
          },
        ],
      }),
      attempt: () => ({ attemptId: "attempt-odpe", taskId: "package", state: "RUNNING" }),
      attempts: () => [],
      evidence: () => [],
      scanLexical: async () => [],
      taskEnvelope: () => ({ envelope_id: "env-1", base_commit: base, write_paths: ["package.md"], required_artifacts: ["package.md"] } as never),
      completionContractForEnvelope: () => ({ verification: { required: false } }),
      mechanicalCheckSummary: () => [],
      hasStandard: () => false,
      promotionFacts: () => [],
      attemptCreatedEventId: () => 1,
      reworkProvenanceBefore: () => [],
      originResult: () => null,
      appendManifest: (input: { readonly manifest: import("../src/context/index.js").ContextManifest }) => {
        stored = input.manifest;
      },
      existingManifest: (manifestId: string) => (stored?.manifest_id === manifestId ? stored : null),
      projectGoal: () => "a correct package",
      requirementStatements: () => [],
      decisionStatements: () => [],
      projectInputs: () => observeProjectInputs({ repository: repo, baseCommit: base }),
      readProjectInput: (input: {
        readonly path: string;
        readonly content: "WORKTREE" | "COMMIT" | "ABSENT";
        readonly revision: string;
        readonly expectedDigest?: string | undefined;
      }) => readProjectInput({ repository: repo, ...input }),
    } as unknown as ContextServicePorts;
    return { service: makeContextService(ports), ports };
  }

  it("binds the digest and exposes a pull-only handle; the pull returns those bytes", async () => {
    const { repo, base } = workspace();
    const { service } = serviceFor(repo, base);
    const context = await service.workWorkerContext("attempt-odpe");
    expect(context.compiled.inputObservation).toBe("OBSERVED");
    const bound = context.compiled.inputs ?? [];
    expect(bound.map((entry) => entry.path)).toContain("inbox-measured.md");
    expect(bound.find((entry) => entry.path === "inbox-measured.md")?.digest).toMatch(/^[0-9a-f]{64}$/u);

    const handles = context.compiled.handles.map((entry) => entry.handle);
    expect(handles).toContain("@ctx/input/inbox-measured.md");

    const pulled = await service.fetch("attempt-odpe", "@ctx/input/inbox-measured.md");
    expect(pulled?.kind).toBe("input");
    if (pulled === undefined || pulled.kind !== "input") throw new Error("unreachable");
    expect(pulled.body.state).toBe("DELIVERED");
    if (pulled.body.state !== "DELIVERED") throw new Error("unreachable");
    expect(pulled.body.text).toBe("measured corridor: 700 mm\n");
  });

  it("a manifest is never silently rewritten, and a moved input is refused on pull", async () => {
    const { repo, base } = workspace();
    const { service } = serviceFor(repo, base);
    const first = await service.workWorkerContext("attempt-odpe");
    writeFileSync(join(repo, "inbox-measured.md"), "measured corridor: 650 mm\n", "utf8");
    const second = await service.workWorkerContext("attempt-odpe");
    // The attempt keeps the manifest it was compiled with (identity, not latest bytes).
    expect(second.compiled.manifestId).toBe(first.compiled.manifestId);
    expect(second.compiled.inputs?.find((entry) => entry.path === "inbox-measured.md")?.digest).toBe(
      first.compiled.inputs?.find((entry) => entry.path === "inbox-measured.md")?.digest,
    );
    const pulled = await service.fetch("attempt-odpe", "@ctx/input/inbox-measured.md");
    if (pulled === undefined || pulled.kind !== "input") throw new Error("unreachable");
    expect(pulled.body.state).toBe("CHANGED");
  });

  it("never reads the inputs of another attempt", async () => {
    const { repo, base } = workspace();
    const { service } = serviceFor(repo, base);
    expect(await service.fetch("attempt-other", "@ctx/input/inbox-measured.md")).toBeUndefined();
  });
});
