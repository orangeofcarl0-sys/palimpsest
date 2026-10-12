/**
 * Trajectory-P2-C §6.1 — THE TRUSTED SOURCE BOUNDARY.
 *
 * P2-B matched a record's `sourceBasis` against a basis the CALLER supplied. That proves the two VALUES
 * agree; it does not establish that the verifier obtained its authority independently. This module is the
 * verifier's own authority: a set of TRUSTED SOURCE EPOCHS the deployment composition constructs from its
 * own configuration, never from a record and never from a handoff file.
 *
 * WHAT IT IS. A defensible LOCAL trusted-composition boundary: the deployment that actually wired the
 * worker port records which executable basis it trusted, classified by the deployment's own source kind.
 * The qualifier consults THIS, so:
 *
 *   · a record whose basis does not match any trusted epoch is refused;
 *   · a record whose KIND disagrees with the matching epoch's kind is refused, so a CONTROLLED_STUB
 *     record cannot ride a matching path-based basis into first-party verification (F3);
 *   · a record whose kind is not a SUPPORTED PRODUCER kind is refused even if a basis matches.
 *
 * WHAT IT IS NOT. It is NOT remote cryptographic attestation, NOT a content hash of the executable, and
 * NOT hardware identity. `computeTrustedSourceBasis` hashes executable PATH strings, so this boundary
 * distinguishes "the deployment was configured with this executable" from "the record claims this
 * executable" — it does not prove the bytes on disk were the expected ones. That limitation is stated
 * rather than papered over, and it is recorded in `source-basis-qualification.json`.
 *
 * HISTORICAL COMPATIBILITY. The registry holds a LIST of epochs, so a legitimate upgrade ADDS an epoch
 * rather than invalidating every historical association. A record is refused only when NO trusted epoch
 * matches it.
 *
 * Layer: L2 (`src/execution_association/`). Pure data and its validator; it owns no store and no runtime.
 */
import {
  SOURCE_KINDS,
  type SourceKind,
  type TrustedSourceBasis,
} from "./contract.js";

/**
 * §6.1: the source kinds that may participate in a FIRST-PARTY qualification.
 *
 * A `CONTROLLED_STUB` is deliberately absent: a test fixture can establish contract behavior but must
 * never become a first-party producer, no matter how its basis matches.
 */
export const SUPPORTED_PRODUCER_SOURCE_KINDS: readonly SourceKind[] = Object.freeze(["FIRST_PARTY_DSH_HOST"]);

/** §6.1: one trusted configuration of the producer, established by the deployment composition. */
export interface TrustedSourceEpoch {
  /** A stable id for this trusted configuration, so a record's provenance is nameable. */
  readonly epochId: string;
  readonly sourceKind: SourceKind;
  readonly sourceBasis: TrustedSourceBasis;
  /** When the deployment established this epoch. Provenance only — never an input to a decision. */
  readonly establishedAt?: string | undefined;
}

export interface TrustedSourceRegistry {
  readonly epochs: readonly TrustedSourceEpoch[];
  readonly supportedProducerKinds: readonly SourceKind[];
}

/** §6.1: build a registry from the deployment's OWN trusted epochs. */
export function makeTrustedSourceRegistry(input: {
  readonly epochs: readonly TrustedSourceEpoch[];
  readonly supportedProducerKinds?: readonly SourceKind[] | undefined;
}): TrustedSourceRegistry {
  if (input.epochs.length === 0) {
    throw new Error("a trusted source registry requires at least one epoch; an empty registry would refuse every association silently");
  }
  for (const epoch of input.epochs) {
    if (typeof epoch.epochId !== "string" || epoch.epochId.length === 0) throw new Error("a trusted source epoch requires a non-empty epochId");
    if (!(SOURCE_KINDS as readonly string[]).includes(epoch.sourceKind)) throw new Error(`trusted source epoch "${epoch.epochId}" has an unknown sourceKind "${String(epoch.sourceKind)}"`);
  }
  return Object.freeze({
    epochs: Object.freeze([...input.epochs]),
    supportedProducerKinds: Object.freeze([...(input.supportedProducerKinds ?? SUPPORTED_PRODUCER_SOURCE_KINDS)]),
  });
}

/**
 * §6.1: build a single-epoch registry from one basis.
 *
 * This is the LEGACY-shaped constructor: a caller that has one basis and no historical epochs gets a
 * registry that trusts exactly that basis, classified as a first-party host. It is the honest default for
 * a deployment that has only ever run one configuration.
 */
export function registryFromSingleBasis(basis: TrustedSourceBasis, sourceKind: SourceKind = "FIRST_PARTY_DSH_HOST"): TrustedSourceRegistry {
  return makeTrustedSourceRegistry({ epochs: [{ epochId: `epoch-${basis.workerBinDigest.slice(0, 12)}`, sourceKind, sourceBasis: basis }] });
}

const sameBasis = (a: TrustedSourceBasis, b: TrustedSourceBasis): boolean =>
  a.adapterId === b.adapterId &&
  a.workerBinBasename === b.workerBinBasename &&
  a.workerBinDigest === b.workerBinDigest &&
  a.nodeExecutableDigest === b.nodeExecutableDigest;

/** §6.1: the source-qualification outcome. A refusal names WHICH property failed. */
export type SourceQualificationOutcome =
  | { readonly ok: true; readonly epochId: string }
  | { readonly ok: false; readonly reason: "NO_TRUSTED_EPOCH_MATCHES" | "SOURCE_KIND_MISMATCH" | "UNSUPPORTED_PRODUCER_KIND"; readonly detail: string };

/**
 * §6.1: qualify ONE record's declared source against the verifier's own trusted epochs.
 *
 * The order matters: the kind must agree with the MATCHING epoch's kind, and the kind must be a supported
 * producer kind. A record can therefore not become first-party-verified by declaring a label, and a stub
 * cannot borrow a first-party basis.
 */
export function qualifyRecordSource(input: {
  readonly registry: TrustedSourceRegistry;
  readonly recordBasis: TrustedSourceBasis;
  readonly recordKind: SourceKind;
}): SourceQualificationOutcome {
  const matching = input.registry.epochs.filter((epoch) => sameBasis(epoch.sourceBasis, input.recordBasis));
  if (matching.length === 0) {
    return Object.freeze({
      ok: false as const,
      reason: "NO_TRUSTED_EPOCH_MATCHES" as const,
      detail: "the observation's source basis matches no trusted source epoch of this deployment, so the source is refused regardless of what the record declares about itself",
    });
  }
  if (!(input.registry.supportedProducerKinds as readonly string[]).includes(input.recordKind)) {
    return Object.freeze({
      ok: false as const,
      reason: "UNSUPPORTED_PRODUCER_KIND" as const,
      detail: `the observation declares source kind "${input.recordKind}", which is not a supported producer kind (${input.registry.supportedProducerKinds.join(", ")})`,
    });
  }
  const kindAgrees = matching.find((epoch) => epoch.sourceKind === input.recordKind);
  if (kindAgrees === undefined) {
    return Object.freeze({
      ok: false as const,
      reason: "SOURCE_KIND_MISMATCH" as const,
      detail: `the observation declares source kind "${input.recordKind}" but the trusted epoch with this basis is classified "${matching[0]!.sourceKind}"`,
    });
  }
  return Object.freeze({ ok: true as const, epochId: kindAgrees.epochId });
}
