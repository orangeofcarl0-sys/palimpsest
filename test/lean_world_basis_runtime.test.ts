/**
 * PLMP-LEAN-1 §D3-a — EXACT-BASIS CAPTURE and the EXACT CURRENTNESS RUNTIME.
 *
 * D3-0 froze the vocabulary; this file proves it now runs. Two properties carry the slice, and both are
 * about NOT drifting back to a global snapshot:
 *
 *     capture basis  ≺  mutation authority        (provenance is observed, never reconstructed)
 *     Attempt provenance is IMMUTABLE             (a moved world is a verdict, not a rewrite)
 *
 * and one deliberate absence:
 *
 *     §D3-a NEVER returns COMPATIBLE
 *
 * "It changed but looks harmless" is a claim that requires proving something about the change. D3-a
 * answers CURRENT / STALE / UNKNOWN and stops, so the tests assert that `COMPATIBLE` cannot come out of
 * this slice even when a change is demonstrably irrelevant to the work.
 *
 * The asset case is the one that proves currentness has actually left the Git-centric world: it is a
 * divergence with NO source movement at all, which a `HEAD`-equality model cannot express.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import {
  SqliteAttemptWorldBasisStore,
  basisFromKnownWorld,
  deriveWorkDependency,
  legacyD2BasisForAssessment,
  makeProjectWorldBasisRuntime,
  semanticProjectionDigestOf,
  type ProjectWorldObservationPort,
} from "../src/project_world/index.js";
import {
  NOT_REQUIRED,
  bound,
  materializeWorkDependency,
  unknown,
  type AssetRevisionBinding,
  type FacetBinding,
  type ProjectWorldState,
  type SourceRevisionBinding,
} from "../src/domain/world_basis.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import type { TaskEnvelope } from "../src/schema/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

const git = (cwd: string, args: readonly string[]): string =>
  execFileSync("git", [...args], { cwd, encoding: "utf8" }).trim();

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["test fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

/* ------------------------------------------------------------------ a real repository */

function workspace(): { root: string; repo: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "palimpsest-d3a-"));
  const repo = join(root, "repo");
  mkdirSync(join(repo, "src"), { recursive: true });
  writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
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

/** An ENVELOPE-shaped input for the digest, so the fixture does not depend on the full parser. */
function envelopeOf(overrides: Partial<TaskEnvelope> = {}): TaskEnvelope {
  return {
    schema_version: 1,
    project_id: "d3a",
    task_id: "t1",
    envelope_id: "env-1",
    project_revision: 1,
    project_digest: "d".repeat(64),
    base_commit: "0".repeat(40),
    objective: "tidy the source",
    read_paths: ["src"],
    write_paths: ["src/a.ts"],
    required_artifacts: [],
    allowed_commands: [{ executable: "node", argv_prefix: ["-e"] }],
    network_policy: "deny",
    network_allowlist: [],
    timeout_s: 60,
    lease_s: 10,
    attempt_limit: 2,
    candidate_limit: 1,
    idempotency_key: "k1",
    ...overrides,
  };
}

/* ------------------------------------------------------------------ a controllable world */

/**
 * An observation port whose world the test drives. It is the SAME shape the first-party port satisfies,
 * so what the tests exercise is the runtime's logic rather than a fixture's convenience.
 */
