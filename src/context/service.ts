/**
 * PLMP-CTX-2 / PLMP-CTX-3 / PLMP-CTX-4 / §D5-c2 / SR-2 §十二 — the CONTEXT SERVICE.
 *
 *     TaskLatestContext  ≠  AttemptCompiledContext
 *
 * Context compilation grew from a helper into a load-bearing part of D5: an attempt's manifest is
 * now the record of WHAT THAT ATTEMPT was given, and its `continuation` block is the read-only
 * presentation of a prior result. Four entry points had accumulated inside `ProjectController` —
 * `compileTaskContext`, `fetchContext`, `workWorkerAttemptContext` and the private lineage scan —
 * each reading owners the controller also used for other purposes.
 *
 * This module is that owner. It consumes a narrow port set and produces context; it writes exactly
 * ONE event (`CONTEXT_MANIFEST_ADDED`, append-once per attempt) and no other canonical fact.
 *
 * ## THE TWO IDENTITIES THAT MUST NOT BE CONFLATED
 *
 *   TaskLatestContext ≠ AttemptCompiledContext   an attempt fetches ITS OWN manifest. Resolving by
 *                                                task-latest was context time travel — `fetch(A0)`
 *                                                returning M1 — the same defect D5-b1 fixed for
 *                                                envelopes, fixed here for context.
 *
 *   PriorResultContext is PRESENTATION, not authority   the block says what a prior attempt did and
 *                                                how the world moved. Nothing in it qualifies the
 *                                                new attempt: historical verification entries are
 *                                                labelled historical and are never a qualification.
 *
 * ## WHAT THIS MODULE DOES NOT DO
 *
 *   · it does not decide what an attempt IS — the Work owner does (attempt identity, envelope);
 *   · it does not run a model. Retrieval is the lexical channel plus the optional semantic channel;
 *   · it does not admit, verify, promote or settle anything.
 *
 * Layer: L2 (`src/context/`). Consumed by the controller's façades and by D2-d's delegation kernel.
 */
import {
  actionKey,
  stableEntityId,
} from "../domain/idempotency.js";
import { DomainValidationError } from "../domain/errors.js";
import {
  attemptReportDigestOf,
  parseAttemptReport,
  type TaskEnvelope,
} from "../schema/index.js";
import { attemptResultSubjectDigestOf, type ProjectVerificationRun } from "../project_verification/index.js";
import { promotionChainBasis, type PromotionFact } from "../domain/project_head.js";
import {
  assessCoverage,
  buildContextManifest,
  distributeContext,
  type ContextDistribution,
  type ContextManifest,
  type CoverageAssessment,
} from "../context/index.js";
import { compileContextRequirement } from "../context/requirement.js";
import { compilePriorResultContext, type PriorResultContext } from "../context/prior_result.js";

/**
 * The task-level static half a worker receives.
 *
 * SR-2 §十二: declared HERE as plain structural data rather than imported from the host bundle
 * (`src/deployment/work_worker.ts`). That module is L5 — it RUNS a worker — and an L2 context owner
 * naming it would be an upward dependency for a shape that carries no behaviour. The host's own
 * interface remains the transport's contract; this is the producer's view of what it produces, and
 * the two agree structurally because the fields are the facts.
 */
export interface WorkWorkerTaskContext {
  readonly projectGoal: string;
  readonly requirements: readonly string[];
  readonly decisions: readonly string[];
  readonly objective: string;
  readonly writeScope: readonly string[];
  readonly requiredArtifacts: readonly string[];
  readonly baseCommit: string;
  readonly completionChecks: readonly string[];
  readonly independentVerificationRequired: boolean;
}

/**
 * The composed worker context D5-c3 delivers: the task half plus THIS attempt's compiled half.
 *
 * The entry shapes are the DISTRIBUTION's own (`boot` carries a byte count, `handles` does not) —
 * declared precisely rather than as `unknown[]`, because the delivery is a contract the D5-c3 proofs
 * assert on.
 */
export interface WorkWorkerAttemptContext {
  readonly work: WorkWorkerTaskContext;
  readonly compiled: {
    readonly manifestId: string;
    readonly boot: readonly Readonly<{ handle: string; kind: string; ref: string; bytes: number }>[];
    readonly handles: readonly Readonly<{ handle: string; kind: string; ref: string }>[];
    readonly continuation?: PriorResultContext | undefined;
  };
}

