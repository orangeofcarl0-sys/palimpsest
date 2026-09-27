/**
 * E2-I — GOVERNED PROJECT INTENT RECONCILIATION.
 *
 *     Observed Reality / Governed Assets → Grounded Intent Proposal → Currentness Assessment
 *       → Independent Semantic Authority → Existing ProjectIR Revision Path → Future Work
 *
 * ## The equation the whole stage turns on
 *
 *     bottom-up evidence may PROPOSE top-down change;
 *     it may never mutate top-down intent directly.
 *
 * So the service has exactly three verbs, and only the third writes:
 *
 *     prepare  → no canonical write (a proposal is a non-canonical artifact)
 *     assess   → no canonical write (a currentness observation)
 *     apply    → authority-gated, through the EXISTING revision owner
 *
 * ## What this service does NOT do
 *
 *   · it does not own intent — `ProjectIR`/`PROJECT_REVISED` does, unchanged;
 *   · it does not own evidence — Proof, Reasoning and the Journal keep their facts;
 *   · it does not author the next task plan (§22). It retires Work the old intent no longer
 *     authorizes, and ordinary planning creates future Work under the new intent;
 *   · it does not treat a proposal, a rationale, a management mode or a caller boolean as authority.
 *
 * Layer: L2 (`src/project_intent/`). Composition adapts the owners into `ProjectIntentPorts`.
 */
import { DomainValidationError } from "../domain/errors.js";

import {
  assertIntentProposal,
  intentProposalDigestOf,
  intentRefuse,
  materializeProjectIntentProposal,
  parseIntentChange,
  validateIntentChanges,
  type IntentGround,
  type IntentGroundRequest,
  type ProjectIntentChange,
  type ProjectIntentProposal,
} from "./proposal.js";
import {
  assertAuthorityOutcomeShape,
  materializeAcceptedIntentReconciliation,
  type AcceptedIntentReconciliationReceipt,
  type IntentCurrentnessAssessment,
  type IntentCurrentnessStatus,
  type ProjectIntentAdmissionPort,
} from "./receipt.js";
import {
  changeClassForIntentChanges,
  changedIdsForIntentChanges,
  revisionReasonFor,
  type IntentProjectFacts,
  type IntentReasoningFrontier,
  type ProjectIntentPorts,
} from "./ports.js";

export interface PrepareIntentProposalInput {
  readonly changes: readonly ProjectIntentChange[];
  readonly grounds: IntentGroundRequest;
  readonly rationale: string;
}

export interface PreparedIntentProposal {
  readonly proposal: ProjectIntentProposal;
  /** §10: the basis the proposal was frozen against, repeated for the caller's convenience. */
  readonly basis: { readonly projectId: string; readonly revision: number; readonly digest: string; readonly headCommit: string };
  /** §20: the invalidation strength this proposal WILL carry, derived here so it is inspectable early. */
  readonly changeClass: "behavior_change" | "contract_breaking";
  readonly changedIds: readonly string[];
}

export interface ApplyIntentProposalInput {
  readonly proposal: ProjectIntentProposal;
}

export interface ApplyIntentProposalOutcome {
  readonly status: "APPLIED" | "authority_unresolved" | "rejected" | "stale";
  readonly revision: number | null;
  readonly digest: string | null;
  readonly staledTaskIds: readonly string[];
  readonly receipt: AcceptedIntentReconciliationReceipt | null;
  readonly currentness: IntentCurrentnessAssessment;
  readonly detail: string;
}

export interface ProjectIntentService {
  /** §13: prepare a proposal. No canonical write; all grounds validate or nothing is produced. */
  prepare(input: PrepareIntentProposalInput): Promise<PreparedIntentProposal>;
  /** §16: assess a proposal's currentness against the live owners. No canonical write. */
  assess(input: { readonly proposal: ProjectIntentProposal }): Promise<IntentCurrentnessAssessment>;
  /** §19: authority decides the exact digest, then the EXISTING revision path applies it. */
  apply(input: ApplyIntentProposalInput): Promise<ApplyIntentProposalOutcome>;
}

export interface ProjectIntentServiceDeps {
  readonly ports: ProjectIntentPorts;
  /**
   * §17: the independent semantic authority. ABSENT means "this deployment has no authority", which
   * yields `authority_unresolved` — never an implicit approval.
   */
  readonly admission?: ProjectIntentAdmissionPort | undefined;
  readonly clock?: (() => string) | undefined;
}

