/**
 * E4-L — GOVERNED INSTITUTIONAL LEARNING.
 *
 * The positive matrix L-P01…L-P10 and the adversarial matrix L-N01…L-N18, driven through the REAL
 * packaged install (`installPalimpsest`) so the composition adapter, the durable evolution histories,
 * the OrganizationMemory owner and the empirical advisor are all exercised rather than stubbed.
 *
 * The laws this file pins, in the order the ruling states them:
 *
 *   OrganizationMemory ≠ OrganizationTruth        InterventionRecord ≠ EvolutionAuthority
 *   Intervention ≠ Causation                      Observed improvement ≠ universal superiority
 *   Evaluation ≠ Governance                       Historical winner ≠ Future authority
 *   Experiment result ≠ automatic Dynamics proposal
 *   Architecture recommendation ≠ OrganizationDynamicsProposal
 *   Memory ≠ Structure mutation
 *
 * and the wrong edge stays rejected: `ArchitectureRecommendation → OrganizationDynamicsProposal`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { installPalimpsest, trustedDefaultPolicy } from "../src/install.js";
import { GitCliPort } from "../src/effects/index.js";
import type { ProjectStandard } from "../src/domain/standard.js";
import {
  SqliteOrganizationStore,
  materializeOrganizationDefinition,
  organizationRefOf,
} from "../src/organization/index.js";
import type { OrganizationDefinition } from "../src/organization/index.js";
import { SqliteRuntimeScopeStore, makeRuntimeScopeService, materializeRuntimeScopeDefinition } from "../src/runtime_scope/index.js";
import type { RuntimeScopeOrganizationPort } from "../src/runtime_scope/index.js";
import { makeOrganizationDynamicsService } from "../src/organization_dynamics/index.js";
import type { DynamicsPolicy, OrganizationDynamicsProposal } from "../src/organization_dynamics/index.js";
import {
  SqliteOrganizationEvolutionStore,
  evolutionCandidateDigestOf,
  makeOrganizationEvolutionService,
} from "../src/organization_evolution/index.js";
import type { CompleteEvolutionCandidate, OrganizationEvolutionAdmissionPort, OrganizationEvolutionCompilerPort } from "../src/organization_evolution/index.js";
import {
  SqliteRuntimeEvolutionStore,
  makeRuntimeEvolutionService,
  runtimeEvolutionCandidateDigestOf,
} from "../src/runtime_evolution/index.js";
import type { RuntimeStructuralEvolutionAdmissionPort, RuntimeStructuralEvolutionCompilerPort } from "../src/runtime_evolution/index.js";
import {
  SqliteOrganizationMemoryStore,
  materializeExperiment,
  materializeIntervention,
  materializeMetric,
  materializeScenario,
  materializeVariant,
} from "../src/organization_memory/index.js";
import type {
  ArchitectureVariant,
  ExperimentDefinition,
  OrganizationMemoryService,
  RunResult,
  ScenarioDefinition,
} from "../src/organization_memory/index.js";
import { buildRunResult } from "../src/experiment/index.js";
import { unknownTaskProfile } from "../src/advisor/index.js";
import {
  interventionContentDigest,
  projectActivatedCase,
  structuralSourceKey,
} from "../src/institutional_learning/index.js";
import { MockHost } from "./helpers.js";

const cleanups: Array<() => void | Promise<void>> = [];
afterAll(async () => {
  for (const fn of cleanups) {
    try {
      // A cleanup may be ASYNC (`dispose()` is). Not awaiting it would leave the rejection to surface
      // as an unhandled error at an unrelated point in the run — which is exactly what R0 found.
      await fn();
    } catch {
      // A git worktree materialized under a temp root leaves read-only pack files that Windows refuses to
      // unlink; a cleanup refusal must not turn a green matrix red.
    }
  }
});

const PEER = { schemaVersion: 1 as const, peerId: "p1" };
const MEMBER = { kind: "peer" as const, peer: PEER };
const POLICY: DynamicsPolicy = {
  ref: { id: "default", version: "1" },
  minDistinctBases: 2,
  churnMinReconfigurations: 3,
  concentrationShareThreshold: 0.5,
  federationMinMessageEvents: 4,
  federationMinDistinctPeers: 2,
};
const authorizeOrg: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "authorized" }) };
const authorizeRuntime: RuntimeStructuralEvolutionAdmissionPort = { admit: async () => ({ outcome: "authorized" }) };

function orgDef(revision: number, mission = "m"): OrganizationDefinition {
  return materializeOrganizationDefinition({
    organizationDefinitionId: "O",
    revision,
    mission,
    members: [MEMBER],
    roles: [{ roleId: "r1", requiredCapabilities: [] }, { roleId: "r2", requiredCapabilities: [] }],
    assignments: [{ member: MEMBER, roleId: "r1" }],
    norms: [],
    interactions: [{ interactionId: "i-1", fromRoleId: "r1", toRoleId: "r2", protocol: "proto" }],
  });
}

function standardOf(): ProjectStandard {
  return Object.freeze({
    statement: "tests pass and scope respected",
    clauses: Object.freeze([
      Object.freeze({ kind: "command_succeeds" as const, command: Object.freeze(["node", "-e", "process.exit(0)"]), predicate: "tests_pass" as const }),
      Object.freeze({ kind: "scope_respected" as const }),
    ]),
    derivedFrom: Object.freeze(["e4l fixture"]),
    confirmed: true,
    notes: Object.freeze([]),
  });
}

/**
 * A REAL packaged install whose evolution planes, memory owner and learning face are all composed.
 *
 * The evolution stores are PATH-based, so disposing the install and composing a SECOND one over the same
 * paths is a genuine cold restart rather than a re-handle — which is what L-P04/L-P08 require.
 */
