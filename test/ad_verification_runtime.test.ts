/**
 * G10-AD Independent Project Verification Runtime — CORE PROOF SUITE
 * (AD-N01 … AD-N16, AD-N28, AD-N29 + the §26 golden proofs).
 *
 * Everything here exercises the REAL plane on REAL temp files:
 *   - a real Work `EventStore` (so the Work Evidence / ProjectIR footprint is
 *     inspectable in SQL),
 *   - the real `ProjectController` (the canonical ProjectIR projection owner),
 *   - a real `SqliteProjectVerificationStore` (the append-only history),
 *   - the real `SqliteProofEvidenceStore` and `SqliteReasoningCellStore` (the
 *     planes a verification result must NEVER reach),
 *   - the real `firstPartyProjectHeadVerificationSource` / registry / service.
 *
 * Only the Git head port, the clock and the verifier PROVIDER are adapters — the
 * three seams the plane itself declares. ProjectIR / Work / Proof / Reasoning
 * semantics are never mocked.
 *
 * The suite is deliberately hostile to the plane's own marketing: it proves what
 * a verification result is NOT (truth, Work Evidence, Proof publication,
 * Reasoning admission, task failure, authority) before it proves what it is.
 *
 * HONEST notes collected at the bottom of this file (search for "HONEST:").
 */

import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { TaskPolicy } from "../src/domain/index.js";
import { FakeGitPort, createPalimpsestEffects } from "../src/effects/index.js";
import type { PalimpsestEffectsRuntime } from "../src/effects/index.js";
import { llmJudgeValidator, validatorVerdictToOutcome } from "../src/experiment/index.js";
import { SqliteProofEvidenceStore } from "../src/proof_asset/index.js";
import { SqliteReasoningCellStore } from "../src/reasoning_cell/index.js";
import { canonicalDatetime } from "../src/schema/index.js";
import { EventStore } from "../src/state/index.js";
import { ProjectController } from "../src/tools/index.js";
import {
  PROJECT_VERIFICATION_GENESIS,
  SqliteProjectVerificationStore,
  classifyModelIndependence,
  commandProjectHeadVerifier,
  countsAsIndependent,
  effectiveModelIndependenceClass,
  experimentValidatorProjectHeadAdapter,
  firstPartyMechanicalVerifierDefinition,
  firstPartyProjectHeadVerificationSource,
  makeProjectVerificationService,
  materializeProjectVerificationRequest,
  materializeProjectVerifierRawResult,
  materializeVerifierDefinition,
  materializeVerifierRegistry,
  stateForVerdict,
  verificationIsDue,
} from "../src/project_verification/index.js";
import type {
  ProjectHeadVerificationSource,
  ProjectVerificationService,
  ProjectVerifierPort,
  ProjectVerifierRawResult,
  ProjectVerifierRegistry,
  ProjectVerifierVerifyInput,
  VerifierDefinition,
  VerifierIndependenceClass,
  ModelVerifierFacts,
} from "../src/project_verification/index.js";

import { taskSpec } from "./helpers.js";

/* -------------------------------------------------------------------------- *
 * Shared fixture
 * -------------------------------------------------------------------------- */

const PROJECT = "ad-verification-project";
const HEAD = "c".repeat(40);
const AMBIENT_GIT = "d".repeat(40);
const CLOCK = "2026-09-16T00:00:00Z";
/**
 * The store digests the timestamp it is HANDED, but the parser re-normalizes it
 * to the canonical micro form on read, so raw store callers must hand it a
 * canonical timestamp (the service always does, via `canonicalDatetime(clock)`).
 * See AD-N29b, which documents the resulting plane defect for a non-canonical
 * timestamp.
 */
const CANONICAL_CLOCK = canonicalDatetime(CLOCK);

interface Core {
  readonly dir: string;
  readonly workStore: EventStore;
  readonly effects: PalimpsestEffectsRuntime;
  readonly controller: ProjectController;
  readonly proofStore: SqliteProofEvidenceStore;
  readonly reasoningStore: SqliteReasoningCellStore;
  readonly gitHead: { value: string };
}

const openCores: Core[] = [];
const openVerificationStores: SqliteProjectVerificationStore[] = [];

afterEach(async () => {
  for (const store of openVerificationStores.splice(0)) {
    try {
      store.close();
    } catch {
      /* already closed */
    }
  }
  for (const core of openCores.splice(0)) {
    try {
      await core.effects.close();
    } catch {
      /* already closed */
    }
    try {
      core.proofStore.close();
    } catch {
      /* already closed */
    }
    try {
      core.reasoningStore.close();
    } catch {
      /* already closed */
    }
    try {
      core.workStore.close();
    } catch {
      /* already closed */
    }
  }
});

function makeCore(options: { readonly head?: string } = {}): Core {
  const head = options.head ?? HEAD;
  const dir = mkdtempSync(join(tmpdir(), "pal-ad-verification-"));
  const workStore = new EventStore(join(dir, "work.sqlite"), { clock: () => CLOCK });
  const effects = createPalimpsestEffects({
    databasePath: join(dir, "effects.sqlite"),
    git: new FakeGitPort(head),
  });
  const controller = new ProjectController({
    store: workStore,
    effects,
    projectId: PROJECT,
    policy: new TaskPolicy({
      policy_id: "ad-verification-policy",
      read_paths: ["src"],
      allowed_commands: [],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => CLOCK,
  });
  controller.start({
    projectId: PROJECT,
    goal: "Prove independent project verification without truth.",
    tasks: [taskSpec("task-a")],
  });
  const core: Core = {
    dir,
    workStore,
    effects,
    controller,
    proofStore: new SqliteProofEvidenceStore(join(dir, "proof.sqlite")),
    reasoningStore: new SqliteReasoningCellStore(join(dir, "reasoning.sqlite")),
    gitHead: { value: head },
  };
  openCores.push(core);
  return core;
}

interface VerificationRig {
  readonly store: SqliteProjectVerificationStore;
  readonly service: ProjectVerificationService;
  readonly registry: ProjectVerifierRegistry;
  readonly source: ProjectHeadVerificationSource;
}

function openVerification(
  core: Core,
  options: {
    readonly definitions: readonly VerifierDefinition[];
    readonly providers: readonly ProjectVerifierPort[];
    readonly store?: SqliteProjectVerificationStore;
    readonly defaultVerifierRef?: string;
    readonly source?: ProjectHeadVerificationSource;
  },
): VerificationRig {
  const store =
    options.store ??
    new SqliteProjectVerificationStore(
      join(core.dir, `verification-${openVerificationStores.length}.sqlite`),
    );
  if (options.store === undefined) openVerificationStores.push(store);
  const registry = materializeVerifierRegistry(options.definitions);
  const source =
    options.source ??
    firstPartyProjectHeadVerificationSource({
      controller: core.controller,
      git: { head: async (): Promise<string> => core.gitHead.value },
    });
  const service = makeProjectVerificationService({
    projectId: PROJECT,
    source,
    store,
    registry,
    providers: options.providers,
    ...(options.defaultVerifierRef === undefined
      ? {}
      : { defaultVerifierRef: options.defaultVerifierRef }),
    clock: () => CLOCK,
  });
  return { store, service, registry, source };
}

interface CountingProvider {
  readonly port: ProjectVerifierPort;
  calls(): number;
}

function countingProvider(
  definition: VerifierDefinition,
  produce: (
    call: number,
    input: ProjectVerifierVerifyInput,
  ) => ProjectVerifierRawResult | Promise<ProjectVerifierRawResult>,
): CountingProvider {
  const state = { calls: 0 };
  const port: ProjectVerifierPort = Object.freeze({
    definition,
    async verify(input: ProjectVerifierVerifyInput): Promise<ProjectVerifierRawResult> {
      state.calls += 1;
      return produce(state.calls, input);
    },
  });
  return { port, calls: (): number => state.calls };
}

function rawPass(ref: string): ProjectVerifierRawResult {
  return materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "PASS" });
}
function rawFail(ref: string, detail = "the protocol reported a violation"): ProjectVerifierRawResult {
  return materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "FAIL", detail });
}
function rawError(ref: string, detail = "the runtime failed"): ProjectVerifierRawResult {
  return materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "ERROR", detail });
}
function rawScore(ref: string, score: number): ProjectVerifierRawResult {
  return materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "SCORE", score });
}

