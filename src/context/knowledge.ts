/**
 * E1-K §3–§14 — GOVERNED KNOWLEDGE SELECTION for context compilation.
 *
 *     Knowledge availability  ≠  automatic context inclusion
 *
 * This module is the CONTEXT OWNER's half of E1-K: it turns an EXPLICIT selection request (identity
 * only) into durable `KnowledgeBinding`s, after REVALIDATING every item against the canonical owners.
 * It defines the consumer-owned READ PORTS through which the context owner may look at admitted
 * knowledge, and the typed refusal that makes explicit selection ATOMIC and fail-closed.
 *
 * ## The three truths that stay separate (§9)
 *
 *     Project association  ≠  Proof standing  ≠  Reasoning standing
 *
 * A claim's membership in a project is a ProjectWorkspace fact. Its standing is a Proof fact. Its
 * activity is a Reasoning fact. The ports below keep those three reads apart, so context can never
 * mistake one owner's answer for another's — and so a physically shared database grants no
 * eligibility at all (§10).
 *
 * ## What this module is NOT
 *
 *   · it is NOT an owner. It declares no identity, lifecycle or mutation authority for any fact;
 *   · it stores NOTHING — no selection store, no request digest (§13/§18: the bindings ARE the record);
 *   · it copies NO claim body — the binding is a HISTORICAL presentation of owner facts;
 *   · it declares no universal reference (`UniversalCanonicalRef`, `KnowledgeRef {kind,id}`): the union
 *     is domain-specific on purpose (§7.2), because a standing is not a property of "an asset".
 *
 * Layer: L2 (`src/context/`). The composition adapts the canonical owners into `ContextKnowledgePorts`;
 * context owns all eligibility reasoning. `composition knows wiring; context knows context semantics.`
 */

/** §12: the Proof owner's OWN basis. Never a derived view digest (Basis ≠ DerivedViewDigest). */
export interface ProofBasisAtCompile {
  readonly scopeId: string;
  readonly throughSeq: number;
  readonly chainDigest: string;
}

/** §7.3: the Reasoning owner's frontier basis, recorded verbatim. */
export interface ReasoningFrontierBasisAtCompile {
  readonly cellId: string;
  readonly frontierRevision: number;
  readonly frontierDigest: string;
}

/**
 * §11: the standing vocabulary is preserved VERBATIM — a contradicted or inconclusive claim is
 * frequently informative inherited knowledge, so standing is NEVER translated to true/false.
 *
 * These literals MIRROR the Proof owner's `PROOF_CLAIM_STANDINGS` / `PROOF_FRESHNESS_STATES`. They are
 * re-stated here rather than imported because `src/context/` must not depend on `src/proof_asset/`
 * (the E1-K firewall); a targeted test pins that the two lists agree.
 */
export const KNOWLEDGE_PROOF_STANDINGS = [
  "SUPPORTED",
  "PARTIALLY_SUPPORTED",
  "CONTRADICTED",
  "INCONCLUSIVE",
  "STALE",
] as const;
export type KnowledgeProofStanding = (typeof KNOWLEDGE_PROOF_STANDINGS)[number];

export const KNOWLEDGE_PROOF_FRESHNESS = ["fresh", "stale", "unknown"] as const;
export type KnowledgeProofFreshness = (typeof KNOWLEDGE_PROOF_FRESHNESS)[number];

/** The project-asset kinds E1-K V1 may select. Both already exist in `PROJECT_ASSET_KINDS`. */
export const KNOWLEDGE_ASSET_KINDS = ["PROOF_CLAIM", "REASONING_CELL"] as const;
export type KnowledgeAssetKind = (typeof KNOWLEDGE_ASSET_KINDS)[number];

/* ------------------------------------------------------------------ *
 * The explicit selection request — IDENTITY ONLY (§4)
 * ------------------------------------------------------------------ */

/**
 * §4: the selector provides IDENTITY ONLY. It may NOT provide standing, freshness, basis, activity,
 * authority or preview — those are derived by the canonical owners during revalidation. There is no
 * field on this type for any of them, so a caller cannot even express the attempt.
 */