function fakeWorld(input: {
  readonly projectId?: string;
  readonly revision?: number;
  readonly source?: string | null;
  readonly projection?: string | null;
  readonly assets?: FacetBinding<readonly AssetRevisionBinding[]> | undefined;
  readonly environment?: FacetBinding<{ readonly component: string; readonly revision: string }> | undefined;
}) {
  const state = {
    revision: input.revision ?? 41,
    source: input.source === undefined ? ("H0" as string | null) : input.source,
    projection: input.projection === undefined ? ("sem-1" as string | null) : input.projection,
    assets: input.assets ?? (NOT_REQUIRED as FacetBinding<readonly AssetRevisionBinding[]>),
    environment: input.environment ?? (NOT_REQUIRED as FacetBinding<{ readonly component: string; readonly revision: string }>),
  };
  const port: ProjectWorldObservationPort = {
    adapterId: "test-world-observation",
    observeSource: () =>
      state.source === null
        ? { ok: false, detail: "the test world has no source" }
        : { ok: true, revision: Object.freeze({ backend: "git", revision: state.source }) },
    observeSemanticProjection: (taskId) =>
      taskId !== "t1" || state.projection === null
        ? null
        : { ok: true, digest: state.projection },
    /**
     * The optional asset observation, supplied because this fixture IS a deployment that can see
     * assets — which is what makes the "source unchanged, asset moved ⇒ STALE" case reachable. A
     * deployment that cannot see them omits the method, and the runtime reports UNKNOWN.
     */
    observeAssets: () => state.assets,
    observeRevision: () => state.revision,
  };
  return { port, state };
}

function runtimeFor(world: ReturnType<typeof fakeWorld>, projectId = "d3a") {
  const store = new SqliteAttemptWorldBasisStore(":memory:");
  cleanups.push(() => store.close());
  const runtime = makeProjectWorldBasisRuntime({
    projectId,
    store,
    observation: world.port,
    clock: () => "2026-09-24T00:00:00.000Z",
  });
  return { store, runtime };
}

const captureInput = (attemptId: string, envelope = envelopeOf()) => ({ attemptId, taskId: envelope.task_id, envelope });

/* ================================================================== *
 * Capture, and immutability
 * ================================================================== */

describe("§D3-a capture records the dependency projection, once", () => {
  it("a capture records a basis whose source and semantic projection come from the observed world", () => {
    const world = fakeWorld({ source: "H0", projection: "sem-1" });
    const { runtime } = runtimeFor(world);
    const result = runtime.capture(captureInput("attempt-1"));
    expect(result.state).toBe("CAPTURED");
    if (result.state !== "CAPTURED") throw new Error("expected a capture");
    expect(result.record.basis.source).toEqual(bound({ backend: "git", revision: "H0" }));
    expect(result.record.basis.semanticProjectionDigest).toBe("sem-1");
    // The work declares no asset read, so the facet is KNOWLEDGE that assets do not matter — not the
    // deployment's ignorance, which is what the observed world reports for that facet.
    expect(result.record.basis.assets.state).toBe("NOT_REQUIRED");
    // The footprint is stored WITH the basis, because currentness must re-resolve through it.
    expect(result.record.dependency.reads.map((selector) => selector.domain)).toEqual(["source"]);
  });

  it("a SECOND capture for the same attempt keeps the FIRST basis, even after the world moved", () => {
    const world = fakeWorld({ source: "H0", projection: "sem-1" });
    const { runtime } = runtimeFor(world);
    const first = runtime.capture(captureInput("attempt-1"));
    if (first.state !== "CAPTURED") throw new Error("expected a capture");

    // The world moves in every facet.
    world.state.source = "H9";
    world.state.projection = "sem-9";
    world.state.revision = 99;

    const second = runtime.capture(captureInput("attempt-1"));
    expect(second.state).toBe("ALREADY_CAPTURED");
    if (second.state !== "ALREADY_CAPTURED") throw new Error("expected the existing record");
    // Byte-identical provenance: the attempt's basis is what it STARTED from, forever.
    expect(second.record.basis.basisDigest).toBe(first.record.basis.basisDigest);
    expect(second.record.basis.source).toEqual(bound({ backend: "git", revision: "H0" }));
    expect(second.record.capturedAt).toBe(first.record.capturedAt);
  });

  it("an unobservable world records NOTHING — a refusal, not a partial capture", () => {
    const world = fakeWorld({ source: null });
    const { runtime, store } = runtimeFor(world);
    const result = runtime.capture(captureInput("attempt-1"));
    expect(result.state).toBe("UNOBSERVABLE");
    // The store is untouched, so a later assessment reports "no basis" rather than a fabricated one.
    expect(store.read({ projectId: "d3a", attemptId: "attempt-1" })).toBe(null);
  });

  it("a task the project does not know cannot be captured", () => {
    const world = fakeWorld({ projection: null });
    const { runtime } = runtimeFor(world);
    const result = runtime.capture(captureInput("attempt-1", envelopeOf({ task_id: "gone" })));
    expect(result.state).toBe("UNOBSERVABLE");
  });
});

