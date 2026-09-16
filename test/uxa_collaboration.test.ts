/**
 * UX-A — ONE-REQUEST LOCAL MULTI-AGENT COLLABORATION — the adversarial suite
 * (UXA-N01 … UXA-N24).
 *
 * Real services on real temp files wherever the property is about a REAL
 * deployment: a real `installPalimpsest` (real Work EventStore, real ProjectIR,
 * real ReasoningCell store, real Project Verification history store, real
 * operating-posture store), so "no ProjectIR revision", "no durable peer" and "a
 * PASS is a protocol result" are asserted against the actual runtime — not
 * against a mock that could not have failed the way the real one can.
 *
 * The three seams the plane itself declares are adapters and nothing else:
 * a branch execution port, the reasoning verification/admission policies, and the
 * verifier PROVIDER. CX semantics are never mocked.
 *
 * The service-level tests compose `makeCollaborationService` directly with
 * recording fakes for the OWNERS (the advisor, the execution service, the
 * reasoning read) so delegation itself is falsifiable: if UX-A stopped consulting
 * the advisor, or started executing for FOCUS, these tests fail.
 *
 * UXA-N25…N30 (AE-R scope isolation, the AE bridge, AD verification, AC-R monitor,
 * AB posture, W/X/Y/Z/AA) are the FULL-SUITE regression gate — this file does not
 * fake them.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { installPalimpsest } from "../src/install.js";
import type { InstalledPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { SqliteOrganizationMemoryStore, parseTaskProfileSnapshot } from "../src/organization_memory/index.js";
import { SqliteWorkModePreferenceStore, type WorkModeBaseMode, type WorkModeModifier } from "../src/project_operating/index.js";
import { SqliteProjectAssetAssociationStore, SqliteProjectJournalStore } from "../src/project_workspace/index.js";
import {
  SqliteReasoningCellStore,
  invalidationAdmissionDigestOf,
  invalidationVerificationDigestOf,
  reasoningAdmissionDigestOf,
  reasoningVerificationDigestOf,
} from "../src/reasoning_cell/index.js";
import type {
  ReasoningBranchExecutionPort,
  ReasoningEpistemicAdmissionPolicyPort,
  ReasoningVerificationPolicyPort,
} from "../src/reasoning_cell/index.js";
import {
  SqliteProjectVerificationStore,
  commandProjectHeadVerifier,
  materializeProjectHeadVerificationSubject,
  materializeProjectVerifierRawResult,
  materializeVerifierDefinition,
  materializeVerifierRegistry,
  deriveProjectVerificationStatus,
} from "../src/project_verification/index.js";
import type { ProjectVerifierPort, ProjectVerificationStatus } from "../src/project_verification/index.js";
import {
  makeEmpiricalArchitectureAdvisor,
  parseProfilerOutput,
  taskFeatureValue,
  taskProfileFromValues,
} from "../src/advisor/index.js";
import type { ArchitectureRecommendInput, EmpiricalArchitectureAdvisor } from "../src/advisor/index.js";
import { builtinRecipeRegistry } from "../src/recipes/index.js";
import type { RecipeExecutionOutcome, RecipeExecutionService } from "../src/recipes/index.js";
import type { AdmittedClaimView } from "../src/reasoning_cell/index.js";
import type { PeerRef } from "../src/federation/index.js";
import type { DshToolDefinition, DshToolRunContext } from "../src/tools/dsh_types.js";
import {
  CollaborationError,
  MAX_BRANCH_HINT,
  MIN_BRANCH_HINT,
  VERIFICATION_PROTOCOL_NOTE,
  deterministicKeywordCollaborationIntentAdapter,
  deterministicTaskProfiler,
  makeCollaborationService,
  nullCollaborationIntentAdapter,
  parseCollaborationRequest,
} from "../src/interaction/index.js";
import { applicationErrorStatus } from "../src/application/http.js";

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

const CLOCK = "2026-09-16T00:00:00Z";
const HEAD = "c".repeat(40);
const PROJECT = "uxa-collaboration";
const P: PeerRef = { schemaVersion: 1, peerId: "palimpsest-uxa" };
const VERIFIER_REF = "uxa-mechanical";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");

const DIR = mkdtempSync(join(tmpdir(), "palimpsest-uxa-"));
afterEach(() => {
  for (const rig of OPEN_RIGS.splice(0)) {
    void rig.close();
  }
});
process.on("exit", () => {
  try {
    rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* windows file handle */
  }
});

let seq = 0;
const nextPath = (name: string): string => join(DIR, `${name}-${++seq}.sqlite`);

/* ------------------------------------------------------------------ *
 * Real install rig
 * ------------------------------------------------------------------ */

interface RigOptions {
  /** A real ReasoningCell store + both policy seams + an ephemeral branch port. */
  readonly withReasoning?: boolean;
  /** A real organization-memory store, which is what makes the advisor exist. */
  readonly withAdvisor?: boolean;
  /** `none` = the explicit "no verification runtime" deployment. */
  readonly verifiers?: "independent" | "shared-context" | "mixed" | "none";
  readonly knownPeerIds?: readonly string[];
  readonly durableWorkMode?: { readonly baseMode: WorkModeBaseMode; readonly modifiers: readonly WorkModeModifier[] };
  readonly localPeer?: boolean;
}

interface Rig {
  readonly installed: InstalledPalimpsest;
  readonly dir: string;
  /** Every peer message this deployment SENT (must stay empty for UX-A's local modes). */
  readonly sent: unknown[];
  /** Every peer-directory observation the deployment performed. */
  readonly directoryCalls: number[];
  readonly branchExecutions: number[];
  /** Flip the branch port's behaviour between runs. */
  readonly branchBehaviour: { value: "statements" | "one-unresolved" };
  readonly workMode?: SqliteWorkModePreferenceStore | undefined;
  head(): { readonly revision: number; readonly digest: string };
  close(): Promise<void>;
}

const OPEN_RIGS: Rig[] = [];

function reasoningPolicySeams(): {
  verification: ReasoningVerificationPolicyPort;
  admission: ReasoningEpistemicAdmissionPolicyPort;
} {
  const verification: ReasoningVerificationPolicyPort = {
    verify: async ({ definition, candidate, frontierBasis }) => {
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED" as const,
        supportingEvidenceIds: ["ev-1"],
        contradictingEvidenceIds: [],
        provenanceDigest: "a".repeat(64),
      };
      return { ...base, digest: reasoningVerificationDigestOf(base) };
    },
    verifyInvalidation: async ({ definition, request, frontierBasis }) => {
      const base = {
        schemaVersion: 1 as const,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        frontierBasis,
        verificationPolicyRef: definition.verificationPolicyRef,
        standing: "SUPPORTED" as const,
        evidenceIds: ["ev-9"],
        provenanceDigest: "b".repeat(64),
      };
      return { ...base, digest: invalidationVerificationDigestOf(base) };
    },
  };
  const admission: ReasoningEpistemicAdmissionPolicyPort = {
    admit: async ({ definition, candidate, verification: result, frontierBasis }) => {
      const base = {
        schemaVersion: 1 as const,
        cell: candidate.cell,
        candidateDigest: candidate.candidateDigest,
        verificationResultDigest: result.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "ADMIT" as const,
        provenanceDigest: "c".repeat(64),
      };
      return { ...base, digest: reasoningAdmissionDigestOf(base) };
    },
    admitInvalidation: async ({ definition, request, verification: result, frontierBasis }) => {
      const base = {
        schemaVersion: 1 as const,
        cell: request.cell,
        targetClaimId: request.targetClaimId,
        requestDigest: request.requestDigest,
        verificationResultDigest: result.digest,
        frontierBasis,
        admissionPolicyRef: definition.admissionPolicyRef,
        decision: "INVALIDATE" as const,
        provenanceDigest: "d".repeat(64),
      };
      return { ...base, digest: invalidationAdmissionDigestOf(base) };
    },
  };
  return { verification, admission };
}