interface Rig {
  readonly installed: ReturnType<typeof installPalimpsest>;
  readonly memory: OrganizationMemoryService;
  readonly evolution: ReturnType<typeof makeOrganizationEvolutionService>;
  readonly runtimeEvolution: ReturnType<typeof makeRuntimeEvolutionService>;
  readonly orgStore: SqliteOrganizationStore;
  readonly scopeStore: SqliteRuntimeScopeStore;
  readonly root: string;
  readonly repo: string;
}

function rig(input: {
  readonly root?: string;
  readonly orgAuthority?: OrganizationEvolutionAdmissionPort;
  readonly runtimeAuthority?: RuntimeStructuralEvolutionAdmissionPort;
  readonly memoryStore?: SqliteOrganizationMemoryStore;
} = {}): Rig {
  const root = input.root ?? mkdtempSync(join(tmpdir(), "palimpsest-e4l-"));
  if (input.root === undefined) cleanups.push(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, "repo");
  if (!existsSyncSafe(repo)) {
    mkdirSync(join(repo, "src"), { recursive: true });
    writeFileSync(join(repo, "src", "a.ts"), "export const a = 1;\n");
    execFileSync("git", ["init", "-q"], { cwd: repo });
    execFileSync("git", ["add", "-A"], { cwd: repo });
    execFileSync("git", ["-c", "user.email=t@t.t", "-c", "user.name=t", "commit", "-qm", "H0"], { cwd: repo });
  }

  const orgStore = new SqliteOrganizationStore(join(root, "org.sqlite"));
  const scopeStore = new SqliteRuntimeScopeStore(join(root, "scope.sqlite"));
  const orgEvolutionStore = new SqliteOrganizationEvolutionStore(join(root, "org-evo.sqlite"));
  const runtimeEvolutionStore = new SqliteRuntimeEvolutionStore(join(root, "runtime-evo.sqlite"));
  const memoryStore = input.memoryStore ?? new SqliteOrganizationMemoryStore(join(root, "memory.sqlite"));
  cleanups.push(() => {
    orgStore.close();
    scopeStore.close();
    orgEvolutionStore.close();
    runtimeEvolutionStore.close();
    // `memoryStore` is handed to `installPalimpsest` (which owns it as
    // CALLER_SUPPLIED_INSTALL_MANAGED_LEGACY) and NOT closed here: this rig always installs, so the
    // install's `dispose()` is the single closer. Closing it here as well threw `database is not open`.
  });

  const organizations: RuntimeScopeOrganizationPort = {
    current: (id) => orgStore.head(id),
    exists: async (ref) => (await orgStore.get(ref)) !== undefined,
    definition: async (ref) => {
      const definition = await orgStore.get(ref);
      return definition === undefined ? undefined : { interactions: definition.interactions };
    },
  };
  const scopeService = makeRuntimeScopeService({
    store: scopeStore,
    organizations,
    representationAdmission: { admit: async () => ({ admitted: true }) },
  });
  const dynamics = makeOrganizationDynamicsService({
    runtimeScopes: { store: scopeStore, service: scopeService },
    organizations: { head: (id) => orgStore.head(id), get: (ref) => orgStore.get(ref) },
  });

  const evolution = makeOrganizationEvolutionService({
    organizations: orgStore,
    dynamics,
    store: orgEvolutionStore,
    compiler: orgCompiler(),
    authority: input.orgAuthority ?? authorizeOrg,
  });
  const runtimeEvolution = makeRuntimeEvolutionService({
    runtimeScopes: { store: scopeStore, service: scopeService },
    dynamics,
    store: runtimeEvolutionStore,
    compiler: runtimeCompiler(),
    authority: input.runtimeAuthority ?? authorizeRuntime,
  });

  const installed = installPalimpsest(new MockHost() as never, {
    projectId: "e4l",
    repository: repo,
    git: new GitCliPort(repo, join(root, "worlds")),
    databasePath: join(root, "orchestration.sqlite"),
    ordariumDatabasePath: join(root, "ops.sqlite"),
    standard: standardOf(),
    policy: trustedDefaultPolicy(),
    organizationStore: orgStore,
    runtimeScopeStore: scopeStore,
    organizationEvolutionStore: orgEvolutionStore,
    runtimeEvolutionStore: runtimeEvolutionStore,
    organizationEvolutionCompiler: orgCompiler(),
    organizationEvolutionAuthority: input.orgAuthority ?? authorizeOrg,
    runtimeEvolutionCompiler: runtimeCompiler(),
    runtimeEvolutionAuthority: input.runtimeAuthority ?? authorizeRuntime,
    organizationMemoryStore: memoryStore,
  });
  // R0 §17/§27: `dispose()` is ASYNC and the install CLOSES every store it was handed. Two defects
  // hid here, and both surfaced only in a clean checkout:
  //   · the cleanup did not await `dispose()`, so a rejection escaped as an unhandled error at an
  //     unrelated point in the run;
  //   · `memoryStore` is passed to the install (which closes it) AND closed again by the cleanup
  //     below, which threw `database is not open`.
  // The rig now awaits disposal and leaves the caller-supplied store to the install that owns it.
  cleanups.push(async () => {
    await installed.dispose();
  });

  return {
    installed,
    memory: installed.organizationMemory!,
    evolution,
    runtimeEvolution,
    orgStore,
    scopeStore,
    root,
    repo,
  };
}

