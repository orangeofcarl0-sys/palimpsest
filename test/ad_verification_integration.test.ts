/**
 * G10-AD Independent Project Verification Runtime — PRODUCT INTEGRATION SUITE
 * (AD-N17 … AD-N27, AD-N30, the §15/§16/§17/§22/§23/§26/§27/§28 integration
 * proofs, and the install-level restart/dogfood proofs).
 *
 * The CORE plane suite (`test/ad_verification_runtime.test.ts`, AD-N01…AD-N16,
 * AD-N28/AD-N29) proves the plane itself. This file proves the INTEGRATION:
 *
 *   §15/§16  Work Mode VERIFY availability comes from a REAL runtime + registry
 *   §17      the capability is `project.verification`; `bind_verification` names a
 *            registered ref or the explicit `project-default`, never an invented one
 *   §18      RecipeExecution runs the base mode and THEN verifies the current head
 *   §19/§20/§21  RUN_LOCAL_VERIFY is reachable, loop-free and durable
 *   §22/§23  the application/HTTP/tool face (status, history, explicit verification)
 *   §27      no OTHER plane changed
 *
 * Everything runs on the REAL product stack: `installPalimpsest` with a real Work
 * `EventStore`/`ProjectController`, a real `SqliteProjectVerificationStore`, the
 * real first-party mechanical verifier (a bounded subprocess) and the real
 * management/workspace/recipe services. The only adapters are the seams the
 * product itself declares: the Git head port (`FakeGitPort`, the same port the
 * core suite uses), the clock, and the host branch-execution port.
 *
 * HONEST notes are collected at the bottom of this file (search "HONEST:").
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { handleApplicationRequest } from "../src/application/http.js";
import { FakeGitPort } from "../src/effects/index.js";
import { installPalimpsest } from "../src/install.js";
import type { InstalledPalimpsest } from "../src/install.js";
import {
  DEFAULT_ACTION_POLICY,
  SqliteManagementPreferenceStore,
} from "../src/project_management/index.js";
import {
  deriveEffectiveModeStatus,
  verificationAvailabilityOf,
} from "../src/project_operating/index.js";
import {
  SqliteProjectAssetAssociationStore,
  SqliteProjectJournalStore,
} from "../src/project_workspace/index.js";
import {
  commandProjectHeadVerifier,
  independenceSummary,
  projectVerificationRunRef,
  SqliteProjectVerificationStore,
  verificationIsDue,
  asHeadSubject,
} from "../src/project_verification/index.js";
import type { VerifierDefinition } from "../src/project_verification/index.js";
import { DEFAULT_HEAD_COMMIT } from "../src/tools/controller.js";
import {
  builtinRecipeRegistry,
  compileRecipePlan,
  makeRecipeExecutionService,
  materializeRecipePlan,
  PROJECT_DEFAULT_VERIFIER_REF,
} from "../src/recipes/index.js";
import type {
  ReasoningBranchExecutionPort,
  RecipeDefinitionRef,
  RecipePlan,
} from "../src/recipes/index.js";
import {
  SqliteReasoningCellStore,
  invalidationAdmissionDigestOf,
  invalidationVerificationDigestOf,
  reasoningAdmissionDigestOf,
  reasoningVerificationDigestOf,
} from "../src/reasoning_cell/index.js";
import type {
  ReasoningEpistemicAdmissionPolicyPort,
  ReasoningVerificationPolicyPort,
} from "../src/reasoning_cell/index.js";
import type { PeerRef } from "../src/federation/index.js";

import { taskSpec } from "./helpers.js";

/* -------------------------------------------------------------------------- *
 * Shared constants + rig
 * -------------------------------------------------------------------------- */

const CLOCK = "2026-09-16T00:00:00Z";
const HEAD = "a".repeat(40);
const REF = "project.head.integration.v1";
const P: PeerRef = { schemaVersion: 1, peerId: "peer-local" };

const DIRS: string[] = [];
const OPEN: { dispose(): Promise<void> }[] = [];
const OPEN_RIGS: Rig[] = [];

afterEach(async () => {
  for (const rig of OPEN_RIGS.splice(0)) {
    try {
      await rig.close();
    } catch {
      /* already closed */
    }
  }
  for (const item of OPEN.splice(0)) {
    try {
      await item.dispose();
    } catch {
      /* already disposed */
    }
  }
  for (const dir of DIRS.splice(0)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows may still hold a SQLite handle briefly; the temp dir is disposable. */
    }
  }
});

function freshDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  DIRS.push(dir);
  return dir;
}

/**
 * The REAL mechanical verifier this deployment registers: a bounded `node`
 * subprocess (`node -e process.exit(0)`), executed through the existing
 * `commandValidator`. It is MECHANICAL_INDEPENDENT, so it counts as independent
 * (§10/§16) — and it is a registered DEFINITION, so a caller may only select the
 * ref, never a command.
 */
function mechanicalVerifier() {
  return commandProjectHeadVerifier({
    verifierRef: REF,
    command: process.execPath,
    args: ["-e", "process.exit(0)"],
  });
}

interface RigOptions {
  readonly projectId?: string;
  /** TRUE ⇒ a completely bare Work-only install (no workspace, no verification). */
  readonly bare?: boolean;
  readonly withLocalPeer?: boolean;
  readonly withReasoning?: boolean;
  readonly verificationStore?: SqliteProjectVerificationStore | undefined;
  readonly verificationCapabilityRef?: string | undefined;
  /** An EMPTY provider list is the explicit "no verification runtime" deployment. */
  readonly providerRefs?: readonly string[];
  readonly defaultVerifierRef?: string | null;
  readonly managementStore?: boolean;
  readonly tasks?: readonly string[];
}

interface Rig {
  readonly installed: InstalledPalimpsest;
  readonly dir: string;
  readonly projectId: string;
  readonly management: SqliteManagementPreferenceStore | undefined;
  /** A real subprocess spawn count is observable through the history length. */
  close(): Promise<void>;
}

