/**
 * G10-AD §4/§5/§11/§12 — the verification ORCHESTRATION.
 *
 * One run is:
 *
 *   materialize the exact current ProjectIR head           (§4 — never a caller's commit)
 *   → enforce actual Git head == subject head commit       (§5 — before ANY execution)
 *   → write STARTED                                        (§12 — before the provider call)
 *   → call the registered verifier protocol
 *   → re-read ProjectIR + Git                              (§5 — mid-run drift)
 *   → write COMPLETED with verdict/independence/freshness  (§8/§10/§12/§13)
 *
 * Firewalls (§2/§25): this module imports NO Work module, NO gate, NO Evidence,
 * NO Proof, NO Reasoning, NO promotion and NO effects module. A PASS here mints
 * nothing: no Work EvidenceAtom, no Proof publication, no Reasoning admission,
 * no task/project state change, no promotion eligibility, no effect authority.
 * The typed SURFACE of what it can do is exactly: read the head, run a
 * registered protocol, append history.
 */

import { canonicalDatetime } from "../schema/datetime.js";
import {
  materializeProjectVerificationRequest,
  materializeProjectVerifierRawResult,
  parseProjectVerifierRawResult,
  type ProjectVerifierRawResult,
  type ProjectVerificationFreshness,
  type ProjectVerificationRun,
  type VerifierDefinition,
} from "./artifacts.js";
import {
  deriveProjectVerificationStatus,
  type ProjectVerificationStatus,
  type ProjectVerificationState,
} from "./status.js";
import type { ProjectHeadVerificationSource, ProjectVerifierPort } from "./provider.js";
import type { AttemptResultMaterializerPort, AttemptResultVerificationSource } from "./attempt_result_source.js";
import type {
  DerivedResultVerificationSubject,
  ProjectVerificationSubject,
  ProjectVerificationSubjectKind,
  ResultVerificationSubject,
} from "./artifacts.js";
import { sameSubject } from "./artifacts.js";
import { countsAsIndependent } from "./independence.js";
import type { ProjectVerifierRegistry } from "./registry.js";
import type { ProjectVerificationHistoryStore } from "./store.js";

export interface ProjectVerificationServiceDeps {
  readonly projectId: string;
  readonly source: ProjectHeadVerificationSource;
  readonly store: ProjectVerificationHistoryStore;
  readonly registry: ProjectVerifierRegistry;
  /** The EXECUTABLE ports this deployment bound. A registered ref with no port is not a runtime. */
  readonly providers: readonly ProjectVerifierPort[];
  readonly defaultVerifierRef?: string | null | undefined;
  /** The repository the mechanical protocol runs against, when one applies. */
  readonly repository?: string | undefined;
  /**
   * PLMP-LEAN-1 §B.9/§B.12: the two attempt-result seams. Both are required for an ATTEMPT_RESULT
   * verification to be executable — a registered definition is not a runtime, and a runtime without a
   * way to materialize the result is not one either.
   */
  readonly attemptResultSource?: AttemptResultVerificationSource | undefined;
  /** §D3-d3: the derived-result subject source. Absent ⇒ a deployment verifies no derived results. */
  readonly derivedResultSource?: DerivedResultVerificationSource | undefined;
  readonly attemptResultMaterializer?: AttemptResultMaterializerPort | undefined;
  readonly clock?: (() => string) | undefined;
}

