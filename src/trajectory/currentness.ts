/**
 * Trajectory-T0 §4 (T0-C) — CURRENTNESS, and §9 — the minimal consumer-facing READ MODEL.
 *
 * The two belong together because the read model's whole job is to answer "what changed?" without
 * ever rewriting what happened. The rule this module exists to enforce:
 *
 *     Historical standing and current standing are DISTINCT.
 *
 * A simple digest difference may establish `CHANGED`. It does NOT by itself establish semantic
 * invalidity. So `STALE_BY_OWNER` is assigned only where the owning capability's own semantics
 * support it — a reasoning cell whose frontier no longer holds a claim, a proof claim whose
 * effective standing was recomputed from the current plane. Everywhere else the honest answer is
 * `CHANGED`, `UNAVAILABLE` or `UNKNOWN`.
 */
import type { TrajectoryBasisVector } from "./contract.js";
import type { TrajectoryProjection } from "./projection.js";
import type { Currentness, TrajectoryNode } from "./refs.js";

/** §4: the currentness of one historical fact, with the reason it was assigned. */
export interface CurrentnessVerdict {
  readonly nodeId: string;
  readonly historicalStatus: TrajectoryNode["epistemicStatus"];
  readonly currentness: Currentness;
  /** The owner capability that supplied the currentness basis, or NONE when none can. */
  readonly basisOwner: "WORK" | "REASONING" | "PROOF" | "WORKSPACE" | "NONE";
  readonly detail: string;
}

/**
 * §4: one owner's currentness assessment for a referenced fact.
 *
 * `hasOwnerCurrentnessSemantics` is the load-bearing field: when it is false, T0 refuses to assign
 * `STALE_BY_OWNER` and reports `CHANGED`/`UNKNOWN` instead. This is what keeps a digest difference
 * from being laundered into a semantic invalidation claim.
 */
export interface OwnerCurrentnessInput {
  readonly nodeId: string;
  readonly basisOwner: CurrentnessVerdict["basisOwner"];
  readonly hasOwnerCurrentnessSemantics: boolean;
  readonly historicalDigest: string | null;
  readonly currentDigest: string | null;
  readonly ownerVerdict: "CURRENT" | "STALE" | "UNKNOWN" | "UNAVAILABLE" | null;
  readonly detail: string;
}

/**
 * §4: classify one referenced fact's currentness.
 *
 * Precedence, in order: an unavailable owner is UNAVAILABLE; an owner with real currentness
 * semantics reports its own verdict; otherwise a digest difference is CHANGED (never STALE) and a
 * digest match is CURRENT.
 */
export function classifyCurrentness(input: OwnerCurrentnessInput, historicalStatus: TrajectoryNode["epistemicStatus"]): CurrentnessVerdict {
  const base = {
    nodeId: input.nodeId,
    historicalStatus,
    basisOwner: input.basisOwner,
  } as const;

  if (input.ownerVerdict === "UNAVAILABLE") {
    return Object.freeze({ ...base, currentness: "UNAVAILABLE" as const, detail: input.detail });
  }
  if (input.hasOwnerCurrentnessSemantics && input.ownerVerdict !== null) {
    const currentness: Currentness =
      input.ownerVerdict === "CURRENT" ? "CURRENT" : input.ownerVerdict === "STALE" ? "STALE_BY_OWNER" : "UNKNOWN";
    return Object.freeze({ ...base, currentness, detail: input.detail });
  }
  if (input.historicalDigest !== null && input.currentDigest !== null) {
    return Object.freeze({
      ...base,
      currentness: input.historicalDigest === input.currentDigest ? ("CURRENT" as const) : ("CHANGED" as const),
      detail:
        input.historicalDigest === input.currentDigest
          ? `${input.detail}; the digest is unchanged, so the fact is CURRENT`
          : `${input.detail}; the digest differs, which establishes CHANGED and NOT semantic invalidity`,
    });
  }
  return Object.freeze({
    ...base,
    currentness: "UNKNOWN" as const,
    detail: `${input.detail}; no owner currentness semantics and no comparable digest, so currentness is UNKNOWN rather than assumed`,
  });
}

/* ------------------------------------------------------------------ *
 * §9 Minimal consumer-facing read model
 * ------------------------------------------------------------------ */