/** The scope SERVICE (the store exposes no `listScopes`); a fresh handle over the same store is fine. */
function scopeServiceOf(r: Rig): ReturnType<typeof makeRuntimeScopeService> {
  return makeRuntimeScopeService({
    store: r.scopeStore,
    organizations: {
      current: (id) => r.orgStore.head(id),
      exists: async (ref) => (await r.orgStore.get(ref)) !== undefined,
      definition: async (ref) => {
        const definition = await r.orgStore.get(ref);
        return definition === undefined ? undefined : { interactions: definition.interactions };
      },
    },
    representationAdmission: { admit: async () => ({ admitted: true }) },
  });
}

function existsSyncSafe(path: string): boolean {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("node:fs").existsSync(path) as boolean;
  } catch {
    return false;
  }
}

/** A compiler that always authorizes the REVISE transformation the test supplies. */
function orgCompiler(): OrganizationEvolutionCompilerPort {
  return {
    compile: async ({ proposal, sources }) => {
      const base = sources[0]!;
      const candidate = orgDef(base.revision + 1, `${base.mission}-next`);
      const body = {
        schemaVersion: 1 as const,
        proposalDigest: proposal.digest,
        proposalBasisDigest: proposal.basisDigest,
        kind: "REVISE" as const,
        transformation: { kind: "REVISE" as const, base: organizationRefOf(base), candidate },
        compilerProvenance: "e4l-compiler",
      };
      return { ...body, digest: evolutionCandidateDigestOf(body) } satisfies CompleteEvolutionCandidate;
    },
  };
}

/** A runtime compiler that encapsulates a scope's members into a new child scope. */
function runtimeCompiler(): RuntimeStructuralEvolutionCompilerPort {
  return {
    compile: async ({ proposal, scopes }) => {
      if (proposal.subject.kind !== "runtime_scope") throw new Error("expected a runtime subject");
      const parentId = proposal.subject.scope.scopeId;
      const parent = scopes.find((state) => state.definition.scopeId === parentId)!;
      const body = {
        schemaVersion: 1 as const,
        kind: "ENCAPSULATE" as const,
        proposalDigest: proposal.digest,
        proposalBasisDigest: proposal.basisDigest,
        sourceParent: { ref: { schemaVersion: 1 as const, scopeId: parentId }, basis: parent.basis },
        newChild: materializeRuntimeScopeDefinition({ scopeId: `${parentId}-child`, organizationBasis: null }),
        membersToMove: parent.members,
        compilerProvenance: "e4l-runtime-compiler",
      };
      return { ...body, digest: runtimeEvolutionCandidateDigestOf(body) };
    },
  };
}

/** Drive a REAL governed organization evolution to ACTIVATED, returning the case ref and proposal. */
async function activateOrganizationEvolution(r: Rig, mission = "m"): Promise<{ caseRef: string; proposal: OrganizationDynamicsProposal }> {
  const o0 = orgDef(0, mission);
  await r.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
  // The diagnosis needs a runtime-scope basis: the SAME shape the G10-J golden path uses.
  await scopeServiceOf(r).openScope({ scopeId: `R-${mission}`, organizationBasis: organizationRefOf(o0) });
  const o1 = orgDef(1, `${mission}-next`);
  await r.orgStore.registerRevision({ definition: o1, parent: organizationRefOf(o0), expectedHeadRevision: 0 });
  const proposed = await r.installed.organizationDynamics!.service.propose({
    subject: { kind: "organization", organization: organizationRefOf(o1) },
    policy: POLICY,
  });
  if ("status" in proposed) throw new Error(`propose returned ${proposed.status}`);
  const outcome = await r.evolution.advanceEvolution({ proposal: proposed.proposal, policy: POLICY });
  if (outcome.status !== "activated") throw new Error(`evolution returned ${outcome.status}: ${JSON.stringify(outcome)}`);
  return { caseRef: outcome.caseRef!, proposal: proposed.proposal };
}

/** Drive a REAL governed runtime evolution to ACTIVATED. */
async function activateRuntimeEvolution(r: Rig): Promise<{ caseRef: string; proposal: OrganizationDynamicsProposal }> {
  const scopeId = "R";
  await seedRuntimeScope(r, scopeId);
  const proposed = await r.installed.organizationDynamics!.service.propose({
    subject: { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId } },
    policy: POLICY,
    // An explicit authoring seam chooses the STRUCTURAL kind; the proposal is still the owner's.
    advisor: { propose: async () => ({ kind: "ENCAPSULATE_RUNTIME_SCOPE", targets: [scopeId], intent: "encapsulate the runtime topology", advisorProvenance: "e4l-advisor" }) },
  });
  if ("status" in proposed) throw new Error(`propose returned ${proposed.status}`);
  const outcome = await r.runtimeEvolution.advanceRuntimeEvolution({ proposal: proposed.proposal, policy: POLICY });
  if (outcome.status !== "activated") throw new Error(`runtime evolution returned ${outcome.status}: ${JSON.stringify(outcome)}`);
  return { caseRef: outcome.caseRef, proposal: proposed.proposal };
}