export interface VerifyCurrentHeadInput {
  readonly verifierRef?: string | undefined;
  readonly requestedBy: string;
  readonly reason?: string | undefined;
  readonly repository?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * PLMP-LEAN-1 §B.14: whether one attempt's REQUIRED independent verification is satisfied, as a plain
 * synchronous fact.
 *
 * Synchronous on purpose: `PromotionManager.assessEligibility()` is synchronous and recovery/redispatch
 * depend on it, so this must be a read rather than a status() round trip. It imports no promotion type.
 */
export interface AttemptResultVerificationQualification {
  /** The exact subject digest the newest candidate run covered, or null when none exists. */
  readonly subjectDigest: string | null;
  /** The newest exact-subject run, qualifying or not — so a refusal can name it. */
  readonly runRef: string | null;
  readonly satisfied: boolean;
  readonly detail: string;
}

/**
 * §D3-d3: the subject source for a DERIVED result, mirroring the attempt-result source.
 *
 * A PORT rather than a subject parameter, for the same §4 reason: a public "verify this subject" entry
 * point would let a caller construct a verification target, and the subject's every identity field must
 * come from what the runtime recorded rather than from the caller.
 */
export interface DerivedResultVerificationSource {
  materialize(candidateId: string): DerivedResultVerificationSubject;
}

export interface VerifyDerivedResultInput {
  readonly candidateId: string;
  readonly verifierRef?: string | undefined;
  readonly requestedBy: string;
  readonly reason?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface VerifyAttemptResultInput {
  readonly attemptId: string;
  readonly verifierRef?: string | undefined;
  readonly requestedBy: string;
  readonly reason?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

/**
 * `recorded` means a run was durably recorded (its VERDICT may be any of
 * PASS/FAIL/SCORE/UNRESOLVED/ERROR — the outcome is not a truth claim).
 * `blocked` means nothing was executed and nothing was written.
 */
export interface ProjectVerificationOutcome {
  readonly status: "recorded" | "blocked";
  readonly typedReasonCode: string;
  readonly detail: string;
  readonly run: ProjectVerificationRun | null;
  readonly statusView: ProjectVerificationStatus;
}

export interface ProjectVerificationService {
  verifyCurrentHead(input: VerifyCurrentHeadInput): Promise<ProjectVerificationOutcome>;
  /**
   * PLMP-LEAN-1 §B.10: verify the immutable result of one attempt. `attemptId` is INTERNAL
   * application identity — a principal never supplies it, and the subject's commits are read from
   * canonical Work, never from the caller.
   */
  verifyAttemptResult(input: VerifyAttemptResultInput): Promise<ProjectVerificationOutcome>;
  /**
   * §D3-d3: verify a DERIVED result. The SAME runtime, lifecycle and independence semantics as
   * `verifyAttemptResult` — only the subject kind differs, and no second verifier species exists.
   *
   * A rematerialized candidate MUST be re-verified: a compatibility proof establishes resource
   * non-interference, which is NOT a statement about builds, tests, generated output or tool behaviour.
   */
  verifyDerivedResult(input: VerifyDerivedResultInput): Promise<ProjectVerificationOutcome>;
  /**
   * §B.14: the synchronous qualification read the promotion admission bridge consumes. Pure: it
   * materializes the subject from canonical Work and reads the run history; it writes nothing.
   */
  attemptResultQualification(attemptId: string): AttemptResultVerificationQualification;
  /** §D3-d3: the same qualification calculus over a derived result's subject. */
  derivedResultQualification(candidateId: string): AttemptResultVerificationQualification;
  status(): Promise<ProjectVerificationStatus>;
  /** Newest first (a UI/agent history read), never a rewrite of the chain. */
  history(limit?: number): Promise<readonly ProjectVerificationRun[]>;
  /** Runs that never produced a verdict (a crash leaves one). */
  unresolved(): Promise<readonly ProjectVerificationRun[]>;
  /** The local tamper-evidence check over the append-only chain. */
  verifyHistoryChain(): { readonly ok: boolean; readonly problem?: string | undefined };
}

/** The typed reason codes this plane produces (never prose-only). */
export const PROJECT_VERIFICATION_REASON_CODES = [
  "verified",
  "project_ir_unavailable",
  "no_registered_verifier",
  "unknown_verifier_ref",
  "unsupported_verification_subject",
  "verifier_runtime_unavailable",
  "verifier_definition_mismatch",
  /** §5: the actual git head is not the canonical project head. */
  "project_head_not_materialized",
  /** §B.9: canonical Work cannot yield a subject (not completed, no report, inconsistent record). */
  "attempt_result_unavailable",
  /** §B.12: the subject exists but its commit cannot be checked out — blocked before any run. */
  "attempt_result_not_materializable",
  "verification_aborted",
] as const;
export type ProjectVerificationReasonCode = (typeof PROJECT_VERIFICATION_REASON_CODES)[number];

export function makeProjectVerificationService(
  deps: ProjectVerificationServiceDeps,
): ProjectVerificationService {
  const registry = deps.registry;
  const providerByRef = new Map<string, ProjectVerifierPort>(
    deps.providers.map((provider) => [provider.definition.verifierRef, provider]),
  );
  const now = (): string => canonicalDatetime((deps.clock ?? (() => new Date().toISOString()))());

  /**
   * §D3-d3: does this registered verifier SERVE this subject kind?
   *
   * A definition that registers `ATTEMPT_RESULT` is a RESULT-SUBJECT verifier: its protocol runs over a
   * commit range, and that is the same statement for a derived candidate. The relation lives HERE rather
   * than in the definition because widening `supportedSubjects` would change the verifier's definition
   * digest — and B.11 already recorded the consequence, which is that every recorded attempt-result
   * verification would stop qualifying.
   *
   *     ResultSubject = { ATTEMPT_RESULT, DERIVED_RESULT }  served by one protocol
   */
  function definitionServes(definition: VerifierDefinition, kind: ProjectVerificationSubjectKind): boolean {
    if (definition.supportedSubjects.includes(kind)) return true;
    return kind === "DERIVED_RESULT" && definition.supportedSubjects.includes("ATTEMPT_RESULT");
  }

  function executableVerifierRefsFor(kind: ProjectVerificationSubjectKind): readonly string[] {
    return Object.freeze(
      registry
        .list()
        .filter((definition) => providerByRef.has(definition.verifierRef) && definitionServes(definition, kind))
        .map((definition) => definition.verifierRef),
    );
  }

  /** The head view, unchanged in meaning: only verifiers that can serve a head subject count. */
  function executableVerifierRefs(): readonly string[] {
    return executableVerifierRefsFor("CURRENT_PROJECT_HEAD");
  }

  /**
   * §B.11: the default is resolved PER KIND. Resolving "the first executable ref" globally would
   * hand `verifyAttemptResult` the head verifier — a runtime bug that reads as a protocol choice.
   */
  function defaultVerifierRefFor(kind: ProjectVerificationSubjectKind): string | null {
    if (kind === "CURRENT_PROJECT_HEAD" && deps.defaultVerifierRef !== undefined && deps.defaultVerifierRef !== null) {
      return deps.defaultVerifierRef;
    }
    const executable = executableVerifierRefsFor(kind);
    if (kind === "CURRENT_PROJECT_HEAD") {
      // The head default is UNCHANGED: the first executable ref, exactly as before.
      return executable.length === 0 ? null : executable[0]!;
    }
    // §B.14: an ATTEMPT_RESULT default must be INDEPENDENT-first. Taking "the first executable ref"
    // here can pick a non-independent verifier, whose run then cannot satisfy the requirement — a
    // dead end the product would have manufactured for itself (begin says READY because an
    // independent runtime exists; finish auto-selects the other one; promotion refuses). An expert
    // caller may still NAME a non-independent ref for diagnostics; the automatic path never picks one.
    for (const ref of executable) {
      const definition = registry.get(ref);
      if (definition !== undefined && countsAsIndependent(definition)) return ref;
    }
    return null;
  }

  function defaultVerifierRef(): string | null {
    return defaultVerifierRefFor("CURRENT_PROJECT_HEAD");
  }

  async function readRepositoryHead(): Promise<string | null> {
    if (deps.source.repositoryHead === undefined) return null;
    try {
      return await deps.source.repositoryHead();
    } catch {
      return null;
    }
  }

  async function status(): Promise<ProjectVerificationStatus> {
    let subject = null;
    let subjectError: string | null = null;
    try {
      subject = deps.source.current();
    } catch (error) {
      subjectError = error instanceof Error ? error.message : String(error);
    }
    if (subject !== null && subject.projectId !== deps.projectId) {
      subjectError = `the ProjectIR projection returned project "${subject.projectId}", not "${deps.projectId}"`;
      subject = null;
    }
    return deriveProjectVerificationStatus({
      projectId: deps.projectId,
      subject,
      subjectError,
      repositoryHead: await readRepositoryHead(),
      runs: deps.store.list(deps.projectId),
      registry,
      executableVerifierRefs: executableVerifierRefs(),
      defaultVerifierRef: deps.defaultVerifierRef ?? null,
      derivedAt: now(),
    });
  }

  async function blocked(
    typedReasonCode: ProjectVerificationReasonCode,
    detail: string,
  ): Promise<ProjectVerificationOutcome> {
    return Object.freeze({
      status: "blocked" as const,
      typedReasonCode,
      detail,
      run: null,
      statusView: await status(),
    });
  }

  /** §5: re-read the ProjectIR AND git after the run and label the input honestly. */
  async function freshnessAfterRun(input: {
    readonly subjectDigest: string;
    readonly headCommit: string;
  }): Promise<ProjectVerificationFreshness> {
    let current;
    try {
      current = deps.source.current();
    } catch {
      // The subject can no longer be established: never claim the input was current.
      return "STALE_INPUT";
    }
    if (current.digest !== input.subjectDigest) return "STALE_INPUT";
    const headNow = await readRepositoryHead();
    if (headNow !== null && headNow !== input.headCommit) return "STALE_INPUT";
    return "CURRENT";
  }

  async function withStatus(
    outcome: Omit<ProjectVerificationOutcome, "statusView">,
  ): Promise<ProjectVerificationOutcome> {
    return Object.freeze({ ...outcome, statusView: await status() });
  }

  /**
   * §B.13: an attempt result's freshness is `SameCanonicalAttemptResult` — rematerialize the subject
   * from canonical Work and compare digests. It NEVER reads the ambient head, the ProjectIR revision
   * or the project digest: the result is a historical immutable artifact, and the repository moving
   * on says nothing about whether it is still the same result.
   */
  /**
   * §D3-d3: a derived candidate's freshness is `SameCanonicalDerivedResult` — the subject re-materialized
   * from the candidate record and compared. It never consults the ambient head, and it never consults the
   * ORIGIN result: carrying the origin's verdict across would be exactly the verification reuse this
   * slice refuses to infer.
   */
  async function derivedResultFreshnessAfterRun(
    candidateId: string,
    subjectDigest: string,
  ): Promise<ProjectVerificationFreshness> {
    const source = deps.derivedResultSource;
    if (source === undefined) return "STALE_INPUT";
    try {
      return source.materialize(candidateId).digest === subjectDigest ? "CURRENT" : "STALE_INPUT";
    } catch {
      return "STALE_INPUT";
    }
  }

  async function attemptResultFreshnessAfterRun(
    attemptId: string,
    subjectDigest: string,
  ): Promise<ProjectVerificationFreshness> {
    const source = deps.attemptResultSource;
    if (source === undefined) return "STALE_INPUT";
    try {
      return source.materialize(attemptId).digest === subjectDigest ? "CURRENT" : "STALE_INPUT";
    } catch {
      // The subject can no longer be established: never claim the input was current.
      return "STALE_INPUT";
    }
  }

  /**
   * The shared execution core: request -> STARTED -> provider -> freshness -> COMPLETED/INTERRUPTED.
   *
   * NOT exported, and NOT reachable from the returned service object. A public "verify this subject"
   * entry point would let a caller construct a verification target, which §4 forbids; both entry
   * points derive their subject from canonical state and only then hand it here.
   *
   *   shared implementation  !=  generic public target API
   */
  async function executeVerification(input: {
    readonly subject: ProjectVerificationSubject;
    readonly selectedVerifierRef: string;
    readonly definition: VerifierDefinition;
    readonly provider: ProjectVerifierPort;
    readonly repository?: string | undefined;
    readonly requestedBy: string;
    readonly reason: string;
    readonly signal?: AbortSignal | undefined;
    readonly freshness: () => Promise<ProjectVerificationFreshness>;
  }): Promise<ProjectVerificationOutcome> {
    const subject = input.subject;
    // §11 + §12: the request is digest-bound, and STARTED is written BEFORE the provider call so a
    // crash can only leave an unresolved STARTED.
    const request = materializeProjectVerificationRequest({
      subject,
      verifierRef: input.selectedVerifierRef,
      verifierDefinitionDigest: input.definition.digest,
      requestedBy: input.requestedBy,
      reason: input.reason,
    });
    const started = deps.store.appendStart({
      projectId: deps.projectId,
      requestRef: request.verificationRequestId,
      requestDigest: request.digest,
      subject,
      verifierRef: input.selectedVerifierRef,
      verifierDefinitionDigest: input.definition.digest,
      independence: input.definition.independenceClass,
      startedAt: now(),
    });

    let raw: ProjectVerifierRawResult | null = null;
    let failure: string | null = null;
    try {
      raw = parseProjectVerifierRawResult(
        await input.provider.verify({
          subject,
          ...(input.repository === undefined ? {} : { repository: input.repository }),
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        }),
      );
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error);
    }
    const finishedAt = now();
    const freshness = await input.freshness();

    if (failure !== null && input.signal?.aborted === true) {
      // An abort is NOT an evaluation: the run is closed with no verdict.
      const run = deps.store.appendInterruption({
        projectId: deps.projectId,
        runId: started.runId,
        detail: `the run was aborted before the protocol produced a result: ${failure}`,
        freshness,
        finishedAt,
      });
      return withStatus({
        status: "recorded",
        typedReasonCode: "verification_aborted",
        detail: run.detail ?? "the run was aborted",
        run,
      });
    }
    if (raw === null) {
      // An infrastructure fault is ERROR, never FAIL (§8).
      raw = materializeProjectVerifierRawResult({
        verifierRef: input.selectedVerifierRef,
        verdict: "ERROR",
        detail: `the verifier runtime failed before it produced a result: ${failure ?? "unknown failure"}`,
      });
    }
    const run = deps.store.appendCompletion({
      projectId: deps.projectId,
      runId: started.runId,
      verdict: raw.verdict,
      score: raw.score,
      detail: raw.detail,
      freshness,
      resultDigest: raw.digest,
      finishedAt,
    });
    return withStatus({
      status: "recorded",
      typedReasonCode: "verified",
      detail:
        run.status === "COMPLETED"
          ? `the verifier protocol "${input.selectedVerifierRef}" returned ${run.verdict} (${run.freshness})`
          : `the run ended as ${run.status}`,
      run,
    });
  }

  /**
   * §D3-d3: THE qualification calculus, over any result subject.
   *
   *     newest INDEPENDENT + current-protocol + COMPLETED + still CURRENT + PASS
   *
   * ONE implementation, because two would be two authorities answering the same question. The caller
   * supplies only the subject; everything else is read from the run history. This is what makes the
   * generalization minimal: the verifier runtime, the lifecycle and the independence/freshness semantics
   * are untouched, and only the SUBJECT IDENTITY widened.
   */
  function qualifySubject(subject: ResultVerificationSubject): AttemptResultVerificationQualification {
    // 2. Runs over THAT exact subject, newest first.
    const exact = deps.store
      .list(deps.projectId)
      .filter((run) => sameSubject(run.subject, subject))
      .sort((left, right) => (left.startedAt < right.startedAt ? 1 : left.startedAt > right.startedAt ? -1 : 0));
    if (exact.length === 0) {
      return Object.freeze({
        subjectDigest: subject.digest,
        runRef: null,
        satisfied: false,
        detail: "no verification run covers this result's exact subject",
      });
    }
    const newest = exact[0]!;

    // 3. Only a run whose protocol is still the registered one AND which counts as independent is
    //    an admission candidate. A stale or non-independent run never authorizes anything.
    const definition = registry.get(newest.verifierRef);
    const protocolCurrent = definition !== undefined && definition.digest === newest.verifierDefinitionDigest;
    const independent = definition === undefined ? newest.independence === "MECHANICAL_INDEPENDENT" : countsAsIndependent(definition);

    // 4. The newest INDEPENDENT, current-protocol run decides — so a newer independent FAIL
    //    overrides an older PASS instead of "once passed, always authorized".
    const candidate = exact.find((run) => {
      const runDefinition = registry.get(run.verifierRef);
      const runProtocolCurrent = runDefinition !== undefined && runDefinition.digest === run.verifierDefinitionDigest;
      const runIndependent = runDefinition === undefined ? run.independence === "MECHANICAL_INDEPENDENT" : countsAsIndependent(runDefinition);
      return runProtocolCurrent && runIndependent;
    });
    if (candidate === undefined) {
      return Object.freeze({
        subjectDigest: subject.digest,
        runRef: newest.runId,
        satisfied: false,
        detail: protocolCurrent && !independent
          ? `the newest run over this result (${newest.runId}) does not count as independent`
          : "no run over this result uses the currently registered protocol and counts as independent",
      });
    }

    // 5. Satisfied only when that run completed, is still CURRENT, and passed. Currency is the subject
    //    re-materialized and compared — the ambient head is never consulted, for either result kind.
    const current = subject.digest === candidate.subject.digest;
    const satisfied = candidate.status === "COMPLETED" && candidate.freshness === "CURRENT" && candidate.verdict === "PASS";
    return Object.freeze({
      subjectDigest: subject.digest,
      runRef: candidate.runId,
      satisfied,
      detail: satisfied
        ? `independent protocol "${candidate.verifierRef}" passed over this exact result`
        : current
          ? `the newest independent run over this result is ${candidate.status}${candidate.verdict === null ? "" : `/${candidate.verdict}`} (freshness ${candidate.freshness})`
          : "the newest independent run no longer covers this exact result",
    });
  }

  return Object.freeze({
    async verifyCurrentHead(input: VerifyCurrentHeadInput): Promise<ProjectVerificationOutcome> {
      const reason = input.reason ?? "explicit request to verify the current project head";
      const repository = input.repository ?? deps.repository;

      // §4: the subject is DERIVED. `input` cannot name a revision or a commit.
      let subject;
      try {
        subject = deps.source.current();
      } catch (error) {
        return blocked(
          "project_ir_unavailable",
          `the canonical project head cannot be materialized: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (subject.projectId !== deps.projectId) {
        return blocked(
          "project_ir_unavailable",
          `the ProjectIR projection returned project "${subject.projectId}", not "${deps.projectId}"`,
        );
      }

      // A caller may only SELECT a registered ref; it can never inject a command.
      const selectedVerifierRef = input.verifierRef ?? defaultVerifierRef();
      if (selectedVerifierRef === null) {
        return blocked(
          "no_registered_verifier",
          "no verifier is registered in this deployment, so there is nothing to execute",
        );
      }
      const definition: VerifierDefinition | undefined = registry.get(selectedVerifierRef);
      if (definition === undefined) {
        return blocked(
          "unknown_verifier_ref",
          `"${selectedVerifierRef}" is not a registered verifier ref; only registered verifiers may be selected`,
        );
      }
      if (!definition.supportedSubjects.includes("CURRENT_PROJECT_HEAD")) {
        return blocked(
          "unsupported_verification_subject",
          `verifier "${selectedVerifierRef}" does not support CURRENT_PROJECT_HEAD`,
        );
      }
      const provider = providerByRef.get(selectedVerifierRef);
      if (provider === undefined) {
        return blocked(
          "verifier_runtime_unavailable",
          `verifier "${selectedVerifierRef}" is registered as configuration but no runtime is bound to it`,
        );
      }
      if (provider.definition.digest !== definition.digest) {
        return blocked(
          "verifier_definition_mismatch",
          `the runtime for "${selectedVerifierRef}" implements definition ${provider.definition.digest}, but the registry lists ${definition.digest}`,
        );
      }

      // §5: repository consistency, BEFORE the provider call and before STARTED.
      const repositoryHead = await readRepositoryHead();
      if (repositoryHead !== null && repositoryHead !== subject.headCommit) {
        return blocked(
          "project_head_not_materialized",
          `the actual repository head ${repositoryHead} differs from the canonical project head ${subject.headCommit}; ambient git is never verified while it is labelled the canonical project head`,
        );
      }

      return executeVerification({
        subject,
        selectedVerifierRef,
        definition,
        provider,
        ...(repository === undefined ? {} : { repository }),
        requestedBy: input.requestedBy,
        reason,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        freshness: () => freshnessAfterRun({ subjectDigest: subject.digest, headCommit: subject.headCommit }),
      });
    },

    async verifyAttemptResult(input: VerifyAttemptResultInput): Promise<ProjectVerificationOutcome> {
      const reason = input.reason ?? "explicit request to verify a completed attempt's result";
      const source = deps.attemptResultSource;
      const materializer = deps.attemptResultMaterializer;
      if (source === undefined || materializer === undefined) {
        return blocked(
          "verifier_runtime_unavailable",
          "this deployment composes no attempt-result verification runtime: a subject source AND a materializer are both required",
        );
      }

      // §B.9: the subject comes from canonical Work. `attemptId` is internal identity; the commits
      // are never arguments.
      let subject;
      try {
        subject = source.materialize(input.attemptId);
      } catch (error) {
        return blocked(
          "attempt_result_unavailable",
          `the canonical result of attempt "${input.attemptId}" cannot be materialized: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const selectedVerifierRef = input.verifierRef ?? defaultVerifierRefFor("ATTEMPT_RESULT");
      if (selectedVerifierRef === null) {
        return blocked(
          "no_registered_verifier",
          "no verifier that supports ATTEMPT_RESULT is registered in this deployment, so there is nothing to execute",
        );
      }
      const definition: VerifierDefinition | undefined = registry.get(selectedVerifierRef);
      if (definition === undefined) {
        return blocked(
          "unknown_verifier_ref",
          `"${selectedVerifierRef}" is not a registered verifier ref; only registered verifiers may be selected`,
        );
      }
      // §B.11: an explicitly named ref that cannot serve this subject is refused, never silently
      // swapped for one that can.
      if (!definition.supportedSubjects.includes("ATTEMPT_RESULT")) {
        return blocked(
          "unsupported_verification_subject",
          `verifier "${selectedVerifierRef}" does not support ATTEMPT_RESULT`,
        );
      }
      const provider = providerByRef.get(selectedVerifierRef);
      if (provider === undefined) {
        return blocked(
          "verifier_runtime_unavailable",
          `verifier "${selectedVerifierRef}" is registered as configuration but no runtime is bound to it`,
        );
      }
      if (provider.definition.digest !== definition.digest) {
        return blocked(
          "verifier_definition_mismatch",
          `the runtime for "${selectedVerifierRef}" implements definition ${provider.definition.digest}, but the registry lists ${definition.digest}`,
        );
      }

      // §B.12 and the ordering rule: materialize BEFORE STARTED. A subject whose commit cannot be
      // checked out is an EXECUTION blocker, not an evaluation, so no run history is written for it.
      let materialized;
      try {
        materialized = await materializer.materialize(subject);
      } catch (error) {
        return blocked(
          "attempt_result_not_materializable",
          `the result commit of attempt "${input.attemptId}" cannot be materialized: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      try {
        return await executeVerification({
          subject,
          selectedVerifierRef,
          definition,
          provider,
          repository: materialized.repository,
          requestedBy: input.requestedBy,
          reason,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          freshness: () => attemptResultFreshnessAfterRun(input.attemptId, subject.digest),
        });
      } finally {
        // §B.12: release ALWAYS. A cleanup failure is runtime hygiene and must never rewrite the
        // verdict — the protocol already ran, and turning a recorded PASS into ERROR because a
        // directory could not be removed would be exactly the dishonesty this plane prevents.
        try {
          await materialized.release();
        } catch {
          /* hygiene only */
        }
      }
    },
    /**
     * §D3-d3: verify a DERIVED result, through the SAME execution core.
     *
     * The only differences from `verifyAttemptResult` are the subject source and the freshness rule; the
     * lifecycle, the independence requirement, the digest-bound request and the release discipline are
     * shared, so a second verifier species cannot appear by accident.
     *
     * FRESHNESS IS RE-DERIVED, NOT INHERITED. `Verification(R_0) ⇏ Verification(R_1)`: a compatibility
     * proof establishes resource non-interference, which says nothing about whether the build, the tests,
     * the generated output or the tool behaviour are unchanged. So the candidate's freshness is its OWN
     * subject re-materialized and compared — never the origin's verdict carried across.
     */
    async verifyDerivedResult(input: VerifyDerivedResultInput): Promise<ProjectVerificationOutcome> {
      const reason = input.reason ?? "explicit request to verify a derived result candidate";
      const source = deps.derivedResultSource;
      const materializer = deps.attemptResultMaterializer;
      if (source === undefined || materializer === undefined) {
        return blocked(
          "verifier_runtime_unavailable",
          "this deployment composes no derived-result verification runtime: a subject source AND a materializer are both required",
        );
      }

      let subject: DerivedResultVerificationSubject;
      try {
        subject = source.materialize(input.candidateId);
      } catch (error) {
        return blocked(
          "attempt_result_unavailable",
          `the derived result "${input.candidateId}" cannot be materialized as a subject: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const selectedVerifierRef = input.verifierRef ?? defaultVerifierRefFor("DERIVED_RESULT");
      if (selectedVerifierRef === null) {
        return blocked(
          "no_registered_verifier",
          "no verifier that supports DERIVED_RESULT is registered in this deployment, so there is nothing to execute",
        );
      }
      const definition: VerifierDefinition | undefined = registry.get(selectedVerifierRef);
      if (definition === undefined) {
        return blocked(
          "unknown_verifier_ref",
          `"${selectedVerifierRef}" is not a registered verifier ref; only registered verifiers may be selected`,
        );
      }
      /**
       * The registered definition is what the registry says; the subject kind is what the PROTOCOL
       * accepts. They are separate facts on purpose: the first-party result verifier registers
       * `ATTEMPT_RESULT` (so its definition digest is unchanged and existing runs stay current) while its
       * protocol serves every result kind. Requiring the registry list to name the kind would force a
       * digest change and stale recorded verification.
       */
      if (!definition.supportedSubjects.some((kind) => kind === "ATTEMPT_RESULT" || kind === "DERIVED_RESULT")) {
        return blocked(
          "unsupported_verification_subject",
          `verifier "${selectedVerifierRef}" does not support a result subject`,
        );
      }
      const provider = providerByRef.get(selectedVerifierRef);
      if (provider === undefined) {
        return blocked(
          "verifier_runtime_unavailable",
          `verifier "${selectedVerifierRef}" is registered as configuration but no runtime is bound to it`,
        );
      }
      if (provider.definition.digest !== definition.digest) {
        return blocked(
          "verifier_definition_mismatch",
          `the runtime for "${selectedVerifierRef}" implements definition ${provider.definition.digest}, but the registry lists ${definition.digest}`,
        );
      }

      let materialized;
      try {
        materialized = await materializer.materialize(subject);
      } catch (error) {
        return blocked(
          "attempt_result_not_materializable",
          `the result revision of derived result "${input.candidateId}" cannot be materialized: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      try {
        return await executeVerification({
          subject,
          selectedVerifierRef,
          definition,
          provider,
          repository: materialized.repository,
          requestedBy: input.requestedBy,
          reason,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          freshness: () => derivedResultFreshnessAfterRun(input.candidateId, subject.digest),
        });
      } finally {
        try {
          await materialized.release();
        } catch {
          /* hygiene only */
        }
      }
    },
    attemptResultQualification(attemptId: string): AttemptResultVerificationQualification {
      const source = deps.attemptResultSource;
      if (source === undefined) {
        return Object.freeze({
          subjectDigest: null,
          runRef: null,
          satisfied: false,
          detail: "this deployment composes no attempt-result subject source, so a required attempt verification cannot be evaluated",
        });
      }
      // 1. The exact subject, from canonical Work. A subject that cannot be derived is not a
      //    qualification failure to paper over — it means the requirement cannot be shown to be met.
      let subject;
      try {
        subject = source.materialize(attemptId);
      } catch (error) {
        return Object.freeze({
          subjectDigest: null,
          runRef: null,
          satisfied: false,
          detail: `the canonical result of attempt "${attemptId}" cannot be materialized: ${error instanceof Error ? error.message : String(error)}`,
        });
      }

      return qualifySubject(subject);
    },

    /**
     * §D3-d3: the SAME qualification calculus over a derived result's subject.
     *
     * Deliberately the identical function rather than a parallel implementation: "is there a newest
     * independent, current-protocol run that completed, is still current and passed" is ONE question, and
     * two answers to it would be two authorities. What differs between the kinds is only where the subject
     * comes from and what "still current" is rematerialized against.
     */
    derivedResultQualification(candidateId: string): AttemptResultVerificationQualification {
      const source = deps.derivedResultSource;
      if (source === undefined) {
        return Object.freeze({
          subjectDigest: null,
          runRef: null,
          satisfied: false,
          detail: "this deployment composes no derived-result subject source, so a required derived verification cannot be evaluated",
        });
      }
      let subject;
      try {
        subject = source.materialize(candidateId);
      } catch (error) {
        return Object.freeze({
          subjectDigest: null,
          runRef: null,
          satisfied: false,
          detail: `the derived result "${candidateId}" cannot be materialized: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      return qualifySubject(subject);
    },

    status,

    async history(limit?: number): Promise<readonly ProjectVerificationRun[]> {
      const all = [...deps.store.list(deps.projectId)].reverse();
      if (limit === undefined) return Object.freeze(all);
      return Object.freeze(all.slice(0, Math.max(0, limit)));
    },

    async unresolved(): Promise<readonly ProjectVerificationRun[]> {
      return deps.store.unresolved(deps.projectId);
    },

    verifyHistoryChain(): { readonly ok: boolean; readonly problem?: string | undefined } {
      return deps.store.verifyChain(deps.projectId);
    },
  });
}

/** §15/§19: the honest VERIFY runtime facts a posture/advisor derives from. */
export interface ProjectVerificationRuntimeFacts {
  readonly runtimeAvailable: boolean;
  readonly independentVerifyAvailable: boolean;
  readonly independentVerifierRefs: readonly string[];
  readonly declaredSeparateVerifierRefs: readonly string[];
  readonly defaultVerifierRef: string | null;
  readonly note: string;
}

export function runtimeFactsOf(status: ProjectVerificationStatus): ProjectVerificationRuntimeFacts {
  return Object.freeze({
    runtimeAvailable: status.runtimeAvailable,
    independentVerifyAvailable: status.independentVerifyAvailable,
    independentVerifierRefs: status.independentVerifierRefs,
    declaredSeparateVerifierRefs: status.declaredSeparateVerifierRefs,
    defaultVerifierRef: status.defaultVerifierRef,
    note: status.independentVerifyAvailable
      ? `VERIFY is available from a real independent runtime (${status.independentVerifierRefs.join(", ")})`
      : status.runtimeAvailable
        ? "a verification runtime exists but no registered verifier counts as independent; VERIFY is not available"
        : "no verification runtime exists; the VERIFY preference is retained and reported honestly",
  });
}

export type { ProjectVerificationState };