function commandDefinition(
  ref: string,
  protocol: string,
  independenceClass: VerifierIndependenceClass = "MECHANICAL_INDEPENDENT",
  version = 1,
): VerifierDefinition {
  return materializeVerifierDefinition({
    verifierRef: ref,
    version,
    kind: "command",
    protocol,
    independenceClass,
    provenance: {
      provider: "palimpsest.test",
      providerVersion: "1",
      implementation: protocol,
      protocolNote: "bounded test protocol",
      contextIsolation: "PROCESS_SEPARATED",
      model: null,
      promptVersion: null,
    },
  });
}

function modelDefinition(
  ref: string,
  options: {
    readonly independenceClass: VerifierIndependenceClass;
    readonly model?: string;
    readonly promptVersion?: string;
  },
): VerifierDefinition {
  const model = options.model ?? "verifier-model";
  const promptVersion = options.promptVersion ?? "prompt-v1";
  return materializeVerifierDefinition({
    verifierRef: ref,
    kind: "model",
    protocol: `model:${model}@${promptVersion}`,
    independenceClass: options.independenceClass,
    provenance: {
      provider: "palimpsest.test",
      providerVersion: "1",
      implementation: `model:${model}`,
      protocolNote: "model verifier adapter",
      contextIsolation: "SAME_PROCESS",
      model,
      promptVersion,
    },
  });
}

/* -------------------------------------------------------------------------- *
 * Real-store inspectors (SQL — the projections are the truth)
 * -------------------------------------------------------------------------- */

function countRows(store: EventStore, table: "events" | "evidence" | "tasks" | "projects"): number {
  const parameterized = table === "tasks" || table === "projects";
  if (!parameterized) {
    const sql = table === "events" ? "SELECT COUNT(*) AS n FROM events" : "SELECT COUNT(*) AS n FROM evidence";
    const row = store.connection.prepare(sql).get() as { n: number } | undefined;
    return Number(row?.n ?? 0);
  }
  const sql =
    table === "tasks"
      ? "SELECT COUNT(*) AS n FROM tasks WHERE project_id=?"
      : "SELECT COUNT(*) AS n FROM projects WHERE project_id=?";
  const row = store.connection.prepare(sql).get(PROJECT) as { n: number } | undefined;
  return Number(row?.n ?? 0);
}

function projectRow(store: EventStore): {
  readonly revision: number;
  readonly digest: string;
  readonly head_commit: string;
} {
  const row = store.connection
    .prepare("SELECT revision, digest, head_commit FROM projects WHERE project_id=?")
    .get(PROJECT) as { revision: number; digest: string; head_commit: string } | undefined;
  if (row === undefined) throw new Error("the project has no ProjectIR row");
  return row;
}

function taskStates(store: EventStore): readonly string[] {
  return (
    store.connection
      .prepare("SELECT state FROM tasks WHERE project_id=? ORDER BY task_id")
      .all(PROJECT) as unknown as { state: string }[]
  ).map((row) => row.state);
}

interface Footprint {
  readonly workEvents: number;
  readonly workEvidence: number;
  readonly proofEvents: number;
  readonly reasoningCells: number;
}

async function footprint(core: Core): Promise<Footprint> {
  return {
    workEvents: countRows(core.workStore, "events"),
    workEvidence: countRows(core.workStore, "evidence"),
    proofEvents: (await core.proofStore.replay()).length,
    reasoningCells: (await core.reasoningStore.cells()).length,
  };
}

/* -------------------------------------------------------------------------- *
 * Static firewall proofs (the plane's own source)
 * -------------------------------------------------------------------------- */

const PLANE_DIR = fileURLToPath(new URL("../src/project_verification/", import.meta.url));
const PLANE_FILES = [
  "artifacts.ts",
  "independence.ts",
  "registry.ts",
  "provider.ts",
  "experiment_adapter.ts",
  "store.ts",
  "status.ts",
  "service.ts",
  "index.ts",
] as const;

function planeSource(file: string): string {
  return readFileSync(join(PLANE_DIR, file), "utf-8");
}

function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

function planeCode(): string {
  return PLANE_FILES.map((file) => stripComments(planeSource(file))).join("\n");
}