/* ================================================================== *
 * The semantic projection digest: what is in it, and what is NOT
 * ================================================================== */

describe("§D3-a the semantic projection excludes every POSITIONAL field", () => {
  it("a ProjectIR revision bump does NOT move the digest", () => {
    const at41 = semanticProjectionDigestOf(envelopeOf({ project_revision: 41, project_digest: "a".repeat(64) }));
    const at42 = semanticProjectionDigestOf(envelopeOf({ project_revision: 42, project_digest: "b".repeat(64) }));
    expect(at42).toBe(at41);
  });

  it("a base-commit change does NOT move the digest either — source is a SEPARATE facet", () => {
    const atH0 = semanticProjectionDigestOf(envelopeOf({ base_commit: "0".repeat(40) }));
    const atH1 = semanticProjectionDigestOf(envelopeOf({ base_commit: "1".repeat(40) }));
    expect(atH1).toBe(atH0);
  });

  it("but every SEMANTIC field does move it", () => {
    const base = semanticProjectionDigestOf(envelopeOf());
    for (const change of [
      { objective: "something else" },
      { write_paths: ["src/other.ts"] },
      { read_paths: ["docs"] },
      { required_artifacts: ["out.txt"] },
      { allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }] },
      { network_policy: "allow-listed" as const },
      { timeout_s: 120 },
      { attempt_limit: 4 },
    ] satisfies readonly Partial<TaskEnvelope>[]) {
      expect(semanticProjectionDigestOf(envelopeOf(change)), JSON.stringify(change)).not.toBe(base);
    }
  });

  it("the digest ignores field ORDER of the arrays' contents (it is a canonical digest)", () => {
    const one = semanticProjectionDigestOf(envelopeOf({ write_paths: ["a", "b"] }));
    const other = semanticProjectionDigestOf(envelopeOf({ write_paths: ["a", "b"] }));
    expect(other).toBe(one);
  });
});

/* ================================================================== *
 * The nine runtime cases §D3-a must prove
 * ================================================================== */