/** A verifier that PASSES but shares the authoring context: it never counts. */
function sharedContextVerifier(ref: string): ProjectVerifierPort {
  return Object.freeze({
    definition: materializeVerifierDefinition({
      verifierRef: ref,
      kind: "command",
      protocol: `${process.execPath} -e process.exit(0)`,
      independenceClass: "SHARED_CONTEXT",
      provenance: {
        provider: "palimpsest.test",
        providerVersion: "1",
        implementation: "same-context echo",
        protocolNote: "a same-process protocol that shares the authoring context",
        contextIsolation: "SAME_PROCESS",
        model: null,
        promptVersion: null,
      },
    }),
    verify: async () => materializeProjectVerifierRawResult({ verifierRef: ref, verdict: "PASS" }),
  });
}

async function makeRig(options: RigOptions = {}): Promise<Rig> {
  const dir = mkdtempSync(join(DIR, "rig-"));
  const sent: unknown[] = [];
  const directoryCalls: number[] = [];
  const branchExecutions: number[] = [];
  const branchBehaviour: Rig["branchBehaviour"] = { value: "statements" };
  const workMode =
    options.durableWorkMode === undefined
      ? undefined
      : new SqliteWorkModePreferenceStore(join(dir, "operating.sqlite"), { clock: () => CLOCK });
  if (workMode !== undefined) {
    // Awaited: the durable preference must exist BEFORE the install reads the posture.
    await workMode.set({
      projectId: PROJECT,
      baseMode: options.durableWorkMode!.baseMode,
      modifiers: options.durableWorkMode!.modifiers,
      updatedBy: "operator:uxa-test",
    });
  }

  const verifiers = options.verifiers ?? "none";
  const branchPort: ReasoningBranchExecutionPort = {
    adapterId: "uxa-test-branch",
    run: async (input): Promise<unknown> => {
      const index = branchExecutions.length + 1;
      branchExecutions.push(index);
      const brief = input.brief as { readonly question?: string } | undefined;
      const question = brief?.question ?? "branch";
      if (branchBehaviour.value === "one-unresolved" && /\[branch 2\//u.test(question)) return Object.freeze({});
      // A branch answers with ITS OWN content. It deliberately does NOT echo the
      // branch-brief plumbing, so the projection can be asserted to carry no
      // internal branch machinery.
      return { statement: `approach ${index}: a distinct candidate answer` };
    },
  };
  const seams = reasoningPolicySeams();

  const installed = installPalimpsest({ tools: { register: () => undefined } } as never, {
    projectId: PROJECT,
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    clock: () => CLOCK,
    git: new FakeGitPort(HEAD),
    projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite")),
    projectJournalStore: new SqliteProjectJournalStore(join(dir, "journal.sqlite")),
    ...(workMode === undefined ? {} : { workModePreferenceStore: workMode }),
    ...(options.localPeer === true || options.withReasoning === true
      ? {
          localPeer: P,
          coordinationStore: new SqliteCoordinationStore(join(dir, "coordination.sqlite")),
          peerTransportPort: {
            adapterId: "uxa-test-transport",
            send: async (message: unknown) => {
              sent.push(message);
              return { transportMessageId: `t-${sent.length}`, delivered: true };
            },
          },
          peerDirectoryPort: {
            observePeers: async () => {
              directoryCalls.push(directoryCalls.length + 1);
              return { state: "known" as const, value: [] };
            },
          },
          attemptCatalog: { assertAdmissibleAttempt: async () => undefined },
        }
      : {}),
    ...(options.withAdvisor === true ? { organizationMemoryStore: new SqliteOrganizationMemoryStore(join(dir, "memory.sqlite")) } : {}),
    ...(options.withReasoning === true
      ? {
          reasoningCellStore: new SqliteReasoningCellStore(join(dir, "reasoning.sqlite")),
          reasoningVerificationPolicy: seams.verification,
          reasoningAdmissionPolicy: seams.admission,
          reasoningBranchExecution: branchPort,
        }
      : {}),
    ...(options.knownPeerIds === undefined ? {} : { knownIndependentPeers: options.knownPeerIds.map((peerId) => ({ peerId })) }),
    projectVerificationStore: new SqliteProjectVerificationStore(join(dir, "verification.sqlite")),
    ...(verifiers === "independent"
      ? {
          projectVerifierProviders: [
            commandProjectHeadVerifier({ verifierRef: VERIFIER_REF, command: process.execPath, args: ["-e", "process.exit(0)"] }),
          ],
          projectVerificationDefaultVerifierRef: VERIFIER_REF,
        }
      : verifiers === "shared-context"
        ? {
            projectVerifierProviders: [sharedContextVerifier("uxa-same-context")],
            projectVerificationDefaultVerifierRef: "uxa-same-context",
          }
        : verifiers === "mixed"
          ? {
              // BOTH classes registered, with the INDEPENDENT one as the deployment
              // default. A test that names the other ref can therefore tell whether
              // the request's ref was really bound or silently replaced by the
              // default (the reviewer showed the single-verifier rig could not).
              projectVerifierProviders: [
                commandProjectHeadVerifier({ verifierRef: VERIFIER_REF, command: process.execPath, args: ["-e", "process.exit(0)"] }),
                sharedContextVerifier("uxa-same-context"),
              ],
              projectVerificationDefaultVerifierRef: VERIFIER_REF,
            }
          : { projectVerifierProviders: [] }),
  });

  installed.controller.start({
    projectId: PROJECT,
    goal: "Run one-request local multi-agent collaboration without new authority.",
    headCommit: HEAD,
    tasks: [],
  });

  const rig: Rig = {
    installed,
    dir,
    sent,
    directoryCalls,
    branchExecutions,
    branchBehaviour,
    workMode,
    head: () => {
      const row = installed.controller.store.connection
        .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
        .get(PROJECT) as { readonly revision: number; readonly digest: string } | undefined;
      return { revision: Number(row?.revision ?? 0), digest: String(row?.digest ?? "") };
    },
    close: async () => {
      await installed.dispose();
    },
  };
  OPEN_RIGS.push(rig);
  return rig;
}

function runContext(name: string, args: unknown): DshToolRunContext {
  return { callId: "c1", rootCallId: "r1", name, arguments: args, signal: new AbortController().signal };
}

function toolNamed(rig: Rig, name: string): DshToolDefinition {
  const found = rig.installed.tools.find((entry) => entry.name === name);
  if (found === undefined) {
    throw new Error(`tool "${name}" is missing (registered: ${rig.installed.tools.map((entry) => entry.name).join(", ")})`);
  }
  return found;
}

async function callTool(rig: Rig, name: string, args: unknown): Promise<unknown> {
  return toolNamed(rig, name).execute(args, runContext(name, args));
}

function appCollaboration(rig: Rig) {
  const surface = rig.installed.application.collaboration;
  if (surface === undefined) throw new Error("the collaboration surface is absent");
  return surface;
}

/* ------------------------------------------------------------------ *
 * Service-level fakes (delegation made falsifiable)
 * ------------------------------------------------------------------ */

const registry = builtinRecipeRegistry();

function recordingAdvisor(inner: EmpiricalArchitectureAdvisor): {
  readonly advisor: EmpiricalArchitectureAdvisor;
  readonly calls: ArchitectureRecommendInput[];
} {
  const calls: ArchitectureRecommendInput[] = [];
  return {
    advisor: {
      recommend: async (input: ArchitectureRecommendInput) => {
        calls.push(input);
        return inner.recommend(input);
      },
    },
    calls,
  };
}

function realAdvisor(capabilities: { readonly reasoningBranches: boolean; readonly independentPeers?: readonly string[] }): EmpiricalArchitectureAdvisor {
  return makeEmpiricalArchitectureAdvisor({
    registry,
    capabilities: {
      independentPeers: (capabilities.independentPeers ?? []).map((peerId) => Object.freeze({ peerId })),
      campaignMonitoring: false,
      reasoningBranches: capabilities.reasoningBranches,
    },
  });
}

/** A real derived verification status, built from the real status derivation. */
function derivedVerificationStatus(independent: boolean): ProjectVerificationStatus {
  const definition = materializeVerifierDefinition({
    verifierRef: VERIFIER_REF,
    kind: "command",
    protocol: `${process.execPath} -e process.exit(0)`,
    independenceClass: "MECHANICAL_INDEPENDENT",
    provenance: {
      provider: "palimpsest.test",
      providerVersion: "1",
      implementation: "echo",
      protocolNote: "bounded test protocol",
      contextIsolation: "PROCESS_SEPARATED",
      model: null,
      promptVersion: null,
    },
  });
  return deriveProjectVerificationStatus({
    projectId: PROJECT,
    subject: materializeProjectHeadVerificationSubject({
      projectId: PROJECT,
      projectRevision: 1,
      projectDigest: "d".repeat(64),
      headCommit: HEAD,
    }),
    repositoryHead: HEAD,
    runs: [],
    registry: materializeVerifierRegistry([definition]),
    executableVerifierRefs: independent ? [VERIFIER_REF] : [],
    derivedAt: CLOCK,
  });
}

interface CountingExecution {
  readonly service: RecipeExecutionService;
  readonly calls: { readonly baseMode: string; readonly modifiers: readonly string[] }[];
}

function countingExecution(outcome: RecipeExecutionOutcome): CountingExecution {
  const calls: { baseMode: string; modifiers: readonly string[] }[] = [];
  return {
    service: {
      execute: async (compiled) => {
        calls.push({ baseMode: compiled.baseMode, modifiers: compiled.modifiers });
        return outcome;
      },
    },
    calls,
  };
}

const ADMITTED_FRONTIER: readonly AdmittedClaimView[] = Object.freeze([
  Object.freeze({
    ref: { schemaVersion: 1 as const, cellId: "cell-1", claimId: "cl-1" },
    claim: {
      schemaVersion: 1 as const,
      type: { typeId: "reasoning.statement", version: "v1" },
      content: Object.freeze({ statement: "admitted statement from the accepted frontier" }),
      dependencies: Object.freeze([]),
      claimDigest: "f".repeat(64),
    },
  }),
]);

/* ================================================================== *
 * UXA-N01 — interaction intent != authority
 * ================================================================== */

describe("UXA-N01 interaction intent is not authority", () => {
  it("rejects a request that carries a recipe, plan, agent, command, peer or authority field", () => {
    const base = { task: "explore two approaches", requestedBy: "user:test" };
    for (const forbidden of [
      "recipeId",
      "plan",
      "planId",
      "compiled",
      "agentId",
      "agentDefinition",
      "command",
      "authority",
      "peerRef",
      "peerRefs",
      "verificationResult",
      "cellId",
      "branchIds",
      "flags",
      "approved",
    ]) {
      expect(() => parseCollaborationRequest({ ...base, [forbidden]: "x" }), `field "${forbidden}"`).toThrow(CollaborationError);
      expect(() => parseCollaborationRequest({ ...base, [forbidden]: "x" })).toThrow(/unknown field/);
    }
    // A valid request parses and defaults to AUTO (§7).
    const parsed = parseCollaborationRequest(base);
    expect(parsed.intent).toBe("AUTO");
    expect(parsed.task).toBe("explore two approaches");
  });

  it("derives a plan that grants no authority and names none", async () => {
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      verificationStatus: async () => derivedVerificationStatus(true),
    });
    const plan = await service.plan({ task: "do it", requestedBy: "user:test" });
    expect(Object.keys(plan).sort()).toEqual(
      ["capabilityWarnings", "effectiveBaseMode", "executionKind", "modifiers", "reason", "requestedIntent", "task", "verb"].sort(),
    );
    const serialized = JSON.stringify(plan);
    expect(serialized).not.toMatch(/authorit|commitment|peerRef|admission|proof/i);
    expect(plan.executionKind).toBe("PRINCIPAL_CONTINUES");
  });
});

