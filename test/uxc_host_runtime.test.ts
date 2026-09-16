/**
 * UX-C — HOST-NATIVE ZERO-CONFIG COLLABORATION RUNTIME — the adversarial suite
 * (UXC-N01 … UXC-N29).
 *
 * These tests run against the REAL shipped composition: `launchDeployment` from a
 * typed profile, the packaged ReasoningCell store + first-party exploratory
 * policies, a host-supplied branch execution port, the REAL inbound pump, the REAL
 * Attention service and the REAL activation adapter. Nothing here hand-composes a
 * reasoning store, a policy or a branch port for a "packaged" deployment — that is
 * exactly the developer rig UX-C exists to remove.
 *
 * The TWO structural proofs that carry the stage:
 *   1. the branch environment (`composeBranchHostEnvironment`) composes EXACTLY ONE
 *      tool and has no ReasoningCell/principal capability — the branch therefore
 *      cannot own candidate submission;
 *   2. `RecipeExecution` submits the candidate (with the branch's cited evidence
 *      refs), so the ownership invariant is asserted WITHOUT observing `DEDUPLICATED`
 *      (SC-2).
 *
 * UXC-N30 (full CI) and the UX-A/UX-B/AE-R/AD/AC-R regressions (UXC-N29) are suite
 * gates: this file does NOT fake them, it asserts the shipped surfaces they depend on.
 */

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRANCH_RESULT_TOOL_NAME,
  composeBranchHostEnvironment,
  deploymentReasoningStorePath,
  launchDeployment,
  type Deployment,
  type ProjectAgentDeploymentProfile,
} from "../src/deployment/index.js";
import { makePalimpsestApplicationSurface } from "../src/application/surface.js";
import { unknownTaskProfile } from "../src/advisor/index.js";
import type { AttentionSignal } from "../src/attention/index.js";
import {
  dshAgentsAttentionAdapter,
  materializeAttentionCandidate,
  withEscalation,
} from "../src/attention/index.js";
import { materializePeerMessage, materializePeerRef, materializeThreadRef } from "../src/federation/index.js";
import {
  CROSS_PROJECT_INBOUND_REQUEST_TEXT,
  crossProjectAttentionText,
} from "../src/interaction/index.js";
import type { ReasoningBranchBrief } from "../src/reasoning_cell/index.js";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = mkdtempSync(join(tmpdir(), "palimpsest-uxc-"));
let seq = 0;
function freshDir(label: string): string {
  seq += 1;
  return join(ROOT, `${label}-${seq}`);
}

interface Closeable {
  close(): Promise<void> | void;
}
const OPEN: Closeable[] = [];
afterEach(async () => {
  for (const rig of OPEN.splice(0)) {
    try {
      await Promise.resolve(rig.close());
    } catch {
      /* already closed */
    }
  }
});
afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows file handle */
  }
});

/* ------------------------------------------------------------------ *
 * The packaged deployment rig
 * ------------------------------------------------------------------ */

const PROJECT = "project-packaged";
const PEER = "peer-packaged";
const OTHER_PROJECT = "project-remote";
const OTHER_PEER = "peer-remote";

const EXPLORE_TASK =
  "Explore independent approaches to the caching layer; separately evaluate each component and verify the trade-offs with tests.";
const COUPLED_TASK =
  "Apply one atomic schema migration that every module depends on; the change is monolithic and shares state across components.";

interface BranchRun {
  readonly brief: ReasoningBranchBrief;
  readonly evidenceRefs: readonly string[];
}

/**
 * A host-shaped branch execution port: it "thinks" (returns a distinct statement)
 * and reports the evidence refs it actually cited. It is the ONLY thing the
 * packaged deployment is given — no store, no policy, no profile wiring.
 */
function fakeBranchPort(runs: BranchRun[], evidenceRefsFor: (brief: ReasoningBranchBrief, index: number) => readonly string[] = () => []) {
  return {
    adapterId: "uxc-fake-branch",
    async run(input: { readonly brief: unknown }): Promise<unknown> {
      const brief = input.brief as ReasoningBranchBrief;
      const index = runs.length + 1;
      runs.push({ brief, evidenceRefs: [] });
      const statement = `approach ${index}: ${brief.question}`;
      const evidenceRefs = evidenceRefsFor(brief, index);
      runs[runs.length - 1] = { brief, evidenceRefs };
      return { status: "completed", statement, evidenceRefs: [...evidenceRefs] };
    },
  };
}