describe("§D3-a exact currentness, end to end through the runtime", () => {
  it("1+2: only capturedAtRevision moves ⇒ CURRENT", () => {
    const world = fakeWorld({ revision: 41 });
    const { runtime } = runtimeFor(world);
    runtime.capture(captureInput("attempt-1"));
    world.state.revision = 999;
    const assessment = runtime.assessCurrentness({ attemptId: "attempt-1" });
    expect(assessment?.currentness).toBe("CURRENT");
    expect(assessment?.compatibility).toBe("EXACT");
    expect(assessment?.reasons).toEqual([]);
  });

  it("3: unrelated ProjectIR state changes but the semantic projection does not ⇒ CURRENT", () => {
    const world = fakeWorld({ projection: "sem-1" });
    const { runtime } = runtimeFor(world);
    runtime.capture(captureInput("attempt-1"));
    // Another task's work bumped the revision; this task's envelope is byte-identical, so its
    // projection digest is unchanged — and the runtime re-derives it rather than trusting a counter.
    world.state.revision = 77;
    world.state.projection = "sem-1";
    expect(runtime.assessCurrentness({ attemptId: "attempt-1" })?.currentness).toBe("CURRENT");
  });

  it("4: a bound source change ⇒ STALE", () => {
    const world = fakeWorld({ source: "H0" });
    const { runtime } = runtimeFor(world);
    runtime.capture(captureInput("attempt-1"));
    world.state.source = "H1";
    const assessment = runtime.assessCurrentness({ attemptId: "attempt-1" });
    expect(assessment?.currentness).toBe("STALE");
    expect(assessment?.reasons.join(" ")).toContain("source");
    // §D3-a does not have the vocabulary to call that compatible, and must not reach for it.
    expect(assessment?.compatibility).toBe("UNKNOWN");
  });

  it("5: source UNCHANGED and a bound asset revision changes ⇒ STALE (currentness has left Git)", () => {
    /**
     * The case a `HEAD`-equality model cannot represent. The asset facet is injected as BOUND and
     * observed, because no canonical field declares an asset dependency yet — this is the runtime
     * proving the SEMANTICS are ready for one, which is exactly what D3-0 and D3-a are for.
     *
     * The record is written DIRECTLY to a fresh store rather than captured, because the runtime's own
     * derivation produces a source-only footprint for today's envelopes. What is under test here is the
     * ASSESSMENT, and writing the record through the same `appendOnce` the runtime uses keeps the
     * immutability rule intact — a capture would simply win the race and stand.
     */
    const assetsA3 = bound(Object.freeze([{ assetRef: "A", revision: "A3" }]));
    const world = fakeWorld({ source: "H0", assets: assetsA3 });
    const store = new SqliteAttemptWorldBasisStore(":memory:");
    cleanups.push(() => store.close());

    const dependency = materializeWorkDependency({
      reads: [{ domain: "source", scope: "repository" }, { domain: "asset", assetRef: "A" }],
      writes: [{ domain: "source", scope: "repository" }],
    });
    const written = store.appendOnce({
      schemaVersion: 1,
      projectId: "d3a",
      attemptId: "attempt-asset",
      taskId: "t1",
      dependency,
      basis: basisFromKnownWorld({
        projectId: "d3a",
        taskId: "t1",
        capturedAtRevision: 41,
        semanticProjectionDigest: "sem-1",
        source: bound({ backend: "git", revision: "H0" }),
        assets: assetsA3,
      }),
      capturedAt: "2026-09-24T00:00:00.000Z",
    });
    // The record really was written, and its asset facet really is BOUND.
    expect(written.state).toBe("APPENDED");
    expect(written.record.basis.assets.state).toBe("BOUND");

    const assessing = makeProjectWorldBasisRuntime({ projectId: "d3a", store, observation: world.port });

    // The SOURCE has not moved at all.
    world.state.source = "H0";
    world.state.assets = bound(Object.freeze([{ assetRef: "A", revision: "A4" }]));

    const assessment = assessing.assessCurrentness({ attemptId: "attempt-asset" });
    expect(assessment?.currentness).toBe("STALE");
    expect(assessment?.reasons.join(" ")).toContain("assets");
    // …and the source is explicitly NOT among the reasons.
    expect(assessment?.reasons.join(" ")).not.toContain("source:");
  });

  it("6: an asset change where the facet is NOT_REQUIRED ⇒ CURRENT", () => {
    const world = fakeWorld({ source: "H0", assets: bound(Object.freeze([{ assetRef: "A", revision: "A3" }])) });
    const { runtime } = runtimeFor(world);
    runtime.capture(captureInput("attempt-1"));
    world.state.assets = bound(Object.freeze([{ assetRef: "A", revision: "A4" }]));
    // The work never declared an asset read, so this is knowledge that assets cannot affect it.
    expect(runtime.assessCurrentness({ attemptId: "attempt-1" })?.currentness).toBe("CURRENT");
  });

  it("6b: a deployment that CANNOT observe assets reports UNKNOWN for an asset-bound work, never CURRENT", () => {
    /**
     * The same world and the same basis as case 5, but observed by a deployment with no asset
     * observation at all. The verdict must be UNKNOWN: the facet is required by the work and the
     * deployment cannot establish it. `NOT_REQUIRED` would be a knowledge claim nobody made, and
     * CURRENT would be exactly the fabricated pass this vocabulary exists to refuse.
     */
    const assetsA3 = bound(Object.freeze([{ assetRef: "A", revision: "A3" }]));
    const world = fakeWorld({ source: "H0" });
    const store = new SqliteAttemptWorldBasisStore(":memory:");
    cleanups.push(() => store.close());
    store.appendOnce({
      schemaVersion: 1,
      projectId: "d3a",
      attemptId: "attempt-blind",
      taskId: "t1",
      dependency: materializeWorkDependency({
        reads: [{ domain: "source", scope: "repository" }, { domain: "asset", assetRef: "A" }],
        writes: [],
      }),
      basis: basisFromKnownWorld({
        projectId: "d3a",
        taskId: "t1",
        capturedAtRevision: 41,
        semanticProjectionDigest: "sem-1",
        source: bound({ backend: "git", revision: "H0" }),
        assets: assetsA3,
      }),
      capturedAt: "2026-09-24T00:00:00.000Z",
    });
    // A port with NO `observeAssets`: the deployment is blind to that facet.
    const blind: ProjectWorldObservationPort = {
      adapterId: "blind-observation",
      observeSource: () => ({ ok: true, revision: Object.freeze({ backend: "git", revision: "H0" }) }),
      observeSemanticProjection: () => ({ ok: true, digest: "sem-1" }),
      observeRevision: () => 41,
    };
    const runtime = makeProjectWorldBasisRuntime({ projectId: "d3a", store, observation: blind });
    const assessment = runtime.assessCurrentness({ attemptId: "attempt-blind" });
    expect(assessment?.currentness).toBe("UNKNOWN");
    expect(assessment?.compatibility).toBe("UNKNOWN");
    expect(assessment?.reasons.join(" ")).toContain("cannot prove exactness");
  });

  it("7: a required facet the world cannot report ⇒ UNKNOWN, never CURRENT", () => {
    const world = fakeWorld({ source: "H0" });
    const { runtime } = runtimeFor(world);
    runtime.capture(captureInput("attempt-1"));
    world.state.source = null;
    const assessment = runtime.assessCurrentness({ attemptId: "attempt-1" });
    expect(assessment?.currentness).toBe("UNKNOWN");
    expect(assessment?.compatibility).toBe("UNKNOWN");
  });

  it("8: an attempt with NO captured basis yields null — not a verdict, not a fabrication", () => {
    const world = fakeWorld({});
    const { runtime } = runtimeFor(world);
    expect(runtime.assessCurrentness({ attemptId: "never-captured" })).toBe(null);
    expect(runtime.read({ attemptId: "never-captured" })).toBe(null);
  });

  it("9: the stored basis is unchanged by any number of assessments", () => {
    const world = fakeWorld({ source: "H0" });
    const { runtime, store } = runtimeFor(world);
    runtime.capture(captureInput("attempt-1"));
    const before = JSON.stringify(store.read({ projectId: "d3a", attemptId: "attempt-1" }));

    world.state.source = "H1";
    for (let i = 0; i < 3; i += 1) runtime.assessCurrentness({ attemptId: "attempt-1" });
    world.state.source = "H2";
    runtime.assessCurrentness({ attemptId: "attempt-1" });

    expect(JSON.stringify(store.read({ projectId: "d3a", attemptId: "attempt-1" }))).toBe(before);
    // And the verdict follows the world rather than the record.
    expect(runtime.assessCurrentness({ attemptId: "attempt-1" })?.currentness).toBe("STALE");
  });
});