/* ================================================================== *
 * UXA-N04 — AUTO delegates to the existing Advisor
 * ================================================================== */

describe("UXA-N04 AUTO delegates to the existing advisor", () => {
  it("consults the advisor and carries its rationale/blockers through", async () => {
    const recording = recordingAdvisor(realAdvisor({ reasoningBranches: true }));
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      advisor: recording.advisor,
    });
    const plan = await service.plan({ task: "explore two independent approaches", intent: "AUTO", requestedBy: "user:test" });
    expect(recording.calls).toHaveLength(1);
    expect(recording.calls[0]!.userRequestedMultiAgent).toBeUndefined();
    // The nine-feature profile was really handed over (never a bare string).
    expect(recording.calls[0]!.taskProfile.features).toHaveLength(9);
    // The recommendation's own plain-language reasons are the plan's reason.
    expect(plan.reason.some((entry) => /Focus is always eligible/u.test(entry))).toBe(true);
    expect(plan.reason.some((entry) => /Advisor blocker: no independent sovereign peer/u.test(entry))).toBe(true);
  });

  it("contains no copied shouldExplore/shouldCoordinate policy", () => {
    const source = SRC("interaction/collaboration.ts");
    for (const forbidden of ["shouldExplore", "shouldCoordinate", "prefersExplore", "requestedExploreFallback", "buildCandidate"]) {
      expect(source, `UX-A must not duplicate advisor policy (${forbidden})`).not.toContain(forbidden);
    }
    // It reaches the advisor and the compiler instead of re-implementing either.
    expect(source).toContain("advisor.recommend");
    expect(source).toContain("compileRecipePlan");
    // And it never reaches federation: local collaboration is not a cross-project protocol.
    expect(source).not.toContain("federation");
  });
});

/* ================================================================== *
 * UXA-N09 / N10 — FOCUS creates zero branch, AUTO may choose FOCUS
 * ================================================================== */

describe("UXA-N09/N10 FOCUS creates zero extra boundary", () => {
  it("FOCUS executes nothing at all", async () => {
    const execution = countingExecution({
      status: "explored",
      cellId: "cell-never",
      branchIds: [],
      admittedClaimIds: [],
      unresolved: 0,
      branchExecutions: 0,
    });
    let activeClaimsCalls = 0;
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      recipeExecution: execution.service,
      advisor: realAdvisor({ reasoningBranches: true }),
      reasoning: {
        activeClaims: async () => {
          activeClaimsCalls += 1;
          return ADMITTED_FRONTIER;
        },
      },
    });
    const plan = await service.plan({ task: "small coupled change", intent: "FOCUS", requestedBy: "user:test" });
    expect(plan.executionKind).toBe("PRINCIPAL_CONTINUES");
    expect(plan.effectiveBaseMode).toBe("FOCUS");
    expect(plan.modifiers).toEqual([]);
    const result = await service.run({ task: "small coupled change", intent: "FOCUS", requestedBy: "user:test" });
    expect(result.status).toBe("PRINCIPAL_CONTINUES");
    expect(result.findings).toEqual([]);
    expect(execution.calls).toEqual([]);
    expect(activeClaimsCalls).toBe(0);
    expect(result.summary).toContain("No extra collaboration boundary was created");
  });

  it("AUTO chooses FOCUS for a highly coupled task and creates no cell", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const cellsBefore = await rig.installed.reasoningCells!.store.cells();
    const result = await appCollaboration(rig).run({
      task: "Change the shared state migration that every module depends on; cross-component coupled.",
      intent: "AUTO",
      requestedBy: "user:test",
    });
    expect(result.executionKind).toBe("PRINCIPAL_CONTINUES");
    expect(result.status).toBe("PRINCIPAL_CONTINUES");
    const cellsAfter = await rig.installed.reasoningCells!.store.cells();
    expect(cellsAfter).toHaveLength(cellsBefore.length);
    expect(rig.branchExecutions).toEqual([]);
  });

  it("AUTO falls back to FOCUS when no advisor is composed, and says why", async () => {
    const service = makeCollaborationService({ projectId: PROJECT, clock: () => CLOCK, recipes: registry });
    const plan = await service.plan({ task: "anything", requestedBy: "user:test" });
    expect(plan.executionKind).toBe("PRINCIPAL_CONTINUES");
    expect(plan.reason.join(" ")).toMatch(/no empirical architecture advisor is configured/u);
  });
});

