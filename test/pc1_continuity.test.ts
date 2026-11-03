/**
 * PC1 S03 — project continuity: standing, basis, explanation, budgeted capsule, fresh-session
 * inheritance and invalidation. The service is derived and stateless; these tests use the real
 * product install and the real journal/promotion owners.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installProduct } from "../src/product.js";
import { trustedDefaultPolicy } from "../src/install.js";
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
    derivedFrom: Object.freeze(["PC1 S03 fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

function workspace(): { root: string; repo: string; head: string; stateDir: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-pc1-s03-"));
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
      // Windows may keep sqlite handles busy
    }
  });
  return { root, repo, head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo }).toString().trim(), stateDir: join(root, "state") };
}

function install(repo: string, stateDir: string) {
  const installed = installProduct(
    { tools: { register: () => () => undefined } } as never,
    {
      projectId: "pc1",
      repository: repo,
      stateDir,
      execution: "in-place",
      standard: standardOf(),
      policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      toolProfile: "expert",
    },
  );
  cleanups.push(() => void installed.dispose());
  const call = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const definition: DshToolDefinition | undefined = installed.tools.find((tool) => tool.name === name);
    if (definition === undefined) throw new Error(`missing tool ${name}`);
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

function commit(repo: string, file: string, content: string): void {
  writeFileSync(join(repo, file), content);
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", `add ${file}`], { cwd: repo });
}

describe("PC1 S03: derived continuity", () => {
  it("distinguishes accepted, candidate, negative and open facts; explains sources; bounds the capsule", async () => {
    const { repo, head, stateDir } = workspace();
    const { installed, call } = install(repo, stateDir);

    await call("palimpsest_start", {
      projectId: "pc1",
      goal: "install a compliant battery plan",
      headCommit: head,
      tasks: [
        { task_id: "deliver", objective: "deliver the plan", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] },
      ],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    await call("palimpsest_claim", { attemptId: created.entityId });
    commit(repo, "deliverable.md", "# plan\n");
    await call("palimpsest_finish", { action: "run", summary: "delivered" });
    installed.controller.step();
    const promoted = await installed.controller.promotions.promoteAttempt({ attemptId: created.entityId });
    installed.controller.step();
    await installed.controller.reconcileProjectHead();

    const negative = (await call("palimpsest_project", {
      action: "journal",
      kind: "NEGATIVE_RESULT",
      title: "No compliant vendor for Site B under the bulletin",
      body: "Under the unaccepted bulletin, V3 is 0 C and no vendor meets the coastal requirement.",
      provenance: "inbox/2026-02-10/vendor-capabilities.csv",
    })) as { entryId: string; digest: string };
    const question = (await call("palimpsest_project", {
      action: "journal",
      kind: "OPEN_QUESTION",
      title: "Should the bulletin be accepted?",
      body: "The bulletin is unaccepted; acceptance is an operator action.",
      provenance: "inbox/arrivals.jsonl",
    })) as { entryId: string };

    const summary = (await call("palimpsest_continuity", { action: "summary" })) as Record<string, unknown>;
    expect(summary.schema).toBe("pc1-project-summary/v1");
    expect((summary.basis as { headCommit: string }).headCommit).toBe(installed.controller.status().headCommit);
    expect((summary.acceptedResults as unknown[]).length).toBe(1);
    expect((summary.negativeFindings as Array<{ title: string; standing: string }>).some((item) => item.title.includes("No compliant vendor") && item.standing === "NEGATIVE_FINDING")).toBe(true);
    expect((summary.openQuestions as Array<{ title: string; standing: string }>).some((item) => item.title.includes("Should the bulletin") && item.standing === "UNCERTAIN")).toBe(true);
    // A journal IDEA/OPEN_QUESTION is never promoted to accepted by the summary.
    expect((summary.acceptedResults as Array<{ title: string }>).some((item) => item.title.includes("bulletin"))).toBe(false);
    expect((summary.authorizationBoundaries as string[]).some((line) => line.includes("operator"))).toBe(true);
    // The accepted result appears, not a candidate.
    expect((summary.candidates as Array<{ id: string }>).some((item) => item.id.startsWith("candidate:deliver"))).toBe(false);

    const explained = (await call("palimpsest_continuity", { action: "explain", subject: `journal:${negative.entryId}` })) as Record<string, unknown>;
    expect(explained.found).toBe(true);
    expect(explained.standing).toBe("NEGATIVE_FINDING");
    expect((explained.item as { reopenConditions: string[] }).reopenConditions.length).toBeGreaterThan(0);
    const missing = (await call("palimpsest_continuity", { action: "explain", subject: "journal:does-not-exist" })) as Record<string, unknown>;
    expect(missing.found).toBe(false);
    expect(missing.standing).toBe("UNKNOWN");

    const capsule = (await call("palimpsest_continuity", { action: "context_capsule", maxBytes: 1024 })) as Record<string, unknown>;
    expect(capsule.schema).toBe("pc1-context-capsule/v1");
    expect(capsule.usedBytes as number).toBeLessThanOrEqual(1024);
    expect(capsule.complete).toBe(false);
    expect((capsule.omitted as string[]).length).toBeGreaterThan(0);
    expect(capsule.text as string).toContain("install a compliant battery plan");
    expect((capsule.sourceIndex as Array<{ ref: string }>).some((entry) => entry.ref.startsWith("journal:"))).toBe(true);
    void question;
  });

  it("a fresh session inherits the durable facts without a transcript", async () => {
    const { repo, head, stateDir } = workspace();
    const first = install(repo, stateDir);
    await first.call("palimpsest_start", {
      projectId: "pc1",
      goal: "keep the accepted plan",
      headCommit: head,
      tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] }],
    });
    await first.call("palimpsest_next", {});
    const created = (await first.call("palimpsest_next", {})) as { entityId: string };
    await first.call("palimpsest_claim", { attemptId: created.entityId });
    commit(repo, "deliverable.md", "# plan\n");
    await first.call("palimpsest_finish", { action: "run", summary: "delivered" });
    first.installed.controller.step();
    await first.installed.controller.promotions.promoteAttempt({ attemptId: created.entityId });
    await first.call("palimpsest_project", {
      action: "journal",
      kind: "NEGATIVE_RESULT",
      title: "Site B has no compliant vendor under the bulletin",
      body: "Recorded negative.",
      provenance: "inbox",
    });
    const before = (await first.installed.application.projectWorkspace!.summary())!;
    await first.installed.dispose();

    // A NEW installation over the same durable state. No transcript, no in-process cache.
    const second = install(repo, stateDir);
    const after = (await second.installed.application.projectWorkspace!.summary())!;
    expect(after.projectId).toBe(before.projectId);
    expect(after.basis.projectRevision).toBe(before.basis.projectRevision);
    expect(after.acceptedResults.length).toBe(1);
    expect(after.negativeFindings.some((item) => item.title.includes("Site B"))).toBe(true);
    expect(after.goal).toBe("keep the accepted plan");
  });

  it("a new project revision changes the basis and the capsule digest; the old projection is not reused", async () => {
    const { repo, head, stateDir } = workspace();
    const { installed, call } = install(repo, stateDir);
    await call("palimpsest_start", {
      projectId: "pc1",
      goal: "evolve the plan",
      headCommit: head,
      tasks: [{ task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] }],
    });
    await call("palimpsest_next", {});
    const created = (await call("palimpsest_next", {})) as { entityId: string };
    await call("palimpsest_claim", { attemptId: created.entityId });
    commit(repo, "deliverable.md", "# plan\n");
    await call("palimpsest_finish", { action: "run", summary: "delivered" });
    installed.controller.step();
    await installed.controller.promotions.promoteAttempt({ attemptId: created.entityId });
    installed.controller.step();
    await installed.controller.reconcileProjectHead();
    const before = (await call("palimpsest_continuity", { action: "context_capsule" })) as { digest: string; basis: { projectRevision: number } };
    await call("palimpsest_plan", {
      tasks: [
        { task_id: "deliver", objective: "deliver", depends_on: [], write_paths: ["deliverable.md"], required_artifacts: ["deliverable.md"] },
        { task_id: "next", objective: "next", depends_on: ["deliver"], write_paths: ["next.md"], required_artifacts: ["next.md"] },
      ],
      reason: "add the next step",
    });
    const after = (await call("palimpsest_continuity", { action: "context_capsule" })) as { digest: string; basis: { projectRevision: number } };
    expect(after.basis.projectRevision).toBe(before.basis.projectRevision + 1);
    expect(after.digest).not.toBe(before.digest);
  });
});
