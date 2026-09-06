import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  cosineSimilarity,
  EMBEDDING_DIMENSIONS,
  hashingEmbedder,
  type EmbeddingPort,
} from "../src/context/index.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

function makeRig(embedding?: EmbeddingPort) {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const git = new FakeGitPort(HEAD);
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-sem-")), "ops.sqlite"),
    git,
    ...(embedding === undefined ? {} : { embedding }),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
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
    clock: () => "2026-08-13T00:00:00Z",
  });
  return { store, controller, git, effects, cleanup: () => effects.close() };
}

async function dispatchOne(controller: ProjectController): Promise<string> {
  controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
  controller.step();
  const created = controller.step()!;
  await controller.claim(created.entity_id);
  return created.entity_id;
}

describe("semantic retrieval channel (PLMP-CTX-3)", () => {
  it("CTX3-A01: the hashing reference embedder is deterministic with raw counts", async () => {
    const embedder = hashingEmbedder();
    const first = await embedder.embed(["population modulation router"]);
    const second = await embedder.embed(["population modulation router"]);
    expect(first[0]).toEqual(second[0]);
    expect(first[0]).toHaveLength(EMBEDDING_DIMENSIONS);
    // Raw bucket counts (r2): repeating a token doubles its bucket.
    const probe = await embedder.embed(["population"]);
    const bucket = probe[0]!.findIndex((value) => value > 0);
    expect(bucket).toBeGreaterThanOrEqual(0);
    const [twice] = await embedder.embed([
      "population population modulation router",
    ]);
    expect(twice![bucket]).toBe(first[0]![bucket]! * 2);
  });

  it("CTX3-A02: file-level cosine ranks the dense match first in the manifest", async () => {
    const { controller, git, cleanup } = makeRig(hashingEmbedder());
    try {
      const attemptId = await dispatchOne(controller);
      git.seedWorktreeFiles(attemptId, {
        // Dense in the objective tokens; the sparse file has one hit.
        "src/dense.py": "task task task task population implementation\n",
        "src/sparse.py": "task\n",
      });
      const result = await controller.compileTaskContext(attemptId);

      expect(result.manifest.retrieval).toContain("semantic");
      expect(result.manifest.semantic).toBeDefined();
      // The dense file ranks first (its dot product is higher), and both
      // files appear in the manifest ordered by score.
      expect(result.manifest.semantic!.map((entry) => entry.path)).toEqual([
        "src/dense.py",
        "src/sparse.py",
      ]);
      const scores = result.manifest.semantic!.map((entry) => entry.score_permille);
      expect(scores).toEqual([...scores].sort((a, b) => b - a));
    } finally {
      cleanup();
    }
  });

  it("CTX3-A03: without an injected port the channel is off and nothing drifts", async () => {
    const { controller, git, cleanup } = makeRig();
    try {
      const attemptId = await dispatchOne(controller);
      git.seedWorktreeFiles(attemptId, {
        "src/task-1.py": "task implementation\n",
      });
      const result = await controller.compileTaskContext(attemptId);
      expect("semantic" in result.manifest).toBe(false);
      expect(result.manifest.retrieval).toEqual(["lexical"]);
      expect("embedding" in controller.effects).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("CTX3-A04: semantic hits are event-sourced and projected", async () => {
    const { controller, git, store, cleanup } = makeRig(hashingEmbedder());
    try {
      const attemptId = await dispatchOne(controller);
      git.seedWorktreeFiles(attemptId, {
        "src/task-1.py": "task implementation for the objective\n",
      });
      const result = await controller.compileTaskContext(attemptId);

      const manifestRow = store.connection
        .prepare("SELECT manifest_json FROM context_manifests WHERE project_id=?")
        .get("scheduler-project") as { manifest_json: Uint8Array };
      const manifest = JSON.parse(new TextDecoder().decode(manifestRow.manifest_json));
      expect(manifest.semantic).toBeDefined();
      expect(manifest.semantic![0]!.path).toBe("src/task-1.py");
      expect(manifest.retrieval).toContain("semantic");

      const event = store.connection
        .prepare("SELECT payload_json FROM events WHERE event_type='CONTEXT_MANIFEST_ADDED'")
        .get() as { payload_json: Uint8Array } | undefined;
      expect(event).toBeDefined();
      const payload = JSON.parse(new TextDecoder().decode(event!.payload_json));
      expect(payload.manifest.semantic![0]!.score_permille).toBe(
        result.manifest.semantic![0]!.score_permille,
      );
    } finally {
      cleanup();
    }
  });

  it("CTX3-A05: the cosine helper is a pure function", () => {
    const a = [0.6, 0.8];
    const b = [0.8, 0.6];
    expect(cosineSimilarity(a, b)).toBe(cosineSimilarity(a, b));
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.96, 10);
  });
});