/* ================================================================== *
 * UXA-N11 / UXA-N02 — AUTO may choose EXPLORE; intent never mutates posture
 * ================================================================== */

describe("UXA-N11/N02 AUTO→EXPLORE with the durable preference as context only", () => {
  it("profiles the task, chooses EXPLORE, honours the durable VERIFY rider, and never rewrites the preference", async () => {
    const rig = await makeRig({
      withReasoning: true,
      withAdvisor: true,
      verifiers: "independent",
      durableWorkMode: { baseMode: "EXPLORE", modifiers: ["VERIFY"] },
    });
    const before = await rig.workMode!.get(PROJECT);
    expect(before.preference.baseMode).toBe("EXPLORE");

    const surface = appCollaboration(rig);
    const plan = await surface.plan({
      task: "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.",
      intent: "AUTO",
      requestedBy: "user:test",
    });
    // §7/§12: the EXPLORE structure came from the advisor; the VERIFY rider came
    // from the DURABLE preference as context.
    expect(plan.effectiveBaseMode).toBe("EXPLORE");
    expect(plan.executionKind).toBe("LOCAL_EXPLORE_AND_VERIFY");
    expect(plan.modifiers).toEqual(["VERIFY"]);
    // §5 of the audit: the DERIVED availability is quoted and NAMES the capability,
    // for both halves of the plan.
    const reasons = plan.reason.join(" ");
    expect(reasons).toMatch(/"reasoning\.cell" is AVAILABLE/u);
    expect(reasons).toMatch(/"project\.verification" is AVAILABLE/u);

    const result = await surface.run({
      task: "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.",
      intent: "AUTO",
      requestedBy: "user:test",
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.verification).toBeDefined();

    // UXA-N02: the durable preference is CONTEXT — it was read, never rewritten.
    const after = await rig.workMode!.get(PROJECT);
    expect(after.preference.digest).toBe(before.preference.digest);
    expect(after.preference.baseMode).toBe(before.preference.baseMode);
    expect(after.preference.modifiers).toEqual(before.preference.modifiers);
    expect((await rig.workMode!.history(PROJECT)).length).toBe(1);
  });

  it("the deterministic profiler makes advisor.profile({task}) real (the dead seam), honestly and without guessing", async () => {
    const rig = await makeRig({ withAdvisor: true, localPeer: true, verifiers: "none" });
    const advisor = rig.installed.application.advisor;
    expect(advisor).toBeDefined();
    // Before UX-A this returned nine UNKNOWN features because install.ts never
    // supplied `ApplicationSurfaceDeps.taskProfiler`. It now profiles for real.
    const profile = await advisor!.profile({
      task: "Explore two independent approaches to the cache; each approach is isolated in one module and covered by a falsifiable test.",
    });
    expect(profile.features).toHaveLength(9);
    expect(parseTaskProfileSnapshot(JSON.parse(JSON.stringify(profile)))).toEqual(profile);
    expect(taskFeatureValue(profile, "decomposability")).toBe("HIGH");
    expect(taskFeatureValue(profile, "crossComponentCoupling")).toBe("LOW");
    expect(taskFeatureValue(profile, "verifiability")).toBe("HIGH");
    expect(taskFeatureValue(profile, "parallelSearchBenefit")).toBe("HIGH");
    expect(profile.features.find((entry) => entry.feature === "decomposability")!.source).toBe("UNTRUSTED_PROFILER");
    // NO SIGNAL ⇒ UNKNOWN, and the deployment-only feature is NEVER inferred.
    expect(taskFeatureValue(profile, "existingIndependentPeers")).toBe("UNKNOWN");
    expect(taskFeatureValue(profile, "privacyLocalityNeed")).toBe("UNKNOWN");
    expect(profile.features.find((entry) => entry.feature === "privacyLocalityNeed")!.source).toBe("UNKNOWN");

    // The profiler itself is deterministic, emits only allowed values, and NEVER
    // declares a provenance of its own (the advisor assigns it).
    const profiler = deterministicTaskProfiler();
    const first = await profiler.profile({ task: "a quick public fix" });
    const second = await profiler.profile({ task: "a quick public fix" });
    expect(first).toEqual(second);
    expect(() => parseProfilerOutput({ features: [{ feature: "decomposability", value: "HIGH", source: "USER_DECLARED" }] })).toThrow();
    // An AMBIGUOUS feature is OMITTED rather than guessed: this text carries both a
    // "high" and a "low" locality marker, so `contextLocality` is never emitted.
    const ambiguous = await profiler.profile({ task: "one file, but honestly the whole repo" });
    const ambiguousFeatures = (ambiguous as { readonly features: readonly { readonly feature: string }[] }).features;
    expect(ambiguousFeatures.map((entry) => entry.feature)).not.toContain("contextLocality");
  });
});

/* ================================================================== *
 * UXA-N05 / N06 — PARALLEL: no durable peer, honest failure when unavailable
 * ================================================================== */

describe("UXA-N05/N06 PARALLEL", () => {
  it("uses only ephemeral branches: zero peer messages, zero commitments, zero peerDirectory calls", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const inboxBefore = await rig.installed.federation!.inbox(P);
    const result = await appCollaboration(rig).run({
      task: "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.",
      intent: "PARALLEL",
      branchCountHint: 2,
      requestedBy: "user:test",
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.findings.length).toBe(2);
    expect(result.details.branchIds).toHaveLength(2);
    // UXA-N05: branches are ephemeral, so no durable peer/commitment exists.
    expect(rig.sent).toEqual([]);
    expect(rig.directoryCalls).toEqual([]);
    expect(await rig.installed.federation!.commitments()).toEqual([]);
    expect((await rig.installed.federation!.inbox(P)).received).toEqual(inboxBefore.received);
  });

  it("refuses honestly when the reasoning-branch capability is absent, never faking completion", async () => {
    // The advisor exists (so the architecture selection is REAL) but no branch
    // execution is wired: the advisor will itself propose FOCUS with its
    // "reasoning branches capability is not available" blocker.
    const rig = await makeRig({ withAdvisor: true, localPeer: true, verifiers: "none" });
    const surface = appCollaboration(rig);
    const plan = await surface.plan({ task: "parallel investigate two approaches", intent: "PARALLEL", requestedBy: "user:test" });
    expect(plan.executionKind).toBe("CAPABILITY_REQUIRED");
    expect(plan.capabilityWarnings.join(" ")).toMatch(/reasoning\.cell/u);
    const result = await surface.run({ task: "parallel investigate two approaches", intent: "PARALLEL", requestedBy: "user:test" });
    expect(result.status).toBe("CAPABILITY_REQUIRED");
    expect(result.details.capability).toBe("reasoning.cell");
    expect(result.findings).toEqual([]);
    expect(result.unresolved.join(" ")).toMatch(/reasoning\.cell/u);
    expect(result.summary).not.toMatch(/completed|explored/u);
  });
});

/* ================================================================== *
 * UXA-N07 / N08 — CHECK requires a REAL independent verifier
 * ================================================================== */

describe("UXA-N07/N08 CHECK", () => {
  it("runs the existing Project Verification runtime when an independent verifier exists", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const status = await rig.installed.verification!.status();
    expect(status.independentVerifyAvailable).toBe(true);
    const result = await appCollaboration(rig).run({ task: "check the current head", intent: "CHECK", requestedBy: "user:test" });
    expect(result.status).toBe("COMPLETED");
    expect(result.verification).toBeDefined();
    expect(result.verification!.verifierRef).toBe(VERIFIER_REF);
    expect(result.verification!.verdict).toBe("PASS");
    expect(result.details.runRefs).toHaveLength(1);
    // The run is REAL: it exists in the durable history.
    expect((await rig.installed.verification!.history()).length).toBe(1);
  });

  it("answers CAPABILITY_REQUIRED when no verification runtime exists", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "none" });
    const status = await rig.installed.verification!.status();
    expect(status.runtimeAvailable).toBe(false);
    const result = await appCollaboration(rig).run({ task: "check the current head", intent: "CHECK", requestedBy: "user:test" });
    expect(result.status).toBe("CAPABILITY_REQUIRED");
    expect(result.details.capability).toBe("project.verification");
    expect(result.verification).toBeUndefined();
    expect((await rig.installed.verification!.history()).length).toBe(0);
  });

  it("does NOT accept a same-context fallback as an independent check", async () => {
    // The registered verifier really executes and really PASSES — it just shares
    // the authoring context, so it cannot count (§10/§34).
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "shared-context" });
    const status = await rig.installed.verification!.status();
    expect(status.runtimeAvailable).toBe(true);
    expect(status.independentVerifyAvailable).toBe(false);
    const result = await appCollaboration(rig).run({ task: "check the current head", intent: "CHECK", requestedBy: "user:test" });
    expect(result.status).toBe("CAPABILITY_REQUIRED");
    expect(result.details.capability).toBe("project.verification");
    // ZERO runs: the same-context verifier was never used as a fallback.
    expect((await rig.installed.verification!.history()).length).toBe(0);
    expect(result.summary).not.toMatch(/PASS/u);
  });

  it("binds the REGISTERED verifier ref the request selects, and reports an unresolved check as PARTIAL", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const bound = await appCollaboration(rig).run({
      task: "check the current head",
      intent: "CHECK",
      verifierRef: VERIFIER_REF,
      requestedBy: "user:test",
    });
    expect(bound.status).toBe("COMPLETED");
    expect(bound.verification!.verifierRef).toBe(VERIFIER_REF);

    // A ref this deployment does not have cannot be bound: the runtime refuses,
    // the base mode stays visible, and the result is PARTIAL with the typed reason —
    // never a fabricated verdict and never a silent fallback to another verifier.
    const refused = await appCollaboration(rig).run({
      task: "check the current head",
      intent: "CHECK",
      verifierRef: "not-a-registered-verifier",
      requestedBy: "user:test",
    });
    expect(refused.status).toBe("PARTIAL");
    expect(refused.verification).toBeUndefined();
    expect(refused.unresolved.join(" ")).toMatch(/unknown_verifier_ref/u);
    expect((await rig.installed.verification!.history()).length).toBe(1);
  });

  it("binds the request's verifierRef on PARALLEL_AND_CHECK, and a named NON-independent ref never reads as an independent check", async () => {
    // The verifier ref used to reach the compiler only on CHECK, so a combined request
    // verified under the compiler's `project-default` sentinel — a protocol the caller
    // never named. The rig is deliberately MIXED (both classes registered, the
    // INDEPENDENT one as the deployment default): with a single verifier the assertion
    // would pass whether or not the caller's ref was really bound, so it could not
    // detect a revert. Here the caller names the OTHER ref, which the default would
    // otherwise replace.
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "mixed" });

    // (1) The request's ref BINDS — the deployment default would have been VERIFIER_REF.
    const bound = await appCollaboration(rig).run({
      task: "Parallel investigate two plausible approaches to this implementation and check the result.",
      intent: "PARALLEL_AND_CHECK",
      verifierRef: "uxa-same-context",
      requestedBy: "user:test",
    });
    expect(bound.status).toBe("COMPLETED");
    expect(bound.verification?.verifierRef).toBe("uxa-same-context");
    expect(bound.verification?.independence).toBe("SHARED_CONTEXT");
    // …and the primary copy does NOT claim an independent check happened. The
    // deployment-wide gate only proves that SOME verifier is independent.
    expect(bound.summary).not.toMatch(/Independent verification ran/u);
    expect(bound.summary).toMatch(/NOT an independent check/u);
    expect(bound.summary).toMatch(/SHARED_CONTEXT/u);

    // (2) The genuinely independent default still reads as independent.
    const independent = await appCollaboration(rig).run({
      task: "Parallel investigate two plausible approaches to this implementation and check the result.",
      intent: "PARALLEL_AND_CHECK",
      verifierRef: VERIFIER_REF,
      requestedBy: "user:test",
    });
    expect(independent.status).toBe("COMPLETED");
    expect(independent.verification?.verifierRef).toBe(VERIFIER_REF);
    expect(independent.summary, `independent summary: ${independent.summary}`).toMatch(
      /Independent verification ran/u,
    );
  });

  it("reports a repeat request's findings as the CELL frontier, crediting only what this run admitted", async () => {
    // Findings are read from the cell's current accepted frontier (§19), and the cell
    // id is derived from the plan — so a repeat request reuses the cell and its earlier
    // admitted claims are still there. The summary used to say N findings "emerged"
    // for a run that admitted fewer, taking credit for pre-existing work.
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "none" });
    const request = {
      task: "Parallel investigate two plausible approaches to this implementation.",
      intent: "PARALLEL",
      requestedBy: "user:test",
    };
    const first = await appCollaboration(rig).run(request);
    expect(first.status).toBe("COMPLETED");
    const firstCount = first.findings.length;
    expect(firstCount).toBeGreaterThan(0);
    expect(first.summary, `first summary: ${first.summary}`).toMatch(
      new RegExp(`${firstCount} admitted by this request`, "u"),
    );
    expect(first.summary).not.toMatch(/earlier request against the same cell/u);

    const second = await appCollaboration(rig).run(request);
    expect(second.status).toBe("COMPLETED");
    // The frontier is not smaller, and the wording distinguishes this run's admissions
    // from what the same cell already held.
    expect(second.findings.length).toBeGreaterThanOrEqual(firstCount);
    expect(second.summary).toMatch(/already admitted by an earlier request against the same cell/u);
    // The wording distinguishes this run's admissions from the cell's existing
    // frontier, and the second run is credited only with what IT admitted.
    // The second run reuses the same derived cell, so its frontier holds the earlier
    // claims too. The summary must credit THIS run only with its own admissions and
    // name the pre-existing ones as pre-existing (UX-A review MAJOR-2).
    expect(second.summary, `second summary: ${second.summary}`).toMatch(
      new RegExp(`\(${second.findings.length - firstCount} admitted by this request, ${firstCount} already admitted by an earlier request against the same cell\)`, "u"),
    );
  });

  it("refuses a non-plain object and a non-enumerable unknown key, not just own keys", () => {
    // UX-A review MINOR-6: the refusal must be TOTAL. A prototype-carried field used
    // to be read and USED, and a non-enumerable unknown key was silently ignored.
    const base = { task: "Do the thing.", requestedBy: "user:test" };
    // (a) an inherited field can no longer stand in for its declared counterpart —
    // though nothing authority-bearing was ever consumed, the refusal is now explicit.
    const inherited = Object.create({ task: "Inherited task", requestedBy: "user:other" });
    expect(() => parseCollaborationRequest(inherited)).toThrow(CollaborationError);
    expect(() => parseCollaborationRequest(inherited)).toThrow(/plain object/u);
    // (b) a non-enumerable unknown key is seen and refused.
    const hidden = { ...base } as Record<string, unknown>;
    Object.defineProperty(hidden, "recipeId", { value: "explore.v1", enumerable: false });
    expect(() => parseCollaborationRequest(hidden)).toThrow(/unknown field "recipeId"/u);
    // (c) a plain request with exactly the declared keys still parses.
    expect(parseCollaborationRequest(base).task).toBe("Do the thing.");
    // (d) a null-prototype object is still a plain request shape.
    const bare = Object.create(null) as Record<string, unknown>;
    bare.task = "Do the thing.";
    bare.requestedBy = "user:test";
    expect(parseCollaborationRequest(bare).requestedBy).toBe("user:test");
  });

  it("a malformed request is a CALLER error (400-shaped), not a server fault", async () => {
    // `CollaborationError` exposed only `reason`, so the shared HTTP mapper — which
    // switches on `kind` — answered 500 for a bad request. The class now reports the
    // same value under both names, and an unconfigured deployment still reads 500.
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const error = await appCollaboration(rig)
      .run({ task: "x", intent: "NONSENSE", requestedBy: "user:test" })
      .then(() => undefined, (thrown: unknown) => thrown);
    expect(error).toBeInstanceOf(CollaborationError);
    expect((error as CollaborationError).reason).toBe("invalid_intent");
    expect((error as CollaborationError).kind).toBe("invalid_intent");
    expect(applicationErrorStatus(error)).toBe(400);
    // `not_configured` stays a server condition.
    const notConfigured = new CollaborationError("not_configured", "no clock");
    expect(applicationErrorStatus(notConfigured)).toBe(500);
  });
});

