/**
 * PLMP-LEAN-1 §D2-LIVE — the two PACKAGING defects the live gate found, pinned so CI cannot regress them.
 *
 * The live gate (§D2-LIVE) runs the whole D2 chain against a real deployment and a real worker. CI cannot
 * run that (no model, no DSH worker), so the two defects it MEASURED are captured here as deterministic
 * assertions over the SHIPPED composition — `launchDeployment` from a real profile, which is the path a
 * packaged deployment actually takes. Both were invisible to every slice test, because each slice built
 * its own stack and therefore never exercised the composition that decides these two facts.
 *
 *   DEFECT 1 — TWO NAMES FOR ONE WORLD
 *     The git port MATERIALIZED worlds under `.palimpsest/worktrees` while the execution-world port
 *     EXPORTED from `.palimpsest/worlds`. Settlement therefore asked a directory that never held the
 *     world, and returned `RESULT_NOT_EXPORTED` / `WORLD_MISSING` — so no delegated attempt could reach
 *     COMPLETED on any packaged deployment. Every slice test passed because each one supplied its own
 *     `GitCliPort` root, and the mismatch lived only in the composition that WIRES the two together.
 *
 *   DEFECT 2 — A CAPABILITY DERIVED FROM THE REQUEST, NOT FROM THE COMPOSITION
 *     The controller gates `begin`/`prepareMutatingWork` on `attemptResultVerificationAvailable`. That
 *     value was computed from a PROXY — "was `projectVerificationStore` passed in the options?" — before
 *     the verification runtime was composed. On the packaged path the store is not passed but CREATED, so
 *     the flag said `false` on a deployment that then composed a real, executable, independent
 *     attempt-result verifier: readiness reported DEGRADED and every boundary task was refused with
 *     `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE` — the product refusing work it can actually do.
 *
 * The assertions below are deliberately about the SHIPPED composition and about OUTCOMES (can the result
 * be exported? is the boundary task admitted? does the declared verifier run?), not about which internal
 * field carries the path or the flag — those are exactly the spellings that drifted.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { launchDeployment } from "../src/deployment/index.js";
import type { ProjectAgentDeploymentProfile } from "../src/deployment/index.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

/**
 * A real repository with a write path that touches a BOUNDARY (`schema`), because that is the ONE hard
 * trigger for a REQUIRED independent verification. Without it the capability defect would be invisible:
 * a task needing no verification is admitted either way.
 */
function workspace(): { root: string; repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d2live-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "schema.ts"), "export interface Shape {\n  readonly a: number;\n}\n");
  writeFileSync(
    join(repo, "package.json"),
    `${JSON.stringify({ name: "d2live-fixture", private: true, type: "module", scripts: { test: "node -e \"process.exit(0)\"" } }, null, 2)}\n`,
  );
  execFileSync("git", ["init", "-q"], { cwd: repo });
  execFileSync("git", ["add", "-A"], { cwd: repo });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return { root, repo, head: git(repo, ["rev-parse", "HEAD"]) };
}

/** A PACKAGED profile: the shape `launchDeployment` reads, with no verification options of any kind. */
function packagedProfile(root: string, repo: string): ProjectAgentDeploymentProfile {
  const dir = join(root, "profile");
  mkdirSync(dir, { recursive: true });
  const db = (name: string) => join(dir, `${name}.sqlite`);
  return {
    schemaVersion: 1,
    profileId: "d2live",
    projectId: "d2live",
    localPeer: "d2live-peer",
    persistentPoint: "pp-d2live",
    repository: repo,
    transport: { namespace: "d2live", databasePath: db("transport") },
    databases: {
      orchestration: db("orchestration"),
      ordarium: db("ordarium"),
      coordination: db("coordination"),
      transportCursors: db("cursors"),
      projectAssociations: db("associations"),
      projectJournal: db("journal"),
    },
    // No `reasoning`, no verification store, no verifier registry: exactly what a packaged deployment
    // passes. Whatever verification exists is what the COMPOSITION decides to create.
    execution: "worktree",
    policy: { allowed_commands: [{ executable: "node", argv_prefix: ["-e"] }] },
    standard: { statement: "tests pass and scope respected" },
  } as unknown as ProjectAgentDeploymentProfile;
}

