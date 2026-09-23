/**
 * PLMP-LEAN-1 §C.11 ④ — DEL-A07, the ORTHOGONALITY assertion: research creates no Work truth.
 *
 * D1's most load-bearing claim is a NEGATIVE one:
 *
 *     Direct Work  ∥  Optional cognitive delegation
 *
 * A delegation must not create a Task, an Attempt, an EvidenceAtom, a verification standing, a
 * promotion-eligibility change — and it must not need `palimpsest_begin`. That is easy to assert and
 * easy to get wrong, because the way it goes wrong is a passive one: some composition quietly routes a
 * research result through a Work owner, and the result "looks like" evidence.
 *
 * So this file measures the counts BEFORE and AFTER a delegation that really completes (a real
 * installation, a real ReasoningCell store, a real admitted claim), and asserts they are IDENTICAL. It
 * also asserts the structural half of DEL-A04: there is no canonical delegation store, event type or
 * authority anywhere in the tree.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { DatabaseSync } from "node:sqlite";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { SqliteReasoningCellStore } from "../src/reasoning_cell/index.js";
import { firstPartyExploratoryAdmissionPolicy, firstPartyExploratoryVerificationPolicy } from "../src/deployment/reasoning_bundle.js";
import { parseDelegationRef, type DelegationBranchHost } from "../src/interaction/delegation.js";
import type { PrincipalDeliveryPort } from "../src/interaction/delegation_terminal.js";

const CLOCK = "2026-01-01T00:00:00.000Z";
const HEAD = "c".repeat(40);
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function read(relative: string): string {
  return readFileSync(join(REPO, relative), "utf8");
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-ortho-"));
  cleanups.push(() => {
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Windows keeps the directory busy while a git handle is open; the OS reaps it.
    }
  });
  return root;
}

function repoUnder(root: string): string {
  const dir = join(root, "repo");
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "a.ts"), "export const a = 1;\n");
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: dir });
  return dir;
}

/**
 * The durable counts an auditor would read, straight from the orchestration database — no product
 * code in the path. This is deliberately the crudest possible measurement of DEL-A07: if research
 * appended even ONE Work event, an attempt, or an EvidenceAtom, the numbers would move.
 */
interface DurableCounts {
  readonly events: number;
  readonly attempts: number;
  readonly evidence: number;
}

function durableCounts(databasePath: string): DurableCounts {
  const db = new DatabaseSync(databasePath);
  try {
    const count = (table: string): number => {
      const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { readonly c?: number } | undefined;
      return row?.c ?? 0;
    };
    return { events: count("events"), attempts: count("attempts"), evidence: count("evidence") };
  } finally {
    db.close();
  }
}