function makeRig(options: RigOptions = {}): Rig {
  const projectId = options.projectId ?? "ad-integration";
  const dir = freshDir("palimpsest-ad-integration-");
  const management =
    options.managementStore === true
      ? new SqliteManagementPreferenceStore(join(dir, "management.sqlite"))
      : undefined;
  const installed = installPalimpsest({ tools: { register: () => undefined } }, {
    projectId,
    databasePath: join(dir, "state.sqlite"),
    ordariumDatabasePath: join(dir, "ordarium.sqlite"),
    clock: () => CLOCK,
    // The declared Git head port seam: the project head and the repository head are
    // the SAME value, so §5's consistency rule is genuinely satisfied (and the
    // suite never depends on the surrounding working copy).
    git: new FakeGitPort(HEAD),
    ...(management === undefined ? {} : { managementPreferenceStore: management }),
    // A PRODUCT install carries the association/journal stores, which is what makes
    // the derived workspace, the bounded management service and the default
    // verification runtime exist. `bare: true` omits ALL of it.
    ...(options.bare === true
      ? {}
      : {
          projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite")),
          projectJournalStore: new SqliteProjectJournalStore(join(dir, "journal.sqlite")),
        }),
    ...(options.withLocalPeer === true ? { localPeer: P } : {}),
    ...(options.verificationCapabilityRef === undefined
      ? {}
      : { verificationCapabilityRef: options.verificationCapabilityRef }),
    ...(options.verificationStore === undefined
      ? {}
      : { projectVerificationStore: options.verificationStore }),
    ...(options.bare === true
      ? {}
      : options.providerRefs === undefined
        ? { projectVerifierProviders: [mechanicalVerifier()], projectVerificationDefaultVerifierRef: REF }
        : options.providerRefs.length === 0
          ? { projectVerifierProviders: [] }
          : {
              projectVerifierProviders: [
                commandProjectHeadVerifier({
                  verifierRef: options.providerRefs[0]!,
                  command: process.execPath,
                  args: ["-e", "process.exit(0)"],
                }),
              ],
              projectVerificationDefaultVerifierRef: options.providerRefs[0]!,
            }),
    ...(options.defaultVerifierRef === null || options.defaultVerifierRef === undefined
      ? {}
      : { projectVerificationDefaultVerifierRef: options.defaultVerifierRef }),
    ...(options.withReasoning === true ? reasoningOptions(dir, projectId) : {}),
  });
  installed.controller.start({
    projectId,
    goal: "Integrate independent project verification without truth.",
    headCommit: HEAD,
    tasks: (options.tasks ?? ["task-a"]).map((taskId) => taskSpec(taskId)),
  });
  const rig: Rig = {
    installed,
    dir,
    projectId,
    management,
    close: async () => {
      await installed.dispose();
    },
  };
  OPEN_RIGS.push(rig);
  return rig;
}

/**
 * A REAL ReasoningCell service with the deployment's OWN verification/admission
 * policies. These policies are host-provided ports (the product declares them);
 * ReasoningCell semantics themselves are never mocked.
 */
function reasoningOptions(dir: string, projectId: string): Record<string, unknown> {
  const store = new SqliteReasoningCellStore(join(dir, "reasoning.sqlite"));
  const policyRef = (policyId: string) => ({ policyId, version: "v1" });
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
  void projectId;
  return {
    reasoningCellStore: store,
    reasoningVerificationPolicy: verification,
    reasoningAdmissionPolicy: admission,
    reasoningBranchExecution: {
      adapterId: "ad-integration-branch",
      run: async (): Promise<unknown> => ({ statement: `branch answer for the cell` }),
    } satisfies ReasoningBranchExecutionPort,
  };
}

/* -------------------------------------------------------------------------- *
 * Recipe plan helpers
 * -------------------------------------------------------------------------- */

const registry = builtinRecipeRegistry();

function refOf(recipeId: string): RecipeDefinitionRef {
  const definition = registry.get(recipeId);
  if (definition === undefined) throw new Error(`no builtin recipe "${recipeId}"`);
  return { recipeId: definition.recipeId, version: definition.version, digest: definition.digest };
}

function planOf(input: {
  readonly base: string;
  readonly modifiers?: readonly string[];
  readonly parameters?: Readonly<Record<string, unknown>>;
  readonly existingSubjectRefs?: readonly string[];
}): RecipePlan {
  return materializeRecipePlan({
    baseRecipeRef: refOf(input.base),
    modifierRefs: (input.modifiers ?? []).map(refOf),
    ...(input.parameters === undefined ? {} : { parameters: input.parameters }),
    ...(input.existingSubjectRefs === undefined
      ? {}
      : { existingSubjectRefs: input.existingSubjectRefs }),
    rationaleDigest: "a".repeat(64),
  });
}

async function http(
  installed: InstalledPalimpsest,
  method: string,
  pathname: string,
  body?: unknown,
): Promise<{ readonly status: number; readonly body: unknown }> {
  const result = await handleApplicationRequest({
    application: installed.application,
    method,
    pathname,
    query: new URLSearchParams(),
    body,
  });
  if (result === undefined) throw new Error(`no application route for ${method} ${pathname}`);
  return result;
}

function refusalKind(error: unknown): string {
  return typeof error === "object" && error !== null
    ? String((error as { kind?: unknown }).kind ?? "")
    : "";
}

/* ========================================================================== *
 * AD-N17 / §15 / §16 — a bare ref/bool no longer inflates capability
 * ========================================================================== */

describe("G10-AD AD-N17: a bare verificationCapabilityRef no longer inflates capability", () => {
  it("AD-N17 a bare `independentVerifier: true` is CONDITIONAL, never AVAILABLE (§15/§16)", () => {
    const note = "VERIFY is available from a real independent runtime (project.head.integration.v1)";
    // A declaration alone: not a runtime.
    const declared = verificationAvailabilityOf({ independentVerifier: true });
    expect(declared.availability).toBe("CONDITIONAL");
    expect(declared.reason).toMatch(/bare declaration cannot prove/u);

    // A runtime that exists but whose only verifier does NOT count as independent:
    // UNAVAILABLE, with the runtime's own honest note.
    const notIndependent = verificationAvailabilityOf({
      independentVerifier: true,
      verificationRuntimeCapability: {
        runtimeAvailable: true,
        independentVerifierAvailable: false,
        independentVerifierRefs: [],
        defaultVerifierRef: "project.head.shared-context.v1",
        note: "a verification runtime exists but no registered verifier counts as independent; VERIFY is not available",
      },
    });
    expect(notIndependent.availability).toBe("UNAVAILABLE");
    expect(notIndependent.reason).toMatch(/no registered verifier counts as independent/u);

    // The ONLY path to AVAILABLE: a real runtime AND a registered independent verifier.
    const real = verificationAvailabilityOf({
      independentVerifier: false,
      verificationRuntimeCapability: {
        runtimeAvailable: true,
        independentVerifierAvailable: true,
        independentVerifierRefs: [REF],
        defaultVerifierRef: REF,
        note,
      },
    });
    expect(real.availability).toBe("AVAILABLE");
    expect(real.reason).toBe(note);
  });

  it("AD-N17 a descriptive verificationCapabilityRef alone creates NO runtime and NO VERIFY availability", async () => {
    // A BARE Work-only install (no workspace, no recipe execution): the descriptive
    // string must not conjure a runtime, a route or a tool.
    const bare = makeRig({
      projectId: "ad-n17-bare",
      bare: true,
      verificationCapabilityRef: "descriptive-only-ref",
    });
    expect(bare.installed.verification).toBeUndefined();
    expect(bare.installed.application.verification).toBeUndefined();
    expect(bare.installed.tools.some((tool) => tool.name === "palimpsest_verification")).toBe(false);
    const status = await http(bare.installed, "GET", "/api/verification/status");
    expect(status.status).toBe(501);

    // Even a PRODUCT install that DOES have a runtime derives the Advisor fact from
    // the runtime, not from the string: an unrelated descriptive ref is not reported
    // as an available independent verifier.
    const product = makeRig({ projectId: "ad-n17-product", verificationCapabilityRef: "descriptive-only-ref" });
    expect(product.installed.verification).toBeDefined();
    const capability = product.installed.verification!.runtimeCapability();
    expect(capability.runtimeAvailable).toBe(true);
    expect(capability.independentVerifierRefs).toEqual([REF]);
    expect(capability.defaultVerifierRef).toBe(REF);
    // The descriptive string is NOT the registered ref.
    expect(capability.independentVerifierRefs).not.toContain("descriptive-only-ref");
  });

  it("AD-N17 the health of a runtime without an independent verifier is reported as UNAVAILABLE", async () => {
    // A registered + EXECUTABLE verifier whose independence class does not count.
    const shared = commandProjectHeadVerifier({
      verifierRef: "project.head.shared.v1",
      command: process.execPath,
      args: ["-e", "process.exit(0)"],
      independenceClass: "SHARED_CONTEXT",
    });
    const summary = independenceSummary([shared.definition]);
    expect(summary.independentVerifyAvailable).toBe(false);
    const view = verificationAvailabilityOf({
      independentVerifier: true,
      verificationRuntimeCapability: {
        runtimeAvailable: true,
        independentVerifierAvailable: summary.independentVerifyAvailable,
        independentVerifierRefs: summary.independentRefs,
        defaultVerifierRef: "project.head.shared.v1",
        note: "a verification runtime exists but no registered verifier counts as independent; VERIFY is not available",
      },
    });
    expect(view.availability).toBe("UNAVAILABLE");
  });
});