function launch(root: string, repo: string) {
  const deployment = launchDeployment(packagedProfile(root, repo));
  cleanups.push(() => void deployment.close());
  const installed = deployment.installed;
  const call = async (name: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const tool = installed.tools.find((entry) => entry.name === name);
    if (tool === undefined) throw new Error(`no core tool ${name}`);
    return (await tool.execute(args, {
      callId: `c-${name}`,
      rootCallId: `r-${name}`,
      name,
      arguments: args,
      signal: new AbortController().signal,
    })) as Record<string, unknown>;
  };
  return { deployment, installed, controller: installed.controller, call };
}

describe("§D2-LIVE defect 1: the world is created and exported through ONE name", () => {
  it("a packaged deployment settles a delegated attempt: the world exists where settlement exports from", async () => {
    const { root, repo, head } = workspace();
    const { controller, call } = launch(root, repo);

    await call("palimpsest_start", {
      projectId: "d2live",
      goal: "adjust the value helper",
      headCommit: head,
      tasks: [
        { task_id: "t1", objective: "make value return 2", depends_on: [], write_paths: ["src"], required_artifacts: [] },
      ],
    });

    const prepared = await controller.prepareMutatingWork();
    // The world the git port MATERIALIZED is the directory the Work owner OBSERVES — one location.
    expect(existsSync(prepared.worldPath), `the world at "${prepared.worldPath}" must exist`).toBe(true);
    const observed = controller.observeAttemptResult(prepared.attemptId);
    expect(observed?.workDir).toBe(prepared.worldPath);

    // The worker's real discipline: edit, commit INSIDE the world.
    writeFileSync(join(prepared.worldPath, "src", "value.ts"), "export const value = 2;\n");
    execFileSync("git", ["add", "-A"], { cwd: prepared.worldPath });
    execFileSync("git", ["commit", "-qm", "worker commit"], { cwd: prepared.worldPath });
    const resultCommit = git(prepared.worldPath, ["rev-parse", "HEAD"]);
    expect(resultCommit).not.toBe(prepared.baseCommit);

    const settled = await controller.settleMutatingWork({
      attemptId: prepared.attemptId,
      workerOutcome: { kind: "READY_FOR_SETTLEMENT" },
    });

    // THE DEFECT, as an outcome: before the fix this was `NOT_READY` / `RESULT_NOT_EXPORTED`, because
    // settlement looked for the world under a DIFFERENT directory name than the port created it in.
    expect(settled.state, JSON.stringify(settled)).toBe("SETTLED");
    expect(controller.attemptWorkRecord(prepared.attemptId)?.state).toBe("COMPLETED");
    // And the exported result is genuinely readable in the canonical object database.
    expect(git(repo, ["cat-file", "-e", `${resultCommit}^{commit}`])).toBe("");
    // While the canonical SOURCE is untouched: exported ≠ promoted. `.palimpsest/` is excluded because
    // it is the product's OWN state directory (the world, the databases) — the same filter the product's
    // own observation applies, and not the attempt's work.
    expect(git(repo, ["rev-parse", "HEAD"])).toBe(head);
    expect(
      git(repo, ["status", "--porcelain"])
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.endsWith(".palimpsest/")),
    ).toEqual([]);
  }, 120_000);
});

