/**
 * PLMP-LEAN-1 §C.14 (D1-e) — the delegation SURFACE, wired end to end.
 *
 * Everything here runs against a REAL installation: the real Work event store, the real ReasoningCell
 * store and service, the real first-party exploratory policies, and the real delegation snapshot (a
 * detached worktree of a temporary git repository). Only the branch HOST is a fake, because a fake host
 * is the only way to control when a research worker finishes — and it is the seam the product itself
 * declares.
 *
 * The property under test is ADDITIVE (§C.12, acceptance DEL-A08): the async delegation is a second
 * interaction lifecycle over the SAME cognition backend, so `palimpsest_collaborate` keeps its blocking
 * contract, and a deployment without an async branch host has no delegation face at all — absence, not
 * a stub.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { SqliteReasoningCellStore } from "../src/reasoning_cell/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import type { PeerRef } from "../src/federation/index.js";
import { firstPartyExploratoryAdmissionPolicy, firstPartyExploratoryVerificationPolicy } from "../src/deployment/reasoning_bundle.js";
import type { PrincipalDeliveryPort } from "../src/interaction/delegation_terminal.js";
import type { DelegationBranchHost } from "../src/interaction/delegation.js";

const CLOCK = "2026-01-01T00:00:00.000Z";
const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest-deleg" };
const HEAD = "c".repeat(40);
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-deleg-"));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return root;
}

/** A real repository, because the delegation's read basis is a real detached worktree of one. */
function repoUnder(root: string): string {
  const dir = join(root, "repo");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: dir });
  return dir;
}

/** A controllable research worker: the test decides when it finishes, and with what. */
function fakeBranchHost() {
  const started: { readonly workDir: string; readonly brief: unknown }[] = [];
  let settle: (value: unknown) => void = () => undefined;
  const make = (workDir: string): DelegationBranchHost => ({
    adapterId: "fake-branch-host",
    start: (input) => {
      started.push({ workDir, brief: input.brief });
      const completion = new Promise<unknown>((resolve) => {
        settle = resolve;
      });
      return { completion, cancel: () => undefined };
    },
  });
  return {
    started,
    forWorkDir: make,
    finish: (statement: string) => settle({ status: "completed", statement }),
  };
}

function recordingDelivery() {
  const delivered: string[] = [];
  const port: PrincipalDeliveryPort = {
    adapterId: "recording-delivery",
    deliver: async (text) => {
      delivered.push(text);
      return { delivered: true, detail: "recorded" };
    },
  };
  return { port, delivered };
}

function install(options: { readonly delegating: boolean }) {
  const root = tempRoot();
  const dir = join(root, "state");
  mkdirSync(dir, { recursive: true });
  const repository = repoUnder(root);
  const host = fakeBranchHost();
  const delivery = recordingDelivery();
  const installed = installPalimpsest({ tools: { register: () => undefined } } as never, {
    projectId: "delegation-project",
    repository,
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    clock: () => CLOCK,
    git: new FakeGitPort(HEAD),
    // A local peer + the recipe layer, so the BLOCKING collaboration face exists too and "additive,
    // not a replacement" is asserted with both tools in the same catalogue.
    localPeer: P,
    coordinationStore: new SqliteCoordinationStore(join(dir, "coordination.sqlite")),
    peerTransportPort: { adapterId: "deleg-test-transport", send: async () => ({ transportMessageId: "t-1", delivered: true }) },
    peerDirectoryPort: { observePeers: async () => ({ state: "known" as const, value: [] }) },
    attemptCatalog: { assertAdmissibleAttempt: async () => undefined },
    reasoningCellStore: new SqliteReasoningCellStore(join(dir, "reasoning.sqlite")),
    reasoningVerificationPolicy: firstPartyExploratoryVerificationPolicy(),
    reasoningAdmissionPolicy: firstPartyExploratoryAdmissionPolicy(),
    ...(options.delegating
      ? {
          delegationBranchExecution: (workDir: string) => host.forWorkDir(workDir),
          delegationDelivery: delivery.port,
        }
      : {}),
  });
  return { installed, host, delivery, repository };
}

const toolNamed = (tools: readonly { readonly name: string }[], name: string) => tools.find((entry) => entry.name === name);
/** The DSH adapter contract: a tool is its metadata plus `execute(args, context)`. */
interface ToolDefinition {
  readonly name: string;
  readonly mode: string;
  /** The action enum, read the SAME way the golden parity fixture reads it (§8). */
  readonly actions: readonly string[];
  execute(args: unknown, context: unknown): Promise<unknown>;
}
const toolOf = (installed: { readonly tools: readonly unknown[] }, name: string): ToolDefinition => {
  const tool = toolNamed(installed.tools as readonly { readonly name: string }[], name);
  if (tool === undefined) throw new Error(`no tool ${name}`);
  const raw = tool as unknown as { readonly parameters?: { readonly properties?: { readonly action?: { readonly enum?: readonly string[] } } } };
  return {
    ...(tool as unknown as Omit<ToolDefinition, "actions">),
    actions: raw.parameters?.properties?.action?.enum ?? [],
  };
};
const call = (tool: ToolDefinition, args: Record<string, unknown>): Promise<unknown> => tool.execute(args, {});
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