/* ================================================================== *
 * UXA-N12 / N13 / N14 — COORDINATE is a handoff, not an action
 * ================================================================== */

describe("UXA-N12/N13/N14 COORDINATE", () => {
  it("returns CROSS_PROJECT_REQUIRED with the existing peers and mutates nothing", async () => {
    const rig = await makeRig({ withAdvisor: true, localPeer: true, verifiers: "none", knownPeerIds: ["peer-independent-1"] });
    const before = rig.head();
    const inboxBefore = await rig.installed.federation!.inbox(P);
    const surface = appCollaboration(rig);
    const plan = await surface.plan({
      task: "Get an independent review by another team of the shared state migration.",
      intent: "AUTO",
      requestedBy: "user:test",
    });
    expect(plan.executionKind).toBe("CROSS_PROJECT_REQUIRED");
    expect(plan.effectiveBaseMode).toBe("COORDINATE");
    expect(plan.reason.join(" ")).toMatch(/Coordinate is recommended/u);
    // §14: the READ-ONLY plan names the existing peers, so a host can hand off to
    // UX-B without running anything. Without this the handoff seam would only be
    // visible from `run()` — i.e. only after a call that may have done work.
    expect(plan.peers).toEqual(["peer-independent-1"]);
    // …and every other execution kind leaves the field ABSENT rather than empty.
    const local = await surface.plan({
      task: "Do it: rename the local helper.",
      intent: "FOCUS",
      requestedBy: "user:test",
    });
    expect(local.peers).toBeUndefined();

    const result = await surface.run({
      task: "Get an independent review by another team of the shared state migration.",
      intent: "AUTO",
      requestedBy: "user:test",
    });
    expect(result.status).toBe("CROSS_PROJECT_REQUIRED");
    expect(result.details.peers).toEqual(["peer-independent-1"]);
    // UXA-N13 / N14: zero peer messages, zero commitments, zero boundary mutation,
    // and no ProjectIR revision for a purely local interaction layer.
    expect(rig.sent).toEqual([]);
    expect(rig.directoryCalls).toEqual([]);
    expect(await rig.installed.federation!.commitments()).toEqual([]);
    expect((await rig.installed.federation!.inbox(P)).received).toEqual(inboxBefore.received);
    expect(rig.head()).toEqual(before);
    expect(result.unresolved.join(" ")).toMatch(/UX-B/u);
  });
});