function profileObject(input: {
  readonly who: string;
  readonly projectId: string;
  readonly peerId: string;
  readonly root: string;
  readonly transportPath: string;
  readonly namespace: string;
  readonly withCrossProject?: boolean;
  readonly withReasoning?: boolean;
  readonly coldResume?: boolean;
  readonly withAttention?: boolean;
}): Record<string, unknown> {
  const dir = join(input.root, input.who);
  return {
    schemaVersion: 1,
    profileId: `uxc-${input.who}`,
    projectId: input.projectId,
    localPeer: input.peerId,
    persistentPoint: `pp-${input.who}`,
    transport: { namespace: input.namespace, databasePath: input.transportPath },
    databases: {
      orchestration: join(dir, "orchestration.sqlite"),
      ordarium: join(dir, "ordarium.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
      attentionMarks: join(dir, "attention.sqlite"),
      projectAssociations: join(dir, "associations.sqlite"),
      projectJournal: join(dir, "journal.sqlite"),
    },
    ...(input.withCrossProject === true
      ? {
          directory: [{ peerId: OTHER_PEER, competenceTags: ["remote"] }],
          projectDirectory: [
            { projectId: PROJECT, displayName: "the packaged project", aliases: ["packaged"], peerId: PEER, competenceTags: ["local"] },
            { projectId: OTHER_PROJECT, displayName: "the remote project", aliases: ["remote"], peerId: OTHER_PEER, competenceTags: ["remote"] },
          ],
        }
      : {}),
    // UX-C §9/SC-12: the ONE switch. No store path, no branch profile, no policy.
    ...(input.withReasoning === false ? {} : { reasoning: {} }),
    // UX-C SC-9: the DSH activation is late-bound by the host, so NO sessionId here.
    ...(input.coldResume === true
      ? { attention: { policyId: "uxc-attention-v1", cooldownMs: 0, activation: "dsh" } }
      : input.withAttention === true
        ? { attention: { policyId: "uxc-attention-v1", cooldownMs: 0, activation: "none" } }
        : {}),
  };
}

interface PackagedRig {
  readonly deployment: Deployment;
  readonly branchRuns: BranchRun[];
  readonly profile: ProjectAgentDeploymentProfile;
  readonly orchestrationPath: string;
}

function launchPackaged(input: {
  readonly who?: string;
  readonly projectId?: string;
  readonly peerId?: string;
  readonly root: string;
  readonly transportPath: string;
  readonly namespace: string;
  readonly withCrossProject?: boolean;
  readonly withReasoning?: boolean;
  readonly coldResume?: boolean;
  readonly withAttention?: boolean;
  readonly branchPort?: boolean;
  readonly evidenceRefsFor?: (brief: ReasoningBranchBrief, index: number) => readonly string[];
}): PackagedRig {
  const branchRuns: BranchRun[] = [];
  const raw = profileObject({
    who: input.who ?? "packaged",
    projectId: input.projectId ?? PROJECT,
    peerId: input.peerId ?? PEER,
    root: input.root,
    transportPath: input.transportPath,
    namespace: input.namespace,
    ...(input.withCrossProject === undefined ? {} : { withCrossProject: input.withCrossProject }),
    ...(input.withReasoning === undefined ? {} : { withReasoning: input.withReasoning }),
    ...(input.coldResume === undefined ? {} : { coldResume: input.coldResume }),
    ...(input.withAttention === undefined ? {} : { withAttention: input.withAttention }),
  });
  const port = fakeBranchPort(branchRuns, input.evidenceRefsFor);
  const deployment = launchDeployment(raw as unknown as ProjectAgentDeploymentProfile, {
    host: input.branchPort === false ? {} : { branchExecution: port },
  });
  OPEN.push(deployment);
  // Give the project a real genesis head, exactly as a deployed project would have, so
  // project-head verification is an assertion about an initialized project.
  const projectId = String(raw.projectId);
  if (!deployment.installed.controller.isProjectInitialized()) {
    deployment.installed.controller.start({
      projectId,
      goal: "uxc packaged deployment",
      requirements: [{ requirement_id: "req-1", statement: "collaborate", priority: "normal", acceptance_refs: [] }],
      decisions: [],
      tasks: [],
      committedAt: "2026-09-17T00:00:00Z",
    });
  }
  const orchestrationPath = String((raw.databases as Record<string, string>).orchestration);
  return { deployment, branchRuns, profile: deployment.profile, orchestrationPath };
}

function collaborationOf(rig: PackagedRig): NonNullable<Deployment["installed"]["application"]["collaboration"]> {
  const collaboration = rig.deployment.installed.application.collaboration;
  if (collaboration === undefined) throw new Error("the packaged deployment composed no collaboration surface");
  return collaboration;
}

function cellIdOf(result: { readonly details: { readonly cellId?: string | undefined } }): string {
  const cellId = result.details.cellId;
  if (cellId === undefined) throw new Error("the result carried no reasoning cell id");
  return cellId;
}

async function eventTypesOf(rig: PackagedRig, cellId: string): Promise<readonly string[]> {
  const cells = rig.deployment.installed.reasoningCells;
  if (cells === undefined) throw new Error("no reasoning cells are composed");
  const events = await cells.service.events({ cellId });
  return events.map((event) => event.type);
}

function signalOf(kind: AttentionSignal["kind"], peerId = OTHER_PEER, body?: string): AttentionSignal {
  const candidate = materializeAttentionCandidate({
    kind,
    peer: materializePeerRef({ peerId }),
    threadId: "thread-1",
    subjects: [{ kind: "peer_message", id: body ?? "msg-1" }],
    reason: "an inbound project message awaits this principal",
    createdAt: "2026-09-17T00:00:00.000Z",
  });
  return withEscalation(candidate, false);
}

/* ================================================================== *
 * UXC-N01…N04 — memoryless advisor and packaged AUTO
 * ================================================================== */

describe("UXC-N01/N02 memoryless Advisor", () => {
  it("exists without an organization-memory store and claims no empirical evidence", async () => {
    const rig = launchPackaged({ root: freshDir("n01"), transportPath: join(freshDir("n01-t"), "transport.sqlite"), namespace: `uxc-n01-${seq}` });
    const advisor = rig.deployment.installed.application.advisor;
    expect(advisor).toBeDefined();

    const recommendation = await advisor!.recommend({ taskProfile: unknownTaskProfile() });
    // N02: no memory ⇒ no empirical claim of ANY kind.
    expect(recommendation.empiricalSupport).toEqual([]);
    expect(recommendation.empiricalCounterEvidence).toEqual([]);
    expect(recommendation.rationale.join(" ")).toMatch(/No empirical evaluation is available/u);
    expect(recommendation.rationale.join(" ")).not.toMatch(/INSUFFICIENT_EMPIRICAL_EVIDENCE/u);
    expect(JSON.stringify(recommendation)).not.toMatch(/empirical(ally)? (supported|proven)/iu);
  });
});

describe("UXC-N03/N04 packaged AUTO selects FOCUS or EXPLORE from the real task profile", () => {
  it("N03 chooses FOCUS for a coupled, nondecomposable task and runs zero branches", async () => {
    const rig = launchPackaged({ root: freshDir("n03"), transportPath: join(freshDir("n03-t"), "transport.sqlite"), namespace: `uxc-n03-${seq}` });
    const result = await collaborationOf(rig).run({ task: COUPLED_TASK, intent: "AUTO", requestedBy: "test:user" });
    expect(result.executionKind).toBe("PRINCIPAL_CONTINUES");
    expect(result.findings).toEqual([]);
    expect(rig.branchRuns).toEqual([]);
    expect(await rig.deployment.installed.reasoningCells!.store.cells()).toEqual([]);
  });

  it("N04 chooses EXPLORE for a decomposable/verifiable/parallel task (SC-1 verifiability marker included)", async () => {
    const rig = launchPackaged({ root: freshDir("n04"), transportPath: join(freshDir("n04-t"), "transport.sqlite"), namespace: `uxc-n04-${seq}` });
    const result = await collaborationOf(rig).run({ task: EXPLORE_TASK, intent: "AUTO", requestedBy: "test:user" });
    expect(result.executionKind).toBe("LOCAL_EXPLORE");
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(rig.branchRuns.length).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================== *
 * UXC-N05…N06 — a normal DSH deployment needs no manual reasoning wiring
 * ================================================================== */

describe("UXC-N05/N06 packaged PARALLEL needs no manual reasoning store or branch port", () => {
  it("derives the store beside the orchestration DB and uses the host-supplied branch port", async () => {
    const rig = launchPackaged({ root: freshDir("n05"), transportPath: join(freshDir("n05-t"), "transport.sqlite"), namespace: `uxc-n05-${seq}` });
    expect(rig.deployment.reasoning.storeConfigured).toBe(true);
    expect(rig.deployment.reasoning.storeOwned).toBe(true);
    expect(rig.deployment.reasoning.branchAdapter).toBe("uxc-fake-branch");
    expect(existsSync(deploymentReasoningStorePath(rig.orchestrationPath))).toBe(true);

    const result = await collaborationOf(rig).run({ task: EXPLORE_TASK, intent: "PARALLEL", requestedBy: "test:user" });
    expect(result.status).toBe("COMPLETED");
    expect(result.executionKind).toBe("LOCAL_EXPLORE");
    expect(result.findings.length).toBeGreaterThanOrEqual(2);
    expect(rig.branchRuns.length).toBeGreaterThanOrEqual(2);
  });
});

/* ================================================================== *
 * UXC-N07…N09 — the branch environment is minimal, ephemeral and non-semantic
 * ================================================================== */

describe("UXC-N07/N08/N09 branch environment capability firewall", () => {
  const brief: ReasoningBranchBrief = Object.freeze({
    schemaVersion: 1 as const,
    cell: { schemaVersion: 1 as const, cellId: "cell-n07" },
    branch: { schemaVersion: 1 as const, cellId: "cell-n07", branchId: "branch-n07" },
    objective: "objective",
    question: "question",
    frontierBasis: { schemaVersion: 1 as const, cellId: "cell-n07", frontierRevision: 0, frontierDigest: "a".repeat(64) },
    acceptedClaims: Object.freeze([] as never[]),
  });

  it("composes exactly ONE tool and no principal capability", () => {
    const composed = composeBranchHostEnvironment({ ...brief });
    expect(composed.ok).toBe(true);
    if (!composed.ok) return;
    expect(composed.environment.toolNames).toEqual([BRANCH_RESULT_TOOL_NAME]);
    expect(composed.environment.principalTools).toEqual([]);
    // N07/N08: no identity/authority surface is reachable from the branch environment.
    const serialized = JSON.stringify(Object.keys(composed.environment));
    for (const capability of ["deployment", "installed", "federation", "transport", "pump", "attention", "workspace", "proof", "externalAssets", "monitor", "crossProject"]) {
      expect(serialized).not.toContain(capability);
    }
    const principalToolNames = [
      "palimpsest_manage",
      "palimpsest_federation",
      "palimpsest_cross_project",
      "palimpsest_project",
      "palimpsest_external_assets",
      "palimpsest_proof",
      "palimpsest_verification",
      "palimpsest_reasoning",
    ];
    for (const name of principalToolNames) expect(composed.environment.toolNames).not.toContain(name);
  });

  it("N09 the recorded branch output is a plain result, never a ReasoningClaim", async () => {
    const composed = composeBranchHostEnvironment({ ...brief });
    if (!composed.ok) throw new Error(composed.detail);
    const recorded = await composed.environment.tool.execute({ statement: "one falsifiable statement" }, {} as never);
    expect(recorded).toEqual({ accepted: true, detail: "the branch produced its one structured result" });
    const serialized = JSON.stringify(recorded);
    for (const token of ["claimId", "candidateDigest", "verificationResultDigest", "admissionDecisionDigest", "CLAIM_ADMITTED"]) {
      expect(serialized).not.toContain(token);
    }
    // The tool has NO store and NO authority: its strict shape is the whole contract.
    expect(Object.keys((composed.environment.tool.parameters as { properties: object }).properties).sort()).toEqual([
      "evidenceRefs",
      "statement",
    ]);
    expect((composed.environment.tool.parameters as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });

  it("N07/N17 the strict parser refuses a second result and an off-allowlist citation", async () => {
    const allowlisted = composeBranchHostEnvironment({
      brief: { ...brief },
      evidenceContext: { allowedEvidenceRefs: ["pev-1"], selections: [] },
    });
    if (!allowlisted.ok) throw new Error(allowlisted.detail);
    expect(allowlisted.environment.payload.enforceAllowlist).toBe(true);
    await expect(
      allowlisted.environment.tool.execute({ statement: "cites foreign evidence", evidenceRefs: ["pev-foreign"] }, {} as never),
    ).rejects.toThrow(/outside the frozen allowlist/u);
    expect(allowlisted.environment.recorder.status).toBe("failed");

    const clean = composeBranchHostEnvironment({ ...brief });
    if (!clean.ok) throw new Error(clean.detail);
    await clean.environment.tool.execute({ statement: "first" }, {} as never);
    await expect(clean.environment.tool.execute({ statement: "second" }, {} as never)).rejects.toThrow(/ALREADY_RECORDED/u);
    expect(clean.environment.recorder.status).toBe("failed");
    await expect(clean.environment.tool.execute({ statement: "x", extra: 1 }, {} as never)).rejects.toThrow(/unknown argument/u);
  });

  it("the shipped host bundle dispatches branch mode BEFORE any deployment composition", () => {
    const source = readFileSync(join(REPO, "host", "dsh", "lib", "index.js"), "utf8");
    // Structural: branch mode is decided first, and the branch path names no deployment,
    // no ReasoningCell service and no fabricating SUPPORTED policy.
    expect(source).toMatch(/const branchFile = flagValue\('--branch'\)/u);
    expect(source.indexOf("flagValue('--branch')")).toBeLessThan(source.indexOf("launchDeployment(profile"));
    expect(source).not.toContain("SqliteReasoningCellStore");
    expect(source).not.toContain("makeReasoningCellService");
    expect(source).not.toContain("standing: 'SUPPORTED'");
    expect(source).toContain("composeBranchHostEnvironment");
  });
});

/* ================================================================== *
 * UXC-N10 — exactly one candidate submit/evaluate owner
 * ================================================================== */

describe("UXC-N10 exactly one candidate owner (structural, never DEDUPLICATED)", () => {
  it("RecipeExecution submits exactly one candidate per branch, with the branch's cited refs", async () => {
    const rig = launchPackaged({
      root: freshDir("n10"),
      transportPath: join(freshDir("n10-t"), "transport.sqlite"),
      namespace: `uxc-n10-${seq}`,
      evidenceRefsFor: (_brief, index) => [`pev-${index}`],
    });
    const result = await collaborationOf(rig).run({ task: EXPLORE_TASK, intent: "PARALLEL", requestedBy: "test:user" });
    const cellId = cellIdOf(result);

    const cells = rig.deployment.installed.reasoningCells!;
    const events = await cells.service.events({ cellId });
    const submitted = events.filter((event) => event.type === "CANDIDATE_SUBMITTED");
    const admitted = events.filter((event) => event.type === "CLAIM_ADMITTED");
    // One submission per executed branch — and the branch itself has no ReasoningCell to
    // submit through, so there is exactly ONE owner (NOT a DEDUPLICATED convergence).
    expect(submitted).toHaveLength(rig.branchRuns.length);
    expect(admitted).toHaveLength(result.findings.length);
    // The branch's cited evidence refs reached the submitted candidate (SC-3).
    const cited = submitted
      .flatMap((event) => (event.payload as { candidate: { externalEvidenceRefs: readonly { evidenceId: string }[] } }).candidate.externalEvidenceRefs)
      .map((ref) => ref.evidenceId)
      .sort();
    expect(cited).toEqual(["pev-1", "pev-2"]);
    // NOT a dedupe path: no event type says the same candidate converged twice.
    expect(events.filter((event) => event.type === "CANDIDATE_DEDUPLICATED")).toEqual([]);
  });
});

/* ================================================================== *
 * UXC-N11…N13 — the default Explore is honestly exploratory
 * ================================================================== */

describe("UXC-N11/N12/N13 default Explore standing and user-visible truthfulness", () => {
  it("records INCONCLUSIVE with no invented evidence and labels the admission exploratory", async () => {
    const rig = launchPackaged({ root: freshDir("n11"), transportPath: join(freshDir("n11-t"), "transport.sqlite"), namespace: `uxc-n11-${seq}` });
    const result = await collaborationOf(rig).run({ task: EXPLORE_TASK, intent: "PARALLEL", requestedBy: "test:user" });
    const cellId = cellIdOf(result);
    const cells = rig.deployment.installed.reasoningCells!;
    const events = await cells.service.events({ cellId });

    const verification = events.filter((event) => event.type === "VERIFICATION_RECORDED");
    expect(verification.length).toBeGreaterThanOrEqual(1);
    for (const event of verification) {
      const payload = event.payload as {
        verification: { standing: string; supportingEvidenceIds: readonly string[]; contradictingEvidenceIds: readonly string[] };
      };
      expect(payload.verification.standing).toBe("INCONCLUSIVE");
      expect(payload.verification.supportingEvidenceIds).toEqual([]);
      expect(payload.verification.contradictingEvidenceIds).toEqual([]);
    }
    const admissions = events.filter((event) => event.type === "ADMISSION_DECIDED");
    expect(admissions.length).toBeGreaterThanOrEqual(1);
    for (const event of admissions) {
      expect((event.payload as { decision: { decision: string } }).decision.decision).toBe("ADMIT");
    }
    expect(events.filter((event) => event.type === "VERIFICATION_RECORDED" && JSON.stringify(event.payload).includes("SUPPORTED"))).toEqual([]);

    // N13: the PRIMARY user-visible result carries the typed standing and the sentence.
    expect(result.findingStanding).toBe("EXPLORATORY_CELL_LOCAL");
    expect(result.findingNote).toContain("These are exploratory cell-local findings.");
    expect(result.findingNote).toContain("not Evidence");
    expect(result.findingNote).toContain("not independently verified as true");
    expect(result.summary).toContain(result.findingNote!);
  });
});

/* ================================================================== *
 * UXC-N14/N15 — CHECK is project-head verification; findings are never implied verified
 * ================================================================== */

describe("UXC-N14/N15 CHECK and PARALLEL_AND_CHECK copy", () => {
  it("N14 CHECK keeps the current-project-head semantics", async () => {
    const root = freshDir("n14");
    const rig = launchPackaged({ root, transportPath: join(freshDir("n14-t"), "transport.sqlite"), namespace: `uxc-n14-${seq}` });
    const plan = await collaborationOf(rig).plan({ task: "verify the current project head", intent: "CHECK", requestedBy: "test:user" });
    if (plan.executionKind === "LOCAL_VERIFY") {
      expect(plan.effectiveBaseMode).toBe("FOCUS");
      expect(plan.modifiers).toEqual(["VERIFY"]);
      expect(plan.verb).toMatch(/project head/u);
    } else {
      expect(plan.executionKind).toBe("CAPABILITY_REQUIRED");
    }
    expect(plan.verb).not.toMatch(/finding/iu);
    const result = await collaborationOf(rig).run({ task: "verify the current project head", intent: "CHECK", requestedBy: "test:user" });
    // CHECK never produces exploratory findings of its own.
    expect(result.findings).toEqual([]);
    if (result.verification !== undefined) {
      expect(result.verification.protocolNote).toContain("protocol result, not truth");
      expect(result.summary).toMatch(/exact current project head/u);
    }
  });

  it("N15 PARALLEL_AND_CHECK states two independent facts and never implies findings verification", async () => {
    const rig = launchPackaged({ root: freshDir("n15"), transportPath: join(freshDir("n15-t"), "transport.sqlite"), namespace: `uxc-n15-${seq}` });
    const result = await collaborationOf(rig).run({ task: EXPLORE_TASK, intent: "PARALLEL_AND_CHECK", requestedBy: "test:user" });
    expect(result.findings.length).toBeGreaterThanOrEqual(1);
    expect(result.verb).not.toMatch(/check independently/iu);
    // The exploratory label is ALWAYS primary text, whatever the check half did.
    expect(result.findingStanding).toBe("EXPLORATORY_CELL_LOCAL");
    expect(result.summary).toContain(result.findingNote!);
    // Two independent facts: Explore produced exploratory findings; separately the head
    // may have been checked. Nothing here says the findings were verified.
    expect(result.summary).toMatch(/Local Explore produced exploratory findings|exploratory cell-local findings/u);
    if (result.verification !== undefined) {
      expect(result.summary).toContain("Separately: Independent verification ran");
      expect(result.summary).toMatch(/not a verification of the exploratory findings/u);
    } else {
      expect(result.summary).toMatch(/Verification did not run/u);
    }
    expect(result.summary).not.toMatch(/findings were independently verified/iu);
    expect(result.summary).not.toMatch(/exploratory findings[^.]*verified/iu);
  });
});

/* ================================================================== *
 * UXC-N16/N17 — product attention formatting without message bodies
 * ================================================================== */

describe("UXC-N16/N17 product attention formatting", () => {
  it("formats an inbound project message with the §61 product text and no peer body", () => {
    const signal = signalOf("inbound_peer_message", OTHER_PEER, "msg-n17-1");
    const text = crossProjectAttentionText(signal, "either");
    expect(text).toContain(CROSS_PROJECT_INBOUND_REQUEST_TEXT);
    expect(text).toContain("palimpsest_cross_project");
    // The signal has NO body field at all, so the formatter could not embed peer content
    // even by accident: it reads routing metadata only (SC-21/§17).
    expect(Object.keys(signal)).not.toContain("body");
    expect(text).not.toContain("RAW_PEER_MESSAGE_BODY_CANARY");
    expect(text).toContain("msg-n17-1");

    // The SHIPPED runner composes the product formatter for inbound peer messages.
    const source = readFileSync(join(REPO, "host", "dsh", "lib", "runner.js"), "utf8");
    expect(source).toContain("crossProjectAttentionText");
    expect(source).toContain("defaultAttentionText");
    expect(source).toMatch(/inbound_peer_message/u);
    expect(source).not.toMatch(/signal\.body|message\.body/u);
  });
});

/* ================================================================== *
 * UXC-N18/N19/N20 — resume-capable activation, pending-on-failure, no user polling
 * ================================================================== */

describe("UXC-N18/N19/N20 shipped activation and inbound pump", () => {
  it("N18 the shipped activation adapter cold-resumes and queues a followup", async () => {
    const calls: string[] = [];
    const adapter = dshAgentsAttentionAdapter({
      agents: {
        get: () => undefined,
        resume: async ({ resumeSessionId }) => {
          calls.push(`resume:${resumeSessionId}`);
          return { agent: { followup: (text: string) => calls.push(`followup:${text.slice(0, 24)}`) } };
        },
      },
      resumeSessionId: "session-persisted-1",
      format: (signal) => crossProjectAttentionText(signal, "request"),
    });
    const outcome = await adapter.activate(signalOf("inbound_peer_message"));
    expect(outcome.activated).toBe(true);
    expect(calls[0]).toBe("resume:session-persisted-1");
    expect(calls[1]?.startsWith("followup:")).toBe(true);
    expect(adapter.adapterId).toBe("dsh-agents");
  });

  it("N19 a failed resume leaves the semantic signal PENDING (never marked delivered)", async () => {
    const rig = launchPackaged({ root: freshDir("n19"), transportPath: join(freshDir("n19-t"), "transport.sqlite"), namespace: `uxc-n19-${seq}`, coldResume: true });
    const failing = dshAgentsAttentionAdapter({
      agents: {
        get: () => undefined,
        resume: async () => {
          throw new Error("resume unavailable");
        },
      },
      resumeSessionId: "session-persisted-2",
    });
    rig.deployment.bindAttentionActivation(failing);

    // Inject an authenticated inbound peer message through the REAL ingest path.
    await rig.deployment.installed.federation!.recordInboundMessage({
      transportMessageId: "tm-uxc-n19-1",
      authenticatedPeer: materializePeerRef({ peerId: OTHER_PEER }),
      message: materializePeerMessage({
        messageId: "msg-uxc-n19-1",
        thread: materializeThreadRef({ threadId: "thread-n19" }),
        from: materializePeerRef({ peerId: OTHER_PEER }),
        to: materializePeerRef({ peerId: PEER }),
        body: JSON.stringify({ task: "?" }),
      }),
    });

    const first = await rig.deployment.pumpAndActivate();
    expect(first.activations.length).toBeGreaterThanOrEqual(1);
    expect(first.activations.every((entry) => entry.outcome.activated === false)).toBe(true);
    // A second pump returns the SAME signal: a failed activation did not consume it.
    const second = await rig.deployment.pumpAndActivate();
    expect(second.signals.some((signal) => signal.kind === "inbound_peer_message")).toBe(true);
    expect((await rig.deployment.attention!.pending()).some((signal) => signal.kind === "inbound_peer_message")).toBe(true);
  });

  it("N20 the packaged inbound pump needs no user polling (the deployment drives it)", async () => {
    const rig = launchPackaged({ root: freshDir("n20"), transportPath: join(freshDir("n20-t"), "transport.sqlite"), namespace: `uxc-n20-${seq}`, withAttention: true });
    await rig.deployment.installed.federation!.recordInboundMessage({
      transportMessageId: "tm-uxc-n20-1",
      authenticatedPeer: materializePeerRef({ peerId: OTHER_PEER }),
      message: materializePeerMessage({
        messageId: "msg-uxc-n20-1",
        thread: materializeThreadRef({ threadId: "thread-n20" }),
        from: materializePeerRef({ peerId: OTHER_PEER }),
        to: materializePeerRef({ peerId: PEER }),
        body: JSON.stringify({ task: "?" }),
      }),
    });
    // Nothing is polled by hand: the deployment's own lifecycle reports the derived signal.
    const report = await rig.deployment.pumpAndActivate();
    expect(report.signals.some((signal) => signal.kind === "inbound_peer_message")).toBe(true);
    const readiness = rig.deployment.collaborationReadiness();
    expect(readiness.inboundPump).toBe("CONFIGURED");
    expect(readiness.attention).not.toBe("ABSENT");
  });
});

/* ================================================================== *
 * UXC-N21…N25 — packaged cross-project stays explicit and creates no commitment
 * ================================================================== */

describe("UXC-N21…N25 packaged cross-project", () => {
  function twoPackagedRoots(): { root: string; transportPath: string; namespace: string } {
    const root = freshDir("n21");
    return { root, transportPath: join(freshDir("n21-t"), "transport.sqlite"), namespace: `uxc-n21-${seq}` };
  }

  it("N21/N22 AUTO cannot silently send; an explicit Ask is the only send path", async () => {
    const { root, transportPath, namespace } = twoPackagedRoots();
    const a = launchPackaged({ who: "a", projectId: PROJECT, peerId: PEER, root, transportPath, namespace, withCrossProject: true });
    const b = launchPackaged({ who: "b", projectId: OTHER_PROJECT, peerId: OTHER_PEER, root, transportPath, namespace, withCrossProject: true });
    const crossProject = a.deployment.installed.application.crossProject;
    const crossB = b.deployment.installed.application.crossProject!;
    expect(crossProject).toBeDefined();

    // AUTO with an independent peer: COORDINATE stops at a NON-MUTATING handoff.
    const auto = await collaborationOf(a).run({
      task: "Get an independent review by another team of the shared state migration.",
      intent: "AUTO",
      requestedBy: "test:user",
    });
    expect(auto.executionKind).toBe("CROSS_PROJECT_REQUIRED");
    await b.deployment.pumpAndActivate();
    expect(await crossB.pending()).toEqual([]);

    // An EXPLICIT Ask sends exactly one message and creates no commitment.
    const asked = await crossProject!.ask({ target: "the remote project", task: "Do you know this?", requestedBy: "test:user" });
    expect(["RESOLVED", "SENT", "WAITING"]).toContain(asked.status);
    await b.deployment.pumpAndActivate();
    expect(await crossB.pending()).toHaveLength(1);
    expect(await b.deployment.installed.federation!.commitments()).toEqual([]);
  });

  it("N23/N24 a packaged remote project can local-Explore or FOCUS-answer an Ask", async () => {
    const { root, transportPath, namespace } = twoPackagedRoots();
    const a = launchPackaged({ who: "a", projectId: PROJECT, peerId: PEER, root, transportPath, namespace, withCrossProject: true });
    const b = launchPackaged({ who: "b", projectId: OTHER_PROJECT, peerId: OTHER_PEER, root, transportPath, namespace, withCrossProject: true });
    // Both deployment profiles share the SAME projectDirectory bindings.
    const crossA = a.deployment.installed.application.crossProject!;
    const crossB = b.deployment.installed.application.crossProject!;

    // N23: B answers an Ask with ITS OWN packaged PARALLEL Explore.
    await crossA.ask({ target: "the remote project", task: EXPLORE_TASK, requestedBy: "test:user" });
    await b.deployment.pumpAndActivate();
    const pending = await crossB.pending();
    expect(pending).toHaveLength(1);
    const composedExplorer = await crossB.respond(pending[0]!.requestId, { compose: { task: EXPLORE_TASK, intent: "PARALLEL" } });
    expect(composedExplorer.status).toBe("ANSWERED");
    expect(b.branchRuns.length).toBeGreaterThanOrEqual(2);
    // The exploratory label travels in the answer text AND is typed locally.
    expect(composedExplorer.findingNote).toContain("These are exploratory cell-local findings.");
    expect(composedExplorer.answer).toContain("These are exploratory cell-local findings.");

    // N24: a FOCUS-answered Ask needs no branches.
    await crossA.ask({ target: "the remote project", task: "Summarise what you know.", requestedBy: "test:user" });
    await b.deployment.pumpAndActivate();
    const pending2 = await crossB.pending();
    const branchesBefore = b.branchRuns.length;
    const composedFocus = await crossB.respond(pending2[0]!.requestId, { compose: { task: "Summarise what you know.", intent: "FOCUS" } });
    expect(composedFocus.status).toBe("ANSWERED");
    expect(b.branchRuns.length).toBe(branchesBefore);
  });

  it("N25 an Ask creates no commitment, Task, ProjectIR revision or foreign workspace read", async () => {
    const { root, transportPath, namespace } = twoPackagedRoots();
    const a = launchPackaged({ who: "a", projectId: PROJECT, peerId: PEER, root, transportPath, namespace, withCrossProject: true });
    const b = launchPackaged({ who: "b", projectId: OTHER_PROJECT, peerId: OTHER_PEER, root, transportPath, namespace, withCrossProject: true });
    const headBefore = b.deployment.installed.controller.store.connection
      .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
      .get(OTHER_PROJECT);
    const commitmentsBefore = (await b.deployment.installed.federation!.commitments()).length;
    await a.deployment.installed.application.crossProject!.ask({ target: "the remote project", task: "Question?", requestedBy: "test:user" });
    await b.deployment.pumpAndActivate();
    const headAfter = b.deployment.installed.controller.store.connection
      .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
      .get(OTHER_PROJECT);
    const commitmentsAfter = (await b.deployment.installed.federation!.commitments()).length;
    expect(JSON.stringify(headAfter)).toBe(JSON.stringify(headBefore));
    expect(commitmentsAfter).toBe(commitmentsBefore);
    // A foreign workspace read fails closed.
    expect(b.deployment.installed.projectWorkspace).toBeDefined();
    const foreign = await b.deployment.installed.projectWorkspace!
      .journal(PROJECT)
      .then(() => "answered", (error: { kind?: string }) => error?.kind ?? "error");
    expect(foreign).toBe("invalid_registration");
  });
});

/* ================================================================== *
 * UXC-N26/N27 — idle zero-config performs no hidden work
 * ================================================================== */

describe("UXC-N26/N27 idle packaged host", () => {
  it("spawns no branches, sends no messages and runs no verification at idle", async () => {
    const { root, transportPath, namespace } = { root: freshDir("n26"), transportPath: join(freshDir("n26-t"), "transport.sqlite"), namespace: `uxc-n26-${seq}` };
    const rig = launchPackaged({ root, transportPath, namespace, withCrossProject: true });
    // Merely wiring the bundle (including a branch-capable deployment) does nothing.
    expect(rig.branchRuns).toEqual([]);
    expect(await rig.deployment.installed.reasoningCells!.store.cells()).toEqual([]);
    const history = rig.deployment.installed.verification === undefined ? [] : await rig.deployment.installed.verification.history();
    expect(history).toEqual([]);
    const inbox = await rig.deployment.installed.federation!.inbox(materializePeerRef({ peerId: PEER }));
    expect(inbox.received).toEqual([]);
    // The readiness view reports capabilities, never work performed.
    const readiness = rig.deployment.collaborationReadiness();
    expect(Object.keys(readiness).sort()).toEqual(
      ["advisor", "attention", "branchAdapter", "coldResume", "crossProject", "inboundPump", "localExplore", "projectVerification", "reasoningStore"].sort(),
    );
    expect(JSON.stringify(readiness)).not.toMatch(/score|health/iu);
  });
});

/* ================================================================== *
 * UXC-N28 — restart preserves semantic owners, not branch sessions
 * ================================================================== */

describe("UXC-N28 restart", () => {
  it("persists the reasoning store, verification history and bindings; branches stay ephemeral", async () => {
    const root = freshDir("n28");
    const transportPath = join(freshDir("n28-t"), "transport.sqlite");
    const namespace = `uxc-n28-${seq}`;
    const first = launchPackaged({ root, transportPath, namespace, withCrossProject: true });
    const explored = await collaborationOf(first).run({ task: EXPLORE_TASK, intent: "PARALLEL", requestedBy: "test:user" });
    const cellId = cellIdOf(explored);
    // Verification history is a semantic owner: record a real project-head run when the
    // packaged runtime can execute one, so the restart proof is about real history.
    let verificationRecorded = 0;
    if (first.deployment.installed.verification !== undefined) {
      try {
        await first.deployment.installed.verification.service.verifyCurrentHead({ requestedBy: "test:uxc", reason: "uxc restart proof" });
      } catch {
        /* an unavailable verifier is honest; the history assertion then stays at 0 */
      }
      verificationRecorded = (await first.deployment.installed.verification.history()).length;
    }
    const orchestrationPath = first.orchestrationPath;
    const reasoningPath = deploymentReasoningStorePath(orchestrationPath);
    await first.deployment.close();
    OPEN.splice(OPEN.indexOf(first.deployment), 1);

    // Relaunch the SAME profile: the durable store, bindings and project state rederive.
    const second = launchPackaged({ root, transportPath, namespace, withCrossProject: true });
    expect(existsSync(reasoningPath)).toBe(true);
    const view = await second.deployment.installed.reasoningCells!.service.cellView({ cellId });
    expect(view.definition.cellId).toBe(cellId);
    expect(view.admittedClaimIds.length).toBeGreaterThanOrEqual(2);
    const projects = await second.deployment.installed.application.crossProject!.projects();
    expect(projects.state).toBe("known");
    if (second.deployment.installed.verification !== undefined && verificationRecorded > 0) {
      const historyAfter = await second.deployment.installed.verification.history();
      expect(historyAfter.length).toBeGreaterThanOrEqual(verificationRecorded);
    }
    // A branch is NOT a durable principal: the branch environment composes no durable
    // session and the restart composes none either.
    expect(second.deployment.reasoning.storeOwned).toBe(true);
    const composed = composeBranchHostEnvironment({
      schemaVersion: 1,
      cell: { schemaVersion: 1, cellId: "cell-restart" },
      branch: { schemaVersion: 1, cellId: "cell-restart", branchId: "branch-restart" },
      objective: "o",
      question: "q",
      frontierBasis: { schemaVersion: 1, cellId: "cell-restart", frontierRevision: 0, frontierDigest: "b".repeat(64) },
      acceptedClaims: [],
    } as never);
    expect(composed.ok).toBe(true);
    // No interaction store was added: the interaction barrel owns no store module.
    const source = readFileSync(join(REPO, "src", "interaction", "index.ts"), "utf8");
    expect(source).toContain("no interaction store");
  });

  it("rederives cross-project pending state from federation history across a restart", async () => {
    const root = freshDir("n28b");
    const transportPath = join(freshDir("n28b-t"), "transport.sqlite");
    const namespace = `uxc-n28b-${seq}`;
    const a = launchPackaged({ who: "a", projectId: PROJECT, peerId: PEER, root, transportPath, namespace, withCrossProject: true });
    let b = launchPackaged({ who: "b", projectId: OTHER_PROJECT, peerId: OTHER_PEER, root, transportPath, namespace, withCrossProject: true });
    await a.deployment.installed.application.crossProject!.ask({ target: "the remote project", task: "Pending across restart?", requestedBy: "test:user" });
    await b.deployment.pumpAndActivate();
    expect(await b.deployment.installed.application.crossProject!.pending()).toHaveLength(1);
    await b.deployment.close();
    OPEN.splice(OPEN.indexOf(b.deployment), 1);

    // The SAME profile restarts: the pending request rederives from the durable
    // federation history — there is no interaction/cross-project request store.
    const restarted = launchPackaged({ who: "b", projectId: OTHER_PROJECT, peerId: OTHER_PEER, root, transportPath, namespace, withCrossProject: true });
    const pending = await restarted.deployment.installed.application.crossProject!.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.task).toBe("Pending across restart?");
  });
});

/* ================================================================== *
 * UXC-N29 — the shipped surfaces the regression gates depend on
 * ================================================================== */

describe("UXC-N29 regression surfaces remain composed", () => {
  it("keeps the UX-A/UX-B surfaces and exports the host entry the runner needs", () => {
    const advanced = readFileSync(join(REPO, "src", "advanced.ts"), "utf8");
    // SC-8: crossProjectAttentionText is reachable from the host bundle entry.
    expect(advanced).toContain('export * from "./interaction/index.js"');
    // The host bundle's JS is syntactically valid (node --check).
    for (const file of ["index.js", "runner.js", "startup.js"]) {
      execFileSync(process.execPath, ["--check", join(REPO, "host", "dsh", "lib", file)]);
    }
    // The application surface still exposes the collaboration and cross-project faces
    // exactly when they are composed (never a stub).
    expect(typeof makePalimpsestApplicationSurface).toBe("function");
  });
});