/** §9: the questions the read model answers, as data. */
export interface TrajectoryReadModel {
  readonly schemaVersion: 1;
  readonly rootId: string;
  readonly projectId: string;
  /** §9: "What Project Basis does this trajectory describe?" */
  readonly describedBasis: {
    readonly projectIrRevision: number | null;
    readonly projectIrDigest: string | null;
    readonly workSequence: number | null;
    readonly workEventDigest: string | null;
    readonly completeness: TrajectoryBasisVector["completeness"];
    readonly unavailableOwners: readonly string[];
  };
  /** §9: "Which canonical events changed the project?" */
  readonly projectChangingEvents: readonly {
    readonly nodeId: string;
    readonly eventType: string;
    readonly projectSequence: number;
    readonly eventDigest: string;
  }[];
  /** §9: "Which Work Attempts produced accepted results?" */
  readonly attemptsWithResults: readonly {
    readonly attemptId: string;
    readonly attemptNodeId: string;
    readonly terminalNodeId: string;
    readonly evidenceState: string;
  }[];
  /** §9: "Which results were reopened?" */
  readonly reopenedAttempts: readonly {
    readonly originResultRef: string;
    readonly reopenedTaskId: string;
    readonly reworkNodeId: string;
    readonly evidenceState: string;
  }[];
  /** §9: "Which Reasoning/Proof Grounds informed accepted Intent changes?" */
  readonly acceptedIntentGrounds: readonly {
    readonly revisedNodeId: string;
    readonly groundKind: string;
    readonly groundIdentity: string;
    readonly groundNodeId: string;
    readonly evidenceState: string;
  }[];
  /** §9: "Which relationships remain unresolved?" */
  readonly unresolvedRelations: readonly string[];
  /** §9: "Which historical facts are now changed or stale?" */
  readonly changedOrStale: readonly CurrentnessVerdict[];
  /**
   * §9: "Which referenced assets can a future Agent safely resolve?"
   *
   * `SAFE_TO_RESOLVE` means the reference is VERIFIED_AGAINST_OWNER or RESOLVED_WITHOUT_DIGEST AND
   * its currentness is not UNAVAILABLE. It is a statement about resolvability, not a permission.
   */
  readonly resolvableReferences: readonly {
    readonly nodeId: string;
    readonly ownerPlane: string;
    readonly canonicalId: string;
    readonly resolvability: "SAFE_TO_RESOLVE" | "UNRESOLVED" | "CONFLICTING";
  }[];
  /**
   * §9 "No uncontrolled Context injection": the caveats a consumer must carry.
   *
   * T0 never injects the whole trajectory into a prompt. A future Context owner selects specific
   * references under existing authorization and budget rules; this list is what it must respect.
   */
  readonly caveats: readonly string[];
}

const PROJECT_CHANGING_EVENT_TYPES = new Set(["PROJECT_CREATED", "PROJECT_REVISED", "PROMOTION_COMMITTED"]);

