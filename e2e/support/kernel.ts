/**
 * Spec 36 §11/§13: the in-process REAL-KERNEL fixture.
 *
 * Browser → built dist/web bundle → real serveOrchestration (HTTP) → real
 * ProjectController → real EventStore/SQLite → real projections; only the
 * external side-effect boundary (git) is the declared deterministic test
 * port (FakeGitPort). Nothing about Palimpsest's kernel is mocked (§1).
 *
 * The kernel modules are imported from dist/src (the built product) so the
 * suite can never silently drift onto a development-only stack (§12);
 * `pnpm test:e2e` rebuilds both faces first via its pretest hook.
 *
 * Seeding (§15) uses public controller methods BEFORE any browser action to
 * establish topology/holds/attempts/concurrency - setup, never the subject
 * under test. No production test endpoints exist (§14). Every test gets a
 * fresh temp dir + fresh SQLite + fresh ephemeral port (§10/§34); teardown
 * releases every handle (§33).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { EventStore } from "../../dist/src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../../dist/src/effects/index.js";
import { ProjectController } from "../../dist/src/tools/index.js";
import { serveOrchestration } from "../../dist/src/serve.js";
import { DEFAULT_STAGE_GRAPH, TaskPolicy } from "../../dist/src/domain/index.js";

const HEAD = "c".repeat(40);
export const E2E_PROJECT = "e2e-project";
export const E2E_TOKEN = "e2e-token";

const taskSpec = (taskId: string, dependsOn: readonly string[] = []) => ({
  task_id: taskId,
  objective: `Complete ${taskId}.`,
  depends_on: [...dependsOn],
  write_paths: [`src/${taskId}.py`],
  required_artifacts: [`src/${taskId}.py`],
});

const policy = () =>
  new TaskPolicy({
    policy_id: "trusted-default",
    read_paths: ["src"],
    allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 3,
    candidate_limit: 1,
  });

export interface KernelSession {
  readonly url: string;
  readonly token: string;
  readonly projectId: string;
  readonly controller: ProjectController;
  readonly store: EventStore;
  /** Human-readable unique suffix for localStorage-based docs (per test). */
  close(): Promise<void>;
}