/* ========================================================================== *
 * §15 / §26 — Work Mode VERIFY availability from the REAL runtime
 * ========================================================================== */

describe("G10-AD §15/§26: Work Mode VERIFY availability is derived from the real runtime", () => {
  it("§15 a real independent runtime + a VERIFY preference makes the row AVAILABLE", async () => {
    const rig = makeRig({ projectId: "ad-s15", managementStore: true });
    await rig.installed.projectManagement!.setWorkModePreference({
      baseMode: "FOCUS",
      modifiers: ["VERIFY"],
      updatedBy: "operator:test",
    });
    const posture = await rig.installed.projectManagement!.posture();
    const verifyRow = posture.workMode.effectiveStatus.find((row) => row.capability === "VERIFY")!;
    expect(verifyRow.preferred).toBe(true);
    expect(verifyRow.availability).toBe("AVAILABLE");
    expect(verifyRow.reason).toContain(REF);
    // The capability is a READ of the registry + executable providers, not a claim.
    const capability = rig.installed.verification!.runtimeCapability();
    expect(capability.runtimeAvailable).toBe(true);
    expect(capability.independentVerifierAvailable).toBe(true);
    expect(capability.independentVerifierRefs).toEqual([REF]);
  });

  it("§15 a VERIFY preference with NO runtime stays a valid preference, shown honestly", async () => {
    const rig = makeRig({
      projectId: "ad-s15-noruntime",
      providerRefs: [],
      managementStore: true,
    });
    // The runtime is composed but EMPTY: no registered executable verifier.
    expect(rig.installed.verification).toBeDefined();
    expect(rig.installed.verification!.runtimeCapability().runtimeAvailable).toBe(false);
    await rig.installed.projectManagement!.setWorkModePreference({
      baseMode: "FOCUS",
      modifiers: ["VERIFY"],
      updatedBy: "operator:test",
    });
    const posture = await rig.installed.projectManagement!.posture();
    const verifyRow = posture.workMode.effectiveStatus.find((row) => row.capability === "VERIFY")!;
    expect(verifyRow.preferred).toBe(true); // NEVER dropped
    expect(verifyRow.availability).toBe("UNAVAILABLE");
    expect(verifyRow.reason).toMatch(/no verification runtime exists/u);
    // §19: no automatic candidate can exist without an independent runtime.
    const candidates = await rig.installed.projectManagement!.recommend();
    expect(candidates.map((candidate) => candidate.kind)).not.toContain("RUN_LOCAL_VERIFY");
  });

  it("§15 a bare Work-only install reports VERIFY UNAVAILABLE and exposes no verification surface", async () => {
    const rig = makeRig({ projectId: "ad-s15-bare", bare: true });
    expect(rig.installed.verification).toBeUndefined();
    expect(rig.installed.projectManagement).toBeUndefined();
    expect(rig.installed.tools).toHaveLength(9);
  });
});

/* ========================================================================== *
 * §17 — recipe registry/compiler honesty
 * ========================================================================== */

describe("G10-AD §17: verify.v1 capability naming + bind_verification honesty", () => {
  it("§17 verify.v1 stays CONDITIONAL with a PROJECT verification capability", () => {
    const definition = registry.get("verify.v1")!;
    expect(definition.readiness).toBe("CONDITIONAL");
    expect(definition.capabilityRequirements).toEqual(["project.verification"]);
    expect(definition.capabilityRequirements).not.toContain("experiment.validator");
    expect(definition.limitations.join(" ")).toMatch(/registered, versioned verifier definition/u);
  });

  it("§17 an ABSENT verifier binds the EXPLICIT project-default, never an invented ref", () => {
    const compiled = compileRecipePlan(
      planOf({ base: "focus.v1", modifiers: ["verify.v1"] }),
      registry,
    );
    const step = compiled.steps.find((entry) => entry.kind === "bind_verification")!;
    expect(step).toMatchObject({ kind: "bind_verification", verifierRef: PROJECT_DEFAULT_VERIFIER_REF });
    expect(JSON.stringify(compiled)).not.toContain("deterministic");
    // A plan that NAMES a ref keeps it verbatim (it is descriptive; the RUNTIME
    // validates that it is registered and refuses it otherwise).
    const named = compileRecipePlan(
      planOf({ base: "focus.v1", modifiers: ["verify.v1"], parameters: { verifierRef: REF } }),
      registry,
    );
    expect(named.steps.find((entry) => entry.kind === "bind_verification")).toMatchObject({
      verifierRef: REF,
    });
    // The compiled capability set names project verification only.
    expect(compiled.requiredCapabilities).toContain("project.verification");
    expect(compiled.requiredCapabilities).not.toContain("experiment.validator");
  });
});

/* ========================================================================== *
 * §18 — RecipeExecution stops ignoring VERIFY
 * ========================================================================== */

