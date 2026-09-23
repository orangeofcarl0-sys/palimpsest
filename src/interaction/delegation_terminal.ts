/**
 * PLMP-LEAN-1 §C.11 ③: the terminal delivery seam — what the PRINCIPAL is told, and what it is not.
 *
 *     Notification  ≠  Result truth
 *
 * The truth about a delegation is derived from ReasoningCell (see `./delegation.js`). This module only
 * decides how a terminal result REACHES the principal, and it deliberately owns no state that could
 * disagree with the canonical one:
 *
 *   - it is host-local and in-memory, and claims no crash durability. If the process dies before the
 *     delivery, `status`/`inspect` still answer honestly, and v1 does not pretend a notification
 *     queue survived;
 *   - a delivery FAILURE is recorded as exactly that. It never rewrites the research outcome, never
 *     re-settles the branch, and never retries (the delegation runtime already guarantees at most one
 *     terminal projection per ref);
 *   - the text carries the BASIS and the CONCLUSION, because those are decision evidence, and it
 *     carries no cell id, branch id or delegation ref, because those are orchestration detail.
 *
 * It does NOT go through the canonical `AttentionService`: that plane's ontology is peer signals,
 * boundary decisions and commitments. A local research branch finishing is none of those, and minting
 * an `AttentionSignal` for it would widen a frozen semantic surface to carry a host notification.
 *
 * INTERNAL: not re-exported by the interaction barrel, so it stays out of the package public API.
 */
import type { DelegationTerminalProjection } from "./delegation.js";

/**
 * The RAW host primitive: "deliver this text to the principal". The host supplies it (a DSH
 * `agent.followup`, a Pi message, a test recorder); everything above it — what is terminal, what the
 * text says, what a failure means — is decided here.
 */
export interface PrincipalDeliveryPort {
  readonly adapterId: string;
  deliver(text: string): Promise<{ readonly delivered: boolean; readonly detail: string }>;
}

export interface PrincipalDeliveryRecord {
  readonly delegationRef: string;
  readonly state: DelegationTerminalProjection["state"];
  readonly delivered: boolean;
  readonly detail: string;
}

export interface PrincipalTerminalComposer {
  /** The `onTerminal` seam of the delegation service: synchronous, and it never throws. */
  readonly onTerminal: (projection: DelegationTerminalProjection) => void;
  /** What was attempted, in order. Best-effort delivery: a failure is reported, never retried. */
  readonly deliveries: readonly PrincipalDeliveryRecord[];
}

/** A basis is a commit: twelve characters is enough to name it and not enough to mistake it for a ref. */
function shortBasis(basisCommit: string): string {
  return basisCommit.slice(0, 12);
}

/**
 * The standing sentence is not decoration. §C.11 ④ makes a research branch's conclusion cell-local
 * exploratory standing, and a principal that reads "the cache race is in invalidate()" without that
 * sentence would reasonably treat it as a verified fact about the project.
 */
const STANDING = "Standing: cell-local exploratory finding; not Work Evidence or Project Verification.";

export function principalTerminalText(projection: DelegationTerminalProjection): string {
  const lines: string[] = [];
  if (projection.state === "COMPLETED") {
    lines.push("Delegated research completed.");
    lines.push(`Basis: ${shortBasis(projection.basisCommit)}`);
    lines.push(`Exploratory conclusion: ${projection.conclusion ?? "(the branch was admitted without a statement)"}`);
  } else if (projection.state === "FAILED") {
    lines.push("Delegated research ended without an admissible conclusion.");
    lines.push(`Basis: ${shortBasis(projection.basisCommit)}`);
    lines.push(`Detail: ${projection.detail}`);
  } else if (projection.state === "INTERRUPTED") {
    lines.push("Delegated research is no longer running (the process that ran it is gone).");
    lines.push(`Basis: ${shortBasis(projection.basisCommit)}`);
    lines.push(`Detail: ${projection.detail}`);
  } else {
    lines.push("Delegated research ended in a state this deployment cannot interpret.");
    lines.push(`Basis: ${shortBasis(projection.basisCommit)}`);
    lines.push(`Detail: ${projection.detail}`);
  }
  lines.push(STANDING);
  return lines.join("\n");
}

export function makePrincipalTerminalComposer(input: {
  readonly deliver: PrincipalDeliveryPort;
}): PrincipalTerminalComposer {
  const deliveries: PrincipalDeliveryRecord[] = [];
  const record = (entry: PrincipalDeliveryRecord): void => {
    deliveries.push(Object.freeze(entry));
  };
  const onTerminal = (projection: DelegationTerminalProjection): void => {
    const text = principalTerminalText(projection);
    let pending: Promise<{ readonly delivered: boolean; readonly detail: string }>;
    try {
      pending = input.deliver.deliver(text);
    } catch (error) {
      record({
        delegationRef: projection.delegationRef,
        state: projection.state,
        delivered: false,
        detail: `delivery failed: ${error instanceof Error ? error.message : String(error)}`,
      });
      return;
    }
    void Promise.resolve(pending).then(
      (outcome) => record({ delegationRef: projection.delegationRef, state: projection.state, ...outcome }),
      (error: unknown) =>
        record({
          delegationRef: projection.delegationRef,
          state: projection.state,
          delivered: false,
          detail: `delivery failed: ${error instanceof Error ? error.message : String(error)}`,
        }),
    );
  };
  return Object.freeze({ deliveries, onTerminal });
}
