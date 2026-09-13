/**
 * G10-G6 CampaignCompiler and the idempotent Work admission saga
 * (§153–§184).
 *
 *   CampaignCompiler ≠ Scheduler          (§154)
 *   Compiler output is a CANDIDATE only   (§155)
 *
 * The compiler may be an LLM, a deterministic planner, a human adapter, or any
 * host service. Its output crosses a STRICT parser boundary and is NEVER
 * canonical truth. A Project candidate MUST flow through the existing
 * `parseProjectProposal` + `validateProjectProposal` (§165) — the Campaign does
 * not duplicate Work's validation rules.
 *
 * Admission spans two stores (CampaignStore + Work), which are NOT one
 * transaction (§172). A durable idempotent saga is used:
 *
 *   PROJECT_ADMISSION_PREPARED { compilationId, admissionKey, candidateDigest }
 *     ↓ idempotent Work admission (same admissionKey → same Project)
 *   PROJECT_ADMITTED { admissionKey, projectRef }
 *
 * A crash after Work admission but before PROJECT_ADMITTED recovers by
 * re-calling the port with the SAME admissionKey; the Campaign link is
 * recorded exactly once. The compiler never sets belief, never modifies
 * Evidence, never advances an Institution, and cannot terminate a Campaign.
 */

import { canonicalDigest } from "../schema/canonical.js";
import { isStableIdentifier, normalizeStableIdentifier } from "../schema/identifier.js";
import { parseProjectProposal, validateProjectProposal } from "../architecture/proposal.js";
import type { CampaignCommitment } from "./artifacts.js";
import type { CampaignHypothesis, CurrentBeliefState } from "./epistemic.js";
import type { CampaignProjectRef, InterventionPurpose } from "./intervention.js";
import type { CampaignWatchDraft } from "./prospective.js";
import { parseCampaignWatchDraft } from "./prospective.js";
import type { CampaignAppendRequest, CampaignEvent, CampaignStore } from "./store.js";
import { CampaignStoreError } from "./store.js";

export interface CampaignPlanningContext {
  readonly campaignId: string;
  readonly institutionId: string;
  readonly activeCommitments: readonly CampaignCommitment[];
  readonly activeHypotheses: readonly CampaignHypothesis[];
  readonly beliefState: CurrentBeliefState;
  readonly recentObservationRefs: readonly string[];
  readonly interventionSummaries: readonly string[];
  readonly institutionEpoch: { readonly institutionId: string; readonly epoch: number; readonly digest: string } | null;
  readonly activeWatchIds: readonly string[];
  readonly reconciliationDigest: string | null;
}

/** The untrusted planner boundary (§156/§159). Output is `unknown`. */
export interface CampaignCompilerPort {
  compile(context: CampaignPlanningContext): Promise<unknown>;
}

export interface CampaignProjectActionProposal {
  readonly kind: "project";
  readonly projectProposal: unknown;
  readonly intervention: {
    readonly purpose: InterventionPurpose;
    readonly targetHypothesisIds: readonly string[];
  };
}

export interface CampaignWaitActionProposal {
  readonly kind: "wait";
  readonly reason: string;
  readonly watches: readonly CampaignWatchDraft[];
}

export type CampaignNextActionProposal = CampaignProjectActionProposal | CampaignWaitActionProposal;

/** The validated project payload — the canonical ProjectProposal type. */
export type ValidatedCampaignAction =
  | { readonly kind: "project"; readonly proposal: ReturnType<typeof parseProjectProposal>; readonly intervention: CampaignProjectActionProposal["intervention"] }
  | { readonly kind: "wait"; readonly reason: string; readonly watches: readonly CampaignWatchDraft[] };

export interface CompiledCampaignAction {
  readonly compilationId: string;
  readonly campaignBasisThroughSeq: number;
  readonly campaignBasisDigest: string;
  readonly beliefStateDigest: string;
  readonly action: ValidatedCampaignAction;
}

export interface CampaignWorkAdmissionPort {
  /**
   * Idempotent: the SAME admissionKey with the SAME proposal yields the SAME
   * Project result. A different proposal under the same key must fail closed.
   */
  admit(input: { readonly admissionKey: string; readonly proposal: unknown }): Promise<CampaignProjectRef>;
}

