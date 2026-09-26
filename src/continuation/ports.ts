/**
 * PLMP-LEAN-1 §D5-d / SR-2 §八 — the CONTINUATION PORTS: what the continuation service is
 * allowed to know about the rest of Palimpsest.
 *
 *     Composition knows wiring;  service knows semantics.
 *
 * Before this file the service named its dependencies directly — `EventStore`,
 * `ProjectController` reads, the D3-R authorities (`CompatibilityIssuer`,
 * `ObservationRecorder`, `SourceChangeObserver`, `CrossBasisAdmissionRuntime`,
 * `CrossBasisAdmissionStore`, `RematerializationRuntime`, `ProjectWorldBasisRuntime`) and
 * `WorkDelegationService`. Every one of those is a real owner, and the service's algorithm was
 * never wrong — but its KNOWLEDGE RADIUS was, and it grew one authority at a time. This is the
 * signal SR-2 exists to fix:
 *
 *     the algorithm did not get out of hand; the dependency knowledge did.
 *
 * ## THE PORTS ARE STRUCTURAL, DELIBERATELY
 *
 * Every type here is plain data, exactly like `ResultSubjectRef` and
 * `ProjectWorldObservationPort` before it. The service must be able to describe "the task row I
 * need" without naming the module that stores it, or the next reader will reach for the
 * concrete type again and the wall will be decorative.
 *
 * ## WHAT IS *NOT* A PORT
 *
 * `assessContinuation` (D5-a) is NOT wrapped. It is a pure calculus over facts, it belongs to
 * continuation, and it is the service's own semantic core — SR-2c moves it to
 * `src/continuation/assessment.ts`. `ReworkAdmissionPermit` is not wrapped either: minting is
 * the service's authority and the D5-d proof pins it as the ONLY product-code caller.
 *
 * Layer: L3 (`src/continuation/`). Consumed by `service.ts`; implemented by
 * `src/composition/continuation.ts`, which is the one place allowed to see the concrete wiring.
 */

/** Which result, in the owner's namespace. Mirrors `ResultSubjectRef` structurally. */
export interface ContinuationResultRef {
  readonly kind: "ATTEMPT_RESULT" | "DERIVED_RESULT";
  readonly ref: string;
}

/** The result as its owner resolves it — the facts continuation reasons over, and nothing else. */
export interface ContinuationResolvedResult {
  readonly resultSubjectRef: ContinuationResultRef;
  readonly resultManifestDigest: string;
  readonly projectId: string;
  readonly taskId: string;
  /** The basis the result was produced from. */
  readonly originBasisDigest: string;
  readonly sourceResult: {
    readonly backend: string;
    readonly baseRevision: string;
    readonly resultRevision: string;
  } | null;
}

/**
 * D3-a's verdict, in the vocabulary D5-a consumes.
 *
 * `NONE` means the attempt never captured a basis at all — a fact, not a failure — and it is
 * distinct from `null` (no assessment was possible), which is why both are representable.
 */
export type ContinuationCurrentness = "CURRENT" | "STALE" | "UNKNOWN" | "NONE";

/** D3-b's conclusion as the service consumes it — the outcome plus the authority that issued it. */
export interface ContinuationCompatibility {
  readonly outcome: "EXACT" | "COMPATIBLE" | "INCOMPATIBLE" | "UNKNOWN";
  /** The certificate's identity, for recalling the AUTHORITY's copy rather than trusting a copy. */
  readonly issuanceDigest: string;
}

/** The observed target world, as a digest bound to certificates and permits alike. */
export interface ContinuationTargetObservation {
  readonly digest: string;
  readonly detail: string;
}

/**
 * THE WORLD PORT — "is this result still usable against the world as it is NOW?"
 *
 * It absorbs the whole D3-R chain (D3-a currentness, the authority-bearing observations, the
 * existing `CompatibilityIssuer`) and answers in continuation's own vocabulary. Continuation
 * then runs its own frozen calculus over the answer:
 *
 *     Facade = composition  ≠  second implementation
 *
 * Nothing here re-implements compatibility: the implementation calls the SAME issuer D3-c
 * admits through, so there is still exactly one compatibility engine.
 */
export interface ContinuationWorldPort {
  /** Fresh facts → D3-a → D3-b through the issuer. Resolves the result too, since it must. */
  inspect(input: { readonly result: ContinuationResultRef }): {
    readonly resolved: ContinuationResolvedResult | null;
    /** Null when no currentness assessment was possible at all (no captured basis to assess). */
    readonly currentness: ContinuationCurrentness | null;
    readonly targetObservation: ContinuationTargetObservation | null;
    /** Null when no certificate could be issued (no issuer, or no observable target). */
    readonly compatibility: ContinuationCompatibility | null;
  };
  /**
   * The target alone — the FINAL re-observation before the mint.
   *
   * `A(R, B1) does not authorize B2`, and the mint is the last moment the world can be checked
   * cheaply. Null when this deployment cannot observe a target at all.
   */
  observeTarget(taskId: string): ContinuationTargetObservation | null;
  /** Whether a rematerializer AND the records it needs are composed. A capability FACT. */
  readonly rematerializationAvailable: boolean;
  /**
   * Whether this attempt ever CAPTURED a world basis.
   *
   * D3-c's admission refuses a result whose provenance was never captured, so the fact has to
   * reach the admission — but it is a world fact, not a Work one, and it belongs here.
   */
  hasCapturedBasis(input: { readonly attemptId: string }): boolean;
}

