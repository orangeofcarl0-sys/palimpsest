/**
 * Trajectory-P2-B §5 B0-C3 / §7.6 — TRUSTED INGESTION.
 *
 * This module is the ONLY sanctioned way an execution-identity observation becomes a durable record.
 * It exists to make §7.6 structural: a caller must not be able to inject an arbitrary
 * Attempt→Session relationship through a generic append and obtain producer-established status.
 *
 * HOW THE PROTECTION WORKS (and its honest limit).
 *
 *   1. The recorder is created by the DEPLOYMENT composition, bound to the deployment's own
 *      `TrustedSourceBasis` and `SourceKind`. It never reads a basis out of the observation.
 *   2. The recorder accepts ONLY the correlated observation shape (see `ObservedIdentityInput`) — the shape the Work
 *      Delegation correlation produces, whose `attemptId` came from `prepareMutatingWork` and whose
 *      `invocationId` was minted by the port. There is no field through which a caller could name a
 *      different Attempt or Invocation.
 *   3. It rejects any observation whose `source` is not `DIRECT_CHILD_IPC_REPORT`.
 *
 *   THE LIMIT, STATED PLAINLY. A caller who holds the raw `ExecutionAssociationStore` reference can
 *   still write a well-formed record — TypeScript branding would not stop it and a digest it computes
 *   itself would not help. That is why the DECISIVE protection is on the READ side (§9): qualification
 *   re-reads canonical Work, re-reads the real DSH Session header, and requires the record's
 *   `sourceBasis` to match the VERIFIER's own trusted basis. A fabricated record that does not match
 *   the real deployment basis is refused no matter what it declares about itself.
 *
 * Layer: L2 (`src/execution_association/`). It imports the L3 delegation contract types through the
 * public interaction module, which is an allowed L2→L3 direction for pure contract types — the same
 * shape `src/deployment/work_worker.ts` uses in the other direction. It owns no runtime and no authority.
 */
import { createHash } from "node:crypto";
import { basename } from "node:path";

import type { ObservedIdentityInput } from "./contract.js";
import {
  EXECUTION_ASSOCIATION_SCHEMA_VERSION,
  associationEventId,
  type ObservationWindowCloseReason,
  type SessionIdentityObservedPayload,
  type SourceKind,
  type TrustedSourceBasis,
} from "./contract.js";
import type { ExecutionAssociationStore } from "./store.js";

/**
 * §5 B0-C3: compute the trusted source basis from the DEPLOYMENT's own configuration.
 *
 * This is a defensible LOCAL provenance basis — digests of the configured executable paths and the
 * basename of the worker bin — NOT remote cryptographic attestation and NOT hardware identity. Its job
 * is to be a value the deployment computes and a verifier independently re-derives, so a record can be
 * checked against the deployment that was actually configured.
 */
export function computeTrustedSourceBasis(input: {
  readonly adapterId: string;
  readonly workerBin: string;
  readonly nodeExecPath: string;
}): TrustedSourceBasis {
  const digest = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
  return Object.freeze({
    adapterId: input.adapterId,
    workerBinBasename: basename(input.workerBin),
    workerBinDigest: digest(input.workerBin),
    nodeExecutableDigest: digest(input.nodeExecPath),
  });
}

/** §7.6: the recorder's outcome. A rejected observation is reported, never silently dropped. */
export type IngestionOutcome =
  | { readonly state: "RECORDED"; readonly eventId: string }
  | { readonly state: "IDEMPOTENT"; readonly eventId: string }
  | { readonly state: "REJECTED"; readonly reason: string };