export interface KnowledgeSelectionRequest {
  readonly proof?: readonly { readonly claimId: string }[] | undefined;
  readonly reasoning?: readonly { readonly cellId: string; readonly claimId: string }[] | undefined;
}

/** A request that carries no items at all is ABSENT, not an empty selection (§7.4). */
export function knowledgeRequestIsEmpty(request: KnowledgeSelectionRequest | undefined): boolean {
  if (request === undefined) return true;
  return (request.proof?.length ?? 0) === 0 && (request.reasoning?.length ?? 0) === 0;
}

/* ------------------------------------------------------------------ *
 * The bindings — a domain-specific discriminated union (§7.2/§7.3)
 * ------------------------------------------------------------------ */

/**
 * §7.3: a Proof binding records the owner facts AT COMPILE TIME. It carries NO preview and NO copied
 * claim body: explicit selection already establishes relevance, and the manifest must remain a
 * historical BINDING rather than a partial knowledge cache.
 */
export interface ProofKnowledgeBinding {
  readonly kind: "proof";
  readonly proof_claim_id: string;
  readonly standing_at_compile: KnowledgeProofStanding;
  readonly freshness_at_compile: KnowledgeProofFreshness;
  readonly proof_basis_at_compile: ProofBasisAtCompile;
  readonly inclusion_reason: "explicit_request";
  readonly handle: string;
}

/** §7.3: a Reasoning binding records only ACTIVE admitted claims, so `active_at_compile` is `true`. */
export interface ReasoningKnowledgeBinding {
  readonly kind: "reasoning";
  readonly cell_id: string;
  readonly claim_id: string;
  readonly frontier_basis_at_compile: ReasoningFrontierBasisAtCompile;
  readonly active_at_compile: true;
  readonly inclusion_reason: "explicit_request";
  readonly handle: string;
}

export type KnowledgeBinding = ProofKnowledgeBinding | ReasoningKnowledgeBinding;

/** §9: the closed handle namespaces. There is deliberately NO `@ctx/knowledge/*` umbrella. */
export function proofKnowledgeHandle(claimId: string): string {
  return `@ctx/proof/${claimId}`;
}
export function reasoningKnowledgeHandle(cellId: string, claimId: string): string {
  return `@ctx/reasoning/${cellId}/${claimId}`;
}

/** The handle prefix a binding owns. Unknown namespaces fail closed (never a generic parser). */
export const PROOF_HANDLE_PREFIX = "@ctx/proof/";
export const REASONING_HANDLE_PREFIX = "@ctx/reasoning/";

/* ------------------------------------------------------------------ *
 * The consumer-owned READ PORTS (§10) — no mutation API is visible
 * ------------------------------------------------------------------ */

/**
 * The owner's answer about a claim's CURRENT standing and freshness. `classified` distinguishes the
 * two ways a claim can be unavailable, because that distinction is a Proof-owner fact (was a candidate
 * ever recorded? is it published?) and the Context owner must report it truthfully:
 *
 *   NOT_FOUND       nothing was ever recorded under this id
 *   NOT_PUBLISHED   a candidate exists but no claim was published from it
 */
export type ProofClaimObservation =
  | {
      readonly classified: "observed";
      readonly effectiveStanding: string;
      readonly freshness: string;
    }
  | { readonly classified: "NOT_FOUND" }
  | { readonly classified: "NOT_PUBLISHED" };

export function proofStandingAtCompile(value: string): KnowledgeProofStanding {
  return (KNOWLEDGE_PROOF_STANDINGS as readonly string[]).includes(value)
    ? (value as KnowledgeProofStanding)
    : "INCONCLUSIVE";
}
export function proofFreshnessAtCompile(value: string): KnowledgeProofFreshness {
  return (KNOWLEDGE_PROOF_FRESHNESS as readonly string[]).includes(value)
    ? (value as KnowledgeProofFreshness)
    : "unknown";
}

/**
 * THE PORTS. Every method here is a READ the canonical owner already answers. Project association is
 * its OWN capability because it is a ProjectWorkspace truth — Proof and Reasoning do not decide whether
 * one of their claims belongs to a project (§9/§10).
 *
 * Observation and materialization are DIFFERENT reads (§10.1): compilation asks "what was this claim's
 * eligible current standing at ONE stable basis?", and pull asks "what canonical body exists now, and
 * what is its current view?". One ambiguous `view()` is never used for both.
 */
