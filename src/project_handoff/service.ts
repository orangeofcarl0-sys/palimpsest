import { canonicalDigest } from "../schema/canonical.js";
import type {
  CollaborationReceipt,
  ExecutorKind,
  Handoff,
  IndependenceAssessment,
  MechanismInput,
  MechanismSelection,
  ProjectBasisRef,
  ReceiptFinding,
} from "./types.js";

export class HandoffError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "MECHANISM_UNAVAILABLE", message: string) {
    super(message);
    this.name = "HandoffError";
  }
}

export interface MakeHandoffInput {
  readonly task: string;
  readonly intent: string;
  readonly constraints: readonly string[];
  readonly projectBasis: ProjectBasisRef;
  readonly sources: Handoff["sources"];
  readonly allowedResources: readonly string[];
  readonly expectedArtifact: string;
  readonly knownGaps?: readonly string[] | undefined;
  readonly stopConditions?: readonly string[] | undefined;
  readonly budget: Handoff["budget"];
  readonly decisionsNeeded?: readonly string[] | undefined;
  readonly createdAt: string;
}

export function makeHandoff(input: MakeHandoffInput): Handoff {
  const require = (value: string, name: string): void => {
    if (value.trim() === "") throw new HandoffError("INVALID_INPUT", `${name} must be non-empty`);
  };
  require(input.task, "task");
  require(input.intent, "intent");
  require(input.expectedArtifact, "expectedArtifact");
  if (input.constraints.length === 0) throw new HandoffError("INVALID_INPUT", "a handoff needs at least one constraint");
  if (input.allowedResources.length === 0) throw new HandoffError("INVALID_INPUT", "a handoff needs an explicit allowed resource set");
  if (input.stopConditions === undefined || input.stopConditions.length === 0) {
    throw new HandoffError("INVALID_INPUT", "a handoff needs at least one stop condition");
  }
  if (input.budget.maxSteps < 1 || input.budget.maxWallSeconds < 1) {
    throw new HandoffError("INVALID_INPUT", "a handoff budget must be positive");
  }
  const content = { ...input, knownGaps: input.knownGaps ?? [], stopConditions: input.stopConditions, decisionsNeeded: input.decisionsNeeded ?? [] };
  return Object.freeze({
    schema: "pc1-handoff/v1" as const,
    handoffId: `handoff-${canonicalDigest(content).slice(0, 24)}`,
    task: input.task,
    intent: input.intent,
    constraints: Object.freeze([...input.constraints]),
    projectBasis: Object.freeze({ ...input.projectBasis }),
    sources: Object.freeze(input.sources.map((source) => Object.freeze({ ...source }))),
    allowedResources: Object.freeze([...input.allowedResources]),
    expectedArtifact: input.expectedArtifact,
    knownGaps: Object.freeze([...(input.knownGaps ?? [])]),
    stopConditions: Object.freeze([...input.stopConditions]),
    budget: Object.freeze({ ...input.budget }),
    decisionsNeeded: Object.freeze([...(input.decisionsNeeded ?? [])]),
    createdAt: input.createdAt,
  });
}

export interface MakeReceiptInput {
  readonly handoff: Handoff;
  readonly executor: ExecutorKind;
  readonly executorIdentity: string;
  readonly findings: readonly ReceiptFinding[];
  readonly artifacts: readonly string[];
  readonly readFootprint: readonly string[];
  readonly status: CollaborationReceipt["status"];
  readonly limitations?: readonly string[] | undefined;
  readonly followUp?: readonly string[] | undefined;
  readonly createdAt: string;
}

export function makeReceipt(input: MakeReceiptInput): CollaborationReceipt {
  if (input.executorIdentity.trim() === "") throw new HandoffError("INVALID_INPUT", "a receipt must name its executor identity");
  if (input.readFootprint.length === 0 && input.status === "COMPLETE") {
    throw new HandoffError("INVALID_INPUT", "a COMPLETE receipt must state what it actually read");
  }
  const content = {
    handoffId: input.handoff.handoffId,
    executor: input.executor,
    executorIdentity: input.executorIdentity,
    findings: input.findings,
    artifacts: input.artifacts,
    readFootprint: input.readFootprint,
    status: input.status,
    limitations: input.limitations ?? [],
    followUp: input.followUp ?? [],
    createdAt: input.createdAt,
  };
  return Object.freeze({
    schema: "pc1-receipt/v1" as const,
    receiptId: `receipt-${canonicalDigest(content).slice(0, 24)}`,
    handoffId: input.handoff.handoffId,
    executor: input.executor,
    executorIdentity: input.executorIdentity,
    findings: Object.freeze(input.findings.map((finding) => Object.freeze({
      ...finding,
      sources: Object.freeze(finding.sources.map((source) => Object.freeze({ ...source }))),
      counterEvidence: Object.freeze([...finding.counterEvidence]),
    }))),
    artifacts: Object.freeze([...input.artifacts]),
    readFootprint: Object.freeze([...input.readFootprint]),
    sharedSources: Object.freeze([]),
    status: input.status,
    limitations: Object.freeze([...(input.limitations ?? [])]),
    followUp: Object.freeze([...(input.followUp ?? [])]),
    createdAt: input.createdAt,
  });
}