export interface ExecutionAssociationRecorder {
  /** Record ONE correlated identity observation. Bound to this deployment's trusted basis. */
  recordIdentity(observation: ObservedIdentityInput): IngestionOutcome;
  /**
   * §8.1: record that the Invocation's observation window reached a terminal boundary. `observedCandidateCount`
   * is how many distinct identities this recorder has already committed for the invocation.
   */
  finalizeInvocation(input: {
    readonly attemptId: string;
    readonly invocationId: string;
    readonly closeReason: ObservationWindowCloseReason;
  }): IngestionOutcome;
  /**
   * §8.1/§8.2: finalize EVERY invocation this recorder has observed for ONE attempt. Called by the
   * deployment after the Work Delegation boundary's `run()` returned — the honest closure signal.
   */
  finalizeAttempt(input: {
    readonly attemptId: string;
    readonly closeReason: ObservationWindowCloseReason;
  }): readonly IngestionOutcome[];
  /** The trusted basis this recorder stamps, so a verifier can compare against its own. */
  readonly sourceBasis: TrustedSourceBasis;
  readonly sourceKind: SourceKind;
}

/**
 * §7.6: create the trusted recorder for ONE deployment.
 *
 * `sourceKind` is the deployment's own classification of the executable it configured. It is passed in
 * by the composition — a deployment that wires a real first-party DSH host says `FIRST_PARTY_DSH_HOST`;
 * a test that drives a controlled stub says `CONTROLLED_STUB`. The recorder cannot upgrade its own kind
 * from an observation.
 */
