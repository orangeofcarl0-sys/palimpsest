/**
 * PC1 S06 — three-level completion and explicit domain outcomes.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import { trustedDefaultPolicy } from "../src/install.js";
import type { DshToolDefinition } from "../src/tools/dsh_types.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1-s06-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "reports"), { recursive: true });
  writeFileSync(join(repo, "reports", "base.md"), "# base\n");
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "init"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // sqlite handles may outlive the process on Windows
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(), stateDir: join(root, "state") };
}

function install(repo: string, head: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "pc1",
      repository: repo,
      stateDir,
      execution: "in-place",
      policy: trustedDefaultPolicy(),
      toolProfile: "expert",
    },
  );
  cleanups.push(() => void installed.dispose());
  installed.controller.start({
    projectId: "pc1",
    goal: "establish whether the site is feasible",
    headCommit: head,
    tasks: [{ task_id: "investigate", objective: "investigate feasibility", depends_on: [], write_paths: ["reports/site.json"], required_artifacts: ["reports/site.json"] }],
  });
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const definition: DshToolDefinition | undefined = installed.tools.find((tool) => tool.name === name);
    if (definition === undefined) throw new Error(`missing tool ${name}`);
    return definition.execute(args, { callId: `c-${name}`, rootCallId: `r-${name}`, name, arguments: args, signal: new AbortController().signal });
  };
  return { installed, call };
}

describe("PC1 S06: domain outcome is explicit and separate", () => {
  it("a JSON artifact contract returns supported/infeasible/uncertain from observed bytes", async () => {
    const { repo, head, stateDir } = workspace();
    const { call } = install(repo, head, stateDir);
    writeFileSync(join(repo, "reports", "site.json"), JSON.stringify({ vendor: "V3", minTemp: 0 }));
    const supported = (await call("palimpsest_outcome", {
      action: "evaluate",
      taskId: "investigate",
      contractId: "json-artifact",
      artifactPath: "reports/site.json",
      parameters: { requiredKeys: ["vendor", "minTemp"] },
    })) as { status: string; artifactDigest: string; evaluationId: string };
    expect(supported.status).toBe("supported");
    expect(supported.artifactDigest).toMatch(/^[0-9a-f]{64}$/u);

    writeFileSync(join(repo, "reports", "site.json"), JSON.stringify({ vendor: "V3" }));
    const infeasible = (await call("palimpsest_outcome", {
      action: "evaluate", taskId: "investigate", contractId: "json-artifact", artifactPath: "reports/site.json",
      parameters: { requiredKeys: ["vendor", "minTemp"] },
    })) as { status: string; unmetRequirements: string[] };
    expect(infeasible.status).toBe("infeasible");
    expect(infeasible.unmetRequirements).toContain("minTemp");

    const uncertain = (await call("palimpsest_outcome", {
      action: "evaluate", taskId: "investigate", contractId: "json-artifact", artifactPath: "reports/missing.json",
      parameters: { requiredKeys: [] },
    })) as { status: string };
    expect(uncertain.status).toBe("uncertain");

    const latest = (await call("palimpsest_outcome", { action: "project" })) as Array<{ taskId: string; status: string }>;
    expect(latest.length).toBe(1);
    expect(latest[0]?.taskId).toBe("investigate");
    expect(latest[0]?.status).toBe("uncertain");
  });

  it("a negative investigation completes the investigation, not the business objective", async () => {
    const { repo, head, stateDir } = workspace();
    const { installed, call } = install(repo, head, stateDir);
    const entry = await installed.application.projectWorkspace!.recordJournalEntry({
      kind: "NEGATIVE_RESULT",
      title: "No compliant vendor for Site B",
      body: "Under the accepted data no vendor meets the coastal requirement.",
      provenance: "sources/vendors.csv",
    });
    const evaluation = (await call("palimpsest_outcome", {
      action: "evaluate",
      taskId: "investigate",
      contractId: "negative-investigation",
      parameters: { journalEntryId: entry.entryId, unmetRequirements: ["R3", "R1"] },
    })) as { status: string; investigationComplete: boolean; unmetRequirements: string[] };
    expect(evaluation.status).toBe("infeasible");
    expect(evaluation.investigationComplete).toBe(true);
    expect(evaluation.unmetRequirements).toEqual(["R3", "R1"]);

    const summary = (await call("palimpsest_continuity", { action: "summary" })) as {
      tasks: Array<{ taskId: string; state: string; workAcceptance: string; businessOutcome: string; investigationComplete: boolean; unmetRequirements: string[] }>;
    };
    const task = summary.tasks.find((entryTask) => entryTask.taskId === "investigate")!;
    expect(task.state).toBe("READY");
    expect(task.workAcceptance).toBe("UNKNOWN");
    expect(task.businessOutcome).toBe("infeasible");
    expect(task.investigationComplete).toBe(true);
    expect(task.unmetRequirements).toEqual(["R3", "R1"]);
    // The project goal is not reported as satisfied by a negative finding.
    expect(task.businessOutcome).not.toBe("supported");
  });

  it("a human-judgement contract stays uncertain and does not become a machine verdict", async () => {
    const { repo, head, stateDir } = workspace();
    const { call } = install(repo, head, stateDir);
    writeFileSync(join(repo, "reports", "review.md"), "# review\n");
    const evaluation = (await call("palimpsest_outcome", {
      action: "evaluate", taskId: "investigate", contractId: "human-review", artifactPath: "reports/review.md",
    })) as { status: string; detail: string; investigationComplete: boolean };
    expect(evaluation.status).toBe("uncertain");
    expect(evaluation.investigationComplete).toBe(false);
    expect(evaluation.detail).toMatch(/human judgement/u);
  });

  it("the tool has no way to register a contract or set a status", () => {
    const { repo, head, stateDir } = workspace();
    const { installed } = install(repo, head, stateDir);
    const tool = installed.tools.find((entry) => entry.name === "palimpsest_outcome")!;
    const properties = tool.parameters.properties as Record<string, unknown>;
    const action = properties.action as { enum: string[] };
    expect(action.enum).toEqual(["contracts", "project", "evaluate"]);
    expect(properties).not.toHaveProperty("status");
  });
});