/* -------------------------------------------------------------------------- *
 * AD-N01 — a verification result is not truth
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N01: a verification result is not truth", () => {
  it("AD-N01 a recorded result carries no truth/authority claim (typed surface only)", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.shape.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    // The caller supplies NO verification target: only who asked.
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.status).toBe("recorded");
    const run = outcome.run!;

    // The run's typed surface has exactly the evidence fields and no authority field.
    expect(Object.keys(run).sort()).toEqual(
      [
        "schemaVersion",
        "runId",
        "projectId",
        "sequence",
        "requestRef",
        "requestDigest",
        "subject",
        "verifierRef",
        "verifierDefinitionDigest",
        "independence",
        "status",
        "verdict",
        "score",
        "detail",
        "startedAt",
        "finishedAt",
        "freshness",
        "resultDigest",
        "startedEventId",
        "terminalEventId",
        "runDigest",
      ].sort(),
    );
    for (const key of Object.keys(run)) {
      expect(key).not.toMatch(/truth|authority|gate|promotion|effect|commitment|eligib/i);
    }

    // PASS means ONLY "this named protocol passed" — the scope is explicit.
    expect(outcome.statusView.verdictScope).toBe("named_verifier_protocol_only");
    expect(outcome.statusView.state).toBe("PASS");
    expect(outcome.statusView.detail).toMatch(/protocol result, not truth/);
    expect(outcome.statusView.detail).toContain(definition.verifierRef);
  });

  it("AD-N01 no canonical Work/Proof/Reasoning artifact is created anywhere", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.no-leak.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const before = await footprint(core);
    expect(before.workEvents).toBeGreaterThan(0); // the project really exists
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.verdict).toBe("PASS");

    const after = await footprint(core);
    expect(after).toEqual(before);
    // The verification history is durable, but it lives in its OWN store.
    expect(after.proofEvents).toBe(0);
    expect(after.reasoningCells).toBe(0);
  });

  it("AD-N01 the plane imports no Work/Proof/Reasoning/authority owner (static)", () => {
    const code = planeCode();
    expect(code).not.toMatch(
      /proof_asset|reasoning_cell\/service|project_management|project_operating|project_workspace|campaign|monitor|tools\/|state\/|domain\//,
    );
    // The ONLY organization_memory import is the shared verdict vocabulary by reference.
    const sources = [...code.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]!);
    expect(sources.filter((source) => source.includes("organization_memory"))).toEqual([
      "../organization_memory/artifacts.js",
    ]);
    expect(code).not.toMatch(/EvidenceAtom|ProofPublication|ReasoningAdmission|PromotionAuthority|EffectAuthority/);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N02 … AD-N04 — a PASS mints nothing
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N02..N04: a PASS mints nothing", () => {
  it("AD-N02 golden: a PASS creates ZERO Work Evidence (event count unchanged)", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.zero-work.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const eventsBefore = countRows(core.workStore, "events");
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.verdict).toBe("PASS");
    expect(countRows(core.workStore, "events")).toBe(eventsBefore);
    expect(countRows(core.workStore, "evidence")).toBe(0);
    // The Work event log contains no verification event of any kind.
    const types = (
      core.workStore.connection.prepare("SELECT event_type FROM events ORDER BY event_id").all() as
        unknown as { event_type: string }[]
    ).map((row) => row.event_type);
    expect(types.some((type) => /VERIF/.test(type))).toBe(false);
  });

  it("AD-N03 a PASS creates ZERO Proof publication", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.zero-proof.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const before = (await core.proofStore.replay()).length;
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.verdict).toBe("PASS");
    expect((await core.proofStore.replay()).length).toBe(before);
    expect((await core.proofStore.replay()).length).toBe(0);
    expect(await core.proofStore.basis()).toBeUndefined();
  });

  it("AD-N04 a PASS creates ZERO Reasoning admission", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.zero-reasoning.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const before = (await core.reasoningStore.cells()).length;
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.verdict).toBe("PASS");
    expect((await core.reasoningStore.cells()).length).toBe(before);
    expect((await core.reasoningStore.cells()).length).toBe(0);
  });

  it("AD-N25-pass golden: a PASS creates no project revision, no task mutation, no promotion", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.zero-authority.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const projectBefore = projectRow(core.workStore);
    const statesBefore = taskStates(core.workStore);
    const revisionsBefore = countRows(core.workStore, "events");

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.statusView.state).toBe("PASS");

    expect(projectRow(core.workStore)).toEqual(projectBefore);
    expect(taskStates(core.workStore)).toEqual(statesBefore);
    expect(countRows(core.workStore, "events")).toBe(revisionsBefore);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N05 / AD-N06 — FAIL is not TaskFAILED; ERROR is not FAIL
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N05/N06: FAIL and ERROR stay protocol results", () => {
  it("AD-N05 a FAIL does not fail the task or the project", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.fail.v1", "node -e process.exit(3)");
    const provider = countingProvider(definition, () => rawFail(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const projectBefore = projectRow(core.workStore);
    const statesBefore = taskStates(core.workStore);
    const eventsBefore = countRows(core.workStore, "events");

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.status).toBe("recorded");
    expect(outcome.run!.verdict).toBe("FAIL");
    expect(outcome.statusView.state).toBe("FAIL");
    expect(outcome.statusView.state).not.toBe("PASS");

    // The project and its tasks are untouched: a protocol FAIL is not a task failure.
    expect(projectRow(core.workStore)).toEqual(projectBefore);
    expect(taskStates(core.workStore)).toEqual(statesBefore);
    expect(countRows(core.workStore, "events")).toBe(eventsBefore);
    expect(statesBefore).not.toContain("FAILED");

    const types = (
      core.workStore.connection.prepare("SELECT event_type FROM events").all() as unknown as {
        event_type: string;
      }[]
    ).map((row) => row.event_type);
    expect(types.some((type) => /FAILED$/.test(type))).toBe(false);
  });

  it("AD-N06 golden: an infrastructure failure yields ERROR, never FAIL", async () => {
    // A provider that throws is an INFRASTRUCTURE fault: the plane must record ERROR.
    const core = makeCore();
    const definition = commandDefinition("project.head.throws.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => {
      throw new Error("the verifier process died before producing a result");
    });
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.status).toBe("recorded");
    expect(outcome.run!.status).toBe("COMPLETED");
    expect(outcome.run!.verdict).toBe("ERROR");
    expect(outcome.run!.verdict).not.toBe("FAIL");
    expect(outcome.run!.detail).toMatch(/failed before it produced a result/);
    expect(outcome.statusView.state).toBe("ERROR");
    expect(stateForVerdict("ERROR")).toBe("ERROR");
    expect(stateForVerdict("FAIL")).toBe("FAIL");
  });

  it("AD-N06 a REAL spawn failure is ERROR through the real command validator", async () => {
    const core = makeCore();
    // The first-party command path: an executable that does not exist cannot run.
    const port = commandProjectHeadVerifier({
      verifierRef: "project.head.missing-binary.v1",
      command: "palimpsest-nonexistent-binary-xyzzy",
      args: [],
    });
    const { service } = openVerification(core, {
      definitions: [registryDefinitionOf(port)],
      providers: [port],
    });

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.verdict).toBe("ERROR");
    expect(outcome.run!.verdict).not.toBe("FAIL");
    expect(outcome.statusView.state).toBe("ERROR");
  });

  it("AD-N06 an ERROR must say what failed (no blank ERROR can be recorded)", () => {
    const ref = "project.head.blank-error.v1";
    expect(() => materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "ERROR" })).toThrow(
      /must say what failed/,
    );
  });
});

function registryDefinitionOf(port: ProjectVerifierPort): VerifierDefinition {
  return port.definition;
}

/* -------------------------------------------------------------------------- *
 * AD-N07 — SCORE stays SCORE
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N07: SCORE stays SCORE", () => {
  it("AD-N07 a SCORE is never mapped to PASS by the verification plane", async () => {
    const core = makeCore();
    const ref = "project.head.judge.v1";
    const definition = materializeVerifierDefinition({
      verifierRef: ref,
      kind: "external",
      protocol: "versioned llm judge",
      independenceClass: "DECLARED_SEPARATE",
      provenance: {
        provider: "palimpsest.test",
        providerVersion: "1",
        implementation: "llm-judge",
        protocolNote: "an opinion, not a verdict",
        contextIsolation: "SAME_PROCESS",
        model: null,
        promptVersion: null,
      },
    });
    const provider = experimentValidatorProjectHeadAdapter({
      definition,
      validator: llmJudgeValidator({
        validatorRef: ref,
        judgeModel: "judge-model",
        promptVersion: "prompt-v1",
        judge: async () => 7,
      }),
    });
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider],
    });

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.verdict).toBe("SCORE");
    expect(outcome.run!.score).toBe(7);
    expect(outcome.statusView.state).toBe("SCORE");
    expect(outcome.statusView.state).not.toBe("PASS");

    // The trap this plane must avoid: the legacy helper maps SCORE -> PASS.
    expect(validatorVerdictToOutcome("SCORE")).toBe("PASS");
    // ...and the plane's own verdict->state map does not.
    expect(stateForVerdict("SCORE")).toBe("SCORE");
  });

  it("AD-N07b the plane NEVER calls the SCORE->PASS helper (static proof)", () => {
    const code = planeCode();
    expect(code).not.toContain("validatorVerdictToOutcome");
    // A PASS may not carry a score, and only a SCORE may.
    const ref = "project.head.score-contract.v1";
    expect(() =>
      materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "PASS", score: 1 }),
    ).toThrow(/must not carry a score/);
    expect(() => materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "SCORE" })).toThrow(
      /must carry a finite score/,
    );
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N08 / AD-N09 — the subject is derived, never supplied
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N08/N09: the subject is the canonical ProjectIR head", () => {
  it("AD-N08 the subject is derived from the canonical ProjectIR (caller supplies none)", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.derived.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const row = projectRow(core.workStore);
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    const subject = outcome.run!.subject;
    expect(subject.projectId).toBe(PROJECT);
    expect(subject.projectRevision).toBe(row.revision);
    expect(subject.projectDigest).toBe(row.digest);
    expect(subject.headCommit).toBe(row.head_commit);
    expect(subject.kind).toBe("CURRENT_PROJECT_HEAD");
    // And it equals the status's independently derived subject.
    expect(outcome.statusView.subject!.digest).toBe(subject.digest);
  });

  it("AD-N09 a caller cannot verify an arbitrary commit as the current project", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.no-inject.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    // A hostile caller injects every field it might use to name a target.
    const injected = {
      requestedBy: "operator:test",
      headCommit: "a".repeat(40),
      projectDigest: "b".repeat(64),
      projectRevision: 99,
      subject: { headCommit: "a".repeat(40) },
    };
    const outcome = await service.verifyCurrentHead(injected as never);
    const canonical = projectRow(core.workStore);
    expect(outcome.run!.subject.headCommit).toBe(canonical.head_commit);
    expect(outcome.run!.subject.headCommit).not.toBe(injected.headCommit);
    expect(outcome.run!.subject.projectDigest).toBe(canonical.digest);
    expect(outcome.run!.subject.projectRevision).toBe(canonical.revision);
    // The durable request has no caller-chosen commit field either.
    expect(Object.keys(outcome.run!).some((key) => /commit$/i.test(key))).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N10 — repository inconsistency blocks the provider
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N10: a git/ProjectIR head mismatch blocks execution", () => {
  it("AD-N10 golden: mismatch blocks with project_head_not_materialized and the provider is NEVER invoked", async () => {
    const core = makeCore();
    core.gitHead.value = AMBIENT_GIT; // ambient git is NOT the canonical project head
    const definition = commandDefinition("project.head.mismatch.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service, store } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.status).toBe("blocked");
    expect(outcome.typedReasonCode).toBe("project_head_not_materialized");
    expect(outcome.detail).toContain(AMBIENT_GIT);
    expect(outcome.detail).toContain(HEAD);
    expect(outcome.run).toBeNull();
    // NOTHING was executed and NOTHING was written.
    expect(provider.calls()).toBe(0);
    expect(store.list(PROJECT)).toHaveLength(0);
    expect(store.listEvents(PROJECT)).toHaveLength(0);
    expect(outcome.statusView.repositoryConsistent).toBe(false);
    expect(outcome.statusView.state).not.toBe("PASS");
  });

  it("AD-N10 nothing is written when the runtime is missing or the ref is unknown", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.registered-only.v1", "node -e process.exit(0)");
    // Registered as config, but NO executable port is bound.
    const { service, store } = openVerification(core, {
      definitions: [definition],
      providers: [],
    });

    const unknown = await service.verifyCurrentHead({
      requestedBy: "operator:test",
      verifierRef: "project.head.not-registered.v1",
    });
    expect(unknown.status).toBe("blocked");
    expect(unknown.typedReasonCode).toBe("unknown_verifier_ref");
    expect(store.list(PROJECT)).toHaveLength(0);

    const noRuntime = await service.verifyCurrentHead({
      requestedBy: "operator:test",
      verifierRef: definition.verifierRef,
    });
    expect(noRuntime.status).toBe("blocked");
    expect(noRuntime.typedReasonCode).toBe("verifier_runtime_unavailable");
    expect(noRuntime.statusView.runtimeAvailable).toBe(false);
    expect(noRuntime.statusView.state).toBe("UNAVAILABLE");
    expect(store.list(PROJECT)).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N11 — mid-run drift
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N11: a mid-run head change is STALE_INPUT, not a verdict on the new head", () => {
  it("AD-N11 golden: mid-run drift stores STALE_INPUT and the NEW head stays unverified", async () => {
    const core = makeCore();
    const definition = commandDefinition("project.head.drift.v1", "node -e process.exit(0)");
    // The provider really REVISES the project mid-run (a real PROJECT_REVISED,
    // appending a second task), exactly what §5 says to re-read afterwards.
    const provider = countingProvider(definition, () => {
      core.controller.plan({
        tasks: [taskSpec("task-a"), taskSpec("task-b")],
      });
      return rawPass(definition.verifierRef);
    });
    const { service, store } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const before = projectRow(core.workStore);
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });

    // The result is retained as HISTORY, honestly labelled STALE_INPUT.
    expect(outcome.run!.status).toBe("COMPLETED");
    expect(outcome.run!.verdict).toBe("PASS");
    expect(outcome.run!.freshness).toBe("STALE_INPUT");
    expect(outcome.run!.subject.projectRevision).toBe(before.revision);

    // The input really moved.
    const after = projectRow(core.workStore);
    expect(after.revision).toBe(before.revision + 1);

    // The NEW head is UNVERIFIED: no run covers it, and nothing reports PASS for it.
    const status = await service.status();
    expect(status.subject!.projectRevision).toBe(after.revision);
    expect(status.latestRun!.freshness).toBe("STALE_SUBJECT");
    expect(status.latestRun!.current).toBe(false);
    expect(status.currentSubjectRun).toBeNull();
    expect(status.state).toBe("UNVERIFIED");
    expect(status.freshIndependentRun).toBeNull();
    // The history was not deleted.
    expect(store.list(PROJECT)).toHaveLength(1);
    expect(store.verifyChain(PROJECT).ok).toBe(true);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N12 — verifier-definition drift stales by derivation
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N12: a verifier-definition change stales an old run by derivation", () => {
  it("AD-N12 golden: protocol drift stales the run; the history is not deleted", async () => {
    const core = makeCore();
    const ref = "project.head.drifted-definition.v1";
    const v1 = commandDefinition(ref, "node -e process.exit(0)", "MECHANICAL_INDEPENDENT", 1);
    const v2 = commandDefinition(ref, "node -e process.exit(1)", "MECHANICAL_INDEPENDENT", 2);
    expect(v1.digest).not.toBe(v2.digest);

    const store = new SqliteProjectVerificationStore(join(core.dir, "verification-drift.sqlite"));
    openVerificationStores.push(store);

    const p1 = countingProvider(v1, () => rawPass(ref));
    const first = openVerification(core, { definitions: [v1], providers: [p1.port], store });
    const runOutcome = await first.service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(runOutcome.statusView.state).toBe("PASS");
    expect((await first.service.status()).freshIndependentRun).not.toBeNull();
    const eventsBefore = store.listEvents(PROJECT).length;

    // The deployment re-registers the SAME ref with a DIFFERENT protocol.
    const p2 = countingProvider(v2, () => rawPass(ref));
    const second = openVerification(core, { definitions: [v2], providers: [p2.port], store });
    const status = await second.service.status();

    expect(status.latestRun!.freshness).toBe("STALE_VERIFIER_DEFINITION");
    expect(status.latestRun!.current).toBe(false);
    expect(status.state).toBe("STALE");
    expect(status.freshIndependentRun).toBeNull();
    expect(status.independentVerifyAvailable).toBe(true); // the runtime still exists

    // The run was staled BY DERIVATION: the append-only history is intact.
    expect(store.list(PROJECT)).toHaveLength(1);
    expect(store.listEvents(PROJECT)).toHaveLength(eventsBefore);
    expect(store.listEvents(PROJECT)).toHaveLength(2);
    expect(store.verifyChain(PROJECT).ok).toBe(true);
    // The second provider was never invoked by the status read.
    expect(p2.calls()).toBe(0);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N13 … AD-N16 — independence is provenance, never a correctness upgrade
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N13..N16: independence provenance", () => {
  const sameFacts = (overrides: Partial<ModelVerifierFacts> = {}): ModelVerifierFacts => ({
    model: "shared-model",
    contextId: "shared-context",
    promptVersion: "prompt-v1",
    principalModel: "shared-model",
    principalContextId: "shared-context",
    providerBoundaryProven: true,
    establishable: true,
    ...overrides,
  });

  it("AD-N13 golden: same-model same-context is NOT independent and cannot activate VERIFY", async () => {
    // The classifier refuses to upgrade same-model/same-context, even with a
    // "proven" boundary claim.
    expect(classifyModelIndependence(sameFacts())).toBe("SHARED_CONTEXT");
    expect(
      effectiveModelIndependenceClass({
        declared: "MECHANICAL_INDEPENDENT",
        facts: sameFacts(),
      }),
    ).toBe("SHARED_CONTEXT");
    expect(countsAsIndependent({ independenceClass: "SHARED_CONTEXT", separationContract: null })).toBe(
      false,
    );

    // And through the real service: a SHARED_CONTEXT verifier is recorded honestly
    // and never makes VERIFY independent/available.
    const core = makeCore();
    const definition = modelDefinition("project.head.shared-context.v1", {
      independenceClass: "SHARED_CONTEXT",
    });
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const status = await service.status();
    expect(status.runtimeAvailable).toBe(true);
    expect(status.independentVerifyAvailable).toBe(false);
    expect(status.independentVerifierRefs).toEqual([]);
    expect(verificationIsDue({ status }).due).toBe(false);
    expect(verificationIsDue({ status }).reason).toMatch(/no independent runtime/);

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.independence).toBe("SHARED_CONTEXT");
    expect(outcome.run!.verdict).toBe("PASS");
    // A PASS under a non-independent verifier is still not "independent VERIFY".
    expect(outcome.statusView.independentVerifyAvailable).toBe(false);
  });

  it("AD-N14 golden: a different prompt alone is not independent", async () => {
    // Different prompt version, same model AND same context -> still SHARED_CONTEXT.
    expect(
      classifyModelIndependence(sameFacts({ promptVersion: "prompt-v2" })),
    ).toBe("SHARED_CONTEXT");
    // A different model in the SAME context without a proven boundary is only DECLARED.
    expect(
      classifyModelIndependence(
        sameFacts({ model: "other-model", providerBoundaryProven: false }),
      ),
    ).toBe("DECLARED_SEPARATE");
    // A DECLARED_SEPARATE definition never counts.
    expect(countsAsIndependent({ independenceClass: "DECLARED_SEPARATE", separationContract: null })).toBe(
      false,
    );
    // A deployment cannot upgrade a same-context model verifier by declaration.
    expect(
      effectiveModelIndependenceClass({
        declared: "EXTERNALLY_SEPARATED",
        facts: sameFacts({ promptVersion: "prompt-v9" }),
      }),
    ).toBe("SHARED_CONTEXT");
  });

  it("AD-N15 golden: UNKNOWN independence does not activate independent VERIFY", async () => {
    expect(classifyModelIndependence(sameFacts({ establishable: false }))).toBe("UNKNOWN");
    expect(countsAsIndependent({ independenceClass: "UNKNOWN", separationContract: null })).toBe(false);

    const core = makeCore();
    const definition = materializeVerifierDefinition({
      verifierRef: "project.head.unknown.v1",
      kind: "external",
      protocol: "an adapter the deployment cannot classify",
      independenceClass: "UNKNOWN",
      provenance: {
        provider: "palimpsest.test",
        providerVersion: "1",
        implementation: "opaque-adapter",
        protocolNote: "separation cannot be established",
        contextIsolation: "UNKNOWN",
        model: null,
        promptVersion: null,
      },
    });
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
    });

    const status = await service.status();
    expect(status.runtimeAvailable).toBe(true);
    expect(status.independentVerifyAvailable).toBe(false);
    expect(status.state).toBe("UNVERIFIED");
    expect(verificationIsDue({ status }).due).toBe(false);

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.independence).toBe("UNKNOWN");
    expect(outcome.statusView.independentVerifyAvailable).toBe(false);
  });

  it("AD-N16 a first-party mechanical verifier counts as independent", async () => {
    // The config definition itself.
    expect(countsAsIndependent(firstPartyMechanicalVerifierDefinition())).toBe(true);

    // And through the REAL runtime: a bounded node subprocess over the exact head.
    const core = makeCore();
    const port = commandProjectHeadVerifier({
      verifierRef: "project.head.mechanical-real.v1",
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
    });
    expect(port.definition.independenceClass).toBe("MECHANICAL_INDEPENDENT");
    const { service } = openVerification(core, {
      definitions: [port.definition],
      providers: [port],
    });

    const status = await service.status();
    expect(status.runtimeAvailable).toBe(true);
    expect(status.independentVerifyAvailable).toBe(true);
    expect(status.independentVerifierRefs).toEqual(["project.head.mechanical-real.v1"]);
    expect(verificationIsDue({ status }).due).toBe(true);

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(outcome.run!.verdict).toBe("PASS");
    expect(outcome.run!.independence).toBe("MECHANICAL_INDEPENDENT");
    expect(outcome.statusView.state).toBe("PASS");
    // §20: the fresh run prevents an automatic loop.
    expect(verificationIsDue({ status: outcome.statusView }).due).toBe(false);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N28 — restart restores status and history without rerunning anything
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N28: restart restores status/history without a rerun", () => {
  it("AD-N28 golden: a reopened store reproduces PASS and never calls the provider again", async () => {
    const core = makeCore();
    const ref = "project.head.restart.v1";
    const definition = commandDefinition(ref, "node -e process.exit(0)");
    const path = join(core.dir, "verification-restart.sqlite");

    const storeA = new SqliteProjectVerificationStore(path);
    const providerA = countingProvider(definition, () => rawPass(ref));
    const rigA = openVerification(core, {
      definitions: [definition],
      providers: [providerA.port],
      store: storeA,
    });
    const first = await rigA.service.verifyCurrentHead({ requestedBy: "operator:test" });
    expect(first.run!.verdict).toBe("PASS");
    expect(providerA.calls()).toBe(1);
    const runId = first.run!.runId;
    const digest = first.run!.runDigest;
    storeA.close();

    // Reopen the SAME file with a FRESH provider that must never be invoked.
    const storeB = new SqliteProjectVerificationStore(path);
    openVerificationStores.push(storeB);
    const providerB = countingProvider(definition, () => {
      throw new Error("the restarted runtime must not rerun the protocol");
    });
    const rigB = openVerification(core, {
      definitions: [definition],
      providers: [providerB.port],
      store: storeB,
    });

    const status = await rigB.service.status();
    expect(status.state).toBe("PASS");
    expect(status.latestRun!.run.runId).toBe(runId);
    expect(status.latestRun!.run.runDigest).toBe(digest);
    expect(status.freshIndependentRun!.run.runId).toBe(runId);

    const history = await rigB.service.history();
    expect(history).toHaveLength(1);
    expect(history[0]!.runId).toBe(runId);
    expect(history[0]!.verdict).toBe("PASS");
    expect(storeB.verifyChain(PROJECT).ok).toBe(true);
    expect(providerB.calls()).toBe(0);
    // No second run exists.
    expect(storeB.listEvents(PROJECT)).toHaveLength(2);
  });
});

/* -------------------------------------------------------------------------- *
 * AD-N29 — a crash after STARTED fabricates no result
 * -------------------------------------------------------------------------- */