/**
 * THE RESULT PORT — the effect side: admit a certificate, then carry the result.
 *
 * One call rather than three, because the three steps are one decision chain whose ORDER is its
 * semantics (D3-c admission ≺ D3-d carry) and a caller that could interleave them could admit
 * against one world and carry into another.
 */
export interface ContinuationResultPort {
  admitAndRematerialize(input: {
    readonly result: ContinuationResultRef;
    readonly resolved: ContinuationResolvedResult;
    /** The certificate to present; the AUTHORITY's recorded copy is what gets validated. */
    readonly issuanceDigest: string;
    readonly taskId: string;
    readonly hasBasis: boolean;
  }): Promise<{
    readonly state: "MATERIALIZED" | "REMATERIALIZATION_FAILED" | "ADMISSION_REFUSED" | "EFFECT_CAPABILITY_UNAVAILABLE";
    readonly admissionRef: string | null;
    readonly candidateRef: string | null;
    readonly detail: string;
  }>;
}

/** The task facts continuation needs. Every field is one an owner already projects. */
export interface ContinuationTaskFacts {
  readonly state: string;
  /** The batch whose completed candidate would be set aside. */
  readonly batchActivationEventId: number | null;
  readonly lastEventId: number;
  /** The envelope the task CURRENTLY carries — the E_0 a permit is spent against. */
  readonly envelopeId: string | null;
}

/** One attempt's facts, as the Work owner projects them. */
export interface ContinuationAttemptFacts {
  readonly taskId: string;
  readonly state: string;
  readonly batchActivationEventId: number | null;
}

/**
 * THE WORK PORT — the Work facts, and the ONE governed append.
 *
 * The service no longer reads the Event Log. Deciding "has this result already been reopened?"
 * by scanning events was the service interpreting the log's shape, which is the Work owner's
 * job; it now asks a question instead.
 */
export interface ContinuationWorkPort {
  task(taskId: string): ContinuationTaskFacts | null;
  attempt(attemptId: string): ContinuationAttemptFacts | null;
  /** A nonterminal attempt holding the mutating lane, or null. */
  openAttempt(taskId: string): { readonly attemptId: string; readonly state: string } | null;
  /**
   * THE DURABLE REPLAY QUERY (§17): has a governed TASK_READY already reopened THIS result?
   *
   * `the record decides replay, not the old ephemeral permit`
   */
  reworkLineage(input: { readonly taskId: string; readonly resultRef: string }): { readonly eventId: number } | null;
  /**
   * Append the governed reopening — the ONE seam that can spend a permit.
   *
   * The permit is MINTED BY THE SERVICE and passed in: the work port cannot create one, which is
   * what keeps the D5-d mint surface unique.
   */
  reopen(input: {
    readonly taskId: string;
    readonly batchActivationEventId: number;
    readonly lastEventId: number;
    readonly permit: import("../domain/rework_admission.js").ReworkAdmissionPermit;
    readonly assessmentDigest: string;
  }): number;
}

/**
 * THE CANONICAL PROJECT PORT — the head authority, and nothing else.
 *
 * `Continuation does not know PromotionManager.` It asks whether the head is the task's current
 * authorization basis and, if not, asks the EXISTING G10-X authority to reconcile.
 */
export interface ContinuationCanonicalPort {
  /** The canonical authority picture a mint is made under. */
  targetFence(): import("../domain/rework_admission.js").ReworkTargetFence;
  reconcileHead(): Promise<{
    readonly status: "in_sync" | "reconciled" | "blocked";
    readonly blockers?: readonly string[];
  }>;
}

/**
 * THE EXECUTION PORT — "run this task's work", and nothing about how.
 *
 * Below it is D2-d's `WorkDelegationService`, unchanged. The service does not know that a
 * worker exists, what a job is, or how a world is prepared.
 */
export interface ContinuationExecutionPort {
  startOrResume(input: { readonly taskId: string }): Promise<{ readonly jobId: string }>;
}

/** The five capabilities, as the service consumes them. */
export interface ResultContinuationPorts {
  readonly projectId: string;
  readonly work: ContinuationWorkPort;
  readonly world: ContinuationWorldPort;
  readonly result: ContinuationResultPort;
  readonly canonical: ContinuationCanonicalPort;
  /** Absent ⇒ this deployment cannot start work; the service reports it honestly. */
  readonly execution: ContinuationExecutionPort | null;
  readonly clock?: (() => string) | undefined;
}