/* ================================================================== *
 * A retired task is a PROVEN divergence, not an unknown
 * ================================================================== */

describe("§D3-a a task the project no longer knows", () => {
  it("reports STALE, because the projection the basis was cut from does not exist any more", () => {
    const world = fakeWorld({ projection: "sem-1" });
    const { runtime } = runtimeFor(world);
    runtime.capture(captureInput("attempt-1"));
    // The task disappears from the current project (retired / re-architected away).
    world.state.projection = null;
    const assessment = runtime.assessCurrentness({ attemptId: "attempt-1" });
    expect(assessment?.currentness).toBe("STALE");
    expect(assessment?.detail).toContain("no longer in the current project");
  });
});

/* ================================================================== *
 * §D3-a cannot produce COMPATIBLE
 * ================================================================== */

describe("§D3-a the slice's hard boundary: exact currentness only", () => {
  it("no assessment this slice can produce is COMPATIBLE", () => {
    const cases: readonly (() => string | undefined)[] = [
      () => {
        const world = fakeWorld({ source: "H0" });
        const { runtime } = runtimeFor(world);
        runtime.capture(captureInput("attempt-1"));
        return runtime.assessCurrentness({ attemptId: "attempt-1" })?.compatibility;
      },
      () => {
        const world = fakeWorld({ source: "H0" });
        const { runtime } = runtimeFor(world);
        runtime.capture(captureInput("attempt-1"));
        world.state.source = "H1";
        return runtime.assessCurrentness({ attemptId: "attempt-1" })?.compatibility;
      },
      () => {
        const world = fakeWorld({ source: null });
        const { runtime } = runtimeFor(world);
        runtime.capture(captureInput("attempt-1"));
        return runtime.assessCurrentness({ attemptId: "attempt-1" })?.compatibility;
      },
    ];
    for (const produce of cases) {
      const verdict = produce();
      expect(verdict, "§D3-a must never claim compatibility").not.toBe("COMPATIBLE");
      expect(verdict).not.toBe("INCOMPATIBLE");
    }
  });
});