/** One attempt's durable row facts the compiler needs. */
export interface ContextAttemptRow {
  readonly attemptId: string;
  readonly taskId: string;
  readonly state: string;
}

/** One evidence row, for the requirement's prior-failure and stale sets. */
export interface ContextEvidenceRow {
  readonly evidenceId: string;
  readonly status: string;
  readonly subjectId: string;
}

/** The canonical task facts a requirement is compiled from. */
export interface ContextTaskFacts {
  readonly taskId: string;
  readonly objective: string;
  readonly requiredArtifacts: readonly string[];
  readonly writePaths: readonly string[];
  readonly dependsOn: readonly string[];
}

/** The project facts a requirement is compiled from. */
export interface ContextProjectFacts {
  readonly revision: number;
  readonly headCommit: string;
  readonly tasks: readonly ContextTaskFacts[];
}

/** One resolved result subject, for the continuation block. */
export interface ContextOriginResult {
  readonly envelopeId: string;
  readonly baseCommit: string;
  /**
   * The origin attempt's report, in the compiler's own payload shape (snake_case), AND the raw
   * stored report the digest is taken over.
   *
   * Both are carried because they answer different questions: the shaped one is what the
   * presentation shows, and `raw` is the exact body `attemptReportDigestOf(parseAttemptReport(raw))`
   * hashes — the SAME report the verification plane digested. Synthesizing a partial report and
   * hashing THAT would produce a subject digest that disagrees with the verification plane's, which
   * is precisely the drift the subject digest exists to prevent.
   */
  readonly report:
    | {
        readonly summary: string;
        readonly changed_files: readonly string[];
        readonly result_commit: string | null;
      }
    | undefined;
  /** The attempt's stored report verbatim, for the digest. Null when it has none. */
  readonly rawReport: unknown;
}

/**
 * THE PORTS. Everything here is a read the controller or another owner already answers; the
 * service composes them into a manifest.
 */
export interface ContextServicePorts {
  readonly projectId: string;
  /** The canonical project facts. */
  project(): ContextProjectFacts;
  /** One attempt row, or null. */
  attempt(attemptId: string): ContextAttemptRow | null;
  /** Every attempt of this project (for the requirement's failure/stale sets). */
  attempts(): readonly ContextAttemptRow[];
  /** Every evidence row of this project. */
  evidence(): readonly ContextEvidenceRow[];
  /** The lexical retrieval channel over the attempt's world. */
  scanLexical(input: { readonly attemptId: string; readonly terms: readonly string[] }): Promise<readonly { readonly path: string; readonly line: number; readonly snippet: string; readonly term: string }[]>;
  /** The optional semantic channel; absent ⇒ the manifest honestly records no semantic hits. */
  semanticHits?(input: { readonly attemptId: string; readonly query: string }): Promise<readonly { readonly path: string; readonly score_permille: number }[] | undefined>;
  /** The task's canonical envelope. */
  taskEnvelope(taskId: string): TaskEnvelope;
  /** The completion contract for one envelope. */
  completionContractForEnvelope(envelope: TaskEnvelope): { readonly verification: { readonly required: boolean } };
  /** The mechanical check summary, for the worker's task half. */
  mechanicalCheckSummary(): readonly string[];
  /** The confirmed standard, for the worker's task half. */
  hasStandard(): boolean;
  /** The committed promotion facts, for the world-transition coordinates. */
  promotionFacts(): readonly PromotionFact[];
  /** The verification history store, when the deployment composes one. */
  verificationHistory?: { list(projectId: string): readonly ProjectVerificationRun[] } | undefined;
  /** The attempt's own creation event id — the bound that makes the lineage attempt-scoped. */
  attemptCreatedEventId(attemptId: string): number | null;
  /** The governed TASK_READY events for a task, newest first, before a bound. */
  reworkProvenanceBefore(input: { readonly taskId: string; readonly beforeEventId: number }): readonly { readonly eventId: number; readonly provenance: Record<string, unknown> }[];
  /** One attempt's authorization envelope + report, for the origin result's coordinates. */
  originResult(attemptId: string): ContextOriginResult | null;
  /** Append the manifest event (append-once per attempt). */
  appendManifest(input: { readonly attemptId: string; readonly manifest: ContextManifest; readonly expectedProjectRevision: number }): void;
  /** The manifest already compiled for this identity, or null — what makes compilation idempotent. */
  existingManifest?(manifestId: string): ContextManifest | null;
  /** One evidence atom's body, for a resolved `@ctx/evidence:…` handle. */
  evidenceBody?(evidenceId: string): unknown;
  /** The project's goal, for the worker's task half. */
  projectGoal(): string;
  /** The project's requirement statements. */
  requirementStatements(): readonly string[];
  /** The project's decision statements. */
  decisionStatements(): readonly string[];
  readonly clock?: (() => string) | undefined;
}