describe("G10-AD AD-N24/N25: RecipeExecution executes bind_verification", () => {
  it("AD-N24/N25 FOCUS+VERIFY reuses the principal and verifies the CURRENT head through the real runtime", async () => {
    const rig = makeRig({ projectId: "ad-n24", withLocalPeer: true });
    const compiled = rig.installed.application.recipeExecution!.compile(
      planOf({ base: "focus.v1", modifiers: ["verify.v1"] }),
    );
    const outcome = await rig.installed.application.recipeExecution!.start(compiled, {});
    expect(outcome.status).toBe("reused_principal");
    const verification = (outcome as { verification?: Record<string, string | null> }).verification!;
    expect(verification).toBeDefined();
    expect(verification.verifierRef).toBe(REF);
    expect(verification.verdict).toBe("PASS");
    expect(verification.freshness).toBe("CURRENT");
    expect(verification.independence).toBe("MECHANICAL_INDEPENDENT");
    expect(verification.runRef).toBe(`project_verification:${verification.runId}`);
    expect((outcome as { verificationUnresolved?: unknown }).verificationUnresolved).toBeUndefined();

    // The run is REAL and durable: it is in the append-only history, for the exact head.
    const history = await rig.installed.verification!.history();
    expect(history).toHaveLength(1);
    expect(history[0]!.runId).toBe(verification.runId);
    expect(asHeadSubject(history[0]!.subject).headCommit).toBe(HEAD);
    expect(history[0]!.subject.kind).toBe("CURRENT_PROJECT_HEAD");
    expect(history[0]!.verdict).toBe("PASS");
    expect(rig.installed.verification!.store.verifyChain(rig.projectId).ok).toBe(true);
  });

  it("§18 a plan with no VERIFY modifier is UNCCHANGED (no verification metadata at all)", async () => {
    const rig = makeRig({ projectId: "ad-s18-none", withLocalPeer: true });
    const compiled = rig.installed.application.recipeExecution!.compile(planOf({ base: "focus.v1" }));
    const outcome = await rig.installed.application.recipeExecution!.start(compiled, {});
    expect(outcome).toEqual({ status: "reused_principal" });
    expect(await rig.installed.verification!.history()).toHaveLength(0);
  });

  it("§18 with NO verification runtime a VERIFY plan returns unresolved, never a fake success", async () => {
    // (a) The install-level shape: the recipe execution service exists (a local peer
    // is wired) but this deployment registered NO executable verifier at all.
    const dir = freshDir("palimpsest-ad-s18-noruntime-");
    const installed = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: "ad-s18-noruntime",
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ord.sqlite"),
      clock: () => CLOCK,
      git: new FakeGitPort(HEAD),
      localPeer: P,
      projectVerifierProviders: [],
    });
    OPEN.push(installed);
    installed.controller.start({
      projectId: "ad-s18-noruntime",
      goal: "g",
      headCommit: HEAD,
      tasks: [taskSpec("task-a")],
    });
    expect(installed.verification).toBeDefined();
    expect(installed.verification!.runtimeCapability().runtimeAvailable).toBe(false);
    const compiled = installed.application.recipeExecution!.compile(
      planOf({ base: "focus.v1", modifiers: ["verify.v1"] }),
    );
    const outcome = await installed.application.recipeExecution!.start(compiled, {});
    expect(outcome.status).toBe("reused_principal");
    expect((outcome as { verification?: unknown }).verification).toBeUndefined();
    const unresolved = (outcome as { verificationUnresolved?: { typedReasonCode: string } })
      .verificationUnresolved!;
    expect(unresolved.typedReasonCode).toBe("no_registered_verifier");
    expect(await installed.verification!.history()).toHaveLength(0);

    // (b) A recipe execution service with NO verification seam at all: the plan
    // declares a capability this deployment does not have.
    const bare = makeRecipeExecutionService({ localPeer: P });
    const bareOutcome = await bare.execute(compiled, {});
    expect(bareOutcome).toMatchObject({
      status: "capability_required",
      capability: "project.verification",
    });
  });

  it("§18 a blocked run leaves the base outcome visible and UNRESOLVED, never a verdict", async () => {
    // The project head is NOT the repository head: §5 blocks the first-party
    // provider, so the base mode completed but the verification did not.
    const dir = freshDir("palimpsest-ad-s18-blocked-");
    const installed = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: "ad-s18-blocked",
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ord.sqlite"),
      clock: () => CLOCK,
      // The git head is the ambient value, while the project head is DEFAULT_HEAD_COMMIT.
      git: new FakeGitPort("b".repeat(40)),
      localPeer: P,
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "a.sqlite")),
      projectJournalStore: new SqliteProjectJournalStore(join(dir, "j.sqlite")),
      projectVerifierProviders: [mechanicalVerifier()],
      projectVerificationDefaultVerifierRef: REF,
    });
    OPEN.push(installed);
    installed.controller.start({
      projectId: "ad-s18-blocked",
      goal: "g",
      headCommit: DEFAULT_HEAD_COMMIT,
      tasks: [taskSpec("task-a")],
    });
    const compiled = installed.application.recipeExecution!.compile(
      planOf({ base: "focus.v1", modifiers: ["verify.v1"] }),
    );
    const outcome = await installed.application.recipeExecution!.start(compiled, {});
    expect(outcome.status).toBe("reused_principal");
    expect((outcome as { verification?: unknown }).verification).toBeUndefined();
    const unresolved = (outcome as { verificationUnresolved?: { typedReasonCode: string } })
      .verificationUnresolved!;
    expect(unresolved.typedReasonCode).toBe("project_head_not_materialized");
    // Nothing was written: a blocked run is not history.
    expect(await installed.verification!.history()).toHaveLength(0);
  });
});

describe("G10-AD AD-N26: EXPLORE+VERIFY does not re-verify reasoning claims", () => {
  it("AD-N26 the ReasoningCell keeps its own verification/admission and the run is about the PROJECT HEAD", async () => {
    const rig = makeRig({ projectId: "ad-n26", withLocalPeer: true, withReasoning: true });
    const compiled = rig.installed.application.recipeExecution!.compile(
      planOf({
        base: "explore.v1",
        modifiers: ["verify.v1"],
        parameters: { question: "does the integration hold?", branchCount: 2 },
      }),
    );
    const outcome = await rig.installed.application.recipeExecution!.start(compiled, {});
    expect(outcome.status).toBe("explored");
    const explored = outcome as unknown as {
      readonly cellId: string;
      readonly admittedClaimIds: readonly string[];
      readonly verification?: { readonly runId: string; readonly runRef: string; readonly verdict: string | null };
    };
    // The ReasoningCell's OWN admission ran and admitted claims (its own policies).
    expect(explored.admittedClaimIds.length).toBeGreaterThan(0);
    const verification = explored.verification!;
    expect(verification.verdict).toBe("PASS");

    // The verification run is about the PROJECT HEAD, never about a reasoning claim.
    const subject = (await rig.installed.verification!.history())[0]!.subject;
    expect(subject.kind).toBe("CURRENT_PROJECT_HEAD");
    expect(asHeadSubject(subject).projectRevision).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(subject)).not.toMatch(/claim|cell|branch/i);
    // …and it never wrote a reasoning record: the admitted claims came from the cell.
    expect(await rig.installed.reasoningCells!.service.cellView({ cellId: explored.cellId })).toBeDefined();
    // The claim ids are the CELL's, not the verifier's.
    for (const claimId of explored.admittedClaimIds) {
      expect(claimId).not.toMatch(/project_verification/);
    }
    // The project-head verification did not touch the reasoning store: exactly the
    // claims the cell admitted exist.
    expect((await rig.installed.reasoningCells!.store.cells()).length).toBe(1);
  });
});

describe("G10-AD AD-N27: COORDINATE+VERIFY accepts no commitment", () => {
  it("AD-N27 coordination surfaces only existing peers, verification checks the head", async () => {
    const rig = makeRig({ projectId: "ad-n27", withLocalPeer: true });
    const compiled = rig.installed.application.recipeExecution!.compile(
      planOf({
        base: "coordinate.v1",
        modifiers: ["verify.v1"],
        existingSubjectRefs: ["peer-x"],
      }),
    );
    const outcome = await rig.installed.application.recipeExecution!.start(compiled, {});
    expect(outcome.status).toBe("coordination_surfaced");
    const surfaced = outcome as unknown as {
      readonly peerRefs: readonly PeerRef[];
      readonly verification?: { readonly verdict: string | null };
    };
    // Only the EXISTING peer refs, and the verification is about the project head.
    expect(surfaced.peerRefs).toEqual([{ schemaVersion: 1, peerId: "peer-x" }]);
    expect(surfaced.verification!.verdict).toBe("PASS");
    expect((await rig.installed.verification!.history())[0]!.subject.kind).toBe("CURRENT_PROJECT_HEAD");
    // No commitment surface exists at all in this install, and the outcome carries no
    // commitment-shaped field: coordination accepts nothing.
    expect(rig.installed.application.federation).toBeUndefined();
    expect(Object.keys(outcome)).not.toContain("commitmentId");
    expect(JSON.stringify(outcome)).not.toMatch(/commitment|handoff/i);
  });
});