/* ================================================================== *
 * Legacy honesty
 * ================================================================== */

describe("§D3-a a legacy D2 attempt is assessed without manufacturing its provenance", () => {
  it("its assets and environment are UNKNOWN, so exactness is unprovable", () => {
    const world = fakeWorld({ source: "H0", projection: "sem-1" });
    const { runtime } = runtimeFor(world);
    // The legacy basis is built for ASSESSMENT only — nothing is written.
    const legacy = legacyD2BasisForAssessment({
      projectId: "d3a",
      taskId: "t1",
      attemptId: "d2-attempt",
      baseCommit: "H0",
      semanticProjectionDigest: "sem-1",
      capturedAtRevision: 41,
      dependency: deriveWorkDependency(envelopeOf()),
    });
    expect(legacy.basis.assets.state).toBe("UNKNOWN");
    expect(legacy.basis.environment.state).toBe("UNKNOWN");
    // The runtime reports "no basis" for that attempt, because a reconstruction is not a capture.
    expect(runtime.assessCurrentness({ attemptId: "d2-attempt" })).toBe(null);
  });
});

/* ================================================================== *
 * The packaged path: capture happens for real, before any effect
 * ================================================================== */

describe("§D3-a the packaged path captures a real attempt's basis", () => {
  it("a real deployment records the basis at claim, and currentness follows the real repository", async () => {
    const { root, repo, head } = workspace();
    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "d3a",
        databasePath: join(root, "p.sqlite"),
        ordariumDatabasePath: join(root, "o.sqlite"),
        repository: repo,
        git: new GitCliPort(repo, join(repo, ".palimpsest", "worlds")),
        execution: "worktree",
        standard: standardOf(),
        policy: trustedDefaultPolicy({ allowed_commands: [{ executable: "node", argv_prefix: ["-e", "process.exit(0)"] }] }),
      } as never,
    );
    cleanups.push(() => void installed.dispose());
    const controller = installed.controller;
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

    await call("palimpsest_start", {
      projectId: "d3a",
      goal: "tidy a",
      headCommit: head,
      tasks: [
        { task_id: "t1", objective: "tidy a", depends_on: [], write_paths: ["src/a.ts"], required_artifacts: [] },
      ],
    });

    const prepared = await controller.prepareMutatingWork();
    // The basis was recorded BY THE CLAIM, before the world existed.
    const basis = controller.attemptWorldBasis(prepared.attemptId);
    expect(basis).not.toBe(null);
    expect(basis?.taskId).toBe("t1");
    expect(basis?.basisDigest).toMatch(/^[0-9a-f]{64}$/u);

    // Unchanged, the attempt is exactly current.
    const before = controller.attemptCurrentness(prepared.attemptId);
    expect(before?.currentness).toBe("CURRENT");
    expect(before?.compatibility).toBe("EXACT");
    expect(before?.basisDigest).toBe(basis?.basisDigest);

    /**
     * Now move the BOUND source facet in the REAL repository. The world has genuinely moved, and the
     * verdict must follow it — while the recorded basis stays what it was.
     */
    writeFileSync(join(repo, "src", "b.ts"), "export const b = 1;\n");
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "unrelated canonical work"], { cwd: repo });

    const after = controller.attemptCurrentness(prepared.attemptId);
    expect(after?.currentness).toBe("STALE");
    // Provenance is immutable: the digest the attempt carries did not move.
    expect(after?.basisDigest).toBe(basis?.basisDigest);
    expect(controller.attemptWorldBasis(prepared.attemptId)?.basisDigest).toBe(basis?.basisDigest);
    // §D3-a still cannot claim compatibility.
    expect(after?.compatibility).toBe("UNKNOWN");
  }, 120_000);

  it("a deployment with no repository composes no basis capability, and says so", () => {
    // A real directory, because the orchestration store is opened by path (not `:memory:`).
    const root = mkdtempSync(join(tmpdir(), "palimpsest-d3a-norepo-"));
    cleanups.push(() => {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // The OS reaps it.
      }
    });
    const installed = installPalimpsest(
      { tools: { register: () => () => undefined } } as never,
      {
        projectId: "d3a-norepo",
        databasePath: join(root, "p.sqlite"),
        ordariumDatabasePath: join(root, "o.sqlite"),
        execution: "in-place",
        standard: standardOf(),
        policy: trustedDefaultPolicy(),
      } as never,
    );
    cleanups.push(() => void installed.dispose());
    // No world to observe ⇒ no basis recorded ⇒ the reads report that honestly rather than inventing.
    expect(installed.controller.attemptWorldBasis("anything")).toBe(null);
    expect(installed.controller.attemptCurrentness("anything")).toBe(null);
  }, 60_000);
});