export async function startKernel(): Promise<KernelSession> {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-e2e-"));
  const store = new EventStore(join(dir, "palimpsest.sqlite"), {
    clock: () => new Date().toISOString(),
  });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "ordarium.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: E2E_PROJECT,
    policy: policy(),
    clock: () => new Date().toISOString(),
  });
  const handle = await serveOrchestration(controller, {
    host: "127.0.0.1",
    port: 0,
    token: E2E_TOKEN,
  });
  return {
    url: handle.url,
    token: E2E_TOKEN,
    projectId: E2E_PROJECT,
    controller,
    store,
    close: async () => {
      await handle.close();
      await effects.close();
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

// ---------------------------------------------------------------------------
// Scenario vocabulary (§16): setup via real kernel methods, nothing bespoke.
// ---------------------------------------------------------------------------

export type Scenario = "empty" | "basic" | "runtime" | "concurrency2";

export async function seed(session: KernelSession, scenario: Scenario): Promise<void> {
  const controller = session.controller;
  switch (scenario) {
    case "empty":
      return;
    case "basic":
      controller.start({
        projectId: session.projectId,
        goal: "e2e basic",
        tasks: [taskSpec("task-1"), taskSpec("task-2", ["task-1"])],
      });
      return;
    case "runtime": {
      controller.start({
        projectId: session.projectId,
        goal: "e2e runtime",
        tasks: [taskSpec("task-1")],
      });
      controller.declareRoleTable({
        roles: [
          { role: "implementer", slots: 2 },
          { role: "tester", slots: 1 },
          { role: "verifier", slots: 1 },
          { role: "scout", slots: 1 },
          { role: "analyst", slots: 1 },
        ],
        hardCap: 6,
        declaredBy: "e2e",
      });
      controller.step();
      const created = controller.step();
      if (created === null || created.event_type !== "ATTEMPT_CREATED") {
        throw new Error(`runtime seed expected ATTEMPT_CREATED, got ${created?.event_type ?? "null"}`);
      }
      // Awaited: the seeded RUNNING attempt must be durable BEFORE the
      // browser opens - a fire-and-forget claim races the first poll.
      await controller.claim(created.entity_id, { model: "e2e-model", cost: 1 });
      return;
    }
    case "concurrency2": {
      controller.start({
        projectId: session.projectId,
        goal: "e2e concurrency",
        tasks: [
          taskSpec("task-a"),
          taskSpec("task-b"),
          taskSpec("task-c", ["task-a", "task-b"]),
        ],
        // PLMP-SCHED-1: latch concurrency on the ACTIVE stage.
        stageGraph: {
          ...DEFAULT_STAGE_GRAPH,
          stages: [
            { id: "active", state: "ACTIVE", concurrency: 2 },
            { id: "verifying", state: "VERIFYING" },
            { id: "blocked", state: "BLOCKED" },
            { id: "ready", state: "READY" },
          ],
        },
      });
      controller.declareRoleTable({
        roles: [
          { role: "implementer", slots: 2 },
          { role: "tester", slots: 1 },
          { role: "verifier", slots: 1 },
          { role: "scout", slots: 1 },
          { role: "analyst", slots: 1 },
        ],
        hardCap: 6,
        declaredBy: "e2e",
      });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Page + selector helpers (§17/§18/§41)
// ---------------------------------------------------------------------------

/** Inject the known token before any page script runs (§17): every suite
 * skips the login ritual except the ONE dedicated auth scenario. An optional
 * draft doc seeds the client-side scratchpad (localStorage) - setup, never
 * the subject under test (§15). */
export const pageTokenInit =
  (session: KernelSession, draftDoc?: unknown) =>
  async (page: import("@playwright/test").Page) => {
    await page.addInitScript(
      ([token, projectId, doc]) => {
        window.localStorage.setItem("palimpsest-token", token ?? "");
        if (doc !== null && doc !== undefined) {
          window.localStorage.setItem(`palimpsest-canvas-${projectId ?? ""}`, doc as string);
        }
      },
      [session.token, session.projectId, draftDoc === undefined ? null : JSON.stringify(draftDoc)] as const,
    );
  };

export const canvasNode = (page: import("@playwright/test").Page, key: string) =>
  page.locator(`[data-canvas-node-key="${key}"]`);

/** Drag an element by a viewport-pixel delta (React Flow node moves): grab
 * its center, move in steps so the drag gesture registers, release. */
export const dragBy = async (
  page: import("@playwright/test").Page,
  element: import("@playwright/test").Locator,
  dx: number,
  dy: number,
): Promise<void> => {
  const box = (await element.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 12 });
  await page.mouse.up();
};

/** Drag one element onto another (center to center, stepped): the stepped
 * gesture is what React Flow's node-drag recognizer needs. */
export const dragOnto = async (
  page: import("@playwright/test").Page,
  from: import("@playwright/test").Locator,
  to: import("@playwright/test").Locator,
): Promise<void> => {
  const fromBox = (await from.boundingBox())!;
  const toBox = (await to.boundingBox())!;
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 12 });
  await page.mouse.up();
};

export const liveNode = (page: import("@playwright/test").Page, taskId: string) =>
  page.locator(`[data-graph-node-key="${taskId}"]`);

export const satelliteNode = (page: import("@playwright/test").Page, attemptId: string) =>
  page.locator(`[data-attempt-id="${attemptId}"]`);

export const holdRow = (page: import("@playwright/test").Page, taskId: string) =>
  page.locator(`[data-hold-task-id="${taskId}"]`);

/** The persisted draft doc for this origin (client-side scratch, §42). */
export const readLocalDoc = (page: import("@playwright/test").Page, projectId: string) =>
  page.evaluate((pid) => {
    const raw = window.localStorage.getItem(`palimpsest-canvas-${pid}`);
    return raw === null ? null : (JSON.parse(raw) as unknown);
  }, projectId);
