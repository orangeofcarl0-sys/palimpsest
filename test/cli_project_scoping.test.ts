/**
 * G9-G §4-6 preflight hotfix: the CLI `architect --declare` started-ness
 * query was a GLOBAL `SELECT 1 FROM scheduler_control LIMIT 1` - a sibling
 * project in a shared EventStore made the current (uninitialized) project
 * take the plan() branch and fail with "project does not exist" instead of
 * start(). The frozen property:
 *
 *   SiblingProjectInitialized ⇏ CurrentProjectInitialized
 *
 * The helper under test is the single read-side source
 * (`ProjectController#isProjectInitialized`) consumed by serviceHealth, the
 * serve declare face, and the CLI architect face alike.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { EventStore } from "../src/state/index.js";
import { ProjectController } from "../src/tools/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";
import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const makeController = (store: EventStore, projectId: string, opsPath: string) =>
  new ProjectController({
    store,
    effects: createPalimpsestEffects({ databasePath: opsPath, git: new FakeGitPort(HEAD) }),
    projectId,
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-10T00:00:00Z",
  });

describe("CLI project scoping (G9-G preflight CLI-PROJECT-A01)", () => {
  it("sibling project initialized does not initialize the current project (read-side helper)", async () => {
    const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
    const effectsA = createPalimpsestEffects({
      databasePath: join(tempStatePath(), "ops-sibling.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    const effectsB = createPalimpsestEffects({
      databasePath: join(tempStatePath(), "ops-current.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    try {
      const controllerA = makeController(store, "sibling-project", join(tempStatePath(), "ops-sibling.sqlite"));
      const controllerB = makeController(store, "current-project", join(tempStatePath(), "ops-current.sqlite"));
      controllerA.start({ projectId: "sibling-project", goal: "sibling", tasks: [taskSpec("task-1")] });
      expect(controllerA.isProjectInitialized()).toBe(true);
      expect(controllerB.isProjectInitialized()).toBe(false);
    } finally {
      await Promise.all([effectsA.close(), effectsB.close(), store.close()]);
    }
  });

  it("CLI-PROJECT-A01: real `architect --declare` on a shared store STARTS the uninitialized project", async () => {
    const distCli = join(process.cwd(), "dist", "src", "cli.js");
    if (!existsSync(distCli)) {
      throw new Error("dist/src/cli.js missing - run the build first (pnpm test builds it)");
    }
    const dir = mkdtempSync(join(tmpdir(), "palimpsest-cli-scope-"));
    const sharedDb = join(dir, "shared.sqlite");
    const ops = join(dir, "ops.sqlite");
    // Sibling project occupies the shared store (Node-side setup - NOT the
    // subject under test).
    const store = new EventStore(sharedDb, { clock: new FakeClock().next });
    const siblingEffects = createPalimpsestEffects({
      databasePath: join(dir, "sibling-ops.sqlite"),
      git: new FakeGitPort(HEAD),
    });
    try {
      const sibling = makeController(store, "sibling-project", join(dir, "sibling-ops.sqlite"));
      sibling.start({ projectId: "sibling-project", goal: "sibling", tasks: [taskSpec("task-1")] });
    } finally {
      await Promise.all([siblingEffects.close(), store.close()]);
    }
    const proposalPath = join(dir, "proposal.json");
    writeFileSync(
      proposalPath,
      JSON.stringify({ goal: "current-project-goal", changeClass: "behavior_change", tasks: [{ title: "T1", dependsOn: [] }] }),
      "utf8",
    );
    // The REAL built CLI over the same store: the current ("project") project
    // is uninitialized, so --declare must take the START branch.
    const run = spawnSync(process.execPath, [distCli, "architect", proposalPath, "--declare", "--db", sharedDb, "--ops", ops], {
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(run.status).toBe(0);
    const parsed = JSON.parse(run.stdout.trim()) as { declared: boolean; eventType: string };
    expect(parsed.declared).toBe(true);
    expect(parsed.eventType).toBe("PROJECT_CREATED");
  });
});
