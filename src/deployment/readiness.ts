/**
 * UX-C §30/§31 — the DERIVED, NON-AUTHORITATIVE host collaboration readiness view.
 *
 *   Readiness != Health        Readiness != Authority        Readiness != a score
 *
 * There is deliberately NO numeric score and NO semantic health truth here: every
 * field is a plain statement about whether a capability is COMPOSED in this
 * process. "Wired" never means "exercised" (§32), and a `DEGRADED`/`UNAVAILABLE`
 * row names a real absence rather than an empty state.
 */

export const HOST_COLLABORATION_READINESS_KEYS = [
  "advisor",
  "localExplore",
  "branchAdapter",
  "reasoningStore",
  "projectVerification",
  "crossProject",
  "inboundPump",
  "attention",
  "coldResume",
] as const;

export interface HostCollaborationReadiness {
  /** A memoryless advisor is still an advisor: DEGRADED means none is composed. */
  readonly advisor: "AVAILABLE" | "DEGRADED";
  /** The packaged local-Explore bundle is usable (a store AND a branch adapter exist). */
  readonly localExplore: "AVAILABLE" | "UNAVAILABLE";
  /** The host-supplied ephemeral branch adapter id, when one is composed. */
  readonly branchAdapter: string | undefined;
  readonly reasoningStore: "CONFIGURED" | "ABSENT";
  readonly projectVerification: "AVAILABLE" | "UNAVAILABLE";
  readonly crossProject: "AVAILABLE" | "UNAVAILABLE";
  readonly inboundPump: "CONFIGURED" | "ABSENT";
  /** `PULL` = attention derives signals but no host wake is bound. */
  readonly attention: "PULL" | "ACTIVE" | "ABSENT";
  /** The bound activation can cold-resume a persisted principal, not just a live one. */
  readonly coldResume: "AVAILABLE" | "UNAVAILABLE";
}

export interface HostCollaborationReadinessInput {
  readonly advisorPresent: boolean;
  readonly reasoningStoreConfigured: boolean;
  readonly branchAdapter?: string | undefined;
  readonly projectVerificationAvailable: boolean;
  readonly crossProjectAvailable: boolean;
  readonly inboundPumpConfigured: boolean;
  readonly attention: HostCollaborationReadiness["attention"];
  readonly coldResume: HostCollaborationReadiness["coldResume"];
}

/** Pure derivation; no store is read and nothing is executed. */
export function deriveHostCollaborationReadiness(input: HostCollaborationReadinessInput): HostCollaborationReadiness {
  return Object.freeze({
    advisor: input.advisorPresent ? ("AVAILABLE" as const) : ("DEGRADED" as const),
    localExplore:
      input.reasoningStoreConfigured && input.branchAdapter !== undefined
        ? ("AVAILABLE" as const)
        : ("UNAVAILABLE" as const),
    branchAdapter: input.branchAdapter,
    reasoningStore: input.reasoningStoreConfigured ? ("CONFIGURED" as const) : ("ABSENT" as const),
    projectVerification: input.projectVerificationAvailable ? ("AVAILABLE" as const) : ("UNAVAILABLE" as const),
    crossProject: input.crossProjectAvailable ? ("AVAILABLE" as const) : ("UNAVAILABLE" as const),
    inboundPump: input.inboundPumpConfigured ? ("CONFIGURED" as const) : ("ABSENT" as const),
    attention: input.attention,
    coldResume: input.coldResume,
  });
}