export interface ContextCompilation {
  readonly manifest: ContextManifest;
  readonly coverage: CoverageAssessment;
  readonly distribution: ContextDistribution;
}

export interface ContextService {
  /** Compile (or return the already-compiled) manifest for ONE attempt. */
  compile(attemptId: string, options?: { readonly verificationHistory?: { list(projectId: string): readonly ProjectVerificationRun[] } }): Promise<ContextCompilation>;
  /**
   * Resolve a `@ctx/…` handle against THIS ATTEMPT's own manifest.
   *
   * Never the task's latest: one task can carry generations of attempts (A0 → M0, A1 → M1), and
   * resolving by task-latest was context time travel.
   */
  fetch(attemptId: string, handle: string): Promise<{ readonly kind: "exact" | "source" | "evidence"; readonly ref: string; readonly body: unknown } | undefined>;
  /** The composed worker context: the task half + this attempt's compiled half. */
  workWorkerContext(attemptId: string, options?: { readonly verificationHistory?: { list(projectId: string): readonly ProjectVerificationRun[] } }): Promise<WorkWorkerAttemptContext>;
  /** The task-level static half a worker receives. */
  taskContext(taskId: string): WorkWorkerTaskContext;
}

/** The deterministic manifest identity for one attempt — the SAME key compile and fetch use. */
export function contextManifestIdOf(projectId: string, attemptId: string): string {
  return stableEntityId(
    "context-manifest",
    actionKey("context-manifest-v1", { project_id: projectId, attempt_id: attemptId }),
  );
}

const STOPWORDS = new Set(["the", "and", "for", "with", "this", "that", "from", "into", "complete"]);