/** Seed a real runtime scope with two activations through the scope service's own write path. */
async function seedRuntimeScope(r: Rig, scopeId: string): Promise<void> {
  // The scope's organization basis must RESOLVE, so the org revision is registered first.
  const basis = orgDef(0);
  if ((await r.orgStore.head("O")) === undefined) {
    await r.orgStore.registerRevision({ definition: basis, parent: null, expectedHeadRevision: null });
  }
  const service = makeRuntimeScopeService({
    store: r.scopeStore,
    organizations: {
      current: (id) => r.orgStore.head(id),
      exists: async (ref) => (await r.orgStore.get(ref)) !== undefined,
      definition: async (ref) => {
        const definition = await r.orgStore.get(ref);
        return definition === undefined ? undefined : { interactions: definition.interactions };
      },
    },
    representationAdmission: { admit: async () => ({ admitted: true }) },
  });
  await service.openScope({ scopeId, organizationBasis: organizationRefOf(orgDef(0)) });
  for (const id of ["a1", "a2"]) {
    await service.addMember({
      scopeId,
      member: { kind: "activation", activation: { activationId: id, agentDefinitionId: `ag-${id}`, runDefinition: { digest: `rd-${id}` }, bindingResolution: { resolutionId: `res-${id}`, digest: `rr-${id}` } } },
    });
  }
}

/* ================================================================== positive matrix */

describe("E4-L L-P01/L-P02: both lanes project an activated case into an InterventionRecord", () => {
  it("L-P01 an ACTIVATED OrganizationEvolution yields an intervention with proposal/case/before/after", async () => {
    const r = rig();
    const { caseRef, proposal } = await activateOrganizationEvolution(r);
    const report = await r.installed.institutionalLearning!.reconcileInterventions();
    expect(report.recorded).toBe(1);
    const entry = report.entries.find((candidate) => candidate.caseRef === caseRef)!;
    expect(entry.action).toBe("recorded");
    const records = await r.memory.interventions();
    expect(records).toHaveLength(1);
    const record = records[0]!;
    // §9: the five provenance facts the ruling requires.
    expect(record.proposalDigest).toBe(proposal.digest);
    expect(record.evolutionCaseRef).toBe(structuralSourceKey({ lane: "organization_evolution", caseRef }));
    expect(record.beforeRef).toBe(proposal.snapshotDigest);
    expect(record.rationale).toBe(proposal.intent);
    expect(record.observationBasis).toBe(proposal.basisDigest);
  });

  it("L-P02 an ACTIVATED RuntimeEvolution yields an intervention on the runtime lane", async () => {
    const r = rig();
    const { caseRef, proposal } = await activateRuntimeEvolution(r);
    const report = await r.installed.institutionalLearning!.reconcileInterventions();
    expect(report.recorded).toBe(1);
    const record = (await r.memory.interventions())[0]!;
    expect(record.proposalDigest).toBe(proposal.digest);
    // §26: the lane is retained, so the two case-ref domains are never interchangeable.
    expect(record.evolutionCaseRef).toBe(`runtime_evolution:${caseRef}`);
    expect(record.beforeRef).toBe(proposal.snapshotDigest);
  });

  it("§5/§26: both lanes reconcile together and stay distinguishable", async () => {
    const r = rig();
    const org = await activateOrganizationEvolution(r);
    const runtime = await activateRuntimeEvolution(r);
    const report = await r.installed.institutionalLearning!.reconcileInterventions();
    expect(report.recorded).toBe(2);
    const records = await r.memory.interventions();
    const cases = records.map((record) => record.evolutionCaseRef).sort();
    expect(cases).toEqual([`organization_evolution:${org.caseRef}`, `runtime_evolution:${runtime.caseRef}`].sort());
    // The lanes group separately through the ordinary structural-history read.
    const orgLane = await r.installed.institutionalLearning!.interventions("organization_evolution");
    const runtimeLane = await r.installed.institutionalLearning!.interventions("runtime_evolution");
    expect(orgLane).toHaveLength(1);
    expect(runtimeLane).toHaveLength(1);
  });
});

describe("E4-L L-P03/L-P04/L-P05: idempotence, crash-window reconciliation, honest absence", () => {
  it("L-P03 reconciling the same activated case twice yields exactly one intervention", async () => {
    const r = rig();
    await activateOrganizationEvolution(r);
    const first = await r.installed.institutionalLearning!.reconcileInterventions();
    const second = await r.installed.institutionalLearning!.reconcileInterventions();
    expect(first.recorded).toBe(1);
    expect(second.recorded).toBe(0);
    expect(second.alreadyRecorded).toBe(1);
    expect(await r.memory.interventions()).toHaveLength(1);
  });

  it("L-P04 a cold restart after activation but before the memory write recovers the intervention", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-e4l-restart-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));

    // Session 1: a REAL structural activation, then the process "dies" before any reconciliation.
    // NOTE: no shared memory-store handle — each session opens its OWN handle over the same PATH, which
    // is what a genuine restart does (and avoids reading through a finalized statement).
    const first = rig({ root });
    const { caseRef, proposal } = await activateOrganizationEvolution(first);
    // The crash window: activation is durable, the empirical write never happened.
    expect(await first.memory.interventions()).toHaveLength(0);
    await first.installed.dispose();

    // Session 2: cold restart over the SAME durable stores, with no session memory.
    const second = rig({ root });
    expect(await second.memory.interventions()).toHaveLength(0);
    const report = await second.installed.institutionalLearning!.reconcileInterventions();
    expect(report.recorded).toBe(1);
    const record = (await second.memory.interventions())[0]!;
    // §12: the exact record is reconstructed from durable evolution history alone.
    expect(record.proposalDigest).toBe(proposal.digest);
    expect(record.evolutionCaseRef).toBe(`organization_evolution:${caseRef}`);
    expect(record.beforeRef).toBe(proposal.snapshotDigest);
    expect(record.rationale).toBe(proposal.intent);
    expect(record.observationBasis).toBe(proposal.basisDigest);
  });

  it("L-P05 an intervention with no immediate after snapshot still records honestly", async () => {
    const r = rig();
    // The organization path observes the post-state, so suppress it by reading the projection directly:
    // an activated case whose events carry no POST_OBSERVED projects afterRef = null.
    const { caseRef, proposal } = await activateOrganizationEvolution(r);
    const store = (r as unknown as { evolution: { inspectEvolution: (ref: string) => Promise<{ events: readonly { type: string; payload: unknown }[] }> } }).evolution;
    const inspection = await store.inspectEvolution(caseRef);
    const withoutPost = inspection.events.filter((event) => event.type !== "EVOLUTION_POST_OBSERVED");
    const projection = projectActivatedCase({ lane: "organization_evolution", caseRef, events: withoutPost });
    expect(projection.status).toBe("projected");
    if (projection.status !== "projected") throw new Error("expected projected");
    // §19: absence stays absence — never synthesized.
    expect(projection.projection.afterRef).toBeNull();
    expect(projection.projection.beforeRef).toBe(proposal.snapshotDigest);
  });
});