export interface ContextKnowledgePorts {
  /** ProjectWorkspace READ: is this asset explicitly associated with THIS project? */
  readonly projectAssets?: {
    associated(projectId: string, kind: KnowledgeAssetKind, id: string): Promise<boolean>;
  } | undefined;

  /** Proof owner READ. Compile: `observeBasis` + `observeClaim`; Pull: `readClaim`. */
  readonly proofAssets?: {
    /** The Proof plane basis, for the §12 before/after race rule. */
    observeBasis(): Promise<ProofBasisAtCompile | undefined>;
    /** COMPILE read: current standing/freshness, or a classified absence. */
    observeClaim(claimId: string): Promise<ProofClaimObservation>;
    /** PULL read: the canonical body plus the CURRENT view. Never mutates compile-time fields. */
    readClaim(claimId: string): Promise<{ readonly body: unknown; readonly effectiveStanding: string; readonly freshness: string } | undefined>;
  } | undefined;

  /** Reasoning owner READ. Compile: `observeFrontier`; Pull: `readAdmittedClaim`. */
  readonly reasoningCells?: {
    /**
     * COMPILE read: ONE self-consistent frontier observation (basis + active admitted claims).
     * `undefined` means the cell is unknown. This is `frontier({cellId})` — a single state read, so
     * no race closure is required (§7.5).
     */
    observeFrontier(cellId: string): Promise<{ readonly basis: ReasoningFrontierBasisAtCompile; readonly activeClaims: readonly { readonly claimId: string }[] } | undefined>;
    /**
     * PULL read: an admitted claim's body + whether it is CURRENTLY active + the current frontier basis.
     * MUST still resolve a previously-admitted claim after it becomes inactive (§7.6).
     */
    readAdmittedClaim(cellId: string, claimId: string): Promise<{ readonly claim: unknown; readonly currentlyActive: boolean; readonly currentFrontierBasis: ReasoningFrontierBasisAtCompile } | undefined>;
  } | undefined;
}

/* ------------------------------------------------------------------ *
 * The typed refusal (§5/§7.4) — the whole selection is refused, atomically
 * ------------------------------------------------------------------ */

export const KNOWLEDGE_REFUSAL_REASONS = [
  "KNOWLEDGE_CAPABILITY_UNAVAILABLE",
  "KNOWLEDGE_NOT_PROJECT_ASSOCIATED",
  "KNOWLEDGE_NOT_FOUND",
  "KNOWLEDGE_NOT_PUBLISHED",
  "KNOWLEDGE_STALE",
  "KNOWLEDGE_REASONING_INACTIVE",
  "KNOWLEDGE_OBSERVATION_RACED",
  "KNOWLEDGE_SELECTION_BUDGET_EXCEEDED",
] as const;
export type KnowledgeRefusalReason = (typeof KNOWLEDGE_REFUSAL_REASONS)[number];

/**
 * A Context-owned typed refusal. Explicit selection is ATOMIC: if any requested item fails, the WHOLE
 * context compilation is refused BEFORE any `CONTEXT_MANIFEST_ADDED`. There is no partial success and
 * no silent omission.
 */
export class ContextKnowledgeRefusal extends Error {
  constructor(
    readonly kind: KnowledgeRefusalReason,
    readonly detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "ContextKnowledgeRefusal";
  }
}

function refuse(kind: KnowledgeRefusalReason, detail: string): never {
  throw new ContextKnowledgeRefusal(kind, detail);
}

/* ------------------------------------------------------------------ *
 * Revalidation — the ONLY path from a request to a binding
 * ------------------------------------------------------------------ */

/** Byte cost of one handle, the unit the boot budget accounts in (§7.8). */
export function knowledgeHandleBytes(handle: string): number {
  return Buffer.byteLength(handle, "utf8");
}

