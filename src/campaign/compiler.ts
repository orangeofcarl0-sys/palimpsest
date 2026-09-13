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
import type { BeliefRevision, CampaignHypothesis, CurrentBeliefState } from "./epistemic.js";
import { currentBeliefStateOf } from "./epistemic.js";
import type { CampaignIntervention, CampaignProjectRef, InterventionPurpose, PreBeliefStanding } from "./intervention.js";
import { parseCampaignProjectRef } from "./intervention.js";
import type { CampaignWatchDraft } from "./prospective.js";
import { parseCampaignWatchDraft } from "./prospective.js";
import type { AdmittedCampaignActionRef, ParsedWakeCycleCompleted } from "./production.js";
import { committedReconciliationOf, evaluateCompiledCampaignActionFreshness, inFlightWake } from "./production.js";
import { requireCanonicalDigest } from "./digest.js";
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
  /** GC2 §65: the EXACT committed reconciliation of the current wake, or null. */
  readonly reconciliationDigest: string | null;
  /** GC2 §63: the WakeCycle the context was built for, when wake-origin. */
  readonly wakeCycleId: string | null;
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
  /** GC2 §63: present iff the candidate was compiled during a wake (§67). */
  readonly wake?: { readonly wakeCycleId: string; readonly reconciliationDigest: string } | undefined;
  readonly action: ValidatedCampaignAction;
}

export interface CampaignWorkAdmissionPort {
  /**
   * Idempotent: the SAME admissionKey with the SAME proposal yields the SAME
   * Project result. A different proposal under the same key must fail closed.
   */
  admit(input: { readonly admissionKey: string; readonly proposal: unknown }): Promise<CampaignProjectRef>;
}

