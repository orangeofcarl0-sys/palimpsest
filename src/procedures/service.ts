/**
 * E5-P §24/§25/§27 — the PROCEDURE SERVICE: experience → grounded candidate → governed admission →
 * durable revision, plus the standing/supersession lifecycle.
 *
 *     prepare  = no canonical write (a candidate is a VALUE)
 *     assess   = no canonical write (a grounding + supersession observation)
 *     publish  = authority-gated EXISTING store append
 *
 * §24: the LIVE path must extract a method from DURABLE experience. `prepare` therefore reads the
 * empirical grounds through the owner's read port and REFUSES when none of them resolves — a
 * candidate may not be authored against evidence that does not exist. There is deliberately no
 * verb that accepts a finished body and publishes it: `publish` takes a CANDIDATE, and a candidate
 * can only be obtained from `prepare`.
 *
 * ## Procedure identity (§8/§25) — stated, never guessed
 *
 * A candidate's semantic identity is its CONTENT, so a revision cannot derive its `procedureId`
 * from that content: the whole point of a revision is that the content changed. The identity is
 * therefore carried EXPLICITLY. `prepare` answers with the `procedureId` the candidate belongs to
 * — the one the caller named when revising, or the candidate's own id for a first publication —
 * and `publish` takes that id back. Nothing is inferred from a project id or a coincidence.
 *
 * §25: supersession is a first-class path. `publish` resolves the CURRENT ACTIVE revision of that
 * procedure and links the new revision to it via `supersedes`; the old revision's row is never
 * touched, and the derived standing moves from ACTIVE to SUPERSEDED.
 *
 * §10: this service holds no authority. When no admission port is composed, `publish` answers
 * `admission_unresolved` and writes NOTHING. It never defaults to admitting, and no caller
 * boolean, management mode or authoring result can stand in for the authority.
 *
 * Layer: L2 (`src/procedures/`).
 */

import {
  assertProcedureAdmissionOutcomeShape,
  assertProcedureAuthoringResult,
  materializeProcedureAdmissionProvenance,
  type ProcedureAdmissionOutcome,
  type ProcedureAdmissionPort,
  type ProcedureAuthoringPort,
  type ProcedurePorts,
} from "./admission.js";
import { materializeProcedureCandidate, type ProcedureCandidate, type ProcedureGround, type ProcedureGroundKind } from "./candidate.js";
import { ProcedureContentError } from "./content.js";
import {
  currentProcedureRevision,
  deriveProcedureStandings,
  materializeProcedureRevision,
  procedureRefKey,
  procedureRefOf,
  sameProcedureRef,
  type ProcedureRef,
  type ProcedureRevision,
  type ProcedureStandingView,
} from "./revision.js";
import {
  publishedRevisionsOf,
  procedureRevisionPublishedEvent,
  procedureRetiredEvent,
  retirementsOf,
  type ProcedureEventDraft,
  type ProcedureStore,
} from "./store.js";

/** §27: the typed refusals the procedure face answers with. Nothing here is an authority. */
export const PROCEDURE_REFUSAL_REASONS = [
  "PROCEDURE_NO_EMPIRICAL_GROUND",
  "PROCEDURE_GROUND_UNKNOWN",
  "PROCEDURE_AUTHORING_UNRESOLVED",
  "PROCEDURE_AUTHORING_UNAVAILABLE",
  "PROCEDURE_AUTHORING_INVALID",
  "PROCEDURE_ADMISSION_DIGEST_MISMATCH",
  "PROCEDURE_UNKNOWN",
  "PROCEDURE_ASSOCIATION_UNAVAILABLE",
  "PROCEDURE_REVISION_NOT_ACTIVE",
] as const;
export type ProcedureRefusalReason = (typeof PROCEDURE_REFUSAL_REASONS)[number];

export class ProcedureRefusal extends Error {
  constructor(
    readonly kind: ProcedureRefusalReason,
    readonly detail: string,
  ) {
    super(`${kind}: ${detail}`);
    this.name = "ProcedureRefusal";
  }
}

function refuse(kind: ProcedureRefusalReason, detail: string): never {
  throw new ProcedureRefusal(kind, detail);
}

/* ------------------------------------------------------------------ *
 * The views
 * ------------------------------------------------------------------ */

export interface ProcedureGroundRequest {
  readonly kind: ProcedureGroundKind;
  readonly ref: string;
}