export interface ResolveKnowledgeInput {
  readonly projectId: string;
  readonly request: KnowledgeSelectionRequest | undefined;
  /** The read-through provider. `undefined` ⇒ the capability is not composed (§10.3). */
  readonly ports: ContextKnowledgePorts | undefined;
  /** The remaining boot budget the knowledge INDEX may occupy (§7.8). */
  readonly knowledgeBudgetBytes: number;
}

/**
 * Revalidate an explicit selection against the canonical owners and produce the durable bindings.
 *
 * Fail-closed and atomic: the first failing item refuses the entire request. Every read is a READ; this
 * function writes nothing and mutates nothing.
 *
 * The eligibility rules are exactly §11 (Proof) and §14 (Reasoning). The proof observation is wrapped
 * in the §12 `basisBefore → observeClaim → basisAfter` window so a concurrent write is reported as
 * `KNOWLEDGE_OBSERVATION_RACED` rather than quietly binding a torn observation. Bounded behavior: the
 * compile fails and the caller retries — there is NO retry loop here.
 */
export async function resolveKnowledgeBindings(input: ResolveKnowledgeInput): Promise<readonly KnowledgeBinding[]> {
  const { request } = input;
  if (knowledgeRequestIsEmpty(request)) return Object.freeze([]);
  const proofs = request?.proof ?? [];
  const reasonings = request?.reasoning ?? [];

  // §7.4/§10.3: an explicit request with no composed capability is UNAVAILABLE — never silently empty.
  const ports = input.ports;
  if (ports === undefined || ports.projectAssets === undefined) {
    refuse("KNOWLEDGE_CAPABILITY_UNAVAILABLE", "an explicit knowledge selection was requested but no project-association read capability is composed");
  }
  if (proofs.length > 0 && ports.proofAssets === undefined) {
    refuse("KNOWLEDGE_CAPABILITY_UNAVAILABLE", "an explicit Proof selection was requested but the Proof read capability is not composed");
  }
  if (reasonings.length > 0 && ports.reasoningCells === undefined) {
    refuse("KNOWLEDGE_CAPABILITY_UNAVAILABLE", "an explicit Reasoning selection was requested but the Reasoning read capability is not composed");
  }
  const projectAssets = ports.projectAssets!;
  const proofAssets = ports.proofAssets;
  const reasoningCells = ports.reasoningCells;

  const bindings: KnowledgeBinding[] = [];

  if (proofs.length > 0 && proofAssets !== undefined) {
    // §12: ONE self-consistent observation window for every Proof item. If the plane advanced anywhere
    // inside it, `basisBefore !== basisAfter` and the whole selection is refused.
    const basisBefore = await proofAssets.observeBasis();
    for (const item of proofs) {
      const claimId = item.claimId;

      // §10: project association is its own read, and physical shared-store visibility grants nothing.
      const associated = await projectAssets.associated(input.projectId, "PROOF_CLAIM", claimId);
      if (!associated) {
        refuse("KNOWLEDGE_NOT_PROJECT_ASSOCIATED", `Proof claim "${claimId}" is not associated with this project as PROOF_CLAIM`);
      }

      // §11: published AND resolvable.
      const observation = await proofAssets.observeClaim(claimId);
      if (observation.classified === "NOT_FOUND") {
        refuse("KNOWLEDGE_NOT_FOUND", `no Proof claim is recorded under "${claimId}"`);
      }
      if (observation.classified === "NOT_PUBLISHED") {
        refuse("KNOWLEDGE_NOT_PUBLISHED", `Proof candidate "${claimId}" was never published as a claim`);
      }

      // §11: current. STALE standing and non-fresh freshness are both "not current".
      const standing = proofStandingAtCompile(observation.effectiveStanding);
      const freshness = proofFreshnessAtCompile(observation.freshness);
      if (standing === "STALE") {
        refuse("KNOWLEDGE_STALE", `Proof claim "${claimId}" has effectiveStanding STALE`);
      }
      if (freshness !== "fresh") {
        refuse("KNOWLEDGE_STALE", `Proof claim "${claimId}" is not fresh (freshness=${freshness})`);
      }

      bindings.push(
        Object.freeze({
          kind: "proof" as const,
          proof_claim_id: claimId,
          standing_at_compile: standing,
          freshness_at_compile: freshness,
          proof_basis_at_compile: basisBefore ?? { scopeId: "", throughSeq: 0, chainDigest: "" },
          inclusion_reason: "explicit_request" as const,
          handle: proofKnowledgeHandle(claimId),
        }),
      );
    }
    const basisAfter = await proofAssets.observeBasis();
    if (!sameBasis(basisBefore, basisAfter)) {
      refuse("KNOWLEDGE_OBSERVATION_RACED", "the Proof plane advanced during knowledge observation, so no single consistent standing could be bound");
    }
  }

  if (reasonings.length > 0 && reasoningCells !== undefined) {
    // Group by cell so §14's ONE `frontier(cellId)` read serves every requested claim of that cell.
    const byCell = new Map<string, string[]>();
    for (const item of reasonings) {
      const held = byCell.get(item.cellId);
      if (held === undefined) byCell.set(item.cellId, [item.claimId]);
      else held.push(item.claimId);
    }
    for (const cellId of [...byCell.keys()].sort()) {
      // §9: the cell must be project-associated, checked by the ProjectWorkspace owner.
      const associated = await projectAssets.associated(input.projectId, "REASONING_CELL", cellId);
      if (!associated) {
        refuse("KNOWLEDGE_NOT_PROJECT_ASSOCIATED", `ReasoningCell "${cellId}" is not associated with this project as REASONING_CELL`);
      }
      // §14: exactly ONE frontier observation. Never `activeClaims()` + `frontier()` from two reads.
      const frontier = await reasoningCells.observeFrontier(cellId);
      if (frontier === undefined) {
        refuse("KNOWLEDGE_NOT_FOUND", `ReasoningCell "${cellId}" does not exist`);
      }
      const active = new Set(frontier.activeClaims.map((entry) => entry.claimId));
      for (const claimId of (byCell.get(cellId) ?? []).slice().sort()) {
        if (!active.has(claimId)) {
          // §5: the claim exists in the cell but is not in the CURRENT active frontier.
          refuse("KNOWLEDGE_REASONING_INACTIVE", `Reasoning claim "${claimId}" is not an ACTIVE admitted claim of cell "${cellId}"`);
        }
        bindings.push(
          Object.freeze({
            kind: "reasoning" as const,
            cell_id: cellId,
            claim_id: claimId,
            frontier_basis_at_compile: frontier.basis,
            active_at_compile: true as const,
            inclusion_reason: "explicit_request" as const,
            handle: reasoningKnowledgeHandle(cellId, claimId),
          }),
        );
      }
    }
  }

  // §12: deterministic order — proof before reasoning, then by identity, so the same request against
  // the same owner bases yields a byte-identical manifest.
  const ordered = bindings
    .slice()
    .sort((left, right) => {
      if (left.kind !== right.kind) return left.kind === "proof" ? -1 : 1;
      if (left.kind === "proof" && right.kind === "proof") return left.proof_claim_id < right.proof_claim_id ? -1 : left.proof_claim_id > right.proof_claim_id ? 1 : 0;
      if (left.kind === "reasoning" && right.kind === "reasoning") {
        if (left.cell_id !== right.cell_id) return left.cell_id < right.cell_id ? -1 : 1;
        return left.claim_id < right.claim_id ? -1 : left.claim_id > right.claim_id ? 1 : 0;
      }
      return 0;
    });

  // §7.8: the knowledge index is NOT a Work contract, so it must fit the remaining boot budget. It is
  // refused — never silently truncated — when the minimal explicit index cannot fit.
  const indexBytes = ordered.reduce((sum, binding) => sum + knowledgeHandleBytes(binding.handle), 0);
  if (indexBytes > input.knowledgeBudgetBytes) {
    refuse(
      "KNOWLEDGE_SELECTION_BUDGET_EXCEEDED",
      `the explicitly selected knowledge index needs ${indexBytes} bytes but only ${input.knowledgeBudgetBytes} remain in the boot budget`,
    );
  }

  return Object.freeze(ordered);
}

function sameBasis(left: ProofBasisAtCompile | undefined, right: ProofBasisAtCompile | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.scopeId === right.scopeId && left.throughSeq === right.throughSeq && left.chainDigest === right.chainDigest;
}