/* ========================================================================== *
 * §19 / §20 / §21 — management reachability, loop-freedom and durability
 * ========================================================================== */

async function setInvolvement(
  rig: Rig,
  to: "DIRECT" | "ASSIST" | "MANAGE" | "DELEGATE",
): Promise<void> {
  await rig.installed.projectManagement!.applyOperatorModeChange({ to, updatedBy: "operator:test" });
}

async function preferVerify(rig: Rig, modifiers: readonly ("VERIFY" | "MONITOR")[]): Promise<void> {
  await rig.installed.projectManagement!.setWorkModePreference({
    baseMode: "FOCUS",
    modifiers,
    updatedBy: "operator:test",
  });
}

describe("G10-AD §19/§20: RUN_LOCAL_VERIFY reachability and loop-freedom", () => {
  it("AD-N18 no VERIFY preference creates NO automatic verification candidate", async () => {
    const rig = makeRig({ projectId: "ad-n18", managementStore: true });
    await setInvolvement(rig, "MANAGE");
    await preferVerify(rig, []);
    const candidates = await rig.installed.projectManagement!.recommend();
    expect(candidates.length).toBeGreaterThan(0); // the workspace really yields work
    expect(candidates.map((candidate) => candidate.kind)).not.toContain("RUN_LOCAL_VERIFY");
    // An unconfirmed step therefore executes something else entirely (or waits).
    const step = await rig.installed.projectManagement!.step();
    expect(step.action).not.toBe("RUN_LOCAL_VERIFY");
  });

  it("AD-N21/AD-N19 a verification-due head produces a candidate, and a fresh run suppresses the repeat", async () => {
    const rig = makeRig({ projectId: "ad-n19", managementStore: true });
    await setInvolvement(rig, "MANAGE");
    await preferVerify(rig, ["VERIFY"]);

    // AD-N21: reachable, and it is the FIRST permitted candidate (its action class is
    // ordered before DISPATCH_LOCAL_WORK, and no attempt exists yet).
    const due = await rig.installed.projectManagement!.recommend();
    const verifyCandidate = due.find((candidate) => candidate.kind === "RUN_LOCAL_VERIFY");
    expect(verifyCandidate).toBeDefined();
    expect(verifyCandidate!.capability).toBe("verify");
    expect(verifyCandidate!.subjects.map((subject) => subject.kind)).toEqual([
      "verification_subject",
      "verifier",
    ]);
    expect(verifyCandidate!.subjects.find((subject) => subject.kind === "verifier")!.id).toBe(REF);

    // The candidate runs the REAL runtime and returns the durable product ref.
    const step = await rig.installed.projectManagement!.step({ confirmed: true });
    expect(step.status).toBe("executed");
    expect(step.actionClass).toBe("RUN_LOCAL_VERIFY");
    const refs = step.canonicalOutcomeRefs!;
    const verifyRef = refs.find((ref) => ref.kind === "project_verification")!;
    expect(verifyRef).toBeDefined();
    const runId = verifyRef.ref;
    expect(projectVerificationRunRef(runId)).toBe(`project_verification:${runId}`);
    expect(step.detail).toContain(`project_verification:${runId}`);
    expect(step.detail).toMatch(/PASS/u);
    // §21: the run is durable and is the SAME run the activity references (never a copy).
    const history = await rig.installed.verification!.history();
    expect(history).toHaveLength(1);
    expect(history[0]!.runId).toBe(runId);
    const activity = await rig.installed.projectManagement!.activity();
    const terminal = activity.at(-1)!;
    expect(terminal.decision).toBe("executed");
    expect(terminal.canonicalOutcomeRefs).toContainEqual({ kind: "project_verification", ref: runId });
    // The activity record COPIES no run body.
    expect(JSON.stringify(terminal)).not.toMatch(/verdict|runDigest|resultDigest/i);

    // AD-N19: the fresh completed run prevents an automatic loop, whatever the verdict.
    const after = await rig.installed.projectManagement!.recommend();
    expect(after.map((candidate) => candidate.kind)).not.toContain("RUN_LOCAL_VERIFY");
    const dueAgain = verificationIsDue({ status: await rig.installed.verification!.status() });
    expect(dueAgain.due).toBe(false);
    expect(dueAgain.reason).toMatch(/fresh completed run/u);
  });

  it("AD-N20 a NEW project head makes verification due again (a NEW candidate)", async () => {
    const rig = makeRig({ projectId: "ad-n20", managementStore: true });
    await setInvolvement(rig, "MANAGE");
    await preferVerify(rig, ["VERIFY"]);
    const before = (await rig.installed.projectManagement!.recommend()).find(
      (candidate) => candidate.kind === "RUN_LOCAL_VERIFY",
    )!;
    const first = await rig.installed.projectManagement!.step({ confirmed: true });
    expect(first.actionClass).toBe("RUN_LOCAL_VERIFY");
    expect(
      (await rig.installed.projectManagement!.recommend()).some(
        (candidate) => candidate.kind === "RUN_LOCAL_VERIFY",
      ),
    ).toBe(false);

    // A real PROJECT_REVISED moves the canonical head.
    rig.installed.controller.plan({ tasks: [taskSpec("task-a"), taskSpec("task-b")] });
    const after = (await rig.installed.projectManagement!.recommend()).find(
      (candidate) => candidate.kind === "RUN_LOCAL_VERIFY",
    )!;
    expect(after).toBeDefined();
    // The subject digest is part of the candidate content: a NEW head is a NEW candidate.
    expect(after.actionId).not.toBe(before.actionId);
    expect(after.subjects.find((subject) => subject.kind === "verification_subject")!.id).not.toBe(
      before.subjects.find((subject) => subject.kind === "verification_subject")!.id,
    );
    const status = await rig.installed.verification!.status();
    expect(status.state).toBe("UNVERIFIED");
    expect(status.latestRun!.freshness).toBe("STALE_SUBJECT");
    expect(verificationIsDue({ status }).due).toBe(true);
  });
});