export interface PrepareProcedureInput {
  /** §6: the empirical grounds the method must be extracted from. At least one is required. */
  readonly grounds: readonly ProcedureGroundRequest[];
  /** §7: what the authoring seam is told about the project. */
  readonly projectContext: {
    readonly projectId: string;
    readonly projectRevision: number;
    readonly projectDigest: string;
    readonly objective: string;
  };
  /**
   * §25: the procedure this candidate REVISES. Absent ⇒ the candidate becomes a NEW procedure and
   * its own content-addressed id names it.
   */
  readonly procedureId?: string | undefined;
}

/** §8/§10: what `prepare` returns — a VALUE plus the identity and grounding facts an authority needs. */
export interface PreparedProcedure {
  readonly procedureId: string;
  readonly candidate: ProcedureCandidate;
  readonly groundsResolved: boolean;
  readonly groundCount: number;
  /** §25: the CURRENT ACTIVE revision this candidate would supersede, when revising. */
  readonly supersedes?: ProcedureRef | undefined;
}

/** §10/§11: the derived assessment. It observes; it does not decide. */
export interface ProcedureAssessment {
  readonly procedureId: string;
  readonly candidateId: string;
  readonly candidateDigest: string;
  readonly groundsResolved: boolean;
  readonly groundCount: number;
  readonly unresolvedGrounds: readonly string[];
  readonly supersedes?: ProcedureRef | undefined;
  /** §10: whether an independent authority is composed at all. */
  readonly admissionAvailable: boolean;
}

export interface PublishProcedureInput {
  /** The identity `prepare` answered with — stated, never re-derived from the content. */
  readonly procedureId: string;
  readonly candidate: ProcedureCandidate;
}

export interface PublishProcedureOutcome {
  readonly status: "published" | "rejected" | "admission_unresolved";
  readonly ref?: ProcedureRef | undefined;
  readonly revision?: ProcedureRevision | undefined;
  /** §25: the revision this publication superseded, when it was a revision. */
  readonly superseded?: ProcedureRef | undefined;
  readonly decision?: ProcedureAdmissionOutcome | undefined;
}

export interface ProcedureHistoryEntry {
  readonly revision: ProcedureRevision;
  readonly ref: ProcedureRef;
  readonly standing: ProcedureStandingView["standing"];
  readonly supersededBy?: ProcedureRef | undefined;
  readonly retiredReason?: string | undefined;
}

export interface ProcedureView {
  readonly procedureId: string;
  readonly current?: ProcedureHistoryEntry | undefined;
  readonly history: readonly ProcedureHistoryEntry[];
}

export interface ProcedureService {
  /** §24: experience → grounded candidate. Writes nothing. */
  prepare(input: PrepareProcedureInput): Promise<PreparedProcedure>;
  /** §10: the derived grounding/supersession observation. Writes nothing. */
  assess(input: { readonly procedureId: string; readonly candidate: ProcedureCandidate }): Promise<ProcedureAssessment>;
  /** §10: authority-gated publication. The ONLY writer. */
  publish(input: PublishProcedureInput): Promise<PublishProcedureOutcome>;
  /** §13: resolve an exact digest-bound ref, or undefined. */
  get(ref: ProcedureRef): Promise<ProcedureRevision | undefined>;
  /**
   * E5-P §12/§16: the procedure's OWN append-only chain basis.
   *
   * This is the owner's REAL basis (scope id + tail seq + tail chain digest), not a derived view
   * digest — the context owner wraps its observation in a before/after window over exactly this
   * value to detect a concurrent publication. A derived digest would not move when a revision is
   * appended, so it could not detect the race it exists to detect.
   */
  basis(procedureId: string): Promise<{ readonly procedureId: string; readonly throughSeq: number; readonly chainDigest: string } | undefined>;
  /** §12: the full derived history of one procedure, oldest first, with derived standing. */
  history(procedureId: string): Promise<ProcedureView>;
  /** §27: every procedure id this owner holds. */
  procedures(): Promise<readonly string[]>;
  /** §12/§25: explicitly retire an ACTIVE revision. An append, never a rewrite. */
  retire(ref: ProcedureRef, reason: string): Promise<ProcedureStandingView>;
  /** §14: explicitly associate the exact revision with the project. */
  associate(input: { readonly projectId: string; readonly ref: ProcedureRef }): Promise<void>;
}