export function makeContextService(ports: ContextServicePorts): ContextService {
  const now = (): string => (ports.clock ?? (() => new Date().toISOString()))();

  /**
   * §D5-c2: the durable rework lineage for THIS attempt — the latest governed TASK_READY that
   * carried `rework_provenance` for the task STRICTLY BEFORE the attempt's own creation event.
   * Bounding by creation is what makes the context attempt-scoped: an attempt compiled later cannot
   * absorb a rework that did not exist when it was created.
   */
  const reworkLineageFor = (attemptId: string, taskId: string): { readonly reworkEventId: number; readonly provenance: Record<string, unknown> } | undefined => {
    const createdEventId = ports.attemptCreatedEventId(attemptId);
    if (createdEventId === null) return undefined;
    const rows = ports.reworkProvenanceBefore({ taskId, beforeEventId: createdEventId });
    for (const row of rows) {
      const provenance = row.provenance.rework_provenance;
      if (provenance !== undefined && provenance !== null) {
        return { reworkEventId: row.eventId, provenance: provenance as Record<string, unknown> };
      }
    }
    return undefined;
  };

  const compile = async (
    attemptId: string,
    options: { readonly verificationHistory?: { list(projectId: string): readonly ProjectVerificationRun[] } } = {},
  ): Promise<ContextCompilation> => {
    const attemptRow = ports.attempt(attemptId);
    if (attemptRow === null) throw new DomainValidationError("attempt does not exist");
    const taskId = attemptRow.taskId;
    const project = ports.project();
    const task = project.tasks.find((item) => item.taskId === taskId);
    if (task === undefined) throw new DomainValidationError("task does not exist");

    const manifestId = contextManifestIdOf(ports.projectId, attemptId);
    // IDEMPOTENT: an attempt keeps the manifest it was compiled with. Re-compiling would rewrite
    // provenance, and the world having moved is not a reason to rewrite what an attempt was given.
    const existing = ports.existingManifest?.(manifestId) ?? null;
    if (existing !== null) {
      return {
        manifest: existing,
        coverage: assessCoverage(existing.requirement, existing),
        distribution: distributeContext(existing),
      };
    }

    // Requirement inputs: prior-failure evidence and the stale set come from the projections;
    // upstream write surfaces come from depends_on tasks.
    const attempts = ports.attempts();
    const failedAttemptIds = new Set(attempts.filter((row) => row.taskId === taskId && row.state === "FAILED").map((row) => row.attemptId));
    const priorFailureEvidence: string[] = [];
    const staleRefs: string[] = [];
    for (const row of attempts) {
      if (row.state === "STALE") staleRefs.push(row.attemptId);
    }
    for (const row of ports.evidence()) {
      if (row.status === "stale") staleRefs.push(row.evidenceId);
      if (failedAttemptIds.has(row.subjectId) && row.status === "active") priorFailureEvidence.push(row.evidenceId);
    }
    const upstreamWritePaths = task.dependsOn.flatMap((dependency) => {
      const upstream = project.tasks.find((item) => item.taskId === dependency);
      return upstream?.writePaths ?? [];
    });
    const requirement = compileContextRequirement({
      projectId: ports.projectId,
      taskId,
      requiredArtifacts: task.requiredArtifacts,
      writePaths: task.writePaths,
      upstreamWritePaths,
      priorFailureEvidence,
      staleRefs,
    });

    // Deterministic retrieval terms: objective + artifact tokens (V0, no model).
    const tokens = new Set<string>();
    for (const token of `${task.objective} ${task.requiredArtifacts.join(" ")}`.toLowerCase().split(/[^a-z0-9]+/)) {
      if (token.length >= 4 && !STOPWORDS.has(token)) tokens.add(token);
    }
    const source = await ports.scanLexical({ attemptId, terms: [...tokens].slice(0, 8) });
    const semantic = await ports.semanticHits?.({
      attemptId,
      query: `${task.objective} ${task.requiredArtifacts.join(" ")}`,
    });

    // §D5-c2: the PRIOR RESULT CONTEXT — compiled only for an attempt whose task was reopened by a
    // governed rework, and only from owners that already hold each fact. An ordinary attempt's
    // manifest carries no continuation block.
    const lineage = reworkLineageFor(attemptId, taskId);
    let continuation: PriorResultContext | undefined;
    if (lineage !== undefined) {
      const subject = lineage.provenance.origin_result_subject as Record<string, unknown>;
      const originAttemptId = String(subject.ref);
      const origin = ports.originResult(originAttemptId);
      // FAIL CLOSED on an unresolvable origin: the durable lineage names a fact the owners must be
      // able to produce. A silent empty-coordinate context would be exactly the kind of fabricated
      // presentation this compiler exists to prevent.
      if (origin === null) {
        throw new DomainValidationError(
          `the rework lineage names origin result "${originAttemptId}", whose authorization cannot be resolved — refusing to compile a fabricated prior-result context`,
        );
      }
      const originSubjectDigest =
        origin.report === undefined || origin.report.result_commit === null
          ? null
          : attemptResultSubjectDigestOf({
              schemaVersion: 1,
              kind: "ATTEMPT_RESULT",
              projectId: ports.projectId,
              taskId,
              attemptId: originAttemptId,
              envelopeId: origin.envelopeId,
              baseCommit: origin.baseCommit,
              resultCommit: origin.report.result_commit,
              reportDigest: attemptReportDigestOf(parseAttemptReport(origin.rawReport)),
            });
      continuation = compilePriorResultContext({
        reworkEventId: lineage.reworkEventId,
        provenance: {
          origin_result_subject: { kind: String(subject.kind), ref: originAttemptId },
          origin_basis_digest: String(lineage.provenance.origin_basis_digest),
          target_observation_digest: String(lineage.provenance.target_observation_digest),
          reason: String(lineage.provenance.reason),
          ...(lineage.provenance.continuation_assessment_digest === undefined
            ? {}
            : { continuation_assessment_digest: String(lineage.provenance.continuation_assessment_digest) }),
        },
        originEnvelope: { envelope_id: origin.envelopeId, base_commit: origin.baseCommit },
        originReport: origin.report,
        originSubjectDigest,
        verificationRuns: (options.verificationHistory ?? ports.verificationHistory)?.list(ports.projectId) ?? [],
        promotionChain: promotionChainBasis(origin.baseCommit, ports.promotionFacts()),
        currentHead: project.headCommit,
      });
    }

    const manifest = buildContextManifest({
      manifestId,
      taskId,
      projectRevision: project.revision,
      requirement,
      source: [...source],
      semantic,
      continuation,
      createdAt: now(),
    });
    ports.appendManifest({ attemptId, manifest, expectedProjectRevision: project.revision });
    return {
      manifest,
      coverage: assessCoverage(manifest.requirement, manifest),
      distribution: distributeContext(manifest),
    };
  };

  return Object.freeze({
    compile,

    async fetch(attemptId: string, handle: string) {
      if (ports.attempt(attemptId) === null) return undefined;
      /**
       * §D5-c2: an attempt fetches ITS OWN compiled manifest — the same deterministic identity
       * `compile` writes — never the task's latest one. After D5, one task can carry generations of
       * attempts (A0 → M0, A1 → M1); resolving by task-latest was context time travel
       * (fetch(A0) returning M1).
       */
      const manifest = ports.existingManifest?.(contextManifestIdOf(ports.projectId, attemptId)) ?? null;
      if (manifest === null) return undefined;
      const distribution = distributeContext(manifest);
      const entry = [...distribution.boot, ...distribution.handles].find((candidate) => candidate.handle === handle);
      if (entry === undefined) return undefined;
      if (entry.kind === "evidence") {
        const body = ports.evidenceBody?.(entry.ref) ?? undefined;
        return body === undefined ? undefined : { kind: entry.kind, ref: entry.ref, body };
      }
      if (entry.kind === "source") {
        const source = manifest.source.find((candidate) => candidate.path === entry.ref);
        return source === undefined ? undefined : { kind: entry.kind, ref: entry.ref, body: source };
      }
      const exact = manifest.exact.find((candidate) => candidate.ref === entry.ref);
      return exact === undefined ? undefined : { kind: entry.kind, ref: entry.ref, body: exact };
    },

    async workWorkerContext(
      attemptId: string,
      options: { readonly verificationHistory?: { list(projectId: string): readonly ProjectVerificationRun[] } } = {},
    ) {
      const attemptRow = ports.attempt(attemptId);
      if (attemptRow === null) {
        throw new DomainValidationError(
          `attempt "${attemptId}" does not exist — worker context is compiled per attempt, after the attempt's identity and world exist`,
        );
      }
      const work = taskContextOf(attemptRow.taskId);
      const compiled = await compile(attemptId, options);
      return Object.freeze({
        work,
        compiled: Object.freeze({
          manifestId: compiled.manifest.manifest_id,
          boot: Object.freeze(compiled.distribution.boot.map((entry) => Object.freeze({ ...entry }))),
          handles: Object.freeze(compiled.distribution.handles.map((entry) => Object.freeze({ ...entry }))),
          ...(compiled.manifest.continuation === undefined ? {} : { continuation: compiled.manifest.continuation }),
        }),
      });
    },

    taskContext(taskId: string): WorkWorkerTaskContext {
      return taskContextOf(taskId);
    },
  });

  function taskContextOf(taskId: string): WorkWorkerTaskContext {
    const envelope = ports.taskEnvelope(taskId);
    const project = ports.project();
    const task = project.tasks.find((entry) => entry.taskId === taskId);
    if (task === undefined) {
      throw new DomainValidationError(`task "${taskId}" is not part of the canonical project`);
    }
    const contract = ports.completionContractForEnvelope(envelope);
    return Object.freeze({
      projectGoal: ports.projectGoal(),
      requirements: Object.freeze([...ports.requirementStatements()]),
      decisions: Object.freeze([...ports.decisionStatements()]),
      objective: task.objective,
      writeScope: Object.freeze([...envelope.write_paths]),
      requiredArtifacts: Object.freeze([...envelope.required_artifacts]),
      baseCommit: envelope.base_commit,
      completionChecks: ports.hasStandard() ? Object.freeze([...ports.mechanicalCheckSummary()]) : Object.freeze([] as string[]),
      independentVerificationRequired: contract.verification.required,
    });
  }
}