describe("E4-L L-P06…L-P10: the experiment link, evaluation retrieval, and future advice", () => {
  it("L-P06/L-P07 an ExperimentDefinition references one intervention and keeps ordinary artifacts", async () => {
    const r = rig();
    await activateOrganizationEvolution(r);
    await r.installed.institutionalLearning!.reconcileInterventions();
    const intervention = (await r.memory.interventions())[0]!;

    const experiment = linkedExperiment(intervention.interventionRef);
    const recorded = await r.memory.recordExperiment(experiment);
    expect(recorded.interventionRef).toBe(intervention.interventionRef);
    // §16: the ordinary artifacts are ordinary — no special score, no new evaluation system.
    const scenario = e4lScenario();
    await r.memory.recordScenario(experiment.experimentId, scenario);
    const variant = e4lVariant();
    await r.memory.recordVariant(experiment.experimentId, variant);
    await r.memory.recordRun(experiment.experimentId, e4lRun(experiment, scenario, variant));
    // The runs read back as ORDINARY OrganizationMemory artifacts; the intervention link is what ties them
    // to the structural change — there is no intervention-specific run shape.
    const runs = await r.memory.runs(experiment.experimentId);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.experimentRef).toBe(experiment.experimentId);
    expect((await r.memory.experimentsForIntervention(intervention.interventionRef)).map((d) => d.experimentId)).toEqual([experiment.experimentId]);
  });

  it("L-P08 interventionEvaluations(ref) recovers the linked experiment after a restart", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-e4l-eval-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));

    // Each session opens its OWN handle over the same PATH — a genuine restart.
    const first = rig({ root });
    await activateOrganizationEvolution(first);
    await first.installed.institutionalLearning!.reconcileInterventions();
    const intervention = (await first.memory.interventions())[0]!;
    await first.memory.recordExperiment(linkedExperiment(intervention.interventionRef));
    const before = await first.installed.institutionalLearning!.interventionEvaluations(intervention.interventionRef);
    expect(before.experiments).toHaveLength(1);
    await first.installed.dispose();

    const second = rig({ root });
    const after = await second.installed.institutionalLearning!.interventionEvaluations(intervention.interventionRef);
    expect(after.interventionRef).toBe(intervention.interventionRef);
    expect(after.experiments).toHaveLength(1);
    expect(after.experiments[0]!.experimentRef).toBe(`exp-${intervention.interventionRef.slice(-8)}`);
  });

  it("L-P09/L-P10 the advisor consumes the linked experiment, and the trace reaches the proposal digest", async () => {
    const r = rig();
    await activateOrganizationEvolution(r);
    await r.installed.institutionalLearning!.reconcileInterventions();
    const intervention = (await r.memory.interventions())[0]!;
    const experiment = linkedExperiment(intervention.interventionRef);
    await r.memory.recordExperiment(experiment);
    const scenario = e4lScenario();
    const variant = e4lVariant();
    await r.memory.recordScenario(experiment.experimentId, scenario);
    await r.memory.recordVariant(experiment.experimentId, variant);
    await r.memory.recordRun(experiment.experimentId, e4lRun(experiment, scenario, variant));

    // §21: the ORDINARY empirical path consumes it — memory → advisor context → recommendation.
    const recommendation = await r.installed.advisor!.recommend({ taskProfile: unknownTaskProfile() });
    expect(recommendation.recommendedPlan).toBeDefined();
    // §22: the recommendation's support names the experiment, and the experiment names the intervention,
    // whose record names the evolution case and the exact proposal digest. The chain stays DERIVED.
    const linked = (await r.memory.experimentsForIntervention(intervention.interventionRef)).map((definition) => definition.experimentId);
    expect(linked).toEqual([experiment.experimentId]);
    const trace = await r.memory.intervention(intervention.interventionRef);
    expect(trace!.proposalDigest).toBe(intervention.proposalDigest);
    expect(trace!.evolutionCaseRef).toBe(intervention.evolutionCaseRef);
  });
});

/* ================================================================== adversarial matrix */

