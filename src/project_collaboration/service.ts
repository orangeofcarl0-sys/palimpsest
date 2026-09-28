/**
 * E3-C — GOVERNED SOVEREIGN COLLABORATION: the project-reality → need-candidate service.
 *
 *     Project Reality Observation
 *       → untrusted need authoring (§6)
 *       → CollaborationNeedCandidate (§7, non-canonical)
 *       → currentness assessment (§9)
 *       → independent need admission (§8)
 *       → EXISTING Federation need declaration (§11)
 *
 * ## The equation the whole stage turns on
 *
 *     Project A may request and accept a contribution from Project B.
 *     Project A NEVER obtains authority over Project B's Work ledger.
 *
 * This service is the LOCAL half of that: it turns a project condition into a durable collaboration need,
 * and it does nothing else. It does not contact peers, select peers, create commitments, schedule Work or
 * grant authority — those live in the Federation owner and in the remote project's own runtime.
 *
 * ## The three verbs, and only the third writes
 *
 *     prepare → no canonical write (a candidate is a value)
 *     assess  → no canonical write (a currentness observation)
 *     admit   → authority-gated, through the EXISTING declaration port
 *
 * Layer: L2 (`src/project_collaboration/`). Composition adapts the owners into `ProjectCollaborationPorts`.
 */
import {
  contactNeedOriginOfCandidate,
  contactNeedReasonOfCandidate,
  materializeCollaborationNeedCandidate,
  needRefuse,
  type BlockedTaskGround,
  type CollaborationNeedCandidate,
  type CollaborationProjectBasis,
  type FailedAttemptGround,
  type NeedGround,
} from "./need.js";
import {
  assertNeedAdmissionOutcomeShape,
  materializeAcceptedNeedDeclaration,
  type AcceptedNeedDeclaration,
  type ContactNeedAdmissionPort,
  type NeedCurrentnessAssessment,
  type NeedCurrentnessStatus,
} from "./receipt.js";
import type { CollaborationNeedAuthoringPort, ProjectCollaborationPorts, ProjectRealityFacts } from "./ports.js";

/** §5: the ground identity a caller supplies. Standing/objective/hints are READ, never supplied. */
export type NeedGroundRequest =
  | { readonly kind: "BLOCKED_TASK"; readonly taskId: string }
  | { readonly kind: "FAILED_ATTEMPT"; readonly attemptId: string };

export interface PrepareNeedInput {
  readonly ground: NeedGroundRequest;
}

export interface PreparedNeedCandidate {
  readonly status: "prepared";
  readonly candidate: CollaborationNeedCandidate;
  /** §9: the basis the candidate was frozen against, repeated for the caller's convenience. */
  readonly projectBasis: CollaborationProjectBasis;
}

/** §5/§6: authoring is allowed to conclude that a ground implies no external need. */
export interface NoNeedOutcome {
  readonly status: "no_need" | "authoring_unresolved";
  readonly ground: NeedGround;
  readonly detail: string;
}

export type PrepareNeedOutcome = PreparedNeedCandidate | NoNeedOutcome;

export interface AdmitNeedOutcome {
  readonly status: "DECLARED" | "admission_unresolved" | "rejected" | "stale";
  readonly contactNeedId: string | null;
  readonly declaration: AcceptedNeedDeclaration | null;
  readonly currentness: NeedCurrentnessAssessment;
  readonly detail: string;
}

export interface ProjectCollaborationService {
  /** §4–§7: observe project reality and author a candidate. No canonical write. */
  prepare(input: PrepareNeedInput): Promise<PrepareNeedOutcome>;
  /** §9: assess a candidate's currentness against the live project. No canonical write. */
  assess(input: { readonly candidate: CollaborationNeedCandidate }): Promise<NeedCurrentnessAssessment>;
  /** §8/§11: authority decides the exact candidate digest, then the EXISTING declaration path runs. */
  admit(input: { readonly candidate: CollaborationNeedCandidate }): Promise<AdmitNeedOutcome>;
}

export interface ProjectCollaborationServiceDeps {
  readonly ports: ProjectCollaborationPorts;
  /** §6: the untrusted authoring seam. Absent ⇒ `prepare` refuses with capability unavailable. */
  readonly authoring?: CollaborationNeedAuthoringPort | undefined;
  /**
   * §8: the independent need authority. ABSENT means "this deployment has no authority", which yields
   * `admission_unresolved` — never an implicit approval.
   */
  readonly admission?: ContactNeedAdmissionPort | undefined;
  readonly clock?: (() => string) | undefined;
}

