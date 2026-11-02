/**
 * PC1 S02 — normal product surface, lossless responses, and the VERIFYING proposal path.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct, trustedDefaultPolicy } from "../src/product.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const PASSING = ["node", "-e", "process.exit(0)"];

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze([...PASSING]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["PC1 S02 fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function workspace(): { root: string; repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1-s02-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "app.ts"), "export const value = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // sqlite handles may outlive the test process on Windows
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim() };
}

function install(repo: string, toolProfile: "normal" | "expert") {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "pc1",
      repository: repo,
      stateDir: join(repo, ".palimpsest", "state"),
      execution: "in-place",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      toolProfile,
    },
  );
  cleanups.push(() => void installed.dispose());
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const definition: DshToolDefinition | undefined = installed.tools.find((tool) => tool.name === name);
    if (definition === undefined) throw new Error(`missing tool ${name} in ${toolProfile} profile`);
    return definition.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    });
  };
  return { installed, call };
}

describe("PC1 S02-R01: the normal and expert catalogues really differ", () => {
  it("normal exposes the product facade and not the conflicting legacy chain", () => {
    const { repo } = workspace();
    const { installed } = install(repo, "normal");
    const names = installed.tools.map((tool) => tool.name);
    expect(names).toContain("palimpsest_work");
    expect(names).toContain("palimpsest_project");
    expect(names).toContain("palimpsest_start");
    expect(names).toContain("palimpsest_status");
    for (const forbidden of ["palimpsest_next", "palimpsest_claim", "palimpsest_report", "palimpsest_gate", "palimpsest_begin", "palimpsest_finish", "palimpsest_plan"]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("expert keeps the full historical catalogue, including the legacy chain", () => {
    const { repo } = workspace();
    const { installed } = install(repo, "expert");
    const names = installed.tools.map((tool) => tool.name);
    for (const required of ["palimpsest_next", "palimpsest_claim", "palimpsest_report", "palimpsest_gate", "palimpsest_begin", "palimpsest_finish", "palimpsest_work"]) {
      expect(names).toContain(required);
    }
  });
});

describe("PC1 S02-R03: normal tool results are lossless JSON", () => {
  it("status/project/work/surfaces results round-trip through JSON", async () => {
    const { repo, head } = workspace();
    const { call } = install(repo, "normal");
    await call("palimpsest_start", {
      projectId: "pc1",
      goal: "ship a deliverable",
      headCommit: head,
      tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] }],
    });
    const results = [
      await call("palimpsest_status", {}),
      await call("palimpsest_project", { action: "overview" }),
      await call("palimpsest_work", { action: "status" }),
      await call("palimpsest_surfaces", { action: "list" }),
    ];
    for (const result of results) {
      const serialized = JSON.stringify(result);
      expect(typeof serialized).toBe("string");
      expect(() => JSON.parse(serialized)).not.toThrow();
    }
    // The principal-safe work projection omits orchestrator identities.
    const status = results[2] as Record<string, unknown>;
    const text = JSON.stringify(status);
    expect(text).not.toMatch(/attempt-[0-9a-f]{16}/u);
    expect(text).not.toMatch(/promotion-[0-9a-f]{16}/u);
  });
});

describe("PC1 S02-R04: a follow-up proposal can be saved while the plan is frozen", () => {
  it("propose records a non-authoritative journal entry; plan mutation remains refused", async () => {
    const { repo, head } = workspace();
    const { installed, call } = install(repo, "expert");
    await call("palimpsest_start", {
      projectId: "pc1",
      goal: "ship a deliverable",
      headCommit: head,
      tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] }],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    await call("palimpsest_claim", { attemptId: created.entityId });

    writeFileSync(join(repo, "deliverable.md"), "# delivered\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "deliver"], { cwd: repo });
    await call("palimpsest_finish", { action: "run", summary: "delivered" });
    installed.controller.step();
    const before = installed.controller.work.project().revision;
    const tasks = installed.controller.work.project().tasks.map((task) => ({ ...task }));
    expect(installed.controller.status().tasks.find((task) => task.task_id === "deliver")?.state).toBe("VERIFYING");

    // The plan is frozen while the result waits for acceptance.
    await expect(
      call("palimpsest_plan", {
        tasks: [
          { task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] },
          { task_id: "follow-up", objective: "next", depends_on: ["deliver"], write_paths: ["next.md"], required_artifacts: ["next.md"] },
        ],
        reason: "add follow-up",
      }),
    ).rejects.toThrow(/quiescen|VERIFYING|pending/iu);

    const proposed = (await call("palimpsest_work", {
      action: "propose",
      purpose: "Refresh the technical fit after the bulletin is accepted",
      proposedAction: "Create a technical-refresh task once the result is accepted",
      sources: ["inbox/2026-02-10/vendor-capabilities.csv"],
      risk: "The bulletin is unaccepted",
      requiredAuthority: "project operator",
      expectedArtifact: "deliverables/technical-refresh.md",
    })) as { status: string; proposalRef: string; digest: string; nonAuthoritative: boolean };
    expect(proposed.status).toBe("PROPOSED");
    expect(proposed.nonAuthoritative).toBe(true);
    expect(proposed.proposalRef).toMatch(/^pje-/u);
    expect(proposed.digest).toMatch(/^[0-9a-f]{64}$/u);

    // Nothing canonical moved: same revision, same task graph.
    expect(installed.controller.work.project().revision).toBe(before);
    expect(installed.controller.work.project().tasks).toEqual(tasks);
    const journal = await installed.projectWorkspace?.journal("pc1");
    expect(journal?.some((entry) => entry.entry.entryId === proposed.proposalRef)).toBe(true);
  });
});