/**
 * The independence audit. Two receipts that rest on the same ROOT source are not two independent
 * sources, no matter how different their prose is. A conflict is preserved, never resolved by count.
 */
export function assessIndependence(receipts: readonly CollaborationReceipt[]): IndependenceAssessment {
  const rootSources = new Map<string, string[]>();
  const claimRoots = new Map<string, Set<string>>();
  for (const receipt of receipts) {
    for (const root of new Set(receipt.readFootprint.map((entry) => entry.split("#")[0] ?? entry))) {
      const holders = rootSources.get(root) ?? [];
      holders.push(receipt.receiptId);
      rootSources.set(root, holders);
    }
    for (const finding of receipt.findings) {
      for (const source of finding.sources) {
        const set = claimRoots.get(finding.claim) ?? new Set<string>();
        set.add(source.rootId);
        claimRoots.set(finding.claim, set);
      }
    }
  }
  const duplicatedSources = [...rootSources.entries()].filter(([, holders]) => holders.length > 1).map(([root]) => root);
  const independentClaims = [...claimRoots.entries()].filter(([, roots]) => roots.size > 1).map(([claim]) => claim);
  const sharedClaimRoots = [...claimRoots.entries()]
    .filter(([, roots]) => roots.size === 1)
    .map(([claim, roots]) => ({ claim, rootId: [...roots][0]!, receipts: receipts.filter((receipt) => receipt.findings.some((finding) => finding.claim === claim)).map((receipt) => receipt.receiptId) }));

  const byClaim = new Map<string, { positive: string[]; negative: string[] }>();
  for (const receipt of receipts) {
    for (const finding of receipt.findings) {
      const entry = byClaim.get(finding.claim) ?? { positive: [], negative: [] };
      // A claim that is merely a hypothesis never counts as the positive side of a conflict.
      if (finding.hypothesis) entry.negative.push(receipt.receiptId);
      else entry.positive.push(receipt.receiptId);
      byClaim.set(finding.claim, entry);
    }
  }
  const conflicts = [...byClaim.entries()]
    .filter(([, entry]) => entry.positive.length > 0 && entry.negative.length > 0)
    .map(([claim, entry]) => ({ claim, receipts: [...entry.positive, ...entry.negative], detail: "the same claim is asserted and treated as an unresolved hypothesis by different receipts" }));

  return Object.freeze({
    receipts: receipts.length,
    uniqueRootSources: Object.freeze([...rootSources.keys()]),
    duplicatedSources: Object.freeze(duplicatedSources),
    independentClaims: Object.freeze(independentClaims),
    sharedClaimRoots: Object.freeze(sharedClaimRoots),
    conflicts: Object.freeze(conflicts),
    independentVerification: independentClaims.length > 0,
    detail:
      receipts.length < 2
        ? "fewer than two receipts: nothing here can be independent verification"
        : independentClaims.length > 0
          ? `independent support exists for: ${independentClaims.join("; ")}`
          : "every claim is supported by receipts that share a root source; multiple summaries are not independent evidence",
  });
}

/**
 * Which mechanism the product should suggest. An absent capability is named, never faked as a
 * serial run of the same executor.
 */
export function selectMechanism(input: MechanismInput): MechanismSelection {
  const wantsPeer = input.durablePeerNeeded || input.crossProjectNeeded;
  if (wantsPeer && input.crossProjectNeeded && !input.capabilities.crossProject) {
    return { executor: "UNAVAILABLE", why: "the task needs another project", use: "configure a project peer directory and federation", cost: "none until configured", capability: "cross-project transport is not composed" };
  }
  if (wantsPeer && !input.capabilities.durablePeer) {
    return { executor: "UNAVAILABLE", why: "the work must outlive this session", use: "configure a durable peer identity and transport", cost: "none until configured", capability: "durable peer is not composed" };
  }
  if (input.realParallelGain && input.capabilities.reasoningBranch) {
    return { executor: "REASONING_BRANCH", why: "genuine parallel exploration is useful and the branch result is exploratory", use: "palimpsest_collaborate PARALLEL or palimpsest_delegate", cost: "bounded branch budget", capability: "reasoning branch is composed" };
  }
  if ((input.independentInformation || input.crossCheck || input.complementaryDomain) && input.capabilities.nativeSubagent) {
    return { executor: "NATIVE_SUBAGENT", why: "an independent read or cross-check is useful, but the work is short-lived", use: "the native DSH subagent", cost: "one bounded subagent", capability: "native subagent is available" };
  }
  if ((input.independentInformation || input.crossCheck) && input.capabilities.managedWorkWorker) {
    return { executor: "MANAGED_WORK_WORKER", why: "the independent work must produce a governed result", use: "Work with an attempt and result acceptance", cost: "one bounded attempt", capability: "managed Work worker is composed" };
  }
  if (input.realParallelGain && !input.capabilities.reasoningBranch) {
    return { executor: "UNAVAILABLE", why: "parallel exploration was requested", use: "compose the reasoning branch, or use a native subagent if that is enough", cost: "none until configured", capability: "reasoning branch is not composed" };
  }
  return { executor: "PRINCIPAL_ONLY", why: "no independent contribution is justified", use: "the principal completes the work", cost: "no extra agent", capability: "the principal is always available" };
}