export const CAMPAIGN_COMPILER_EVENT_PARSERS = Object.freeze({
  PROJECT_ADMISSION_PREPARED: (payload: unknown) => {
    const object = asRecord(payload, "PROJECT_ADMISSION_PREPARED");
    exactKeys(object, ["compilationId", "admissionKey", "candidateDigest"], "PROJECT_ADMISSION_PREPARED");
    return Object.freeze({
      compilationId: stableId(object.compilationId, "compilationId"),
      admissionKey: stableId(object.admissionKey, "admissionKey"),
      candidateDigest: nonEmpty(object.candidateDigest, "candidateDigest"),
    });
  },
  PROJECT_ADMITTED: (payload: unknown) => {
    const object = asRecord(payload, "PROJECT_ADMITTED");
    exactKeys(object, ["admissionKey", "project"], "PROJECT_ADMITTED");
    const project = asRecord(object.project, "PROJECT_ADMITTED.project");
    exactKeys(project, ["projectId", "revision", "digest"], "PROJECT_ADMITTED.project");
    if (!Number.isSafeInteger(project.revision) || (project.revision as number) < 0) {
      throw new CampaignStoreError("malformed_record", "project revision must be a non-negative integer");
    }
    return Object.freeze({
      admissionKey: stableId(object.admissionKey, "admissionKey"),
      project: Object.freeze({
        projectId: stableId(project.projectId, "projectId"),
        revision: project.revision as number,
        digest: nonEmpty(project.digest, "digest"),
      }),
    });
  },
});

function asRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new CampaignStoreError("malformed_record", `${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(object: Record<string, unknown>, keys: readonly string[], what: string): void {
  for (const key of Object.keys(object)) {
    if (!keys.includes(key)) throw new CampaignStoreError("malformed_record", `unknown ${what} field "${key}"`);
  }
  for (const key of keys) {
    if (!Object.hasOwn(object, key)) throw new CampaignStoreError("malformed_record", `${what}: field "${key}" is required`);
  }
}

function stableId(value: unknown, what: string): string {
  if (typeof value !== "string" || !isStableIdentifier(normalizeStableIdentifier(value))) {
    throw new CampaignStoreError("malformed_record", `${what} must be a stable identifier`);
  }
  return value;
}

function nonEmpty(value: unknown, what: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new CampaignStoreError("malformed_record", `${what} must be a non-empty string`);
  }
  return value;
}

/**
 * Strict compiler-output parser (§164). Rejects unknown action kinds, unknown
 * fields, invalid hypothesis refs, empty reasons, malformed watch drafts, and a
 * ProjectProposal that the canonical Work parser/validator refuses.
 */
export function parseCampaignNextActionProposal(
  raw: unknown,
  options: { readonly knownHypothesisIds: ReadonlySet<string>; readonly knownGateIds?: ReadonlySet<string> },
): ValidatedCampaignAction {
  const object = asRecord(raw, "CampaignNextActionProposal");
  if (object.kind === "project") {
    exactKeys(object, ["kind", "projectProposal", "intervention"], "CampaignProjectActionProposal");
    const intervention = asRecord(object.intervention, "intervention");
    exactKeys(intervention, ["purpose", "targetHypothesisIds"], "intervention");
    if (intervention.purpose !== "test" && intervention.purpose !== "measure" && intervention.purpose !== "explore") {
      throw new CampaignStoreError("malformed_record", "intervention purpose must be test, measure, or explore");
    }
    if (!Array.isArray(intervention.targetHypothesisIds)) {
      throw new CampaignStoreError("malformed_record", "targetHypothesisIds must be an array");
    }
    const targetHypothesisIds = intervention.targetHypothesisIds.map((entry) => stableId(entry, "targetHypothesisId"));
    for (const hypothesisId of targetHypothesisIds) {
      if (!options.knownHypothesisIds.has(hypothesisId)) {
        throw new CampaignStoreError("malformed_record", `unknown hypothesis reference "${hypothesisId}"`);
      }
    }
    // §165: reuse the canonical Work parser + validator; never duplicate them.
    const proposal = parseProjectProposal(object.projectProposal);
    const diagnostics = validateProjectProposal(
      proposal,
      options.knownGateIds === undefined ? {} : { knownGateIds: options.knownGateIds },
    );
    if (diagnostics.length > 0) {
      throw new CampaignStoreError("malformed_record", `project proposal is invalid: ${diagnostics.map((d) => d.type).join(", ")}`);
    }
    return Object.freeze({
      kind: "project" as const,
      proposal,
      intervention: Object.freeze({ purpose: intervention.purpose, targetHypothesisIds: Object.freeze(targetHypothesisIds) }),
    });
  }
  if (object.kind === "wait") {
    exactKeys(object, ["kind", "reason", "watches"], "CampaignWaitActionProposal");
    const reason = nonEmpty(object.reason, "reason");
    if (!Array.isArray(object.watches) || object.watches.length === 0) {
      throw new CampaignStoreError("malformed_record", "a WAIT action requires at least one watch draft");
    }
    // §21: malformed Watch conditions must fail at compiler candidate parsing.
    const watches = object.watches.map((entry) => parseCampaignWatchDraft(entry, "watchDraft"));
    return Object.freeze({ kind: "wait" as const, reason, watches: Object.freeze(watches) });
  }
  // §163: a compiler can never terminate a Campaign.
  throw new CampaignStoreError("malformed_record", `unsupported campaign action kind "${String(object.kind)}"`);
}

export interface CompilerServiceDeps {
  readonly store: CampaignStore;
  readonly buildContext: (campaignId: string) => Promise<CampaignPlanningContext>;
  readonly allocateCompilationId: () => string;
  readonly compiler?: CampaignCompilerPort | undefined;
  readonly work?: CampaignWorkAdmissionPort | undefined;
  readonly knownGateIds?: ReadonlySet<string> | undefined;
}

export interface CampaignAdmissionState {
  readonly admissionKey: string;
  readonly compilationId: string;
  readonly candidateDigest: string;
  readonly project: CampaignProjectRef | null;
}

export interface CompilerService {
  compileNextAction(input: { readonly campaignId: string }): Promise<
    | { readonly status: "compiled"; readonly compiled: CompiledCampaignAction }
    | { readonly status: "compilation_failed"; readonly detail: string }
  >;
  /** Freshness-checked admission through the idempotent Work saga (§168–§174). */
  admitCompiledAction(input: {
    readonly campaignId: string;
    readonly compiled: CompiledCampaignAction;
  }): Promise<{ readonly status: "admitted"; readonly project: CampaignProjectRef } | { readonly status: "stale" | "conflict"; readonly detail: string }>;
  admissions(campaignId: string): Promise<readonly CampaignAdmissionState[]>;
}

export function makeCompilerService(deps: CompilerServiceDeps): CompilerService {
  async function replay(campaignId: string): Promise<readonly CampaignEvent[]> {
    return deps.store.replay(campaignId);
  }

  async function currentBasis(campaignId: string) {
    const basis = await deps.store.basis(campaignId);
    if (basis === undefined) throw new CampaignStoreError("unknown_campaign", `campaign "${campaignId}" does not exist`);
    return basis;
  }

  function request(type: string, campaignId: string, payload: unknown): CampaignAppendRequest {
    return {
      eventId: `evt-${canonicalDigest({ domain: "palimpsest.campaign-event.v1", type, campaignId, payload }).slice(0, 24)}`,
      type: type as CampaignAppendRequest["type"],
      payload,
    };
  }

  async function compileNextAction(input: { readonly campaignId: string }) {
    if (deps.compiler === undefined) {
      return { status: "compilation_failed" as const, detail: "no CampaignCompilerPort is configured" };
    }
    const context = await deps.buildContext(input.campaignId);
    const basis = await currentBasis(input.campaignId);
    const raw = await deps.compiler.compile(context);
    try {
      const action = parseCampaignNextActionProposal(raw, {
        knownHypothesisIds: new Set(context.activeHypotheses.map((hypothesis) => hypothesis.hypothesisId)),
        ...(deps.knownGateIds === undefined ? {} : { knownGateIds: deps.knownGateIds }),
      });
      return {
        status: "compiled" as const,
        compiled: Object.freeze({
          compilationId: deps.allocateCompilationId(),
          campaignBasisThroughSeq: basis.throughSeq,
          campaignBasisDigest: basis.chainDigest,
          beliefStateDigest: context.beliefState.digest,
          action,
        }),
      };
    } catch (error) {
      // §179: malformed output mutates nothing.
      return { status: "compilation_failed" as const, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  function admissionKeyOf(compiled: CompiledCampaignAction): string {
    return `adm-${canonicalDigest({ domain: "palimpsest.campaign-admission.v1", compilationId: compiled.compilationId, campaignBasisDigest: compiled.campaignBasisDigest }).slice(0, 24)}`;
  }

  function candidateDigestOf(compiled: CompiledCampaignAction): string {
    return canonicalDigest({ domain: "palimpsest.campaign-candidate.v1", action: compiled.action });
  }

  async function admitCompiledAction(input: { readonly campaignId: string; readonly compiled: CompiledCampaignAction }) {
    const { compiled } = input;
    if (compiled.action.kind !== "project") {
      return { status: "conflict" as const, detail: "WAIT actions are admitted through the prospective/lifecycle path" };
    }
    if (deps.work === undefined) {
      return { status: "conflict" as const, detail: "no CampaignWorkAdmissionPort is configured" };
    }
    const admissionKey = admissionKeyOf(compiled);
    const candidateDigest = candidateDigestOf(compiled);
    const events = await replay(input.campaignId);
    const prepared = events.find(
      (event) => event.type === "PROJECT_ADMISSION_PREPARED" && (event.payload as { admissionKey: string }).admissionKey === admissionKey,
    );
    const admitted = events.find(
      (event) => event.type === "PROJECT_ADMITTED" && (event.payload as { admissionKey: string }).admissionKey === admissionKey,
    );
    if (prepared !== undefined && (prepared.payload as { candidateDigest: string }).candidateDigest !== candidateDigest) {
      // §174: same key, different proposal → fail closed.
      return { status: "conflict" as const, detail: "admission key already prepared with a different candidate" };
    }
    if (admitted !== undefined) {
      // Idempotent retry of a completed admission — no freshness requirement,
      // because the admission itself advanced the Campaign basis.
      return { status: "admitted" as const, project: (admitted.payload as { project: CampaignProjectRef }).project };
    }
    if (prepared === undefined) {
      // §168 freshness applies only to a FIRST admission attempt.
      const basis = await currentBasis(input.campaignId);
      if (basis.throughSeq !== compiled.campaignBasisThroughSeq || basis.chainDigest !== compiled.campaignBasisDigest) {
        return { status: "stale" as const, detail: "campaign_action_stale" };
      }
      await deps.store.appendAtomic({
        expectedBasis: basis,
        events: [request("PROJECT_ADMISSION_PREPARED", input.campaignId, { compilationId: compiled.compilationId, admissionKey, candidateDigest })],
      });
    }
    // Idempotent external admission: a crash here is recovered by re-calling
    // with the SAME admissionKey (§173).
    const project = await deps.work.admit({ admissionKey, proposal: compiled.action.proposal });
    const after = await currentBasis(input.campaignId);
    await deps.store.appendAtomic({
      expectedBasis: after,
      events: [request("PROJECT_ADMITTED", input.campaignId, { admissionKey, project })],
    });
    return { status: "admitted" as const, project };
  }

  async function admissions(campaignId: string): Promise<readonly CampaignAdmissionState[]> {
    const events = await replay(campaignId);
    const byKey = new Map<string, { admissionKey: string; compilationId: string; candidateDigest: string; project: CampaignProjectRef | null }>();
    for (const event of events) {
      if (event.type === "PROJECT_ADMISSION_PREPARED") {
        const payload = event.payload as { compilationId: string; admissionKey: string; candidateDigest: string };
        byKey.set(payload.admissionKey, { ...payload, project: null });
      } else if (event.type === "PROJECT_ADMITTED") {
        const payload = event.payload as { admissionKey: string; project: CampaignProjectRef };
        const existing = byKey.get(payload.admissionKey);
        if (existing !== undefined) byKey.set(payload.admissionKey, { ...existing, project: payload.project });
      }
    }
    return Object.freeze([...byKey.values()]);
  }

  return { compileNextAction, admitCompiledAction, admissions };
}