describe("G10-AD AD-N29: a crash after STARTED fabricates no verdict", () => {
  it("AD-N29 golden: an unresolved STARTED survives a reopen with no verdict", async () => {
    const core = makeCore();
    const ref = "project.head.crash.v1";
    const definition = commandDefinition(ref, "node -e process.exit(0)");
    const path = join(core.dir, "verification-crash.sqlite");
    const source = firstPartyProjectHeadVerificationSource({
      controller: core.controller,
      git: { head: async (): Promise<string> => core.gitHead.value },
    });

    // §12 crash seam: the service writes STARTED through exactly this store call
    // BEFORE invoking the provider and COMPLETED after the result is observed. A
    // process death in between leaves only this row behind.
    const storeA = new SqliteProjectVerificationStore(path);
    const subject = source.current();
    const request = materializeProjectVerificationRequest({
      subject,
      verifierRef: ref,
      verifierDefinitionDigest: definition.digest,
      requestedBy: "operator:test",
      reason: "crash injection",
    });
    const started = storeA.appendStart({
      projectId: PROJECT,
      requestRef: request.verificationRequestId,
      requestDigest: request.digest,
      subject,
      verifierRef: ref,
      verifierDefinitionDigest: definition.digest,
      independence: definition.independenceClass,
      startedAt: CANONICAL_CLOCK,
    });
    // The "crash": no appendCompletion / appendInterruption is ever called.
    storeA.close();

    const storeB = new SqliteProjectVerificationStore(path);
    openVerificationStores.push(storeB);
    const provider = countingProvider(definition, () => {
      throw new Error("nothing may run during a crash recovery read");
    });
    const rig = openVerification(core, {
      definitions: [definition],
      providers: [provider.port],
      store: storeB,
      source,
    });

    const unresolved = await rig.service.unresolved();
    expect(unresolved).toHaveLength(1);
    const run = unresolved[0]!;
    expect(run.runId).toBe(started.runId);
    expect(run.status).toBe("STARTED");
    expect(run.verdict).toBeNull();
    expect(run.score).toBeNull();
    expect(run.resultDigest).toBeNull();
    expect(run.finishedAt).toBeNull();
    expect(run.freshness).toBe("CURRENT");

    const status = await rig.service.status();
    expect(status.state).toBe("VERIFYING");
    expect(status.unresolvedRunIds).toEqual([started.runId]);
    expect(status.freshIndependentRun).toBeNull();
    // Reading the crash state reran nothing.
    expect(provider.calls()).toBe(0);
    expect(storeB.listEvents(PROJECT)).toHaveLength(1);
    // The chain tip is the genesis -> STARTED link, still verifiable.
    expect(storeB.verifyChain(PROJECT).ok).toBe(true);
    // The unresolved STARTED is the FIRST link: it points at genesis.
    expect(storeB.listEvents(PROJECT)[0]!.previousRecordDigest).toBe(PROJECT_VERIFICATION_GENESIS);
  });

  it("AD-N29b a non-canonical but legal ISO start timestamp is canonicalized, durable and readable", () => {
    // This test OBSERVED a real durability gap in the first implementation:
    // `appendStart` digested the raw timestamp it was given while the parser
    // normalized it with `canonicalDatetime` on read, so an ISO-8601 input such as
    // "2026-09-16T00:00:00Z" was persisted but could never be read back (the store
    // threw from its own append and `verifyChain` reported a content-digest
    // mismatch). The plane now canonicalizes the timestamp BEFORE digesting, so
    // write and read agree; this test pins the FIX.
    const core = makeCore();
    const ref = "project.head.noncanonical.v1";
    const definition = commandDefinition(ref, "node -e process.exit(0)");
    const source = firstPartyProjectHeadVerificationSource({
      controller: core.controller,
      git: { head: async (): Promise<string> => core.gitHead.value },
    });
    const store = new SqliteProjectVerificationStore(join(core.dir, "verification-noncanonical.sqlite"));
    openVerificationStores.push(store);
    const subject = source.current();
    const request = materializeProjectVerificationRequest({
      subject,
      verifierRef: ref,
      verifierDefinitionDigest: definition.digest,
      requestedBy: "operator:test",
      reason: "timestamp canonicalization proof",
    });
    expect(CLOCK).not.toBe(CANONICAL_CLOCK); // "Z" is not the canonical micro form

    const started = store.appendStart({
      projectId: PROJECT,
      requestRef: request.verificationRequestId,
      requestDigest: request.digest,
      subject,
      verifierRef: ref,
      verifierDefinitionDigest: definition.digest,
      independence: definition.independenceClass,
      startedAt: CLOCK,
    });
    // The timestamp is stored in the ONE canonical form both sides agree on.
    expect(started.startedAt).toBe(CANONICAL_CLOCK);
    // The row is durable AND readable: the chain verifies, with no repair pass.
    expect(store.verifyChain(PROJECT).ok).toBe(true);
    const runs = store.list(PROJECT);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.runId).toBe(started.runId);
    expect(runs[0]!.startedAt).toBe(CANONICAL_CLOCK);
    expect(store.unresolved(PROJECT)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- *
 * §26 golden proofs — the reachable matrix, explicitly named
 * -------------------------------------------------------------------------- */

describe("G10-AD §26 golden proofs reachable in the core", () => {
  it("golden PASS: mechanical protocol -> PASS, zero Work/Proof/Reasoning, zero mutation", async () => {
    const core = makeCore();
    const definition = commandDefinition("golden.pass.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, { definitions: [definition], providers: [provider.port] });
    const before = await footprint(core);
    const project = projectRow(core.workStore);

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:golden" });
    expect(outcome.statusView.state).toBe("PASS");
    expect(outcome.run!.independence).toBe("MECHANICAL_INDEPENDENT");
    expect(await footprint(core)).toEqual(before);
    expect(projectRow(core.workStore)).toEqual(project);
  });

  it("golden FAIL: the protocol fails, the task/project remain unchanged", async () => {
    const core = makeCore();
    const definition = commandDefinition("golden.fail.v1", "node -e process.exit(1)");
    const provider = countingProvider(definition, () => rawFail(definition.verifierRef));
    const { service } = openVerification(core, { definitions: [definition], providers: [provider.port] });
    const statesBefore = taskStates(core.workStore);
    const eventsBefore = countRows(core.workStore, "events");

    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:golden" });
    expect(outcome.statusView.state).toBe("FAIL");
    expect(taskStates(core.workStore)).toEqual(statesBefore);
    expect(countRows(core.workStore, "events")).toBe(eventsBefore);
  });

  it("golden ERROR: an infrastructure fault is ERROR, never FAIL", async () => {
    const core = makeCore();
    const definition = commandDefinition("golden.error.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => {
      throw new Error("infrastructure not available");
    });
    const { service } = openVerification(core, { definitions: [definition], providers: [provider.port] });
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:golden" });
    expect(outcome.statusView.state).toBe("ERROR");
    expect(outcome.run!.verdict).not.toBe("FAIL");
  });

  it("golden SCORE: a score stays a score and never becomes PASS", async () => {
    const core = makeCore();
    const ref = "golden.score.v1";
    const definition = commandDefinition(ref, "versioned judge", "DECLARED_SEPARATE");
    const provider = experimentValidatorProjectHeadAdapter({
      definition,
      validator: {
        validatorRef: ref,
        kind: "artifact",
        validate: async () => ({ validatorRef: ref, verdict: "SCORE", score: 42 }),
      },
    });
    const { service } = openVerification(core, { definitions: [definition], providers: [provider] });
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:golden" });
    expect(outcome.run!.verdict).toBe("SCORE");
    expect(outcome.run!.score).toBe(42);
    expect(outcome.statusView.state).toBe("SCORE");
  });

  it("golden head mismatch: the provider is not invoked", async () => {
    const core = makeCore();
    core.gitHead.value = AMBIENT_GIT;
    const definition = commandDefinition("golden.mismatch.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => rawPass(definition.verifierRef));
    const { service } = openVerification(core, { definitions: [definition], providers: [provider.port] });
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:golden" });
    expect(outcome.typedReasonCode).toBe("project_head_not_materialized");
    expect(provider.calls()).toBe(0);
  });

  it("golden mid-run drift: STALE_INPUT, and no PASS for the new head", async () => {
    const core = makeCore();
    const definition = commandDefinition("golden.drift.v1", "node -e process.exit(0)");
    const provider = countingProvider(definition, () => {
      core.controller.plan({ tasks: [taskSpec("task-a"), taskSpec("task-b")] });
      return rawPass(definition.verifierRef);
    });
    const { service } = openVerification(core, { definitions: [definition], providers: [provider.port] });
    const outcome = await service.verifyCurrentHead({ requestedBy: "operator:golden" });
    expect(outcome.run!.freshness).toBe("STALE_INPUT");
    const status = await service.status();
    expect(status.state).toBe("UNVERIFIED");
    expect(status.currentSubjectRun).toBeNull();
  });

  it("golden same-context: a same-model same-context verifier is not independent", () => {
    expect(
      classifyModelIndependence({
        model: "m",
        contextId: "c",
        promptVersion: "p",
        principalModel: "m",
        principalContextId: "c",
        providerBoundaryProven: true,
        establishable: true,
      }),
    ).toBe("SHARED_CONTEXT");
  });

  it("golden unknown independence: UNKNOWN never enables independent VERIFY", () => {
    expect(
      classifyModelIndependence({
        model: "m",
        contextId: "c",
        promptVersion: "p",
        principalModel: "m",
        principalContextId: "c",
        providerBoundaryProven: false,
        establishable: false,
      }),
    ).toBe("UNKNOWN");
    expect(countsAsIndependent({ independenceClass: "UNKNOWN", separationContract: null })).toBe(false);
  });

  it("golden definition drift: the old run stales without deletion", async () => {
    const core = makeCore();
    const ref = "golden.definition.v1";
    const v1 = commandDefinition(ref, "node -e process.exit(0)", "MECHANICAL_INDEPENDENT", 1);
    const v2 = commandDefinition(ref, "node -e process.exit(1)", "MECHANICAL_INDEPENDENT", 2);
    const store = new SqliteProjectVerificationStore(join(core.dir, "golden-definition.sqlite"));
    openVerificationStores.push(store);
    const run = openVerification(core, {
      definitions: [v1],
      providers: [countingProvider(v1, () => rawPass(ref)).port],
      store,
    });
    await run.service.verifyCurrentHead({ requestedBy: "operator:golden" });
    const after = openVerification(core, {
      definitions: [v2],
      providers: [countingProvider(v2, () => rawPass(ref)).port],
      store,
    });
    const status = await after.service.status();
    expect(status.latestRun!.freshness).toBe("STALE_VERIFIER_DEFINITION");
    expect(status.state).toBe("STALE");
    expect(store.list(PROJECT)).toHaveLength(1);
  });

  it("golden restart: status/history survive without a rerun", async () => {
    const core = makeCore();
    const ref = "golden.restart.v1";
    const definition = commandDefinition(ref, "node -e process.exit(0)");
    const path = join(core.dir, "golden-restart.sqlite");
    const storeA = new SqliteProjectVerificationStore(path);
    const providerA = countingProvider(definition, () => rawPass(ref));
    await openVerification(core, {
      definitions: [definition],
      providers: [providerA.port],
      store: storeA,
    }).service.verifyCurrentHead({ requestedBy: "operator:golden" });
    storeA.close();

    const storeB = new SqliteProjectVerificationStore(path);
    openVerificationStores.push(storeB);
    const providerB = countingProvider(definition, () => rawPass(ref));
    const status = await openVerification(core, {
      definitions: [definition],
      providers: [providerB.port],
      store: storeB,
    }).service.status();
    expect(status.state).toBe("PASS");
    expect(providerB.calls()).toBe(0);
  });

  it("golden crash: STARTED survives with no fabricated verdict", async () => {
    const core = makeCore();
    const ref = "golden.crash.v1";
    const definition = commandDefinition(ref, "node -e process.exit(0)");
    const path = join(core.dir, "golden-crash.sqlite");
    const source = firstPartyProjectHeadVerificationSource({
      controller: core.controller,
      git: { head: async (): Promise<string> => core.gitHead.value },
    });
    const subject = source.current();
    const request = materializeProjectVerificationRequest({
      subject,
      verifierRef: ref,
      verifierDefinitionDigest: definition.digest,
      requestedBy: "operator:golden",
      reason: "crash",
    });
    const storeA = new SqliteProjectVerificationStore(path);
    storeA.appendStart({
      projectId: PROJECT,
      requestRef: request.verificationRequestId,
      requestDigest: request.digest,
      subject,
      verifierRef: ref,
      verifierDefinitionDigest: definition.digest,
      independence: definition.independenceClass,
      startedAt: CANONICAL_CLOCK,
    });
    storeA.close();

    const storeB = new SqliteProjectVerificationStore(path);
    openVerificationStores.push(storeB);
    const unresolved = storeB.unresolved(PROJECT);
    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]!.status).toBe("STARTED");
    expect(unresolved[0]!.verdict).toBeNull();
  });
});

/* -------------------------------------------------------------------------- *
 * HONEST notes
 *
 * 1. AD-N09 scope: the guarantee "a caller cannot verify an arbitrary commit as
 *    the current project in v1" is STRUCTURAL at the request/service/install
 *    boundary — `verifyCurrentHead` takes no subject/commit, the durable
 *    `ProjectVerificationRequest` has none, and a caller may only select a
 *    registered `verifierRef`. It is NOT a proof about a host that composes its
 *    own `ProjectHeadVerificationSource` (the plane deliberately exposes
 *    `sourceFromProjectHeadReader` for hosts that already hold the ProjectIR
 *    projection). A host that lies to its own source is trusted deployment code
 *    and this plane cannot detect it; no test here claims otherwise.
 *
 * 2. AD-N01 "nowhere": the verification HISTORY is itself durable state (that is
 *    the whole point of §12). "No canonical artifact anywhere" is therefore
 *    asserted against the canonical owners — the Work `EventStore`
 *    (events/evidence), the `SqliteProofEvidenceStore` and the
 *    `SqliteReasoningCellStore` — plus a static proof that the plane cannot
 *    import those owners. The verification store is intentionally excluded.
 *
 * 3. AD-N11 mid-run drift: the plane exposes no in-flight hook, so the drift is
 *    produced by the (allowed) provider adapter committing a REAL
 *    `PROJECT_REVISED` through the real `ProjectController` before returning its
 *    raw result. The re-read afterwards is the plane's own real
 *    `freshnessAfterRun` path; nothing about the freshness logic is mocked.
 *
 * 4. AD-N10/N16 use the Git head port adapter (`{ head() }`) and, for the real
 *    mechanical path, a `node -e` subprocess (the real `commandValidator`
 *    execution path). The install-level dogfood in
 *    `scripts/verification/mechanical-verify.mjs` runs a REAL `git diff --check`
 *    in a REAL temp git repository instead.
 *
 * 5. AD-N29 crash: the STARTED row is written through the real store API the
 *    service itself uses (`appendStart`), because the service offers no seam to
 *    stop between STARTED and COMPLETED — that gap is exactly what a process
 *    crash is. No fabricated verdict is injected anywhere.
 * -------------------------------------------------------------------------- */