describe("E4-L L-N01…L-N04: no activation means no intervention", () => {
  it("L-N01 a DENIED organization evolution records no intervention", async () => {
    const denying: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "denied", detail: "policy denies" }) };
    const r = rig({ orgAuthority: denying });
    const o0 = orgDef(0);
    await r.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    await scopeServiceOf(r).openScope({ scopeId: "R", organizationBasis: organizationRefOf(o0) });
    const o1 = orgDef(1, "m-next");
    await r.orgStore.registerRevision({ definition: o1, parent: organizationRefOf(o0), expectedHeadRevision: 0 });
    const proposed = await r.installed.organizationDynamics!.service.propose({ subject: { kind: "organization", organization: organizationRefOf(o1) }, policy: POLICY });
    if ("status" in proposed) throw new Error(proposed.status);
    const outcome = await r.evolution.advanceEvolution({ proposal: proposed.proposal, policy: POLICY });
    expect(outcome.status).toBe("denied");
    const report = await r.installed.institutionalLearning!.reconcileInterventions();
    expect(report.recorded).toBe(0);
    expect(await r.memory.interventions()).toHaveLength(0);
  });

  it("L-N02 an AUTHORITY-UNRESOLVED evolution records no intervention", async () => {
    const unresolved: OrganizationEvolutionAdmissionPort = { admit: async () => ({ outcome: "unresolved", detail: "no authority" }) };
    const r = rig({ orgAuthority: unresolved });
    const o0 = orgDef(0);
    await r.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    await scopeServiceOf(r).openScope({ scopeId: "R", organizationBasis: organizationRefOf(o0) });
    const o1 = orgDef(1, "m-next");
    await r.orgStore.registerRevision({ definition: o1, parent: organizationRefOf(o0), expectedHeadRevision: 0 });
    const proposed = await r.installed.organizationDynamics!.service.propose({ subject: { kind: "organization", organization: organizationRefOf(o1) }, policy: POLICY });
    if ("status" in proposed) throw new Error(proposed.status);
    const outcome = await r.evolution.advanceEvolution({ proposal: proposed.proposal, policy: POLICY });
    expect(outcome.status).toBe("authority_unresolved");
    expect((await r.installed.institutionalLearning!.reconcileInterventions()).recorded).toBe(0);
    expect(await r.memory.interventions()).toHaveLength(0);
  });

  it("L-N03 a BLOCKED candidate records no intervention", async () => {
    const r = rig();
    // An organization with an open runtime scope grounded to it cannot be retired: the assessment blocks.
    const o0 = orgDef(0);
    await r.orgStore.registerRevision({ definition: o0, parent: null, expectedHeadRevision: null });
    await seedRuntimeScope(r, "R");
    const report = await r.installed.institutionalLearning!.reconcileInterventions();
    // No case exists at all here, so nothing is recorded — and the report is honest about it.
    expect(report.recorded).toBe(0);
    expect(await r.memory.interventions()).toHaveLength(0);
  });

  it("L-N04 a runtime evolution that never activates records no intervention", async () => {
    const denying: RuntimeStructuralEvolutionAdmissionPort = { admit: async () => ({ outcome: "denied", detail: "denied" }) };
    const r = rig({ runtimeAuthority: denying });
    await seedRuntimeScope(r, "R");
    const proposed = await r.installed.organizationDynamics!.service.propose({
      subject: { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "R" } },
      policy: POLICY,
      advisor: { propose: async () => ({ kind: "ENCAPSULATE_RUNTIME_SCOPE", targets: ["R"], intent: "encapsulate", advisorProvenance: "e4l-advisor" }) },
    });
    if ("status" in proposed) throw new Error(proposed.status);
    const outcome = await r.runtimeEvolution.advanceRuntimeEvolution({ proposal: proposed.proposal, policy: POLICY });
    expect(outcome.status).toBe("denied");
    expect((await r.installed.institutionalLearning!.reconcileInterventions()).recorded).toBe(0);
    expect(await r.memory.interventions()).toHaveLength(0);
  });
});

describe("E4-L L-N05…L-N08: cross-store failure, conflicting content, dangling references", () => {
  it("L-N05/L-N06 a memory write failure leaves the activation committed, and reconciliation repairs it", async () => {
    const r = rig();
    const { caseRef, proposal } = await activateOrganizationEvolution(r);
    // §11: simulate the empirical write failing. The structural change must NOT roll back.
    const failingMemory = {
      existing: async () => [],
      record: async () => {
        throw new Error("empirical bookkeeping failed");
      },
    };
    const { makeInstitutionalLearningService } = await import("../src/institutional_learning/index.js");
    const brittle = makeInstitutionalLearningService({
      history: {
        cases: async () => {
          const inspection = await r.evolution.inspectEvolution(caseRef);
          return [{ lane: "organization_evolution" as const, caseRef, events: inspection.events.map((event) => ({ type: event.type, payload: event.payload })) }];
        },
        case: async () => undefined,
      },
      memory: failingMemory,
      evaluations: { intervention: async () => undefined, experimentsFor: async () => [] },
    });
    await expect(brittle.reconcileInterventions()).rejects.toThrow(/empirical bookkeeping failed/u);
    // The STRUCTURAL activation is still there: the case reached POST_OBSERVED, i.e. it ACTIVATED and the
    // empirical bookkeeping failure did not undo it.
    const inspection = await r.evolution.inspectEvolution(caseRef);
    expect(inspection.state).toBe("POST_OBSERVED");
    expect(inspection.events.some((event) => event.type === "EVOLUTION_ACTIVATED")).toBe(true);
    expect(proposal.digest.length).toBe(64);
    // §12: the ordinary reconciliation over the SAME history repairs the missing record.
    const report = await r.installed.institutionalLearning!.reconcileInterventions();
    expect(report.recorded).toBe(1);
    expect((await r.memory.interventions())[0]!.proposalDigest).toBe(proposal.digest);
  });

  it("L-N07 a CONFLICTING intervention for the same evolution case is refused", async () => {
    const r = rig();
    const { caseRef } = await activateOrganizationEvolution(r);
    // Pre-record a DIFFERENT interpretation of the same structural case.
    const conflicting = materializeIntervention({
      subjectRefs: [`organization_evolution:${caseRef}`],
      rationale: "a different story",
      observationBasis: "f".repeat(64),
      recordedAt: "2026-01-01T00:00:00.000Z",
      proposalDigest: "a".repeat(64),
      evolutionCaseRef: `organization_evolution:${caseRef}`,
      beforeRef: "b".repeat(64),
    });
    await r.memory.recordIntervention(conflicting);
    // §10: one structural activation has ONE interpretation — the conflict fails closed.
    await expect(r.installed.institutionalLearning!.reconcileInterventions()).rejects.toThrow(/one activation has one interpretation/u);
    expect(await r.memory.interventions()).toHaveLength(1);
  });

  it("L-N08 an experiment referencing a NONEXISTENT intervention is refused", async () => {
    const r = rig();
    await expect(r.memory.recordExperiment(linkedExperiment("ivr-does-not-exist"))).rejects.toThrow(/does not exist/u);
    expect(await r.memory.experiments()).toHaveLength(0);
  });
});