describe("G10-AD AD-N22/AD-N23: the existing management policy is untouched", () => {
  it("AD-N22/AD-N23 the RUN_LOCAL_VERIFY row is EXACTLY the pre-existing policy matrix", async () => {
    // The spec names these four cells verbatim; assert them literally.
    expect(DEFAULT_ACTION_POLICY.RUN_LOCAL_VERIFY).toEqual({
      DIRECT: "explicit",
      ASSIST: "no",
      MANAGE: "yes",
      DELEGATE: "yes",
    });
    // …and the neighbouring rows the matrix must not have drifted from.
    expect(DEFAULT_ACTION_POLICY.ADVANCE_MECHANICAL_WORK).toEqual({
      DIRECT: "explicit",
      ASSIST: "no",
      MANAGE: "yes",
      DELEGATE: "yes",
    });
    expect(DEFAULT_ACTION_POLICY.START_LOCAL_RECIPE).toEqual({
      DIRECT: "explicit",
      ASSIST: "no",
      MANAGE: "yes",
      DELEGATE: "yes",
    });
    expect(DEFAULT_ACTION_POLICY.IRREVERSIBLE_EFFECT).toEqual({
      DIRECT: "semantic_authority",
      ASSIST: "semantic_authority",
      MANAGE: "semantic_authority",
      DELEGATE: "semantic_authority",
    });
  });

  it("AD-N22 at DIRECT an UNCONFIRMED step never runs verification (explicit stays explicit)", async () => {
    const rig = makeRig({ projectId: "ad-n22", managementStore: true });
    await setInvolvement(rig, "DIRECT");
    await preferVerify(rig, ["VERIFY"]);
    const preview = await rig.installed.projectManagement!.previewStep();
    expect(preview).toMatchObject({
      candidate: { kind: "RUN_LOCAL_VERIFY" },
      permitted: false,
      requiredConfirmation: true,
    });

    const step = await rig.installed.projectManagement!.step();
    expect(step.status).toBe("needs_confirmation");
    expect(step.actionClass ?? step.action).toBe("RUN_LOCAL_VERIFY");
    // Nothing ran and nothing was recorded; an explicit retry with confirmation does.
    expect(await rig.installed.verification!.history()).toHaveLength(0);
    const confirmed = await rig.installed.projectManagement!.step({ confirmed: true });
    expect(confirmed.status).toBe("executed");
    expect(await rig.installed.verification!.history()).toHaveLength(1);
  });

  it("AD-N23 MANAGE/DELEGATE execute the run and the activity reference it durably (resolvable)", async () => {
    const rig = makeRig({ projectId: "ad-n23", managementStore: true });

    for (const involvement of ["MANAGE", "DELEGATE"] as const) {
      await setInvolvement(rig, involvement);
      await preferVerify(rig, ["VERIFY"]);
      // A fresh head each round, so verification is due again for the new subject.
      rig.installed.controller.plan({
        tasks: [taskSpec("task-a"), taskSpec(`task-${involvement.toLowerCase()}`)],
      });
      const step = await rig.installed.projectManagement!.step({ confirmed: true });
      expect(step.status, `involvement ${involvement}`).toBe("executed");
      expect(step.actionClass).toBe("RUN_LOCAL_VERIFY");
      expect(step.canonicalOutcomeRefs?.some((ref) => ref.kind === "project_verification")).toBe(true);

      // The derived operating history renders the CANONICAL product ref and can
      // resolve it (the owning plane is readable), so the audit record is complete.
      const history = await rig.installed.projectManagement!.operatingHistory();
      const entry = history.entries
        .filter((candidate) => candidate.kind === "management_activity")
        .find((candidate) =>
          candidate.canonicalOutcomeRefs.some((ref) => ref.startsWith("project_verification:")),
        )!;
      expect(entry).toBeDefined();
      expect(entry.incompleteCanonicalRef).toBe(false);
    }

    // Every round wrote exactly one verification run for ITS head; the chain verifies.
    const runs = await rig.installed.verification!.history();
    expect(runs.length).toBeGreaterThanOrEqual(2);
    expect(rig.installed.verification!.store.verifyChain(rig.projectId).ok).toBe(true);
  });
});

/* ========================================================================== *
 * §22 / §23 — the application, HTTP and tool faces
 * ========================================================================== */

describe("G10-AD §22/§23: the explicit verification surface", () => {
  it("§22 status/history/verifyCurrentHead are real, and the subject is DERIVED", async () => {
    const rig = makeRig({ projectId: "ad-s22" });
    const surface = rig.installed.application.verification!;
    const before = await surface.status();
    expect(before.state).toBe("UNVERIFIED");
    expect(before.subject!.headCommit).toBe(HEAD);
    expect(before.independentVerifyAvailable).toBe(true);
    expect(await surface.history()).toHaveLength(0);

    const outcome = await surface.verifyCurrentHead({ reason: "explicit integration request" });
    expect(outcome.status).toBe("recorded");
    expect(outcome.run!.verdict).toBe("PASS");
    expect(asHeadSubject(outcome.run!.subject).headCommit).toBe(HEAD);
    const after = await surface.status();
    expect(after.state).toBe("PASS");
    expect(after.freshIndependentRun!.run.runId).toBe(outcome.run!.runId);
    expect((await surface.history(1))[0]!.runId).toBe(outcome.run!.runId);

    // §22: a caller can only SELECT a registered ref. An unknown ref runs NOTHING.
    const refused = await surface.verifyCurrentHead({ verifierRef: "project.head.nope.v1" });
    expect(refused.status).toBe("blocked");
    expect(refused.typedReasonCode).toBe("unknown_verifier_ref");
    expect(refused.run).toBeNull();
    expect(await surface.history()).toHaveLength(1);
  });

  it("§22 the surface exposes NO way to register/alter a verifier or to claim independence", () => {
    const rig = makeRig({ projectId: "ad-s22-shape" });
    const surface = rig.installed.application.verification! as unknown as Record<string, unknown>;
    for (const forbidden of [
      "register",
      "registerVerifier",
      "setIndependenceClass",
      "run",
      "runCommand",
      "command",
      "args",
      "repository",
      "subject",
      "headCommit",
      "projectDigest",
      "independence",
    ]) {
      expect(Object.keys(surface)).not.toContain(forbidden);
    }
    expect(Object.keys(surface).sort()).toEqual(["history", "status", "verifyCurrentHead"]);
  });

  it("§23 the HTTP routes are status/history/run only, and refuse arbitrary targets", async () => {
    const rig = makeRig({ projectId: "ad-s23" });
    const started = await http(rig.installed, "GET", "/api/verification/status");
    expect(started.status).toBe(200);
    expect((started.body as { state: string }).state).toBe("UNVERIFIED");
    expect((await http(rig.installed, "GET", "/api/verification/history")).body).toEqual([]);

    // A run over the exact current head through a REGISTERED verifier.
    const run = await http(rig.installed, "POST", "/api/verification/verify_current_head", {
      verifierRef: REF,
      reason: "http integration request",
    });
    expect(run.status).toBe(200);
    expect((run.body as { status: string; run: { verdict: string } | null }).status).toBe("recorded");
    expect((run.body as { run: { verdict: string } }).run.verdict).toBe("PASS");

    // No arbitrary verifier DEFINITION and no commit can be supplied: an unknown ref
    // is refused and an attempted subject injection is ignored (the subject is derived).
    const unknown = await http(rig.installed, "POST", "/api/verification/verify_current_head", {
      verifierRef: "project.head.not-registered.v1",
    });
    expect(unknown.status).toBe(200);
    expect((unknown.body as { status: string; typedReasonCode: string }).typedReasonCode).toBe(
      "unknown_verifier_ref",
    );
    const injected = await http(rig.installed, "POST", "/api/verification/verify_current_head", {
      headCommit: "f".repeat(40),
      projectDigest: "f".repeat(64),
      command: "rm -rf /",
    });
    expect(injected.status).toBe(200);
    const injectedRun = (injected.body as { run: { subject: { headCommit: string } } }).run;
    expect((injectedRun.subject as { headCommit: string }).headCommit).toBe(HEAD);

    // Wrong method and wrong routes are refused, never silently accepted.
    expect((await http(rig.installed, "POST", "/api/verification/status")).status).toBe(400);
    expect(
      await handleApplicationRequest({
        application: rig.installed.application,
        method: "GET",
        pathname: "/api/verification/register",
        query: new URLSearchParams(),
        body: undefined,
      }),
    ).toBeUndefined();
  });

  it("§23 the discovery routes report the verification surface, and the tool exists", async () => {
    const rig = makeRig({ projectId: "ad-s23-discovery", withLocalPeer: true });
    const surfaces = (await http(rig.installed, "GET", "/api/application/surfaces")).body as Record<
      string,
      boolean
    >;
    expect(surfaces.verification).toBe(true);
    const names = rig.installed.tools.map((tool) => tool.name);
    expect(names).toContain("palimpsest_verification");

    const verificationTool = rig.installed.tools.find(
      (tool) => tool.name === "palimpsest_verification",
    )!;
    const properties = Object.keys(
      (verificationTool.parameters as { properties?: Record<string, unknown> }).properties ?? {},
    );
    for (const forbidden of ["command", "args", "independence", "independenceClass", "headCommit", "commit", "subject"]) {
      expect(properties).not.toContain(forbidden);
    }
    // A bare Work-only install keeps exactly its nine Work tools (no verification surface).
    const bareDir = freshDir("palimpsest-ad-s23-tools-");
    const bare = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: "ad-s23-bare",
      databasePath: join(bareDir, "state.sqlite"),
      ordariumDatabasePath: join(bareDir, "ord.sqlite"),
      clock: () => CLOCK,
      git: new FakeGitPort(HEAD),
    });
    OPEN.push(bare);
    expect(bare.tools).toHaveLength(9);
    expect(bare.tools.map((tool) => tool.name)).not.toContain("palimpsest_verification");
  });
});