describe("DEL-A07: research adds no Work truth, no Evidence and no standing", () => {
  it("a COMPLETED delegation changes no Work count, and admits only a cell-local claim", async () => {
    const root = tempRoot();
    const dir = join(root, "state");
    mkdirSync(dir, { recursive: true });
    const repository = repoUnder(root);
    const reasoningStore = new SqliteReasoningCellStore(join(dir, "reasoning.sqlite"));

    let settle: (value: unknown) => void = () => undefined;
    const host: DelegationBranchHost = {
      adapterId: "ortho-host",
      start: () => ({
        completion: new Promise<unknown>((resolve) => {
          settle = resolve;
        }),
        cancel: () => undefined,
      }),
    };
    const delivered: string[] = [];
    const delivery: PrincipalDeliveryPort = {
      adapterId: "ortho-delivery",
      deliver: async (text) => {
        delivered.push(text);
        return { delivered: true, detail: "recorded" };
      },
    };

    const orchestrationPath = join(dir, "state.sqlite");
    const installed = installPalimpsest({ tools: { register: () => undefined } } as never, {
      projectId: "ortho-project",
      repository,
      databasePath: orchestrationPath,
      ordariumDatabasePath: join(dir, "ordarium.sqlite"),
      clock: () => CLOCK,
      git: new FakeGitPort(HEAD),
      reasoningCellStore: reasoningStore,
      reasoningVerificationPolicy: firstPartyExploratoryVerificationPolicy(),
      reasoningAdmissionPolicy: firstPartyExploratoryAdmissionPolicy(),
      delegationBranchExecution: () => host,
      delegationDelivery: delivery,
    });

    try {
      const before = durableCounts(orchestrationPath);
      // No Work truth exists yet — no project either — so a delegation has nothing to attach to even
      // in principle. `status()` throwing IS that fact, asserted rather than assumed.
      expect(() => installed.controller.status()).toThrow(/project does not exist/u);
      const beforeCells = (await reasoningStore.cells()).length;

      const started = await installed.application.delegation!.start({ task: "is the cache race known?" });
      expect(started.state).toBe("RUNNING");
      settle({ status: "completed", statement: "the race is in invalidate(), and it is known" });
      await new Promise((resolve) => setTimeout(resolve, 50));

      const after = durableCounts(orchestrationPath);
      // The Work plane is untouched: not one event, not one attempt, not one EvidenceAtom. Research
      // happened — a real admitted claim exists below — and it left no Work trace at all.
      expect(after).toEqual(before);
      expect(after.attempts).toBe(0);
      expect(() => installed.controller.status()).toThrow(/project does not exist/u);

      // The ONE thing research DID produce is a cell-local admitted claim, in its own cell — the
      // delegation's own cell, and no other.
      const cells = await reasoningStore.cells();
      expect(cells.length).toBe(beforeCells + 1);
      expect(cells.map((cell) => cell.cellId)).toContain(
        parseDelegationRef(started.delegationRef)!.cellId,
      );

      // And the principal was told what it was: exploratory, not Evidence, not verification.
      expect(delivered).toHaveLength(1);
      expect(delivered[0]).toContain("cell-local exploratory finding");

      /**
       * SENSITIVITY. "Nothing changed" is only evidence if the same measurement MOVES when Work really
       * happens — otherwise it is a property of the counter, not of research. So the control case runs
       * immediately after, through the public lifecycle primitive.
       */
      installed.controller.start({
        projectId: "ortho-project",
        goal: "control",
        tasks: [
          { task_id: "control-1", objective: "control", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
        ],
        headCommit: HEAD,
      } as never);
      const control = durableCounts(orchestrationPath);
      expect(control.events).toBeGreaterThan(after.events);
    } finally {
      await installed.dispose();
    }
  }, 60_000);
});

describe("DEL-A04: no canonical delegation store, event type or authority exists", () => {
  const CANONICAL_DIRECTORIES = ["src/state", "src/schema", "src/domain", "src/state/migrations"];

  it("no delegation store/event/authority type is declared anywhere under the canonical layers", () => {
    // The prohibition is about CANONICAL truth, not about application DTOs: a delegation is a
    // projection over ReasoningCell, so the only names allowed are the interaction-layer ones below.
    const forbidden = [
      /DelegationStore/u,
      /DelegationEvent\b/u,
      /DelegationAuthority/u,
      /DelegationLedger/u,
      /DelegationRecord\b/u,
    ];
    for (const directory of CANONICAL_DIRECTORIES) {
      for (const file of listFiles(directory)) {
        const text = read(file);
        for (const pattern of forbidden) {
          expect(pattern.test(text), `${file} declares a canonical delegation concept (${String(pattern)})`).toBe(false);
        }
      }
    }
  });

  it("no delegation event type exists in the canonical event catalogue", () => {
    // `EVENT_TYPES` is the durable catalogue every canonical store is validated against, so a
    // delegation event would have to appear here to exist at all.
    const models = read("src/schema/models.ts");
    expect(models).toMatch(/export const EVENT_TYPES = \[/u);
    expect(models).not.toMatch(/DELEGATION/u);
  });

  it("the delegation runtime keeps its state in memory, and says so", () => {
    // The host-local map IS the design (§C.11 ①): it answers "is a worker running IN THIS PROCESS",
    // which is the one thing a durable store cannot answer. If that ever became a durable table, this
    // assertion is where the change would have to be argued.
    const runtime = read("src/interaction/delegation.ts");
    expect(runtime).toContain("const active = new Map<");
    expect(runtime).not.toMatch(/SqliteDelegation|delegation\.sqlite/u);
  });
});

/** Every `.ts` file under a repo-relative directory (recursive). */
function listFiles(directory: string): readonly string[] {
  const out: string[] = [];
  const walk = (relative: string): void => {
    let entries: readonly string[];
    try {
      entries = readdirSync(join(REPO, relative), { withFileTypes: true }).map((entry) => entry.name);
    } catch {
      return;
    }
    for (const entry of entries) {
      const next = `${relative}/${entry}`;
      if (entry.endsWith(".ts")) out.push(next);
      else if (!entry.includes(".")) walk(next);
    }
  };
  walk(directory);
  return out;
}