describe("DEL-A08: the delegation is ADDITIVE — the blocking collaboration path is untouched", () => {
  it("a delegating deployment gains the face and the tool, and keeps palimpsest_collaborate as it was", async () => {
    const { installed } = install({ delegating: true });
    try {
      expect(installed.application.delegation).toBeDefined();
      expect(installed.delegation).toBeDefined();

      const delegate = toolOf(installed, "palimpsest_delegate");
      expect(delegate.mode).toBe("mutating");
      expect(delegate.actions).toEqual(["start", "status", "inspect"]);
      // The blocking path is the SAME tool it always was: same name, same mode, same action pair.
      const collaborate = toolOf(installed, "palimpsest_collaborate");
      expect(collaborate.mode).toBe("mutating");
      expect(collaborate.actions).toEqual(["plan", "run"]);
    } finally {
      await installed.dispose();
    }
  }, 60_000);

  it("a deployment with no async branch host has NO delegation face — absence, not a stub", async () => {
    const { installed } = install({ delegating: false });
    try {
      expect(installed.application.delegation).toBeUndefined();
      expect(installed.delegation).toBeUndefined();
      expect(toolNamed(installed.tools, "palimpsest_delegate")).toBeUndefined();
      // And the absence is REPORTED as absence, so an agent never reads "no delegation" as "nothing
      // to research".
      const surfaces = (await toolOf(installed, "palimpsest_surfaces").execute({ action: "list" }, {})) as { readonly delegation?: boolean };
      expect(surfaces.delegation).toBe(false);
    } finally {
      await installed.dispose();
    }
  }, 60_000);
});

describe("§C.14 the tool face is narrow, and it refuses what it does not implement", () => {
  it("start needs a task, kind is RESEARCH-only, and status/inspect need a ref", async () => {
    const { installed } = install({ delegating: true });
    try {
      const delegate = toolOf(installed, "palimpsest_delegate");
      await expect(call(delegate, { action: "start" })).rejects.toThrow(/task/u);
      await expect(call(delegate, { action: "start", task: "x", kind: "WORK" })).rejects.toThrow(/RESEARCH/u);
      await expect(call(delegate, { action: "status" })).rejects.toThrow(/delegationRef/u);
      await expect(call(delegate, { action: "inspect" })).rejects.toThrow(/delegationRef/u);
    } finally {
      await installed.dispose();
    }
  }, 60_000);
});

describe("§C.11 ② the whole path, on a real store: frozen basis, real settlement, terminal delivery", () => {
  it("start returns while the worker is still running, and the result arrives on its own", async () => {
    const { installed, host, delivery, repository } = install({ delegating: true });
    try {
      const delegate = toolOf(installed, "palimpsest_delegate");
      const started = (await call(delegate, { action: "start", task: "find the cache race" })) as {
        readonly delegationRef: string;
        readonly outcome: string;
        readonly state: string;
        readonly basisCommit: string;
      };
      // The whole point: the call returned BEFORE the worker finished.
      expect(started.outcome).toBe("STARTED");
      expect(started.state).toBe("RUNNING");
      expect(host.started).toHaveLength(1);

      // §C.11 ②: the worker was handed a FROZEN snapshot, not the live repository.
      expect(host.started[0]!.workDir).not.toBe(repository);
      expect(started.basisCommit).toMatch(/^[0-9a-f]{40}$/u);
      // §C.15: the brief carries the objective and the accepted frontier — never a principal session.
      expect(JSON.stringify(host.started[0]!.brief)).not.toContain("session");

      // Now let the worker finish. The settlement runs through the REAL ReasoningCell service and the
      // REAL first-party exploratory policies, so COMPLETED here means a genuinely admitted claim.
      host.finish("the race is in invalidate()");
      await settle();

      const after = (await call(delegate, { action: "status", delegationRef: started.delegationRef })) as { readonly state: string };
      expect(after.state).toBe("COMPLETED");

      // §C.11 ③: the principal was told, with the basis and the conclusion, and with the standing.
      expect(delivery.delivered).toHaveLength(1);
      expect(delivery.delivered[0]).toContain("the race is in invalidate()");
      expect(delivery.delivered[0]).toContain(started.basisCommit.slice(0, 12));
      expect(delivery.delivered[0]).toContain("not Work Evidence or Project Verification");
      expect(delivery.delivered[0]).not.toContain(started.delegationRef);

      // Re-issuing the same task converges on the SAME delegation rather than running it again.
      const again = (await call(delegate, { action: "start", task: "find the cache race" })) as {
        readonly delegationRef: string;
        readonly outcome: string;
        readonly conclusion: string | null;
      };
      expect(again.delegationRef).toBe(started.delegationRef);
      expect(again.outcome).toBe("EXISTING");
      expect(again.conclusion).toContain("invalidate()");
      expect(host.started).toHaveLength(1);
    } finally {
      await installed.dispose();
    }
  }, 60_000);
});