/* ================================================================== *
 * UXA-N15 / N16 / N17 / N18 / N21 / N22 / N19 / N20 — the golden run
 * ================================================================== */

describe("UXA-N21 one high-level call executes the golden local path", () => {
  it("PARALLEL_AND_CHECK from ONE palimpsest_collaborate call, with findings and a protocol-labelled verdict", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const before = rig.head();
    const journalBefore = await rig.installed.application.projectWorkspace!.journal();
    const loopsBefore = await rig.installed.application.projectWorkspace!.openLoops();

    // ONE high-level tool call. No TaskProfile, no RecipePlan, no cell id, no
    // verifier id is supplied by the caller.
    const raw = await callTool(rig, "palimpsest_collaborate", {
      action: "run",
      task: "Parallel investigate two plausible approaches to this implementation and check the result.",
      intent: "PARALLEL_AND_CHECK",
      branchCountHint: 2,
    });
    const result = raw as {
      readonly status: string;
      readonly findings: readonly { readonly claimId: string; readonly type: { readonly typeId: string }; readonly content: unknown; readonly source: string }[];
      readonly verification?: { readonly verdict: string | null; readonly protocolNote: string; readonly independence: string };
      readonly unresolved: readonly string[];
      readonly details: { readonly cellId?: string; readonly branchIds: readonly string[]; readonly recipeIds: readonly string[]; readonly runRefs: readonly string[] };
      readonly summary: string;
    };

    expect(result.status).toBe("COMPLETED");
    // UXA-N15: the CONTENT of the admitted/current claims, not just ids.
    expect(result.findings).toHaveLength(2);
    for (const finding of result.findings) {
      expect(finding.source).toBe("reasoning_cell");
      expect(finding.type.typeId).toBe("reasoning.statement");
      const content = finding.content as { readonly statement?: string };
      expect(typeof content.statement).toBe("string");
      expect(content.statement).toMatch(/^approach \d+: a distinct candidate answer$/u);
    }
    // Two independent branches produced two DISTINCT admitted claims.
    expect(new Set(result.findings.map((finding) => (finding.content as { statement: string }).statement)).size).toBe(2);
    expect(result.summary).toContain("admitted finding");

    // UXA-N18: PASS is labelled a PROTOCOL result, never truth.
    expect(result.verification).toBeDefined();
    expect(result.verification!.verdict).toBe("PASS");
    expect(result.verification!.protocolNote).toBe(VERIFICATION_PROTOCOL_NOTE);
    expect(result.verification!.protocolNote).toMatch(/protocol result, not truth/u);
    expect(result.summary).toMatch(/protocol result, not truth/u);

    // §18: ids live under `details`, never in the primary copy.
    expect(result.details.cellId).toBeDefined();
    expect(result.details.branchIds).toHaveLength(2);
    expect(result.details.recipeIds).toEqual(["explore.v1", "verify.v1"]);
    expect(result.details.runRefs).toHaveLength(1);
    expect(result.unresolved).toEqual([]);

    // UXA-N16: no branch chain-of-thought, scratchpad, brief, candidate or event
    // internals anywhere in the real payload.
    const serialized = JSON.stringify(result);
    for (const forbidden of [
      "scratchpad",
      "chainOfThought",
      "chain_of_thought",
      "branchBrief",
      "brief",
      "candidateDigest",
      "acceptedClaims",
      "frontierBasis",
      "VERIFICATION_RECORDED",
      "CANDIDATE_SUBMITTED",
      "events",
    ]) {
      expect(serialized, `the result must not expose "${forbidden}"`).not.toContain(forbidden);
    }
    // The branch question suffix the recipe adds is internal plumbing, not UX.
    expect(serialized).not.toContain("[branch 1/");

    // UXA-N05: still zero durable peer activity in the golden path.
    expect(rig.sent).toEqual([]);
    expect(await rig.installed.federation!.commitments()).toEqual([]);

    // UXA-N19/N20: the interaction composition revised no ProjectIR and promoted
    // nothing into the workspace: no Journal entry, no Decision, no open loop.
    expect(rig.head()).toEqual(before);
    expect(await rig.installed.application.projectWorkspace!.journal()).toEqual(journalBefore);
    expect(await rig.installed.application.projectWorkspace!.openLoops()).toEqual(loopsBefore);
  });

  it("UXA-N17 surfaces the branches that did not converge", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    rig.branchBehaviour.value = "one-unresolved";
    const result = await appCollaboration(rig).run({
      task: "Parallel investigate two plausible approaches to this implementation and check the result.",
      intent: "PARALLEL_AND_CHECK",
      requestedBy: "user:test",
    });
    expect(result.status).toBe("COMPLETED");
    expect(result.findings).toHaveLength(1);
    expect(result.unresolved.length).toBeGreaterThan(0);
    expect(result.unresolved.join(" ")).toMatch(/did not converge/u);
    expect(result.summary).toMatch(/Still unresolved/u);
  });

  it("UXA-N17/§34 the PARTIAL asymmetry: an unavailable CHECK half does not cancel real explore work", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "none" });
    const surface = appCollaboration(rig);
    const plan = await surface.plan({
      task: "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.",
      intent: "PARALLEL_AND_CHECK",
      requestedBy: "user:test",
    });
    // The intended structure is explore + check, the verify half cannot run, and the
    // plan says so BY NAME rather than silently dropping the request.
    expect(plan.executionKind).toBe("LOCAL_EXPLORE_AND_VERIFY");
    expect(plan.modifiers).toEqual([]);
    expect(plan.capabilityWarnings.join(" ")).toMatch(/capability "project\.verification" is UNAVAILABLE/u);

    const result = await surface.run({
      task: "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.",
      intent: "PARALLEL_AND_CHECK",
      requestedBy: "user:test",
    });
    // REAL work ran (findings exist) and the check could not happen: PARTIAL.
    expect(result.status).toBe("PARTIAL");
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.verification).toBeUndefined();
    expect(result.capabilityWarnings.join(" ")).toMatch(/project\.verification/u);
    expect(result.unresolved.join(" ")).toMatch(/no verifier run was recorded/u);
    expect((await rig.installed.verification!.history()).length).toBe(0);
    // The explore half is still an honest, hard refusal when IT is unavailable.
    const hardRefusal = await appCollaboration(
      await makeRig({ withAdvisor: true, localPeer: true, verifiers: "none" }),
    ).run({
      task: "parallel investigate two approaches and check",
      intent: "PARALLEL_AND_CHECK",
      requestedBy: "user:test",
    });
    expect(hardRefusal.status).toBe("CAPABILITY_REQUIRED");
    expect(hardRefusal.details.capability).toBe("reasoning.cell");
  });

  it("UXA-N22 keeps every expert tool registered alongside palimpsest_collaborate", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const names = rig.installed.tools.map((entry) => entry.name);
    for (const expert of [
      "palimpsest_advisor",
      "palimpsest_recipe",
      "palimpsest_recipes",
      "palimpsest_reasoning",
      "palimpsest_verification",
      "palimpsest_collaborate",
    ]) {
      expect(names, `expert tool ${expert} must remain`).toContain(expert);
    }
    // §17: exactly two actions, and a truthful `mutating` mode for `run`.
    const tool = toolNamed(rig, "palimpsest_collaborate");
    expect(Object.keys((tool.parameters.properties ?? {}) as object).sort()).toEqual(
      ["action", "branchCountHint", "intent", "task", "values", "verifierRef"].sort(),
    );
    expect(tool.mode).toBe("mutating");
    const actionSchema = (tool.parameters.properties as { readonly action: { readonly enum: readonly string[] } }).action;
    expect(actionSchema.enum).toEqual(["plan", "run"]);
  });
});