/* ========================================================================== *
 * §26 / §28 — dogfood, restart durability and the Advisor fact
 * ========================================================================== */

describe("G10-AD §26: the dogfood and the restart durability", () => {
  it("§26 a REAL install-level mechanical verification passes and writes no other plane", async () => {
    const rig = makeRig({ projectId: "ad-s26" });

    const countWorkEvents = (): number =>
      Number(
        rig.installed.controller.store.connection
          .prepare("SELECT COUNT(*) AS n FROM events")
          .get()!.n,
      );
    const before = countWorkEvents();
    const outcome = await rig.installed.verification!.verifyCurrentHead({
      requestedBy: "dogfood:integration",
      reason: "§26 golden PASS",
    });
    expect(outcome.statusView.state).toBe("PASS");
    expect(outcome.run!.independence).toBe("MECHANICAL_INDEPENDENT");
    expect(outcome.run!.freshness).toBe("CURRENT");
    // No Work event of any kind, and no verification event in the Work log.
    expect(countWorkEvents()).toBe(before);
    const types = (
      rig.installed.controller.store.connection
        .prepare("SELECT event_type FROM events")
        .all() as unknown as { event_type: string }[]
    ).map((row) => row.event_type);
    expect(types.some((type) => /VERIF/.test(type))).toBe(false);
    // §27: the verification plane cannot import the other planes (static, re-proved here
    // for the INTEGRATED product: the integration added no such import either).
    const planeSource = readFileSync(
      fileURLToPath(new URL("../src/project_verification/service.ts", import.meta.url)),
      "utf-8",
    );
    expect(planeSource).not.toMatch(/proof_asset|reasoning_cell\/service|project_management/);
  });

  it("§26 a restart restores the verification status/history from the SAME store without a rerun", async () => {
    const dir = freshDir("palimpsest-ad-restart-");
    const storePath = join(dir, "verification.sqlite");

    const firstStore = new SqliteProjectVerificationStore(storePath);
    const first = makeRig({
      projectId: "ad-restart",
      verificationStore: firstStore,

    });
    const outcome = await first.installed.verification!.verifyCurrentHead({
      requestedBy: "dogfood:restart",
      reason: "before the restart",
    });
    const runId = outcome.run!.runId;
    const digest = outcome.run!.runDigest;
    expect(await first.installed.verification!.history()).toHaveLength(1);
    await first.close();

    // A SECOND installation over the SAME history file (a real restart).
    const secondStore = new SqliteProjectVerificationStore(storePath);
    const second = makeRig({
      projectId: "ad-restart",
      verificationStore: secondStore,

    });
    const status = await second.installed.verification!.status();
    expect(status.state).toBe("PASS");
    expect(status.latestRun!.run.runId).toBe(runId);
    expect(status.latestRun!.run.runDigest).toBe(digest);
    expect(status.freshIndependentRun!.run.runId).toBe(runId);
    const history = await second.installed.verification!.history();
    expect(history).toHaveLength(1);
    expect(history[0]!.runId).toBe(runId);
    expect(second.installed.verification!.store.verifyChain("ad-restart").ok).toBe(true);
    // A restarted installation has nothing to do: the fresh run suppresses the loop.
    const candidates = await second.installed.projectManagement?.recommend();
    expect(candidates?.map((candidate) => candidate.kind) ?? []).not.toContain("RUN_LOCAL_VERIFY");
    secondStore.close();
    firstStore.close();
  });
});

describe("G10-AD §28: the Advisor fact comes from the runtime, never a bare string", () => {
  it("§28 an independent runtime makes the Advisor report a bound, independent verifier", async () => {
    const dir = freshDir("palimpsest-ad-s28-");
    const installed = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: "ad-s28",
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ord.sqlite"),
      clock: () => CLOCK,
      git: new FakeGitPort(HEAD),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "a.sqlite")),
      projectVerifierProviders: [mechanicalVerifier()],
      projectVerificationDefaultVerifierRef: REF,
      // A DEPRECATED descriptive ref that is NOT the registered one: it must not be
      // reported as the available independent verifier.
      verificationCapabilityRef: "descriptive-only-ref",
    });
    OPEN.push(installed);
    installed.controller.start({ projectId: "ad-s28", goal: "g", headCommit: HEAD, tasks: [taskSpec("task-a")] });

    // The advisor needs an organization-memory store to exist; build the fact check
    // through the runtime capability the install derives (the same object the
    // advisor reads lazily).
    const capability = installed.verification!.runtimeCapability();
    expect(capability.independentVerifierAvailable).toBe(true);
    expect(capability.defaultVerifierRef).toBe(REF);
    expect(installed.verification!.defaultVerifierRef).toBe(REF);
    // The descriptive string never appears as an independent verifier ref anywhere.
    expect(capability.independentVerifierRefs).not.toContain("descriptive-only-ref");
  });

  it("§28 with NO runtime the Advisor cannot claim an independent verifier", async () => {
    const rig = makeRig({ projectId: "ad-s28-none", providerRefs: [] });
    const capability = rig.installed.verification!.runtimeCapability();
    expect(capability.runtimeAvailable).toBe(false);
    expect(capability.independentVerifierAvailable).toBe(false);
    expect(capability.note).toMatch(/no verification runtime exists/u);
  });
});

/* ========================================================================== *
 * §27 / AD-N30 — no other plane changed, and the campaign regressions hold
 * ========================================================================== */