export function createExecutionAssociationRecorder(input: {
  readonly store: ExecutionAssociationStore;
  readonly projectId: string;
  readonly sourceBasis: TrustedSourceBasis;
  readonly sourceKind: SourceKind;
}): ExecutionAssociationRecorder {
  const candidateCounts = new Map<string, Set<string>>();
  const invocationsByAttempt = new Map<string, Set<string>>();

  return Object.freeze({
    sourceBasis: input.sourceBasis,
    sourceKind: input.sourceKind,

    recordIdentity(observation: ObservedIdentityInput): IngestionOutcome {
      const { attemptId, hostLocalJobId, observation: identity } = observation;
      /**
       * §7.6: only a direct-child IPC report is a producer observation. A caller-declared record has no
       * source on this path at all, and anything else is refused rather than coerced.
       */
      if (identity.source !== "DIRECT_CHILD_IPC_REPORT") {
        return Object.freeze({ state: "REJECTED" as const, reason: `untrusted source "${String(identity.source)}"` });
      }
      /**
       * P2-D0 §6.2: THE IDENTITY THIS MESSAGE ACTUALLY REPORTED.
       *
       * The transport reports the tracker's cumulative observation, whose `dshSessionId` is always the
       * FIRST observed identity. Persisting that field alone is exactly how a second, genuinely observed
       * identity is lost before durability (F1). `reportedSessionId` is the raw report of the current
       * message, so the durable candidate set becomes {A, B, C} rather than {A}. A caller that supplies
       * a single already-raw observation omits it, and `dshSessionId` is then the raw report.
       */
      const durableSessionId = identity.reportedSessionId ?? identity.dshSessionId;
      /**
       * §7.6: the payload is assembled HERE from the deployment's own basis plus the identities the
       * producer and Work already own. The `sourceQualificationDeclared` label is preserved for audit
       * ONLY — the read side never consults it.
       */
      const payload: SessionIdentityObservedPayload = Object.freeze({
        schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
        projectId: input.projectId,
        attemptId,
        invocationId: identity.invocationId,
        dshSessionId: durableSessionId,
        sourceBasis: input.sourceBasis,
        sourceKind: input.sourceKind,
        sourceQualificationDeclared: identity.sourceQualification,
        directChildPid: identity.directChildPid,
        hostLocalJobId: hostLocalJobId === "" ? null : hostLocalJobId,
      });
      const eventId = associationEventId({
        type: "SESSION_IDENTITY_OBSERVED",
        projectId: input.projectId,
        attemptId,
        invocationId: identity.invocationId,
        dshSessionId: durableSessionId,
      });
      const outcome = input.store.append({ eventId, projectId: input.projectId, type: "SESSION_IDENTITY_OBSERVED", payload });
      const seen = candidateCounts.get(identity.invocationId) ?? new Set<string>();
      seen.add(durableSessionId);
      candidateCounts.set(identity.invocationId, seen);
      const byAttempt = invocationsByAttempt.get(attemptId) ?? new Set<string>();
      byAttempt.add(identity.invocationId);
      invocationsByAttempt.set(attemptId, byAttempt);
      return Object.freeze({ state: outcome.state, eventId }) as IngestionOutcome;
    },

    finalizeInvocation(input2: {
      readonly attemptId: string;
      readonly invocationId: string;
      readonly closeReason: ObservationWindowCloseReason;
    }): IngestionOutcome {
      /**
       * The candidate count is read from the STORE rather than an in-memory map, so a finalization is
       * correct even for a recorder that did not itself ingest the observations — and so the recorded
       * count is a property of committed evidence rather than of this process's memory.
       */
      const candidateCount = input.store
        .replayForAttempt({ projectId: input.projectId, attemptId: input2.attemptId })
        .filter((event) => event.type === "SESSION_IDENTITY_OBSERVED" && event.payload.invocationId === input2.invocationId)
        .reduce((distinct, event) => distinct.add((event.payload as SessionIdentityObservedPayload).dshSessionId), new Set<string>()).size;
      const eventId = associationEventId({
        type: "INVOCATION_OBSERVATION_FINALIZED",
        projectId: input.projectId,
        attemptId: input2.attemptId,
        invocationId: input2.invocationId,
      });
      const outcome = input.store.append({
        eventId,
        projectId: input.projectId,
        type: "INVOCATION_OBSERVATION_FINALIZED",
        payload: Object.freeze({
          schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
          projectId: input.projectId,
          attemptId: input2.attemptId,
          invocationId: input2.invocationId,
          windowState: "CLOSED" as const,
          closeReason: input2.closeReason,
          observedCandidateCount: candidateCount,
        }),
      });
      return Object.freeze({ state: outcome.state, eventId }) as IngestionOutcome;
    },

    finalizeAttempt(input2: { readonly attemptId: string; readonly closeReason: ObservationWindowCloseReason }): readonly IngestionOutcome[] {
      /**
       * P2-D0 §7.1/§7.2: THIS METHOD IS NOT AN ATTEMPT-WIDE CLOSE.
       *
       * A terminal callback for ONE Job says nothing about the OTHER Invocations of the Attempt, so
       * closing all of them `CLOSED` would manufacture a boundary the Parent never observed (F6). The
       * only honest attempt-wide fact is that the PARENT process itself is ending, in which case every
       * open window becomes UNKNOWN rather than CLOSED — an unresolved boundary, which the window
       * validator correctly refuses to treat as a closure. The PRODUCT path never calls this; it
       * finalizes per Invocation from the Port's own observed child exit.
       */
      const invocations = [
        ...new Set(
          input.store
            .replayForAttempt({ projectId: input.projectId, attemptId: input2.attemptId })
            .filter((event) => event.type === "SESSION_IDENTITY_OBSERVED")
            .map((event) => event.payload.invocationId),
        ),
      ];
      const reason: ObservationWindowCloseReason = input2.closeReason === "CHILD_EXIT_OBSERVED" ? "PARENT_TERMINATED" : input2.closeReason;
      return Object.freeze(
        invocations.map((invocationId) => {
          const candidateCount = input.store
            .replayForAttempt({ projectId: input.projectId, attemptId: input2.attemptId })
            .filter((event) => event.type === "SESSION_IDENTITY_OBSERVED" && event.payload.invocationId === invocationId)
            .reduce((distinct, event) => distinct.add((event.payload as SessionIdentityObservedPayload).dshSessionId), new Set<string>()).size;
          const eventId = associationEventId({
            type: "INVOCATION_OBSERVATION_FINALIZED",
            projectId: input.projectId,
            attemptId: input2.attemptId,
            invocationId,
          });
          const outcome = input.store.append({
            eventId,
            projectId: input.projectId,
            type: "INVOCATION_OBSERVATION_FINALIZED",
            payload: Object.freeze({
              schemaVersion: EXECUTION_ASSOCIATION_SCHEMA_VERSION,
              projectId: input.projectId,
              attemptId: input2.attemptId,
              invocationId,
              windowState: "UNKNOWN" as const,
              closeReason: reason,
              observedCandidateCount: candidateCount,
            }),
          });
          return Object.freeze({ state: outcome.state, eventId }) as IngestionOutcome;
        }),
      );
    },
  });
}
