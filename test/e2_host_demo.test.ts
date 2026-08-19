import { execSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GitCliPort } from "../src/effects/index.js";

import { installForTests } from "./helpers.js";

/**
 * A minimal DSH-agent-shaped worker skill: keyed by the same id a claiming
 * agent would see in TaskEnvelope.suggested_skills. The provider produces the
 * task's required artifact inside the isolated worktree.
 */
const SKILL_REGISTRY: Record<string, { produce(worktree: string): void }> = {
  "document-skills:pptx": {
    produce(worktree: string): void {
      mkdirSync(join(worktree, "out"), { recursive: true });
      writeFileSync(join(worktree, "out", "report.pptx"), Buffer.from("deck"));
    },
  },
};

/**
 * E2 exit-gate equivalent (host level, machine-verifiable): the exact chain a
 * DSH session would exercise — the worker claims an attempt whose envelope
 * suggests document-skills:pptx, resolves that hint against its (simulated)
 * skill set, produces out/report.pptx inside a *real* git worktree, reports,
 * and a deterministic gate records evidence. Everything except an LLM and the
 * pptx library itself is real.
 */
describe("E2 host-demo equivalent: a worker honors the envelope skill hint", () => {
  it("claim -> resolve suggested skill -> produce artifact in the real worktree -> report -> evidence", async () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "palimpsest-e2host-"));
    execSync("git init -q", { cwd: repoRoot });
    writeFileSync(join(repoRoot, "README.md"), "base\n");
    execSync("git add . && git -c user.name=p -c user.email=p@local commit -qm base", {
      cwd: repoRoot,
    });
    const head = execSync("git rev-parse HEAD", { cwd: repoRoot }).toString().trim();

    const git = new GitCliPort(repoRoot, join(repoRoot, ".palimpsest", "worktrees"));
    const { host, installed } = await installForTests({ git });
    try {
      // Start with the real base commit so the worktree can actually be created.
      await host.call("palimpsest_start", {
        projectId: "scheduler-project",
        goal: "produce a pptx deck",
        headCommit: head,
        tasks: [
          {
            task_id: "task-1",
            objective: "author the deck",
            depends_on: [],
            write_paths: ["out"],
            required_artifacts: ["out/report.pptx"],
            suggested_skills: ["document-skills:pptx"],
          },
        ],
      });
      await host.call("palimpsest_next", {}); // TASK_STARTED
      const created = (await host.call("palimpsest_next", {})) as { entityId: string };
      const attemptId = created.entityId;

      // The claiming worker reads its envelope and sees the skill hint.
      const envRow = installed.controller.store.connection
        .prepare("SELECT envelope_json FROM tasks WHERE task_id='task-1'")
        .get() as { envelope_json: Uint8Array };
      const envelope = JSON.parse(new TextDecoder().decode(envRow.envelope_json)) as {
        suggested_skills?: string[];
      };
      expect(envelope.suggested_skills).toEqual(["document-skills:pptx"]);

      const claimed = (await host.call("palimpsest_claim", { attemptId })) as {
        worktreePath: string;
      };
      // A real git worktree exists on disk — this is the host-grade worktree.
      expect(existsSync(claimed.worktreePath)).toBe(true);

      // Worker resolves each hint and produces the required artifact inside the
      // isolated worktree.
      const used: string[] = [];
      for (const skill of envelope.suggested_skills ?? []) {
        const provider = SKILL_REGISTRY[skill];
        expect(provider, `skill ${skill} resolves for the worker`).toBeDefined();
        provider!.produce(claimed.worktreePath);
        used.push(skill);
      }
      expect(used).toEqual(["document-skills:pptx"]);
      expect(existsSync(join(claimed.worktreePath, "out", "report.pptx"))).toBe(true);

      // Self-claims are never evidence; a deterministic gate records evidence.
      // The gate runs a real command inside the real worktree (readOnly profile).
      const report = (await host.call("palimpsest_report", {
        attemptId,
        workerStatus: "completed",
        summary: "deck authored via the document-skills:pptx hint",
      })) as { eventType: string };
      expect(report.eventType).toBe("ATTEMPT_COMPLETED");
      const gate = (await host.call("palimpsest_gate", {
        attemptId,
        predicate: "tests_pass",
        command: ["git", "rev-parse", "--is-inside-work-tree"],
        exitCode: 0,
      })) as { status: string };
      expect(gate.status).toBe("active");

      const status = (await host.call("palimpsest_status", {})) as {
        attempts: Array<{ state: string }>;
        evidence: Array<{ status: string }>;
      };
      expect(status.attempts[0]).toMatchObject({ state: "COMPLETED" });
      expect(status.evidence[0]).toMatchObject({ status: "active" });
    } finally {
      await installed.dispose();
    }
  });
});
