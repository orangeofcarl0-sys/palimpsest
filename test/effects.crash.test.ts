import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { OrdariumRuntime, SimulatedProcessCrash, UncertainOperationError } from "@ordarium/core";
import { SqliteLedger } from "@ordarium/ledger-sqlite";
import { FaultInjector, ManualClock, fixedIdentity } from "@ordarium/testing";

import { defineEffects } from "../src/effects/actions.js";
import { FakeGitPort, type GitPort } from "../src/effects/git_port.js";

const IDENTITY = fixedIdentity({ source: "palimpsest", scope: "p1-suite", callId: "effect-1" });

const AUTHORIZATION = {
  decision: "allow" as const,
  kind: "policy-decision" as const,
  source: "palimpsest-orchestrator",
  reason: "test",
};

async function run(
  runtime: OrdariumRuntime,
  action: any,
  input: unknown,
): Promise<any> {
  return action.run(runtime, input, { identity: IDENTITY, authorization: AUTHORIZATION });
}

/**
 * A crashable runtime pair sharing one ledger and one ManualClock. On
 * restart, the clock is advanced past the crashed owner's lease so the new
 * owner can claim the same operation deterministically.
 */
class CrashSchedule {
  readonly path = join(mkdtempSync(join(tmpdir(), "palimpsest-crash-")), "ledger.sqlite");
  readonly clock = new ManualClock();
  readonly git = new FakeGitPort();

  crashRuntime(hooks?: FaultInjector): OrdariumRuntime {
    return new OrdariumRuntime({
      ledger: new SqliteLedger(this.path),
      deploymentCoordination: "local-multi-process",
      leaseMs: 50,
      clock: this.clock.now,
      ...(hooks === undefined ? {} : { hooks }),
    });
  }

  /** Advance past the crashed owner's lease and build the restart runtime. */
  afterCrash(): OrdariumRuntime {
    this.clock.advance(1000);
    return this.crashRuntime();
  }
}

describe("five Palimpsest actions under Ordarium fault injection", () => {
  it("worktree.create is idempotent across crash/restart", async () => {
    const schedule = new CrashSchedule();
    const actions = defineEffects(schedule.git);
    const input = { worktreeId: "wt-1", baseCommit: "0".repeat(40) };
    const runtime = schedule.crashRuntime(new FaultInjector().crashAt("after-claim", 1));
    await expect(run(runtime, actions.worktreeCreate, input)).rejects.toBeInstanceOf(
      SimulatedProcessCrash,
    );
    const restarted = schedule.afterCrash();
    const result = await run(restarted, actions.worktreeCreate, input);
    expect(result).toEqual({ worktreePath: "worktree:wt-1" });
    await restarted.dispose();
  });

  it("git.promote recovers from Crash A (before the merge) and executes once", async () => {
    const schedule = new CrashSchedule();
    const input = {
      promotionId: "promo-1",
      sourceCommit: "1".repeat(40),
      expectedHeadCommit: "0".repeat(40),
    };
    const spy = new PromoSpyGit(schedule.git);
    const promoted = vi.fn();
    spy.onPromote = () => promoted();
    const actions = defineEffects(spy);

    const runtime = schedule.crashRuntime(new FaultInjector().crashAt("after-claim", 1));
    await expect(run(runtime, actions.gitPromote, input)).rejects.toBeInstanceOf(
      SimulatedProcessCrash,
    );
    const restarted = schedule.afterCrash();
    const result = await run(restarted, actions.gitPromote, input);
    expect(result).toEqual({ resultingHeadCommit: expect.any(String) });
    expect(promoted).toHaveBeenCalledTimes(1);
    await restarted.dispose();
  });

  it("git.promote recovers from Crash B (merge landed, ledger lost) without re-executing", async () => {
    const schedule = new CrashSchedule();
    const input = {
      promotionId: "promo-2",
      sourceCommit: "2".repeat(40),
      expectedHeadCommit: "0".repeat(40),
    };
    const spy = new PromoSpyGit(schedule.git);
    const promoted = vi.fn();
    spy.onPromote = () => promoted();
    const actions = defineEffects(spy);

    const runtime = schedule.crashRuntime(new FaultInjector().crashAt("after-dispatch", 1));
    await expect(run(runtime, actions.gitPromote, input)).rejects.toBeInstanceOf(
      SimulatedProcessCrash,
    );
    const restarted = schedule.afterCrash();
    const result = await run(restarted, actions.gitPromote, input);
    expect(result).toEqual({ resultingHeadCommit: expect.any(String) });
    expect(promoted).toHaveBeenCalledTimes(1);
    await restarted.dispose();
  });

  it("worker.dispatch stays uncertain after a post-dispatch crash (no blind retry)", async () => {
    const schedule = new CrashSchedule();
    const actions = defineEffects(schedule.git);
    const input = {
      workerId: "w-1",
      taskId: "t-1",
      attemptId: "a-1",
      envelopeId: "e-1",
    };
    const runtime = schedule.crashRuntime(new FaultInjector().crashAt("after-dispatch", 1));
    await expect(run(runtime, actions.workerDispatch, input)).rejects.toBeInstanceOf(
      SimulatedProcessCrash,
    );
    const restarted = schedule.afterCrash();
    // guarded + no reconcile -> recovery stays uncertain; execute is NOT rerun.
    await expect(run(restarted, actions.workerDispatch, input)).rejects.toBeInstanceOf(
      UncertainOperationError,
    );
    await restarted.dispose();
  });

  it("gate.command: same operation stays uncertain after a crash (no blind retry), a new operation re-runs", async () => {
    const schedule = new CrashSchedule();
    schedule.git.setGateOutcome("wt-9", "pytest", [], 0);
    const actions = defineEffects(schedule.git);
    const input = { worktreeId: "wt-9", executable: "pytest", argv: [] };
    const runtime = schedule.crashRuntime(new FaultInjector().crashAt("after-dispatch", 1));
    await expect(run(runtime, actions.gateCommand, input)).rejects.toBeInstanceOf(
      SimulatedProcessCrash,
    );
    // readOnly has no reconcile and no operation key: the crashed operation
    // must stay uncertain rather than re-execute under the same identity.
    const restarted = schedule.afterCrash();
    await expect(run(restarted, actions.gateCommand, input)).rejects.toBeInstanceOf(
      UncertainOperationError,
    );
    // A fresh identity is a fresh operation: the gate re-runs and succeeds.
    const freshIdentity = fixedIdentity({
      source: "palimpsest",
      scope: "p1-suite",
      callId: "effect-2",
    });
    const result = await actions.gateCommand.run(restarted, input, {
      identity: freshIdentity,
      authorization: AUTHORIZATION,
    });
    expect(result).toEqual({ exitCode: 0 });
    await restarted.dispose();
  });
});

class PromoSpyGit implements GitPort {
  readonly git: GitPort;
  onPromote?: () => void;

  constructor(git: GitPort) {
    this.git = git;
  }

  async createWorktree(input: any): Promise<any> {
    return this.git.createWorktree(input);
  }
  async commit(input: any): Promise<any> {
    return this.git.commit(input);
  }
  async promote(input: any): Promise<any> {
    this.onPromote?.();
    return this.git.promote(input);
  }
  async head(): Promise<string> {
    return this.git.head();
  }
  async contains(commit: string): Promise<boolean> {
    return this.git.contains(commit);
  }
  async runGate(input: any): Promise<any> {
    return this.git.runGate(input);
  }
}