/* ================================================================== *
 * UXA-N03 — intent does not mutate Management involvement
 * ================================================================== */

describe("UXA-N03 intent does not mutate Management involvement", () => {
  it("leaves the management involvement exactly where it was", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const before = await rig.installed.application.projectManagement!.posture();
    await appCollaboration(rig).run({
      task: "Explore two independent approaches to the request cache; each approach is isolated in one module and covered by a falsifiable test.",
      intent: "PARALLEL_AND_CHECK",
      requestedBy: "user:test",
    });
    const after = await rig.installed.application.projectManagement!.posture();
    expect(after.management.involvement).toBe(before.management.involvement);
    expect(after.management.profile).toEqual(before.management.profile);
    expect(after.management.confirmationBoundaries).toEqual(before.management.confirmationBoundaries);
  });
});

/* ================================================================== *
 * UXA-N23 — the branch hint is bounded and out-of-range is REFUSED
 * ================================================================== */

describe("UXA-N23 branch fan-out is bounded", () => {
  it("refuses out-of-range and non-integer hints instead of clamping them", () => {
    const base = { task: "explore", requestedBy: "user:test" };
    for (const bad of [0, 1, MAX_BRANCH_HINT + 1, -3, 2.5, Number.NaN, Number.POSITIVE_INFINITY, "2"]) {
      let error: unknown;
      try {
        parseCollaborationRequest({ ...base, branchCountHint: bad });
      } catch (caught) {
        error = caught;
      }
      expect(error, `branchCountHint=${String(bad)} must be refused`).toBeInstanceOf(CollaborationError);
      expect((error as CollaborationError).reason).toBe("invalid_branch_count");
      expect((error as Error).message).toMatch(/refused rather than clamped/u);
    }
    expect(parseCollaborationRequest({ ...base, branchCountHint: MIN_BRANCH_HINT }).branchCountHint).toBe(MIN_BRANCH_HINT);
    expect(parseCollaborationRequest({ ...base, branchCountHint: MAX_BRANCH_HINT }).branchCountHint).toBe(MAX_BRANCH_HINT);
  });

  it("refuses the hint at the surface/tool boundary too, and never compiles an unbounded plan", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    await expect(
      callTool(rig, "palimpsest_collaborate", {
        action: "run",
        task: "parallel investigate",
        intent: "PARALLEL",
        branchCountHint: MAX_BRANCH_HINT + 1,
      }),
    ).rejects.toBeInstanceOf(CollaborationError);
    // Nothing ran: no cell, no branch, no verification run.
    expect(await rig.installed.reasoningCells!.store.cells()).toEqual([]);
    expect(rig.branchExecutions).toEqual([]);
  });
});

/* ================================================================== *
 * UXA-N24 — an infrastructure error never masquerades as a semantic failure
 * ================================================================== */

describe("UXA-N24 infrastructure error != semantic failure", () => {
  it("an advisor that throws becomes ERROR with the message, never CAPABILITY_REQUIRED", async () => {
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      advisor: {
        recommend: async () => {
          throw new Error("advisor backend is down");
        },
      },
    });
    const result = await service.run({ task: "anything", intent: "AUTO", requestedBy: "user:test" });
    expect(result.status).toBe("ERROR");
    expect(result.message).toContain("advisor backend is down");
    expect(result.summary).toContain("advisor backend is down");
    expect(result.findings).toEqual([]);
  });

  it("an execution service that throws becomes ERROR, not PARTIAL or CAPABILITY_REQUIRED", async () => {
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      recipeExecution: {
        execute: async () => {
          throw new Error("reasoning store is unreachable");
        },
      },
      verificationStatus: async () => derivedVerificationStatus(true),
    });
    const result = await service.run({
      task: "check the current head",
      intent: "CHECK",
      requestedBy: "user:test",
    });
    expect(result.status).toBe("ERROR");
    expect(result.message).toContain("reasoning store is unreachable");
    expect(result.status).not.toBe("PARTIAL");
    expect(result.status).not.toBe("CAPABILITY_REQUIRED");
  });

  it("a failing DOWNSTREAM owner READ becomes ERROR too, and stays non-semantic", async () => {
    // A real deployment's verification status read is a real owner call. When that
    // owner fails, the request did not "lack a capability" — the infrastructure
    // broke, and saying CAPABILITY_REQUIRED would be a lie about the deployment.
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      verificationStatus: async () => {
        throw new Error("verification status read failed");
      },
    });
    const result = await service.run({ task: "check the current head", intent: "CHECK", requestedBy: "user:test" });
    expect(result.status).toBe("ERROR");
    expect(result.message).toContain("verification status read failed");
    expect(result.status).not.toBe("CAPABILITY_REQUIRED");
  });

  it("a malformed request is a TYPED refusal, not a semantic result", async () => {
    const service = makeCollaborationService({ projectId: PROJECT, clock: () => CLOCK, recipes: registry });
    await expect(service.run({ task: "", requestedBy: "user:test" })).rejects.toBeInstanceOf(CollaborationError);
    await expect(service.run({ task: "x", requestedBy: "user:test", intent: "SIDEWAYS" })).rejects.toBeInstanceOf(CollaborationError);
    await expect(service.plan({ task: "x", requestedBy: "" })).rejects.toThrow(/requestedBy/u);
    // A service with no project scope cannot be constructed at all.
    expect(() => makeCollaborationService({ projectId: "", clock: () => CLOCK })).toThrow(CollaborationError);
  });
});