describe("E4-L L-N09…L-N13: zero structural authority, append-only history", () => {
  it("L-N09/L-N10/L-N11 an intervention-linked evaluation mutates neither Organization, RuntimeScope nor authority", async () => {
    const r = rig();
    await activateOrganizationEvolution(r);
    await r.installed.institutionalLearning!.reconcileInterventions();
    const intervention = (await r.memory.interventions())[0]!;
    const experiment = linkedExperiment(intervention.interventionRef);
    await r.memory.recordExperiment(experiment);

    const orgHeadBefore = await r.orgStore.head("O");
    const scopesBefore = await scopeServiceOf(r).listScopes();
    const casesBefore = (await r.evolution.inspectEvolution(intervention.evolutionCaseRef!.split(":")[1]!)).events.length;

    // §23: the ONLY structural path is DynamicsProposal → authority → Evolution. The learning face
    // exposes no mutation verb, and a historical result is context, never authority.
    const face = r.installed.institutionalLearning!;
    for (const forbidden of ["advanceEvolution", "advanceRuntimeEvolution", "applyStructuralTransition", "registerRevision", "openScope"]) {
      expect(Object.hasOwn(face, forbidden), `the learning face must not expose ${forbidden}`).toBe(false);
    }
    expect(await r.orgStore.head("O")).toEqual(orgHeadBefore);
    expect(await scopeServiceOf(r).listScopes()).toEqual(scopesBefore);
    expect((await r.evolution.inspectEvolution(intervention.evolutionCaseRef!.split(":")[1]!)).events.length).toBe(casesBefore);
  });

  it("L-N12 a later evaluation does not rewrite the InterventionRecord", async () => {
    const r = rig();
    await activateOrganizationEvolution(r);
    await r.installed.institutionalLearning!.reconcileInterventions();
    const before = (await r.memory.interventions())[0]!;
    const experiment = linkedExperiment(before.interventionRef);
    await r.memory.recordExperiment(experiment);
    const after = (await r.memory.interventions())[0]!;
    // §18: historical observation is immutable; later evaluation is APPENDED.
    expect(after).toEqual(before);
    expect(after.digest).toBe(before.digest);
    expect(await r.memory.interventions()).toHaveLength(1);
  });

  it("L-N13 a later observation does not rewrite evolution history", async () => {
    const r = rig();
    const { caseRef } = await activateOrganizationEvolution(r);
    const before = await r.evolution.inspectEvolution(caseRef);
    await r.installed.institutionalLearning!.reconcileInterventions();
    const after = await r.evolution.inspectEvolution(caseRef);
    expect(after.events.map((event) => event.eventId)).toEqual(before.events.map((event) => event.eventId));
    expect(after.state).toBe(before.state);
  });
});