const PROOF_STANDINGS = ["SUPPORTED", "PARTIALLY_SUPPORTED", "CONTRADICTED", "INCONCLUSIVE", "STALE"] as const;
const PROOF_FRESHNESS = ["fresh", "stale", "unknown"] as const;

export function makeProjectIntentService(deps: ProjectIntentServiceDeps): ProjectIntentService {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();
  const ports = deps.ports;

  /* ---------------------------------------------------------------- ground binding */

  /**
   * §8/§13: revalidate EVERY requested ground against its canonical owner and bind the historical
   * observation. Atomic: the first failing item refuses the whole preparation, so no partial ground set
   * can ever become a proposal.
   *
   * The request carries identity only; standing, freshness, basis, activity and the journal status are
   * all read from the owners here.
   */
  const bindGrounds = async (request: IntentGroundRequest): Promise<readonly IntentGround[]> => {
    const proofs = request.proof ?? [];
    const reasonings = request.reasoning ?? [];
    const negatives = request.negativeResults ?? [];
    if (proofs.length === 0 && reasonings.length === 0 && negatives.length === 0) {
      // §7: a proposal with zero grounds is not an E2-I proposal. Ordinary `plan()` remains available
      // for operator-authored revision.
      intentRefuse("INTENT_NO_GROUNDS", "an E2-I proposal requires at least one ground (proof, reasoning or negative result)");
    }

    const grounds: IntentGround[] = [];

    if (proofs.length > 0) {
      // §8: ONE self-consistent Proof observation window for every Proof ground.
      const basisBefore = await ports.proof.observeBasis();
      for (const item of proofs) {
        const claimId = item.claimId;
        const associated = await ports.projectAssets.associated("PROOF_CLAIM", claimId);
        if (!associated) {
          intentRefuse("INTENT_GROUND_NOT_PROJECT_ASSOCIATED", `Proof claim "${claimId}" is not associated with this project as PROOF_CLAIM`);
        }
        const observation = await ports.proof.observeClaim(claimId);
        if (observation.classified === "NOT_FOUND") intentRefuse("INTENT_GROUND_NOT_FOUND", `no Proof claim is recorded under "${claimId}"`);
        if (observation.classified === "NOT_PUBLISHED") intentRefuse("INTENT_GROUND_NOT_FOUND", `Proof candidate "${claimId}" was never published as a claim`);
        // §8: SUPPORTED is NOT required — a current CONTRADICTED claim may be exactly why the project
        // should change. Only STALE / non-fresh are ineligible.
        const standing = (PROOF_STANDINGS as readonly string[]).includes(observation.effectiveStanding)
          ? observation.effectiveStanding
          : "INCONCLUSIVE";
        const freshness = (PROOF_FRESHNESS as readonly string[]).includes(observation.freshness)
          ? observation.freshness
          : "unknown";
        if (standing === "STALE") intentRefuse("INTENT_PROOF_STALE", `Proof claim "${claimId}" has effectiveStanding STALE`);
        if (freshness !== "fresh") intentRefuse("INTENT_PROOF_STALE", `Proof claim "${claimId}" is not fresh (freshness=${freshness})`);
        grounds.push(
          Object.freeze({
            kind: "proof" as const,
            claimId,
            standingAtProposal: standing,
            freshnessAtProposal: freshness,
            proofBasisAtProposal: basisBefore ?? { scopeId: "", throughSeq: 0, chainDigest: "" },
            projectAssociation: "PROOF_CLAIM" as const,
          }),
        );
      }
      const basisAfter = await ports.proof.observeBasis();
      if (!sameProofBasis(basisBefore, basisAfter)) {
        intentRefuse("INTENT_GROUND_OBSERVATION_RACED", "the Proof plane advanced during ground observation, so no single consistent standing could be bound");
      }
    }

    if (reasonings.length > 0) {
      // Group by cell so ONE frontier read serves every claim of that cell.
      const byCell = new Map<string, string[]>();
      for (const item of reasonings) {
        const held = byCell.get(item.cellId);
        if (held === undefined) byCell.set(item.cellId, [item.claimId]);
        else held.push(item.claimId);
      }
      for (const cellId of [...byCell.keys()].sort()) {
        const associated = await ports.projectAssets.associated("REASONING_CELL", cellId);
        if (!associated) {
          intentRefuse("INTENT_GROUND_NOT_PROJECT_ASSOCIATED", `ReasoningCell "${cellId}" is not associated with this project as REASONING_CELL`);
        }
        const frontier = await ports.reasoning.observeFrontier(cellId);
        if (frontier === undefined) intentRefuse("INTENT_GROUND_NOT_FOUND", `ReasoningCell "${cellId}" does not exist`);
        const active = new Set(frontier.activeClaimIds);
        for (const claimId of (byCell.get(cellId) ?? []).slice().sort()) {
          if (!active.has(claimId)) {
            intentRefuse("INTENT_REASONING_INACTIVE", `Reasoning claim "${claimId}" is not an ACTIVE admitted claim of cell "${cellId}"`);
          }
          grounds.push(
            Object.freeze({
              kind: "reasoning" as const,
              cellId,
              claimId,
              frontierBasisAtProposal: Object.freeze({
                cellId: frontier.cellId,
                frontierRevision: frontier.frontierRevision,
                frontierDigest: frontier.frontierDigest,
              }),
              activeAtProposal: true as const,
              projectAssociation: "REASONING_CELL" as const,
            }),
          );
        }
      }
    }

    for (const item of negatives) {
      const entry = await ports.journal.entry(item.entryId);
      if (entry === undefined) intentRefuse("INTENT_GROUND_NOT_FOUND", `journal entry "${item.entryId}" does not exist`);
      // §28: the wrong project or the wrong kind is a refusal — a negative result is never silently
      // reinterpreted as evidence or as another journal kind.
      if (entry.projectId !== (await ports.project.facts()).projectId) {
        intentRefuse("INTENT_GROUND_NOT_PROJECT_ASSOCIATED", `journal entry "${item.entryId}" belongs to another project`);
      }
      if (entry.kind !== "NEGATIVE_RESULT") {
        intentRefuse("INTENT_NEGATIVE_RESULT_WRONG_KIND", `journal entry "${item.entryId}" is ${entry.kind}, not NEGATIVE_RESULT`);
      }
      grounds.push(
        Object.freeze({
          kind: "negative_result" as const,
          entryId: entry.entryId,
          entryDigest: entry.digest,
          projectId: entry.projectId,
          journalKind: "NEGATIVE_RESULT" as const,
          resolutionAtProposal: entry.resolution === null ? null : Object.freeze({ ...entry.resolution }),
        }),
      );
    }

    return Object.freeze(grounds);
  };

  /* ---------------------------------------------------------------- §16 currentness */

  const assessCurrentness = async (proposal: ProjectIntentProposal): Promise<IntentCurrentnessAssessment> => {
    const facts = await ports.project.facts();
    const observedBasis = {
      projectId: facts.projectId,
      revision: facts.revision,
      digest: facts.digest,
      headCommit: facts.headCommit,
    };
    const details: string[] = [];

    // §10: a proposal prepared against revision N cannot silently become one against N+1.
    const basisMoved =
      proposal.projectBasis.projectId !== observedBasis.projectId ||
      proposal.projectBasis.revision !== observedBasis.revision ||
      proposal.projectBasis.digest !== observedBasis.digest ||
      proposal.projectBasis.headCommit !== observedBasis.headCommit;
    if (basisMoved) {
      return Object.freeze({
        status: "STALE_PROJECT" as IntentCurrentnessStatus,
        details: Object.freeze([
          `the project basis moved from revision ${proposal.projectBasis.revision} to ${observedBasis.revision} — prepare a new proposal against the current basis`,
        ]),
        observedBasis,
      });
    }

    for (const ground of proposal.grounds) {
      if (ground.kind === "proof") {
        const associated = await ports.projectAssets.associated("PROOF_CLAIM", ground.claimId);
        if (!associated) {
          details.push(`Proof claim "${ground.claimId}" is no longer project-associated`);
          continue;
        }
        const observation = await ports.proof.observeClaim(ground.claimId);
        if (observation.classified !== "observed") {
          details.push(`Proof claim "${ground.claimId}" is no longer resolvable (${observation.classified})`);
          continue;
        }
        // §26: a standing/freshness change after the proposal makes it stale — the future proposal may
        // deliberately ground itself in the NEW standing.
        if (observation.effectiveStanding !== ground.standingAtProposal || observation.freshness !== ground.freshnessAtProposal) {
          details.push(
            `Proof claim "${ground.claimId}" moved from ${ground.standingAtProposal}/${ground.freshnessAtProposal} to ${observation.effectiveStanding}/${observation.freshness}`,
          );
        }
      } else if (ground.kind === "reasoning") {
        const associated = await ports.projectAssets.associated("REASONING_CELL", ground.cellId);
        if (!associated) {
          details.push(`ReasoningCell "${ground.cellId}" is no longer project-associated`);
          continue;
        }
        const frontier = await ports.reasoning.observeFrontier(ground.cellId);
        if (frontier === undefined) {
          details.push(`ReasoningCell "${ground.cellId}" no longer exists`);
          continue;
        }
        // §27: no old epistemic admission rides forward as current intent authority.
        if (!frontier.activeClaimIds.includes(ground.claimId)) {
          details.push(`Reasoning claim "${ground.claimId}" is no longer active in cell "${ground.cellId}"`);
        }
      } else {
        const entry = await ports.journal.entry(ground.entryId);
        if (entry === undefined) {
          details.push(`journal entry "${ground.entryId}" no longer exists`);
          continue;
        }
        if (entry.projectId !== facts.projectId) {
          details.push(`journal entry "${ground.entryId}" belongs to another project`);
          continue;
        }
        if (entry.kind !== "NEGATIVE_RESULT") {
          details.push(`journal entry "${ground.entryId}" is no longer a NEGATIVE_RESULT`);
          continue;
        }
        // §28: identity/digest is what the proposal bound; a changed digest is a different entry.
        if (entry.digest !== ground.entryDigest) {
          details.push(`journal entry "${ground.entryId}" content changed`);
        }
        // A later RESOLUTION does not rewrite the old proposal (§28/§29) — it is reported, not fatal.
      }
    }

    if (details.length > 0) {
      return Object.freeze({ status: "STALE_GROUND" as IntentCurrentnessStatus, details: Object.freeze(details), observedBasis });
    }
    return Object.freeze({ status: "CURRENT" as IntentCurrentnessStatus, details: Object.freeze([]), observedBasis });
  };

  /* ---------------------------------------------------------------- the three verbs */

  const prepare = async (input: PrepareIntentProposalInput): Promise<PreparedIntentProposal> => {
    const facts = await ports.project.facts();

    // §5: the change set is validated against the CURRENT intent before anything else. Parsing goes
    // through the strict parser, so a malformed or unknown-keyed change never reaches validation.
    const changes = input.changes.map((change) => parseIntentChange(change));
    validateIntentChanges(changes, {
      goal: facts.goal,
      requirements: facts.requirements.map((requirement) => ({
        requirement_id: requirement.requirement_id,
        statement: requirement.statement,
        priority: requirement.priority as "critical" | "high" | "normal" | "low",
        acceptance_refs: [...requirement.acceptance_refs],
      })),
      decisions: facts.decisions.map((decision) => ({
        decision_id: decision.decision_id,
        statement: decision.statement,
        rationale: decision.rationale,
        evidence_ids: [...decision.evidence_ids],
        supersedes: decision.supersedes,
      })),
    });

    // §13: bind every ground, atomically.
    const grounds = await bindGrounds(input.grounds);

    const proposal = materializeProjectIntentProposal({
      projectBasis: {
        projectId: facts.projectId,
        revision: facts.revision,
        digest: facts.digest,
        headCommit: facts.headCommit,
      },
      changes,
      grounds,
      rationale: input.rationale,
    });

    return Object.freeze({
      proposal,
      basis: Object.freeze({ ...proposal.projectBasis }),
      changeClass: changeClassForIntentChanges(proposal.changes),
      changedIds: changedIdsForIntentChanges(facts),
    });
  };

  const assess = async (input: { readonly proposal: ProjectIntentProposal }): Promise<IntentCurrentnessAssessment> => {
    const proposal = assertIntentProposal(input.proposal);
    // Re-derive the digest from the content: a proposal whose identity disagrees with its own content is
    // not the proposal it claims to be, and assessing it would be assessing a forgery.
    if (intentProposalDigestOf(proposal) !== proposal.digest) {
      intentRefuse("INTENT_CHANGE_INVALID", "the proposal digest does not match its content");
    }
    return assessCurrentness(proposal);
  };

  const apply = async (input: ApplyIntentProposalInput): Promise<ApplyIntentProposalOutcome> => {
    const proposal = assertIntentProposal(input.proposal);
    if (intentProposalDigestOf(proposal) !== proposal.digest) {
      intentRefuse("INTENT_CHANGE_INVALID", "the proposal digest does not match its content");
    }

    // §19 step 2: currentness BEFORE authority, so an authority is never asked about a proposal that is
    // already stale.
    const currentness = await assessCurrentness(proposal);
    if (currentness.status !== "CURRENT") {
      return Object.freeze({
        status: "stale" as const,
        revision: null,
        digest: null,
        staledTaskIds: Object.freeze([]),
        receipt: null,
        currentness,
        detail: `the proposal is ${currentness.status}: ${currentness.details.join("; ")}`,
      });
    }

    // §17/§24: no composed authority is NOT an implicit approval.
    const admission = deps.admission;
    if (admission === undefined) {
      return Object.freeze({
        status: "authority_unresolved" as const,
        revision: null,
        digest: null,
        staledTaskIds: Object.freeze([]),
        receipt: null,
        currentness,
        detail: "this deployment composes no project intent admission authority, so the proposal cannot be admitted",
      });
    }

    // §19 step 3: the authority decides the EXACT proposal digest.
    const rawDecision = await admission.decide({ proposal, currentness });
    const decision = assertAuthorityOutcomeShape(rawDecision);
    if (decision.proposalDigest !== proposal.digest) {
      // Approving "something like this" is not approving this proposal.
      return Object.freeze({
        status: "rejected" as const,
        revision: null,
        digest: null,
        staledTaskIds: Object.freeze([]),
        receipt: null,
        currentness,
        detail: `the authority decided a different proposal digest (${decision.proposalDigest}), not the presented one`,
      });
    }
    if (decision.decision !== "ADMIT") {
      return Object.freeze({
        status: decision.decision === "REJECT" ? ("rejected" as const) : ("authority_unresolved" as const),
        revision: null,
        digest: null,
        staledTaskIds: Object.freeze([]),
        receipt: null,
        currentness,
        detail: decision.detail ?? `the authority returned ${decision.decision}`,
      });
    }

    // §19 step 4: REVALIDATE basis + grounds immediately before the write. The authority approved a
    // digest; the world it described must still be the world it described.
    const revalidated = await assessCurrentness(proposal);
    if (revalidated.status !== "CURRENT") {
      return Object.freeze({
        status: "stale" as const,
        revision: null,
        digest: null,
        staledTaskIds: Object.freeze([]),
        receipt: null,
        currentness: revalidated,
        detail: `the proposal went ${revalidated.status} after the authority decision: ${revalidated.details.join("; ")}`,
      });
    }

    // §19 step 5: derive the accepted receipt, then commit through the EXISTING revision path.
    const facts = await ports.project.facts();
    const receipt = materializeAcceptedIntentReconciliation({ proposal, admission: decision, acceptedAt: now() });
    const applied = ports.applyAcceptedRevision({
      changes: proposal.changes,
      changeClass: changeClassForIntentChanges(proposal.changes),
      changedIds: changedIdsForIntentChanges(facts),
      reason: revisionReasonFor(proposal.changes),
      acceptedIntentReconciliation: receipt,
    });

    return Object.freeze({
      status: "APPLIED" as const,
      revision: applied.revision,
      digest: applied.digest,
      staledTaskIds: applied.staledTaskIds,
      receipt,
      currentness: revalidated,
      detail: `the accepted intent reconciliation committed as revision ${applied.revision}`,
    });
  };

  return Object.freeze({ prepare, assess, apply });
}

function sameProofBasis(left: { scopeId: string; throughSeq: number; chainDigest: string } | undefined, right: { scopeId: string; throughSeq: number; chainDigest: string } | undefined): boolean {
  if (left === undefined || right === undefined) return left === right;
  return left.scopeId === right.scopeId && left.throughSeq === right.throughSeq && left.chainDigest === right.chainDigest;
}

/** Re-exported so callers can build a typed change from raw input without reaching into proposal.ts. */
export { parseIntentChange };
export type { ProjectIntentChange };
export { DomainValidationError };