describe("§D2-LIVE defect 2: the capability is derived from what was COMPOSED", () => {
  it("a packaged deployment admits a boundary task, because it really does compose an attempt-result verifier", async () => {
    const { root, repo, head } = workspace();
    const { installed, controller, call } = launch(root, repo);

    // The runtime is real: an independent, executable verifier that supports ATTEMPT_RESULT.
    const runtime = installed.verification?.runtimeCapability();
    expect(runtime?.runtimeAvailable).toBe(true);
    expect(runtime?.independentVerifierAvailable).toBe(true);
    expect(runtime?.independentVerifierRefs.length ?? 0).toBeGreaterThan(0);

    // The deployment layer therefore reports CONFIGURED, with no capability gap — the honest statement
    // about a deployment that can meet a required verification.
    const readiness = controller.completionReadiness();
    expect(readiness.deployment.state).toBe("CONFIGURED");
    expect(readiness.deployment.gaps).toEqual([]);

    // And the admission decision follows: a boundary task is NOT refused. Before the fix this threw
    // `ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE` while the runtime above was fully composed — the two
    // facts contradicted each other, and the refusal was the wrong one.
    await call("palimpsest_start", {
      projectId: "d2live",
      goal: "adjust the boundary shape",
      headCommit: head,
      tasks: [
        {
          task_id: "t1",
          objective: "add a field to the boundary shape",
          depends_on: [],
          write_paths: ["src/schema.ts"],
          required_artifacts: [],
        },
      ],
    });
    const prepared = await controller.prepareMutatingWork();
    expect(prepared.taskId).toBe("t1");
    // The requirement is genuinely present — the admission above was a real decision, not a task that
    // never needed verification.
    expect(controller.completionContract(prepared.attemptId)?.verification.requiredReasons.join(" ")).toContain(
      "contract_boundary",
    );
  }, 120_000);

  it("a BARE install composes no verification runtime, reports the gap, and still refuses the work", async () => {
    const { root, repo, head } = workspace();

    /**
     * The other direction, so the fix cannot have simply flipped a constant. A bare Work-only install —
     * no project workspace, no recipe execution, no verification options — composes NO verification
     * runtime, so the capability must read ABSENT and the refusal must stand.
     *
     * This is stated through the same composition rather than by passing an explicit `capabilities`
     * object, because passing one is a caller ASSERTING its own deployment, and the defect was precisely
     * about a derived value disagreeing with what was composed.
     */
    const bareRoot = mkdtempSync(join(tmpdir(), "palimpsest-d2live-bare-"));
    cleanups.push(() => {
      try {
        rmSync(bareRoot, { recursive: true, force: true });
      } catch {
        // The OS reaps it.
      }
    });
    const { installPalimpsest, trustedDefaultPolicy } = await import("../src/install.js");
    const bare = installPalimpsest(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "d2live-bare",
        databasePath: join(bareRoot, "p.sqlite"),
        ordariumDatabasePath: join(bareRoot, "o.sqlite"),
        repository: repo,
        execution: "worktree",
        policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e"] }] }),
        standard: {
          statement: "tests pass and scope respected",
          clauses: [
            { kind: "command_succeeds", command: ["node", "-e", "process.exit(0)"], predicate: "tests_pass" },
            { kind: "scope_respected" },
          ],
          derivedFrom: ["test fixture"],
          confirmed: true,
          notes: [],
        },
      } as never,
    );
    cleanups.push(() => void bare.dispose());

    // No verification runtime was composed, and the capability says so rather than guessing.
    expect(bare.verification).toBeUndefined();
    const readiness = bare.controller.completionReadiness();
    expect(readiness.deployment.independentVerifierAvailable).toBe(false);
    expect(readiness.deployment.state).toBe("DEGRADED");
    expect(readiness.deployment.gaps.join(" ")).toContain("no verifier");

    // And the refusal stands: a boundary task must not begin where nothing can verify its result.
    await bare.tools
      .find((entry) => entry.name === "palimpsest_start")!
      .execute(
        {
          projectId: "d2live-bare",
          goal: "adjust the boundary shape",
          headCommit: head,
          tasks: [
            { task_id: "t1", objective: "touch the boundary", depends_on: [], write_paths: ["src/schema.ts"], required_artifacts: [] },
          ],
        },
        { callId: "c1", rootCallId: "r1", name: "palimpsest_start", arguments: {}, signal: new AbortController().signal },
      );
    await expect(bare.controller.prepareMutatingWork()).rejects.toThrow(/ATTEMPT_RESULT_VERIFICATION_UNAVAILABLE/u);
  }, 120_000);
});