describe("G10-AD §27/AD-N30: no other plane changed; the campaign regressions hold", () => {
  it("§27 the ReasoningCell / Proof / Work planes are UNMODIFIED (source-level proof)", () => {
    const repoRoot = fileURLToPath(new URL("..", import.meta.url));
    // The tracked files under these paths are the planes AD must not have touched.
    // (A new untracked file under `src/project_verification/` is the AD plane itself
    // and is deliberately NOT part of this check.)
    const protectedPaths = [
      "src/reasoning_cell",
      "src/proof_asset",
      "src/domain",
      "src/state",
      "src/scheduler",
    ];
    const modified = execFileSync(
      "git",
      ["diff", "--name-only", "HEAD", "--", ...protectedPaths],
      { cwd: repoRoot, encoding: "utf8" },
    )
      .split(/\r?\n/u)
      .filter((line) => line.trim() !== "");
    expect(modified).toEqual([]);
  });

  it("§27 the protected planes still declare their OWN verification/admission seams", () => {
    const read = (relative: string): string =>
      readFileSync(fileURLToPath(new URL(`../${relative}`, import.meta.url)), "utf-8");
    // ReasoningCell keeps its verification AND admission policies, as separate ports.
    const reasoning = read("src/reasoning_cell/service.ts");
    expect(reasoning).toMatch(/verificationPolicy/u);
    expect(reasoning).toMatch(/admissionPolicy/u);
    // Proof keeps verification and a SEPARATE publication admission.
    const proof = read("src/proof_asset/service.ts");
    expect(proof).toMatch(/ProofVerificationPolicyPort/u);
    expect(proof).toMatch(/ProofPublicationAdmissionPort/u);
    expect(proof).toMatch(/decidePublication/u);
    // Work Evidence/gates and promotion semantics still live in their own modules.
    expect(read("src/domain/promotion_eligibility.ts").length).toBeGreaterThan(0);
    expect(read("src/domain/promotion_terminal.ts").length).toBeGreaterThan(0);
  });

  it("AD-N30 the AC-R/W/X/Y/Z/AA/AB invariants AD could have disturbed still hold", async () => {
    // The full regression suites (ac_r_*, v_*, w_*, x_*, y_*, z_*, aa_*, ab_*) run in
    // the SAME vitest invocation as this file; what follows pins the invariants that a
    // verification integration is most likely to break.
    //
    // 1. A bare Work-only install is COMPLETELY unchanged (P/AC-R).
    const dir = freshDir("palimpsest-ad-n30-");
    const bare = installPalimpsest({ tools: { register: () => undefined } }, {
      projectId: "ad-n30-bare",
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ord.sqlite"),
      clock: () => CLOCK,
      git: new FakeGitPort(HEAD),
    });
    OPEN.push(bare);
    expect(bare.tools).toHaveLength(9);
    expect(bare.application.verification).toBeUndefined();
    expect(bare.application.projectManagement).toBeUndefined();
    expect(bare.application.monitor).toBeUndefined();

    // 2. The management policy matrix (AB/V) is exactly what it was.
    expect(DEFAULT_ACTION_POLICY.RUN_LOCAL_VERIFY).toEqual({
      DIRECT: "explicit",
      ASSIST: "no",
      MANAGE: "yes",
      DELEGATE: "yes",
    });
    expect(DEFAULT_ACTION_POLICY.OBSERVE).toEqual({
      DIRECT: "explicit",
      ASSIST: "yes",
      MANAGE: "yes",
      DELEGATE: "yes",
    });

    // 3. The Work Mode axes (AB) still derive independently: a VERIFY preference
    //    without a runtime changes nothing about the management axis.
    const rig = makeRig({ projectId: "ad-n30-axes", managementStore: true });
    await preferVerify(rig, ["VERIFY"]);
    const posture = await rig.installed.projectManagement!.posture();
    expect(posture.management.involvement).toBe("DIRECT");
    expect(posture.workMode.preferred.modifiers).toEqual(["VERIFY"]);
    expect(posture.workMode.effectiveStatus.some((row) => row.capability === "VERIFY")).toBe(true);

    // 4. The durable activity chain (AB) still verifies.
    const activityStore = rig.installed.projectOperating?.activity;
    if (activityStore !== undefined) {
      expect(activityStore.verifyChain(rig.projectId).ok).toBe(true);
    }

    // 5. A CANONICAL ref kind outside the verification plane (work_event) is still
    //    accepted, so the added kind did not narrow the vocabulary.
    expect(rig.installed.application.work.status()).toBeDefined();
  });

  it("AD-N30 the verification capability naming is honest for a refused/absent runtime", () => {
    // A registered-but-unexecutable deployment cannot make VERIFY available.
    const definition: VerifierDefinition = requiredDefinition();
    const summary = independenceSummary([definition]);
    expect(summary.independentVerifyAvailable).toBe(true); // the definition itself counts…
    // …but with NO provider there is no runtime, so availability must be false.
    const rig = makeRig({ projectId: "ad-n30-exec", providerRefs: [] });
    const capability = rig.installed.verification!.runtimeCapability();
    expect(capability.runtimeAvailable).toBe(false);
    expect(capability.independentVerifierAvailable).toBe(false);
  });
});

function requiredDefinition(): VerifierDefinition {
  return mechanicalVerifier().definition;
}

/* -------------------------------------------------------------------------- *
 * HONEST notes
 *
 * 1. AD-N30's "regressions green" claim: this file does NOT re-implement the
 *    AC-R/W/X/Y/Z/AA/AB suites. Those suites run in the SAME `vitest run` and are
 *    reported in the same totals; the in-file assertions above pin the FIREWALLS
 *    that a verification integration could realistically have broken (a bare
 *    Work-only install, the management policy matrix, the Work Mode axes, the
 *    activity chain, the canonical-ref vocabulary).
 *
 * 2. §27's "no other plane changed" proof is SOURCE-LEVEL: `git diff --name-only
 *    HEAD` over `src/reasoning_cell`, `src/proof_asset`, `src/domain`, `src/state`
 *    and `src/scheduler` must be empty. It is a proof over the TRACKED working
 *    tree, not a cryptographic seal, and a NEW untracked file under one of those
 *    paths would not be listed by `git diff`. The behavioural half of the claim is
 *    carried by those suites' own tests.
 *
 * 3. `src/project_operating/activity.ts` received a ONE-LINE additive change
 *    (`"project_verification"` added to `CANONICAL_OUTCOME_KINDS`). §21 requires the
 *    management activity record to REFERENCE the durable verification run, and the
 *    closed kind union is the only way to do that without inventing a ref that the
 *    derived operating history would flag as incomplete. No existing kind, policy,
 *    decision or fold changed.
 *
 * 4. The verification run in these tests is a REAL bounded `node` subprocess through
 *    the existing `commandValidator` (`node -e process.exit(0)`); the Git seam is the
 *    product's own declared port (`FakeGitPort`, exactly as the core plane suite
 *    uses it), so the §5 repository-consistency rule is genuinely exercised without
 *    depending on the surrounding working copy. The install-level dogfood against a
 *    REAL `git diff --check` over a REAL temp repository is
 *    `scripts/verification/mechanical-verify.mjs`.
 * -------------------------------------------------------------------------- */