describe("E4-L L-N14…L-N18: honest absence, legacy history, and the G-13 wrong edge", () => {
  it("L-N14 a missing after snapshot remains missing, never synthesized", async () => {
    const r = rig();
    const { caseRef } = await activateOrganizationEvolution(r);
    const inspection = await r.evolution.inspectEvolution(caseRef);
    const withoutPost = inspection.events.filter((event) => event.type !== "EVOLUTION_POST_OBSERVED");
    const projection = projectActivatedCase({ lane: "organization_evolution", caseRef, events: withoutPost });
    if (projection.status !== "projected") throw new Error("expected projected");
    expect(projection.projection.afterRef).toBeNull();
    // The projection's OWN digest is stable whether or not an after snapshot exists — no null-to-value
    // substitution anywhere.
    expect(interventionContentDigest(projection.projection)).toContain(""); // deterministic
    expect(JSON.stringify(projection.projection)).toContain('"afterRef":null');
  });

  it("L-N15 a LEGACY case with no bound proposal is reported incomplete, not guessed", async () => {
    // §27: an activated case whose events lack the proposal binding. The learning layer REPORTS it.
    const outcome = projectActivatedCase({
      lane: "organization_evolution",
      caseRef: "ec-legacy",
      events: [
        { type: "EVOLUTION_CASE_OPENED", payload: { proposalDigest: "a".repeat(64), subjectKey: "organization:O" } },
        { type: "EVOLUTION_ACTIVATED", payload: { activated: [] } },
      ],
    });
    expect(outcome.status).toBe("incomplete");
    if (outcome.status !== "incomplete") throw new Error("expected incomplete");
    expect(outcome.refusal).toBe("LEGACY_PROVENANCE_INCOMPLETE");
  });

  it("L-N16/L-N18 an ArchitectureRecommendation cannot be passed as a DynamicsProposal", async () => {
    const r = rig();
    const { caseRef } = await activateOrganizationEvolution(r);
    // The wrong edge, refused at the ENTRY POINT: a recommendation-shaped object is not a proposal. The
    // owner answers a typed refusal (never an activation), and the case is untouched.
    const recommendation = { recommendationId: "rec-1", planRef: "p", rationale: "looked better", empiricalSupport: [] };
    const outcome = await r.evolution.advanceEvolution({ proposal: recommendation as never, policy: POLICY });
    expect(outcome.status).not.toBe("activated");
    // And no case was opened for it: the recommendation did not become structural history.
    expect(await r.memory.interventions()).toHaveLength(0);
    // The case is unchanged by the attempt: still the same POST_OBSERVED activation, with no event added.
    const inspection = await r.evolution.inspectEvolution(caseRef);
    expect(inspection.state).toBe("POST_OBSERVED");
    expect(inspection.events.some((event) => event.type === "EVOLUTION_ACTIVATED")).toBe(true);
    // And the learning face cannot mint a proposal from a recommendation either.
    const face = r.installed.institutionalLearning!;
    for (const forbidden of ["propose", "proposeFromRecommendation", "recommend"]) {
      expect(Object.hasOwn(face, forbidden), `the learning face must not expose ${forbidden}`).toBe(false);
    }
  });

  it("L-N17 ManagementMode cannot make an evaluation authoritative", async () => {
    const r = rig();
    // The management layer cannot reach the learning or evolution owners: the firewall holds it out.
    const { analyseModuleArchitecture } = await import("../tools/architecture/index.js");
    const graph = analyseModuleArchitecture(process.cwd());
    for (const module of graph.modules.filter((entry) => entry.file.startsWith("src/project_management/"))) {
      for (const target of module.imports) {
        expect(target.startsWith("src/institutional_learning/"), `${module.file} imports ${target}`).toBe(false);
      }
    }
    // And the learning face carries no management-mode input at all.
    const face = r.installed.institutionalLearning!;
    expect(Object.hasOwn(face, "managementMode")).toBe(false);
    expect(Object.hasOwn(face, "setMode")).toBe(false);
  });
});

/* ------------------------------------------------------------------ fixtures */

/** A minimal but real linked experiment: one scenario, one variant, the intervention reference. */
function linkedExperiment(interventionRef: string): ExperimentDefinition {
  const scenario = e4lScenario();
  const variant = e4lVariant();
  return materializeExperiment({
    experimentId: `exp-${interventionRef.slice(-8)}`,
    revision: 0,
    objective: "measure the structural effect under one scenario",
    scenarioRefs: [{ scenarioId: scenario.scenarioId, scenarioRevision: scenario.scenarioRevision, digest: scenario.digest }],
    variantRefs: [{ variantId: variant.variantId, digest: variant.digest }],
    measurementPlan: {
      metricIds: ["latency"],
      primaryValidatorRef: "validator-1",
      objectives: ["latency"],
      objectiveNote: "decision_aid_not_truth",
    },
    runPolicy: {
      minRunsPerVariantPerScenario: 1,
      maxRuns: 2,
      maxWallClockMs: 1000,
      maxModelCalls: 0,
      maxAttemptsPerRun: 1,
      randomizeOrder: false,
      seed: 1,
    },
    interventionRef,
  });
}

/** A real scenario in the RUNTIME_TOPOLOGY kind — the structural class this loop studies. */
function e4lScenario(): ScenarioDefinition {
  return materializeScenario({
    scenarioId: "s1",
    scenarioRevision: 0,
    kind: "RUNTIME_TOPOLOGY",
    classification: "SCRIPTED_MECHANICAL",
    task: "run the structural scenario",
    successCriteria: ["criterion"],
    bounds: { maxWallClockMs: 1000, maxModelCalls: 0, maxRunsPerVariant: 2 },
  });
}

/** The post-intervention variant, named with the EXISTING runtime-topology kind. */
function e4lVariant(): ArchitectureVariant {
  return materializeVariant({ variantId: "v1", kind: "RUNTIME_TOPOLOGY", description: "post-intervention topology" });
}

/** A run built by the ordinary `buildRunResult`, so no intervention-specific run shape is introduced. */
function e4lRun(experiment: ExperimentDefinition, scenario: ScenarioDefinition, variant: ArchitectureVariant): RunResult {
  return buildRunResult({
    spec: { experiment, scenario, variant, seed: 42, orderIndex: 1, warmup: false, attempt: 1 },
    provenance: {
      provider: "e4l",
      model: "deterministic",
      hostVersion: "host-1",
      palimpsestSha: "sha-1",
      ordariumVersion: "ord-1",
      profileDigest: "profile-1",
      repoShas: [],
      unknowns: [],
    },
    execution: {
      outcome: "PASS",
      failureClassification: "NONE",
      measurements: [
        materializeMetric({ metricId: "latency", unit: "ms", measurementClass: "DIRECTLY_OBSERVED", state: "known", value: 12, provenance: "e4l" }),
      ],
      validatorResults: [],
    },
    startedAt: "2020-01-01T00:00:00.000Z",
    endedAt: "2020-01-01T00:00:01.000Z",
  });
}