export function makeProjectCollaborationService(
  deps: ProjectCollaborationServiceDeps,
): ProjectCollaborationService {
  const now = (): string => (deps.clock ?? (() => new Date().toISOString()))();
  const ports = deps.ports;

  /** The live project basis, read from the ONE project facts port. */
  async function currentBasis(): Promise<CollaborationProjectBasis> {
    const facts = await ports.project.facts();
    return Object.freeze({
      projectId: facts.projectId,
      revision: facts.revision,
      digest: facts.digest,
      headCommit: facts.headCommit,
    });
  }

  /**
   * §5: read the ground from its canonical owner. The caller supplied IDENTITY only; the objective, the
   * dependency set, the hints and the report digest are all observed here. A missing observation is a
   * refusal, never an inferred ground.
   */
  async function observeGround(request: NeedGroundRequest): Promise<{ ground: NeedGround; facts: ProjectRealityFacts }> {
    if (request.kind === "BLOCKED_TASK") {
      if (ports.blockedTask === undefined) {
        needRefuse("NEED_CAPABILITY_UNAVAILABLE", "no Work owner is composed to observe a blocked task condition");
      }
      const observed = await ports.blockedTask.observe(request.taskId);
      if (observed === undefined) {
        needRefuse("NEED_GROUND_NOT_FOUND", `task "${request.taskId}" is not a BLOCKED task in canonical Work`);
      }
      const basis = await currentBasis();
      const ground: BlockedTaskGround = Object.freeze({
        kind: "BLOCKED_TASK" as const,
        projectId: basis.projectId,
        taskId: observed.taskId,
        taskState: "BLOCKED" as const,
        objective: observed.objective,
        dependsOn: Object.freeze([...observed.dependsOn]),
        declaredHints: Object.freeze([...observed.declaredHints]),
      });
      return {
        ground,
        facts: Object.freeze({ projectBasis: basis, declaredHints: ground.declaredHints }),
      };
    }
    if (ports.failedAttempt === undefined) {
      needRefuse("NEED_CAPABILITY_UNAVAILABLE", "no Work owner is composed to observe a failed attempt");
    }
    const observed = await ports.failedAttempt.observe(request.attemptId);
    if (observed === undefined) {
      needRefuse("NEED_GROUND_NOT_FOUND", `attempt "${request.attemptId}" is not a failed attempt in canonical Work`);
    }
    const basis = await currentBasis();
    const ground: FailedAttemptGround = Object.freeze({
      kind: "FAILED_ATTEMPT" as const,
      projectId: basis.projectId,
      taskId: observed.taskId,
      attemptId: observed.attemptId,
      reportDigest: observed.reportDigest,
      workerStatus: "failed" as const,
      objective: observed.objective,
    });
    return {
      ground,
      facts: Object.freeze({ projectBasis: basis, declaredHints: Object.freeze([] as readonly string[]) }),
    };
  }

  async function prepare(input: PrepareNeedInput): Promise<PrepareNeedOutcome> {
    if (deps.authoring === undefined) {
      needRefuse("NEED_CAPABILITY_UNAVAILABLE", "no need authoring seam is composed — a candidate requires untrusted authoring");
    }
    const { ground, facts } = await observeGround(input.ground);
    const authored = await deps.authoring.propose({ ground, facts });
    if (authored.outcome === "NO_NEED") {
      // §5: a blocked task or a failed attempt is PRESSURE, not a need. Authoring may conclude there is
      // no external need, and this service does not overrule it.
      return Object.freeze({ status: "no_need" as const, ground, detail: "the authoring seam found no external need in this ground" });
    }
    if (authored.outcome === "UNRESOLVED") {
      return Object.freeze({
        status: "authoring_unresolved" as const,
        ground,
        detail: "the authoring seam could not decide whether this ground implies an external need",
      });
    }
    const candidate = materializeCollaborationNeedCandidate({
      projectBasis: facts.projectBasis,
      ground,
      competenceTags: authored.competenceTags,
      reason: authored.reason,
      origin: deps.authoring.origin,
    });
    return Object.freeze({ status: "prepared" as const, candidate, projectBasis: candidate.projectBasis });
  }

  /**
   * §9: revalidate the candidate against the LIVE project. Two independent questions:
   *
   *   · has the project basis moved? (STALE_PROJECT — the intent the candidate was authored under is gone)
   *   · is the grounded Work condition still the one observed? (STALE_GROUND — the task was unblocked, or
   *     the failed attempt is no longer the attempt in history)
   *
   * A candidate whose ground cannot be re-observed at all is UNRESOLVED rather than assumed current.
   */
  async function assess(input: { readonly candidate: CollaborationNeedCandidate }): Promise<NeedCurrentnessAssessment> {
    const candidate = input.candidate;
    const observed = await currentBasis();
    const details: string[] = [];
    let status: NeedCurrentnessStatus = "CURRENT";

    if (
      observed.projectId !== candidate.projectBasis.projectId ||
      observed.revision !== candidate.projectBasis.revision ||
      observed.digest !== candidate.projectBasis.digest ||
      observed.headCommit !== candidate.projectBasis.headCommit
    ) {
      status = "STALE_PROJECT";
      details.push(
        `project basis moved from revision ${candidate.projectBasis.revision} to ${observed.revision}`,
      );
    }

    const ground = candidate.ground;
    if (ground.kind === "BLOCKED_TASK") {
      if (ports.blockedTask === undefined) {
        return Object.freeze({ status: "UNRESOLVED" as const, details: Object.freeze(["no Work owner is composed to re-observe the blocked task"]), observedBasis: observed });
      }
      const current = await ports.blockedTask.observe(ground.taskId);
      if (current === undefined) {
        status = status === "CURRENT" ? "STALE_GROUND" : status;
        details.push(`task "${ground.taskId}" is no longer a BLOCKED task in canonical Work`);
      } else if (current.objective !== ground.objective) {
        status = status === "CURRENT" ? "STALE_GROUND" : status;
        details.push(`task "${ground.taskId}" objective changed since the candidate was authored`);
      }
    } else {
      if (ports.failedAttempt === undefined) {
        return Object.freeze({ status: "UNRESOLVED" as const, details: Object.freeze(["no Work owner is composed to re-observe the failed attempt"]), observedBasis: observed });
      }
      const current = await ports.failedAttempt.observe(ground.attemptId);
      if (current === undefined) {
        status = status === "CURRENT" ? "STALE_GROUND" : status;
        details.push(`attempt "${ground.attemptId}" is no longer a failed attempt in canonical Work`);
      } else if (current.reportDigest !== ground.reportDigest) {
        status = status === "CURRENT" ? "STALE_GROUND" : status;
        details.push(`attempt "${ground.attemptId}" report identity changed since the candidate was authored`);
      }
    }

    return Object.freeze({ status, details: Object.freeze(details), observedBasis: observed });
  }

  /**
   * §8/§11: the governed admission. Order matters and is deliberate:
   *
   *   1. currentness — a stale candidate produces ZERO declarations (§9);
   *   2. the authority decides the EXACT digest (§8) — absent authority is `admission_unresolved`;
   *   3. the declaration runs through the EXISTING Federation port, carrying the candidate digest as the
   *      §13 retry correlation and the accepted receipt as the durable provenance.
   *
   * Nothing here creates a store, and nothing here grants Work authority: the declaration is a
   * collaboration need, and a need is not an assignment.
   */
  async function admit(input: { readonly candidate: CollaborationNeedCandidate }): Promise<AdmitNeedOutcome> {
    const candidate = input.candidate;
    const currentness = await assess({ candidate });

    if (currentness.status !== "CURRENT") {
      // §9: a stale candidate declares NOTHING. The caller prepares another candidate instead.
      return Object.freeze({
        status: currentness.status === "UNRESOLVED" ? ("admission_unresolved" as const) : ("stale" as const),
        contactNeedId: null,
        declaration: null,
        currentness,
        detail: `candidate is ${currentness.status}: ${currentness.details.join("; ")}`,
      });
    }

    const authority = deps.admission;
    if (authority === undefined) {
      return Object.freeze({
        status: "admission_unresolved" as const,
        contactNeedId: null,
        declaration: null,
        currentness,
        detail: "no contact-need admission authority is configured for this deployment",
      });
    }

    const raw = await authority.decide({ candidate, currentness });
    const outcome = assertNeedAdmissionOutcomeShape(raw);
    if (outcome.candidateDigest !== candidate.digest) {
      // §8: the decision must name the EXACT candidate digest — never "something like this".
      needRefuse(
        "NEED_CANDIDATE_INVALID",
        `the need authority decided candidate "${outcome.candidateDigest}", not the offered "${candidate.digest}"`,
      );
    }
    if (outcome.decision !== "ADMIT") {
      return Object.freeze({
        status: outcome.decision === "REJECT" ? ("rejected" as const) : ("admission_unresolved" as const),
        contactNeedId: null,
        declaration: null,
        currentness,
        detail: outcome.detail ?? `the need authority answered ${outcome.decision}`,
      });
    }

    const declaration = materializeAcceptedNeedDeclaration({ candidate, admission: outcome, declaredAt: now() });
    const declared = await ports.declaration.declare({
      origin: contactNeedOriginOfCandidate(candidate),
      competenceTags: candidate.competenceTags,
      reason: contactNeedReasonOfCandidate(candidate),
      candidateDigest: candidate.digest,
      accepted: declaration,
    });
    return Object.freeze({
      status: "DECLARED" as const,
      contactNeedId: declared.contactNeedId,
      declaration,
      currentness,
      detail: `admitted candidate ${candidate.candidateId} as need ${declared.contactNeedId}`,
    });
  }

  return { prepare, assess, admit };
}