/** Required keys plus an all-or-nothing optional wake-correlation pair (§§72/§73). */
function exactKeysWithWakeCorrelation(
  object: Record<string, unknown>,
  required: readonly string[],
  what: string,
): { readonly wakeCycleId?: string; readonly reconciliationDigest?: string } {
  const optional = ["wakeCycleId", "reconciliationDigest"];
  for (const key of Object.keys(object)) {
    if (!required.includes(key) && !optional.includes(key)) {
      throw new CampaignStoreError("malformed_record", `unknown ${what} field "${key}"`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(object, key)) throw new CampaignStoreError("malformed_record", `${what}: field "${key}" is required`);
  }
  const hasWake = Object.hasOwn(object, "wakeCycleId");
  const hasReconciliation = Object.hasOwn(object, "reconciliationDigest");
  if (hasWake !== hasReconciliation) {
    throw new CampaignStoreError("malformed_record", `${what}: wakeCycleId and reconciliationDigest must appear together`);
  }
  if (!hasWake) return {};
  return {
    wakeCycleId: stableId(object.wakeCycleId, `${what}.wakeCycleId`),
    reconciliationDigest: requireCanonicalDigest(object.reconciliationDigest, `${what}.reconciliationDigest`),
  };
}

export const CAMPAIGN_COMPILER_EVENT_PARSERS = Object.freeze({
  PROJECT_ADMISSION_PREPARED: (payload: unknown) => {
    const object = asRecord(payload, "PROJECT_ADMISSION_PREPARED");
    const correlation = exactKeysWithWakeCorrelation(object, ["compilationId", "admissionKey", "candidateDigest"], "PROJECT_ADMISSION_PREPARED");
    return Object.freeze({
      compilationId: stableId(object.compilationId, "compilationId"),
      admissionKey: stableId(object.admissionKey, "admissionKey"),
      candidateDigest: requireCanonicalDigest(object.candidateDigest, "candidateDigest"),
      ...correlation,
    });
  },
  PROJECT_ADMITTED: (payload: unknown) => {
    const object = asRecord(payload, "PROJECT_ADMITTED");
    const correlation = exactKeysWithWakeCorrelation(object, ["admissionKey", "compilationId", "project"], "PROJECT_ADMITTED");
    return Object.freeze({
      admissionKey: stableId(object.admissionKey, "admissionKey"),
      compilationId: stableId(object.compilationId, "compilationId"),
      project: parseCampaignProjectRef(object.project, "PROJECT_ADMITTED.project"),
      ...correlation,
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

export interface CampaignActionParseOptions {
  readonly knownHypothesisIds: ReadonlySet<string>;
  readonly knownGateIds?: ReadonlySet<string> | undefined;
}

/** Shared Project arm validation (§165): reuse the canonical Work parser/validator. */
function validateProjectArm(rawProposal: unknown, rawIntervention: unknown, options: CampaignActionParseOptions): ValidatedCampaignAction {
  const intervention = asRecord(rawIntervention, "intervention");
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
  const proposal = parseProjectProposal(rawProposal);
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

/** Shared WAIT arm validation (§22). */
function validateWaitArm(rawReason: unknown, rawWatches: unknown): ValidatedCampaignAction {
  const reason = nonEmpty(rawReason, "reason");
  if (!Array.isArray(rawWatches) || rawWatches.length === 0) {
    throw new CampaignStoreError("malformed_record", "a WAIT action requires at least one watch draft");
  }
  // §21: malformed Watch conditions must fail at candidate parsing.
  const watches = rawWatches.map((entry) => parseCampaignWatchDraft(entry, "watchDraft"));
  return Object.freeze({ kind: "wait" as const, reason, watches: Object.freeze(watches) });
}

/**
 * Strict compiler-output parser (§164). Rejects unknown action kinds, unknown
 * fields, invalid hypothesis refs, empty reasons, malformed watch drafts, and a
 * ProjectProposal that the canonical Work parser/validator refuses.
 */
export function parseCampaignNextActionProposal(raw: unknown, options: CampaignActionParseOptions): ValidatedCampaignAction {
  const object = asRecord(raw, "CampaignNextActionProposal");
  if (object.kind === "project") {
    exactKeys(object, ["kind", "projectProposal", "intervention"], "CampaignProjectActionProposal");
    return validateProjectArm(object.projectProposal, object.intervention, options);
  }
  if (object.kind === "wait") {
    exactKeys(object, ["kind", "reason", "watches"], "CampaignWaitActionProposal");
    return validateWaitArm(object.reason, object.watches);
  }
  // §163: a compiler can never terminate a Campaign.
  throw new CampaignStoreError("malformed_record", `unsupported campaign action kind "${String(object.kind)}"`);
}

/** Strict parser for the VALIDATED action shape carried inside a compiled candidate. */
export function parseValidatedCampaignAction(raw: unknown, options: CampaignActionParseOptions): ValidatedCampaignAction {
  const object = asRecord(raw, "CampaignAction");
  if (object.kind === "project") {
    exactKeys(object, ["kind", "proposal", "intervention"], "CampaignProjectAction");
    return validateProjectArm(object.proposal, object.intervention, options);
  }
  if (object.kind === "wait") {
    exactKeys(object, ["kind", "reason", "watches"], "CampaignWaitAction");
    return validateWaitArm(object.reason, object.watches);
  }
  throw new CampaignStoreError("malformed_record", `unsupported campaign action kind "${String(object.kind)}"`);
}

/**
 * GC3-1 §§18–23: the strict artifact parser for the admission boundary. Unknown
 * fields are rejected, the optional wake pair is all-or-nothing, and the action
 * is validated through the shared arm parsers (input detached, output frozen).
 */
export function parseCompiledCampaignAction(raw: unknown, options: CampaignActionParseOptions): CompiledCampaignAction {
  const object = asRecord(raw, "CompiledCampaignAction");
  const allowed = ["compilationId", "campaignBasisThroughSeq", "campaignBasisDigest", "beliefStateDigest", "wake", "action"];
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new CampaignStoreError("malformed_record", `unknown CompiledCampaignAction field "${key}"`);
  }
  for (const key of ["compilationId", "campaignBasisThroughSeq", "campaignBasisDigest", "beliefStateDigest", "action"]) {
    if (!Object.hasOwn(object, key)) throw new CampaignStoreError("malformed_record", `CompiledCampaignAction: field "${key}" is required`);
  }
  const throughSeq = object.campaignBasisThroughSeq;
  if (!Number.isSafeInteger(throughSeq) || (throughSeq as number) < 0) {
    throw new CampaignStoreError("malformed_record", "CompiledCampaignAction.campaignBasisThroughSeq must be a non-negative integer");
  }
  let wake: { readonly wakeCycleId: string; readonly reconciliationDigest: string } | undefined;
  if (Object.hasOwn(object, "wake") && object.wake !== undefined && object.wake !== null) {
    const wakeObject = asRecord(object.wake, "CompiledCampaignAction.wake");
    exactKeys(wakeObject, ["wakeCycleId", "reconciliationDigest"], "CompiledCampaignAction.wake");
    wake = Object.freeze({
      wakeCycleId: stableId(wakeObject.wakeCycleId, "CompiledCampaignAction.wake.wakeCycleId"),
      reconciliationDigest: requireCanonicalDigest(wakeObject.reconciliationDigest, "CompiledCampaignAction.wake.reconciliationDigest"),
    });
  }
  return Object.freeze({
    compilationId: stableId(object.compilationId, "CompiledCampaignAction.compilationId"),
    campaignBasisThroughSeq: throughSeq as number,
    campaignBasisDigest: requireCanonicalDigest(object.campaignBasisDigest, "CompiledCampaignAction.campaignBasisDigest"),
    beliefStateDigest: requireCanonicalDigest(object.beliefStateDigest, "CompiledCampaignAction.beliefStateDigest"),
    ...(wake === undefined ? {} : { wake }),
    action: parseValidatedCampaignAction(object.action, options),
  });
}

/** GC3-1 §26: a distinct domain — never the admission-key domain. */
export const COMPILED_CAMPAIGN_ACTION_DIGEST_DOMAIN = "palimpsest.compiled-campaign-action.v1";

/**
 * GC3-1 §§24–27: the canonical semantic identity of a compiled candidate. It
 * includes every admission-relevant field: compilation correlation, Campaign
 * basis, BeliefState, the optional wake pair, and the complete action content.
 * `candidateDigest` is NOT the admission key/`waitAdmissionId` (operation
 * identity) — they are not interchangeable.
 */
export function compiledCampaignActionDigestOf(compiled: CompiledCampaignAction): string {
  return canonicalDigest({
    domain: COMPILED_CAMPAIGN_ACTION_DIGEST_DOMAIN,
    compilationId: compiled.compilationId,
    campaignBasisThroughSeq: compiled.campaignBasisThroughSeq,
    campaignBasisDigest: compiled.campaignBasisDigest,
    beliefStateDigest: compiled.beliefStateDigest,
    wakeCycleId: compiled.wake?.wakeCycleId ?? null,
    reconciliationDigest: compiled.wake?.reconciliationDigest ?? null,
    action: compiled.action,
  });
}

/**
 * The Project-admission operation/idempotency key (correlation identity). It is
 * deliberately NOT the candidate digest (§27).
 */
export function campaignProjectAdmissionKeyOf(compiled: CompiledCampaignAction): string {
  return `adm-${canonicalDigest({
    domain: "palimpsest.campaign-admission.v1",
    compilationId: compiled.compilationId,
    campaignBasisDigest: compiled.campaignBasisDigest,
    wakeCycleId: compiled.wake?.wakeCycleId ?? null,
    reconciliationDigest: compiled.wake?.reconciliationDigest ?? null,
  }).slice(0, 24)}`;
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
  readonly wakeCycleId: string | null;
  readonly reconciliationDigest: string | null;
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
  }): Promise<
    | {
        readonly status: "admitted";
        readonly project: CampaignProjectRef;
        /** GC2 §73: the exact completion reference, when the admission was wake-bound. */
        readonly completion: AdmittedCampaignActionRef | null;
      }
    | { readonly status: "stale" | "conflict"; readonly detail: string }
  >;
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
    // §64/§97: a wake-bound compile requires the CURRENT incomplete wake and its
    // committed reconciliation — never "the latest reconciliation anywhere".
    const events = await replay(input.campaignId);
    const inFlight = inFlightWake(events);
    let wake: { readonly wakeCycleId: string; readonly reconciliationDigest: string } | undefined;
    if (inFlight !== undefined) {
      const reconciliation = committedReconciliationOf(events, inFlight);
      if (reconciliation === undefined) {
        return { status: "compilation_failed" as const, detail: "the current wake has no committed reconciliation" };
      }
      wake = { wakeCycleId: inFlight, reconciliationDigest: reconciliation.digest };
    }
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
          ...(wake === undefined ? {} : { wake }),
          action,
        }),
      };
    } catch (error) {
      // §179: malformed output mutates nothing.
      return { status: "compilation_failed" as const, detail: error instanceof Error ? error.message : String(error) };
    }
  }

  async function admitCompiledAction(input: { readonly campaignId: string; readonly compiled: CompiledCampaignAction }) {
    const { compiled } = input;
    if (compiled.action.kind !== "project") {
      return { status: "conflict" as const, detail: "WAIT actions are admitted through unified next-action admission" };
    }
    if (deps.work === undefined) {
      return { status: "conflict" as const, detail: "no CampaignWorkAdmissionPort is configured" };
    }
    const admissionKey = campaignProjectAdmissionKeyOf(compiled);
    const candidateDigest = compiledCampaignActionDigestOf(compiled);
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
      const retried = (admitted.payload as { project: CampaignProjectRef }).project;
      return { status: "admitted" as const, project: retried, completion: completionOf(compiled, retried, admissionKey) };
    }
    if (prepared === undefined) {
      // GC3-2 §29: the ONE shared freshness evaluator (read-only; never appends).
      const freshness = await evaluateCompiledCampaignActionFreshness({
        store: deps.store,
        campaignId: input.campaignId,
        compiled,
      });
      if (freshness.status !== "fresh") {
        return { status: "stale" as const, detail: freshness.detail };
      }
      const basis = (await currentBasis(input.campaignId))!;
      const correlation =
        compiled.wake === undefined
          ? {}
          : { wakeCycleId: compiled.wake.wakeCycleId, reconciliationDigest: compiled.wake.reconciliationDigest };
      await deps.store.appendAtomic({
        expectedBasis: basis,
        events: [
          request("PROJECT_ADMISSION_PREPARED", input.campaignId, {
            compilationId: compiled.compilationId,
            admissionKey,
            candidateDigest,
            ...correlation,
          }),
        ],
      });
    }
    // Idempotent external admission: a crash here is recovered by re-calling
    // with the SAME admissionKey (§173/§79).
    const rawProject = await deps.work.admit({ admissionKey, proposal: compiled.action.proposal });
    const project = parseCampaignProjectRef(rawProject, "work admission project");
    const correlation =
      compiled.wake === undefined
        ? {}
        : { wakeCycleId: compiled.wake.wakeCycleId, reconciliationDigest: compiled.wake.reconciliationDigest };
    // §80/§81: PROJECT_ADMITTED and the declared Intervention register together.
    const intervention = materializeAdmissionIntervention(input.campaignId, admissionKey, project, compiled, await replay(input.campaignId));
    await deps.store.appendAtomic({
      expectedBasis: (await currentBasis(input.campaignId))!,
      events: [
        request("PROJECT_ADMITTED", input.campaignId, { admissionKey, compilationId: compiled.compilationId, project, ...correlation }),
        request("INTERVENTION_REGISTERED", input.campaignId, { intervention }),
      ],
    });
    return { status: "admitted" as const, project, completion: completionOf(compiled, project, admissionKey) };
  }

  function beliefRevisionsFromEvents(events: readonly CampaignEvent[]): readonly BeliefRevision[] {
    return events.filter((event) => event.type === "BELIEF_REVISED").map((event) => (event.payload as { revision: BeliefRevision }).revision);
  }

  function completionOf(compiled: CompiledCampaignAction, project?: CampaignProjectRef, admissionKey?: string): AdmittedCampaignActionRef | null {
    if (compiled.wake === undefined) return null;
    if (compiled.action.kind === "project" && project !== undefined && admissionKey !== undefined) {
      return Object.freeze({
        kind: "project" as const,
        wakeCycleId: compiled.wake.wakeCycleId,
        compilationId: compiled.compilationId,
        reconciliationDigest: compiled.wake.reconciliationDigest,
        admissionKey,
        project,
      });
    }
    return null;
  }

  function materializeAdmissionIntervention(
    campaignId: string,
    admissionKey: string,
    project: CampaignProjectRef,
    compiled: CompiledCampaignAction,
    events: readonly CampaignEvent[],
  ): CampaignIntervention {
    if (compiled.action.kind !== "project") throw new CampaignStoreError("invalid_registration", "intervention requires a project action");
    const interventionId = `iv-${canonicalDigest({
      domain: "palimpsest.campaign-intervention.v1",
      campaignId,
      admissionKey,
      project,
    }).slice(0, 24)}`;
    const belief = currentBeliefStateOf(campaignId, beliefRevisionsFromEvents(events));
    const preBeliefStandings: PreBeliefStanding[] = compiled.action.intervention.targetHypothesisIds.map((hypothesisId) =>
      Object.freeze({
        hypothesisId,
        standing: belief.entries.find((entry) => entry.hypothesisId === hypothesisId)?.standing ?? "inconclusive",
      }),
    );
    return Object.freeze({
      interventionId,
      campaignId,
      project,
      purpose: compiled.action.intervention.purpose,
      targetHypothesisIds: Object.freeze([...compiled.action.intervention.targetHypothesisIds]),
      preBeliefStateDigest: belief.digest,
      preBeliefStandings: Object.freeze(preBeliefStandings),
    });
  }

  async function admissions(campaignId: string): Promise<readonly CampaignAdmissionState[]> {
    const events = await replay(campaignId);
    const byKey = new Map<string, CampaignAdmissionState>();
    for (const event of events) {
      if (event.type === "PROJECT_ADMISSION_PREPARED") {
        const payload = event.payload as { compilationId: string; admissionKey: string; candidateDigest: string; wakeCycleId?: string; reconciliationDigest?: string };
        byKey.set(payload.admissionKey, {
          admissionKey: payload.admissionKey,
          compilationId: payload.compilationId,
          candidateDigest: payload.candidateDigest,
          project: null,
          wakeCycleId: payload.wakeCycleId ?? null,
          reconciliationDigest: payload.reconciliationDigest ?? null,
        });
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