/* ================================================================== *
 * The OUT list, as a machine check
 * ================================================================== */

describe("§D3-a scope: assessment only, no effect", () => {
  it("the plane contains no transplant, merge or solver, and writes no canonical Work state", () => {
    const read = (relative: string): string => {
      const text = execFileSync(process.execPath, ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, relative))},'utf8'))`], {
        encoding: "utf8",
      });
      const withoutBlocks = text.replace(/\/\*[\s\S]*?\*\//gu, "");
      return withoutBlocks
        .split(String.fromCharCode(10))
        .map((line) => {
          const at = line.indexOf("//");
          return at < 0 ? line : line.slice(0, at);
        })
        .join(String.fromCharCode(10));
    };
    for (const file of ["src/project_world/runtime.ts", "src/project_world/basis_store.ts", "src/project_world/dependency.ts"]) {
      const text = read(file);
      for (const forbidden of [
        "cherry-pick",
        "mergeBase",
        "merge-base",
        "threeWay",
        "rebase",
        "transplant",
        "inferCompatibility",
        "proveCompatible",
        // No canonical Work mutation: this plane records provenance and reports verdicts.
        "ATTEMPT_COMPLETED",
        "ATTEMPT_FAILED",
        "recordCallback",
        "promoteAttempt",
        "assessPromotionEligibility",
      ]) {
        expect(text, `${file} must not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });

  it("the store is APPEND-ONCE: the write path has no upsert and no update", () => {
    const source = execFileSync(
      process.execPath,
      ["-e", `process.stdout.write(require('node:fs').readFileSync(${JSON.stringify(join(REPO, "src/project_world/basis_store.ts"))},'utf8'))`],
      { encoding: "utf8" },
    ).toUpperCase();
    // A second capture cannot rewrite the first, and the schema enforces it independently of the code.
    expect(source).not.toContain("ON CONFLICT");
    expect(source).not.toContain("UPDATE ATTEMPT_WORLD_BASIS");
    expect(source).toContain("PRIMARY KEY (PROJECT_ID, ATTEMPT_ID)");
  });
});