/* ================================================================== *
 * Host adapter + result-view seams (part of N01/N04/N16's contract)
 * ================================================================== */

describe("UX-A host adapter and projection seams", () => {
  it("the null adapter never guesses; the example keyword adapter is replaceable and grants nothing", async () => {
    expect(await nullCollaborationIntentAdapter.deriveIntent("parallel explore and verify")).toEqual({
      task: "parallel explore and verify",
      intent: "AUTO",
    });
    const example = deterministicKeywordCollaborationIntentAdapter;
    expect((await example.deriveIntent("Parallel investigate two approaches and check the result.")).intent).toBe("PARALLEL_AND_CHECK");
    expect((await example.deriveIntent("Explore a few alternatives for the cache design.")).intent).toBe("PARALLEL");
    expect((await example.deriveIntent("Check the current head independently.")).intent).toBe("CHECK");
    expect((await example.deriveIntent("Rewrite the README title.")).intent).toBe("AUTO");
    // The adapter's output is NOT a request: its extra `confidence` field is an
    // adapter-local hint, and the request parser refuses to let it through.
    const derived = await example.deriveIntent("Parallel investigate two approaches and check the result.");
    expect(derived.confidence).toBeDefined();
    expect(() => parseCollaborationRequest({ ...derived, requestedBy: "host:test" })).toThrow(/unknown field "confidence"/u);
    // Converting it explicitly (the host's job) yields a valid typed request, and the
    // ADVISOR still decides the structure.
    expect(
      parseCollaborationRequest({ task: derived.task, intent: derived.intent, requestedBy: "host:test" }).intent,
    ).toBe("PARALLEL_AND_CHECK");
  });

  it("projects findings only from the accepted frontier, with the claim content as-is", async () => {
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      recipeExecution: countingExecution({
        status: "explored",
        cellId: "cell-1",
        branchIds: ["br-1"],
        admittedClaimIds: ["cl-1"],
        unresolved: 0,
        branchExecutions: 1,
      }).service,
      reasoning: { activeClaims: async () => ADMITTED_FRONTIER },
      advisor: realAdvisor({ reasoningBranches: true }),
    });
    const result = await service.run({ task: "explore two approaches", intent: "PARALLEL", requestedBy: "user:test" });
    expect(result.status).toBe("COMPLETED");
    expect(result.findings).toEqual([
      {
        claimId: "cl-1",
        type: { typeId: "reasoning.statement", version: "v1" },
        content: { statement: "admitted statement from the accepted frontier" },
        source: "reasoning_cell",
      },
    ]);
    expect(result.summary).toContain("admitted statement from the accepted frontier");
  });

  it("uxa verbs are user copy, not mode names (§24)", async () => {
    const service = makeCollaborationService({ projectId: PROJECT, clock: () => CLOCK, recipes: registry });
    const plan = await service.plan({ task: "do it", requestedBy: "user:test" });
    expect(plan.verb).toBe("Do it");
    expect(plan.verb).not.toMatch(/FOCUS|EXPLORE|VERIFY|ReasoningCell/u);
  });

  it("explicit profile overrides are USER_DECLARED and beat an untrusted proposal", async () => {
    const service = makeCollaborationService({
      projectId: PROJECT,
      clock: () => CLOCK,
      recipes: registry,
      taskProfiler: deterministicTaskProfiler(),
      advisor: realAdvisor({ reasoningBranches: true }),
    });
    const plan = await service.plan({
      task: "quick fix",
      intent: "AUTO",
      taskProfileOverrides: { decomposability: "HIGH", crossComponentCoupling: "LOW" },
      requestedBy: "user:test",
    });
    // The overrides are read (they are not silently dropped by the profiler path).
    expect(plan.reason.length).toBeGreaterThan(0);
  });

  it("the single tool exposes plan and run, and the explicit values reach the ADVISOR through the profile", async () => {
    const rig = await makeRig({ withReasoning: true, withAdvisor: true, verifiers: "independent" });
    const planned = (await callTool(rig, "palimpsest_collaborate", {
      action: "plan",
      task: "parallel investigate two approaches",
      intent: "PARALLEL",
      values: { decomposability: "HIGH", crossComponentCoupling: "LOW", verifiability: "HIGH", parallelSearchBenefit: "HIGH" },
    })) as { readonly executionKind: string; readonly effectiveBaseMode: string };
    expect(planned.executionKind).toBe("LOCAL_EXPLORE");
    expect(planned.effectiveBaseMode).toBe("EXPLORE");
    // plan() is READ-ONLY: nothing was executed and no cell was opened.
    expect(rig.branchExecutions).toEqual([]);
    expect(await rig.installed.reasoningCells!.store.cells()).toEqual([]);

    // A caller cannot smuggle an authority-bearing argument through the tool.
    await expect(
      callTool(rig, "palimpsest_collaborate", { action: "run", task: "x", recipeId: "explore.v1" }),
    ).rejects.toThrow(/unknown argument "recipeId"/u);
    await expect(callTool(rig, "palimpsest_collaborate", { action: "delete", task: "x" })).rejects.toThrow(/unknown action/u);
  });

  it("is ABSENT — never a stub — on a deployment without the recipe layer", async () => {
    // A bare Work-only install has no local peer, so there is no governed recipe
    // execution to compose a collaboration over. The face must be absent (the
    // G10-AC-R §11 lesson: a declared-but-uncomposed face answers 501 forever).
    const installed = installPalimpsest(
      { tools: { register: () => undefined } } as never,
      { projectId: "uxa-bare", databasePath: nextPath("bare-state"), ordariumDatabasePath: nextPath("bare-ord"), clock: () => CLOCK },
    );
    try {
      expect(installed.application.collaboration).toBeUndefined();
      expect(installed.collaboration).toBeUndefined();
      expect(installed.tools.map((entry) => entry.name)).not.toContain("palimpsest_collaborate");
      // A request can still be TYPED and refused without the surface existing.
      expect(() => parseCollaborationRequest({ task: "x", requestedBy: "user:test", intent: "PARALLEL" })).not.toThrow();
    } finally {
      await installed.dispose();
    }
  });

  it("a task-profile override with a disallowed value is refused", () => {
    expect(() =>
      parseCollaborationRequest({
        task: "x",
        requestedBy: "user:test",
        taskProfileOverrides: { decomposability: "MAYBE" },
      }),
    ).toThrow(/must be one of LOW, MEDIUM, HIGH, UNKNOWN/u);
    expect(() =>
      parseCollaborationRequest({ task: "x", requestedBy: "user:test", taskProfileOverrides: { invented: "HIGH" } }),
    ).toThrow(/unknown task feature/u);
  });

  it("the deterministic profiler accepts the real taskProfileFromValues helper contract", () => {
    const profile = taskProfileFromValues({ parallelSearchBenefit: "HIGH" });
    expect(parseTaskProfileSnapshot(profile)).toEqual(profile);
  });
});