/** §9: derive the read model from a completed projection. Pure — reads nothing further. */
export function buildTrajectoryReadModel(
  projection: TrajectoryProjection,
  currentness: readonly CurrentnessVerdict[],
): TrajectoryReadModel {
  const workEvents = projection.nodes.filter((node) => node.reference.ownerPlane === "WORK");
  const changedOrStale = currentness.filter((verdict) => verdict.currentness === "CHANGED" || verdict.currentness === "STALE_BY_OWNER");

  const projectChangingEvents = workEvents
    .filter((node) => {
      const eventType = node.label.split(" ")[0] ?? "";
      return PROJECT_CHANGING_EVENT_TYPES.has(eventType);
    })
    .map((node) => ({
      nodeId: node.nodeId,
      eventType: node.label.split(" ")[0] ?? "UNKNOWN",
      projectSequence: node.reference.sourceSequence ?? -1,
      eventDigest: node.reference.sourceDigest ?? "",
    }));

  const attemptsWithResults = projection.edges
    .filter((edge) => edge.relation === "ATTEMPT_PRODUCED_RESULT")
    .map((edge) => ({
      attemptId: projection.nodes.find((node) => node.nodeId === edge.fromNodeId)?.label.split(" ")[1] ?? "unknown",
      attemptNodeId: edge.fromNodeId,
      terminalNodeId: edge.toNodeId,
      evidenceState: edge.evidenceState,
    }));

  const reopenedAttempts = projection.edges
    .filter((edge) => edge.relation === "ATTEMPT_REOPENED_FOR_REWORK")
    .map((edge) => {
      const evidence = edge.evidence?.compared ?? {};
      return {
        originResultRef: evidence["originRef"] ?? "unknown",
        reopenedTaskId: evidence["taskId"] ?? "unknown",
        reworkNodeId: edge.toNodeId,
        evidenceState: edge.evidenceState,
      };
    });

  const acceptedIntentGrounds = projection.edges
    .filter((edge) => edge.relation === "RECEIPT_REFERENCED_GROUND")
    .map((edge) => {
      const fromNode = projection.nodes.find((node) => node.nodeId === edge.fromNodeId);
      return {
        revisedNodeId: edge.toNodeId,
        groundKind: fromNode?.reference.ownerPlane ?? "unknown",
        groundIdentity: fromNode?.reference.canonicalId ?? "unknown",
        groundNodeId: edge.fromNodeId,
        evidenceState: edge.evidenceState,
      };
    });

  const resolvableReferences = projection.nodes.map((node) => ({
    nodeId: node.nodeId,
    ownerPlane: node.reference.ownerPlane,
    canonicalId: node.reference.canonicalId,
    resolvability:
      node.reference.verification === "MISMATCH"
        ? ("CONFLICTING" as const)
        : (node.reference.verification === "VERIFIED_AGAINST_OWNER" || node.reference.verification === "RESOLVED_WITHOUT_DIGEST") &&
            node.currentness !== "UNAVAILABLE"
          ? ("SAFE_TO_RESOLVE" as const)
          : ("UNRESOLVED" as const),
  }));

  const caveats: string[] = [
    "Trajectory owns only the interpretation and presentation of references; every fact belongs to the owner that recorded it.",
    "Temporal adjacency is NOT causation: SAME_OWNER_SEQUENCE_SUCCESSOR edges are ordering only.",
    "There is no invented global clock: each owner history keeps its own sequence and digest basis.",
    "An unresolved edge is a diagnostic and never counts as verified provenance.",
  ];
  if (projection.basisVector.completeness !== "COMPLETE") {
    caveats.push(
      `This projection was built with an ${projection.basisVector.completeness} basis vector; it must not be presented as a globally consistent snapshot.`,
    );
  }
  if (projection.unresolved.length > 0) {
    caveats.push(`${String(projection.unresolved.length)} referenced relationship(s) remain unresolved and are excluded from established provenance.`);
  }
  if (projection.conflicts.length > 0) {
    caveats.push(`${String(projection.conflicts.length)} source conflict(s) were detected; the conflicting references are not established.`);
  }
  caveats.push(`Local host observations are admitted at most at ${projection.hostObservationAdmission}; they never establish an execution-causation edge.`);

  return Object.freeze({
    schemaVersion: 1 as const,
    rootId: projection.rootId,
    projectId: projection.projectId,
    describedBasis: Object.freeze({
      projectIrRevision: projection.basisVector.work.projectIrRevision,
      projectIrDigest: projection.basisVector.work.projectIrDigest,
      workSequence: projection.basisVector.work.projectSequence,
      workEventDigest: projection.basisVector.work.eventDigest,
      completeness: projection.basisVector.completeness,
      unavailableOwners: projection.basisVector.unavailable,
    }),
    projectChangingEvents: Object.freeze(projectChangingEvents),
    attemptsWithResults: Object.freeze(attemptsWithResults),
    reopenedAttempts: Object.freeze(reopenedAttempts),
    acceptedIntentGrounds: Object.freeze(acceptedIntentGrounds),
    unresolvedRelations: Object.freeze(projection.unresolved.map((entry) => `${entry.relation ?? "UNKNOWN"}:${entry.requestedIdentity}`)),
    changedOrStale: Object.freeze([...changedOrStale]),
    resolvableReferences: Object.freeze(resolvableReferences),
    caveats: Object.freeze(caveats),
  });
}