export interface ProcedureServiceDeps {
  readonly store: ProcedureStore;
  /** §7: the UNTRUSTED authoring seam. Absent ⇒ `prepare` refuses honestly. */
  readonly authoring?: ProcedureAuthoringPort | undefined;
  /** §10: the INDEPENDENT admission authority. Absent ⇒ `publish` answers `admission_unresolved`. */
  readonly admission?: ProcedureAdmissionPort | undefined;
  readonly ports?: ProcedurePorts | undefined;
  readonly clock?: (() => string) | undefined;
}

export function makeProcedureService(deps: ProcedureServiceDeps): ProcedureService {
  const store = deps.store;
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();
  const ports = deps.ports;

  /**
   * §6: resolve the requested grounds through the owner's read port. An unresolvable ref is
   * reported, never silently dropped: a candidate authored against missing evidence would be
   * exactly the ungrounded method the ruling forbids.
   */
  async function resolveGrounds(
    requests: readonly ProcedureGroundRequest[],
  ): Promise<{ readonly grounds: readonly ProcedureGround[]; readonly unresolved: readonly string[] }> {
    const grounds: ProcedureGround[] = [];
    const unresolved: string[] = [];
    for (const request of requests) {
      const observation = await ports?.grounds?.observe(request.kind, request.ref);
      if (observation === undefined) {
        unresolved.push(`${request.kind}:${request.ref}`);
        continue;
      }
      grounds.push(
        Object.freeze({
          kind: observation.kind,
          ref: observation.ref,
          digest: observation.digest,
          ...(observation.experimentRef === undefined ? {} : { experimentRef: observation.experimentRef }),
        }),
      );
    }
    return { grounds: Object.freeze(grounds), unresolved: Object.freeze(unresolved) };
  }

  async function chainOf(procedureId: string): Promise<{
    readonly revisions: readonly ProcedureRevision[];
    readonly retirements: readonly { readonly ref: ProcedureRef; readonly reason: string }[];
  }> {
    const events = await store.replay(procedureId);
    return { revisions: publishedRevisionsOf(events), retirements: retirementsOf(events) };
  }

  /** §25: the CURRENT ACTIVE revision of a procedure — what a new revision would supersede. */
  async function currentActiveRef(procedureId: string): Promise<ProcedureRef | undefined> {
    const { revisions, retirements } = await chainOf(procedureId);
    if (revisions.length === 0) return undefined;
    return currentProcedureRevision(revisions, deriveProcedureStandings(revisions, retirements))?.ref;
  }

  async function appendTo(procedureId: string, events: readonly ProcedureEventDraft[]): Promise<void> {
    const basis = (await store.basis(procedureId)) ?? Object.freeze({ scopeId: procedureId, throughSeq: 0, chainDigest: "" });
    await store.appendAtomic({ expectedBasis: basis, events });
  }

  async function prepare(input: PrepareProcedureInput): Promise<PreparedProcedure> {
    if (input.grounds.length === 0) {
      refuse("PROCEDURE_NO_EMPIRICAL_GROUND", "a procedure candidate requires at least one empirical ground (§6)");
    }
    if (deps.authoring === undefined) {
      refuse("PROCEDURE_AUTHORING_UNAVAILABLE", "no procedure authoring seam is composed, so no method can be extracted from experience");
    }
    const { grounds, unresolved } = await resolveGrounds(input.grounds);
    // §6: at least one ground must RESOLVE. A request naming only unknown evidence is refused
    // rather than authoring a method from nothing.
    if (grounds.length === 0) {
      refuse(
        "PROCEDURE_GROUND_UNKNOWN",
        `none of the requested empirical grounds resolve (${unresolved.join(", ")}) — refusing to author an ungrounded procedure`,
      );
    }

    const supersedes = input.procedureId === undefined ? undefined : await currentActiveRef(input.procedureId);

    const authored = assertProcedureAuthoringResult(
      await deps.authoring.propose({
        grounds,
        projectContext: {
          projectId: input.projectContext.projectId,
          projectRevision: input.projectContext.projectRevision,
          objective: input.projectContext.objective,
        },
      }),
    );
    if (authored.outcome !== "proposal") {
      refuse("PROCEDURE_AUTHORING_UNRESOLVED", "the authoring seam resolved no reusable method from this experience");
    }

    let candidate: ProcedureCandidate;
    try {
      candidate = materializeProcedureCandidate({
        content: authored.content,
        empiricalGrounds: grounds,
        provenance: {
          authoringOrigin: deps.authoring.origin,
          projectId: input.projectContext.projectId,
          projectRevision: input.projectContext.projectRevision,
          projectDigest: input.projectContext.projectDigest,
        },
      });
    } catch (error) {
      if (error instanceof ProcedureContentError) {
        refuse("PROCEDURE_AUTHORING_INVALID", `the authoring seam produced a malformed method body: ${error.message}`);
      }
      throw error;
    }
    return Object.freeze({
      // §8/§25: the identity is STATED. A first publication is named by the candidate's own
      // content-addressed id; a revision keeps the id the caller named.
      procedureId: input.procedureId ?? candidate.candidateId,
      candidate,
      groundsResolved: unresolved.length === 0,
      groundCount: candidate.empiricalGrounds.length,
      ...(supersedes === undefined ? {} : { supersedes }),
    });
  }

  async function assess(input: { readonly procedureId: string; readonly candidate: ProcedureCandidate }): Promise<ProcedureAssessment> {
    const unresolved: string[] = [];
    for (const ground of input.candidate.empiricalGrounds) {
      const observation = await ports?.grounds?.observe(ground.kind, ground.ref);
      if (observation === undefined || observation.digest !== ground.digest) {
        unresolved.push(`${ground.kind}:${ground.ref}`);
      }
    }
    const supersedes = await currentActiveRef(input.procedureId);
    return Object.freeze({
      procedureId: input.procedureId,
      candidateId: input.candidate.candidateId,
      candidateDigest: input.candidate.digest,
      groundsResolved: unresolved.length === 0,
      groundCount: input.candidate.empiricalGrounds.length,
      unresolvedGrounds: Object.freeze(unresolved),
      ...(supersedes === undefined ? {} : { supersedes }),
      admissionAvailable: deps.admission !== undefined,
    });
  }

  async function publish(input: PublishProcedureInput): Promise<PublishProcedureOutcome> {
    const candidate = input.candidate;
    if (deps.admission === undefined) {
      // §10: no authority is an honest, zero-write answer — never a default admission.
      return Object.freeze({ status: "admission_unresolved" as const });
    }
    if (candidate.empiricalGrounds.length === 0) {
      refuse("PROCEDURE_NO_EMPIRICAL_GROUND", "a procedure candidate requires at least one empirical ground (§6)");
    }

    const procedureId = input.procedureId;
    const supersedes = await currentActiveRef(procedureId);
    const { unresolved } = await resolveGrounds(candidate.empiricalGrounds.map((ground) => ({ kind: ground.kind, ref: ground.ref })));

    const decision = assertProcedureAdmissionOutcomeShape(
      await deps.admission.decide({
        candidateDigest: candidate.digest,
        candidateId: candidate.candidateId,
        content: candidate.content,
        empiricalGrounds: candidate.empiricalGrounds,
        validation: {
          groundsResolved: unresolved.length === 0,
          groundCount: candidate.empiricalGrounds.length,
          ...(supersedes === undefined ? {} : { supersedes }),
        },
      }),
    );
    // §10: the decision must name the EXACT candidate digest. A decision about something else is
    // refused rather than applied to this candidate.
    if (decision.candidateDigest !== candidate.digest) {
      refuse(
        "PROCEDURE_ADMISSION_DIGEST_MISMATCH",
        `the authority decided about candidate "${decision.candidateDigest}", not the submitted "${candidate.digest}"`,
      );
    }
    if (decision.decision === "UNRESOLVED") {
      return Object.freeze({ status: "admission_unresolved" as const, decision });
    }
    if (decision.decision === "REJECT") {
      return Object.freeze({ status: "rejected" as const, decision });
    }

    const { revisions } = await chainOf(procedureId);
    const published = materializeProcedureRevision({
      procedureId,
      revision: nextRevisionNumber(revisions),
      candidateId: candidate.candidateId,
      candidateDigest: candidate.digest,
      content: candidate.content,
      empiricalGrounds: candidate.empiricalGrounds,
      provenance: candidate.provenance,
      admission: materializeProcedureAdmissionProvenance({
        candidateDigest: candidate.digest,
        policyRef: decision.policyRef,
        rationale: decision.rationale,
        scope: candidate.content.applicability,
        limitations: candidate.content.limitations,
      }),
      ...(supersedes === undefined ? {} : { supersedes }),
      publishedAt: now(),
    });
    await appendTo(procedureId, [procedureRevisionPublishedEvent(published)]);
    return Object.freeze({
      status: "published" as const,
      ref: procedureRefOf(published),
      revision: published,
      ...(supersedes === undefined ? {} : { superseded: supersedes }),
      decision,
    });
  }

  async function get(ref: ProcedureRef): Promise<ProcedureRevision | undefined> {
    const { revisions } = await chainOf(ref.procedureId);
    return revisions.find((revision) => sameProcedureRef(procedureRefOf(revision), ref));
  }

  async function viewOf(procedureId: string): Promise<ProcedureView> {
    const { revisions, retirements } = await chainOf(procedureId);
    const standings = deriveProcedureStandings(revisions, retirements);
    const byRef = new Map(standings.map((standing) => [procedureRefKey(standing.ref), standing]));
    const history: ProcedureHistoryEntry[] = revisions.map((revision) => {
      const ref = procedureRefOf(revision);
      const standing = byRef.get(procedureRefKey(ref))!;
      return Object.freeze({
        revision,
        ref,
        standing: standing.standing,
        ...(standing.supersededBy === undefined ? {} : { supersededBy: standing.supersededBy }),
        ...(standing.retiredReason === undefined ? {} : { retiredReason: standing.retiredReason }),
      });
    });
    const currentRef = currentProcedureRevision(revisions, standings)?.ref;
    const current = currentRef === undefined ? undefined : history.find((entry) => sameProcedureRef(entry.ref, currentRef));
    return Object.freeze({
      procedureId,
      ...(current === undefined ? {} : { current }),
      history: Object.freeze(history),
    });
  }

  async function history(procedureId: string): Promise<ProcedureView> {
    return viewOf(procedureId);
  }

  async function procedures(): Promise<readonly string[]> {
    return store.procedures();
  }

  async function retire(ref: ProcedureRef, reason: string): Promise<ProcedureStandingView> {
    const { revisions, retirements } = await chainOf(ref.procedureId);
    if (!revisions.some((revision) => sameProcedureRef(procedureRefOf(revision), ref))) {
      refuse("PROCEDURE_UNKNOWN", `procedure revision "${procedureRefKey(ref)}" does not exist`);
    }
    const standing = deriveProcedureStandings(revisions, retirements).find((candidate) => sameProcedureRef(candidate.ref, ref))!;
    if (standing.standing !== "ACTIVE") {
      refuse("PROCEDURE_REVISION_NOT_ACTIVE", `procedure revision "${procedureRefKey(ref)}" is ${standing.standing}, not ACTIVE`);
    }
    await appendTo(ref.procedureId, [procedureRetiredEvent(ref.procedureId, ref, reason)]);
    return deriveProcedureStandings(revisions, [...retirements, Object.freeze({ ref, reason })]).find((candidate) => sameProcedureRef(candidate.ref, ref))!;
  }

  async function associate(input: { readonly projectId: string; readonly ref: ProcedureRef }): Promise<void> {
    // §14: the revision must EXIST before a project may reference it. Association never creates a
    // procedure, and an unassociated procedure never enters context.
    if ((await get(input.ref)) === undefined) {
      refuse("PROCEDURE_UNKNOWN", `procedure revision "${procedureRefKey(input.ref)}" does not exist`);
    }
    const association = ports?.association;
    if (association === undefined) {
      refuse("PROCEDURE_ASSOCIATION_UNAVAILABLE", "no project-association capability is composed, so the procedure cannot be associated");
    }
    await association.associate({
      projectId: input.projectId,
      procedureRef: { procedureId: input.ref.procedureId, revision: input.ref.revision, digest: input.ref.digest },
      provenance: `procedure:${procedureRefKey(input.ref)}`,
    });
  }

  async function basis(procedureId: string): Promise<{ readonly procedureId: string; readonly throughSeq: number; readonly chainDigest: string } | undefined> {
    const stored = await store.basis(procedureId);
    return stored === undefined ? undefined : Object.freeze({ procedureId, throughSeq: stored.throughSeq, chainDigest: stored.chainDigest });
  }

  return Object.freeze({ prepare, assess, publish, get, basis, history, procedures, retire, associate });
}

/** The next revision number: the highest existing revision + 1, or 0 for a first publication. */
function nextRevisionNumber(revisions: readonly ProcedureRevision[]): number {
  if (revisions.length === 0) return 0;
  return revisions.reduce((highest, revision) => (revision.revision > highest ? revision.revision : highest), 0) + 1;
}
