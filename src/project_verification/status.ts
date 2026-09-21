/**
 * G10-AD §13 — the DERIVED current verification status.
 *
 *   state == "PASS" means ONLY "the named verifier protocol passed"
 *
 * Nothing here is stored: the status is a pure derivation over the canonical
 * ProjectIR head, the registry's CURRENT definitions and the append-only run
 * history. That is what makes §13's freshness binding honest:
 *
 *   a run's freshness binds project revision + project digest + head commit +
 *   the verifier DEFINITION digest;
 *
 * so a head change or a protocol change stales an old run BY DERIVATION — the
 * history is never deleted, rewritten or silently re-labelled.
 */

import {
  sameSubject,
  type ProjectHeadVerificationSubject,
  type ProjectVerificationFreshness,
  type ProjectVerificationRun,
  type ProjectVerificationVerdict,
} from "./artifacts.js";
import {
  countsAsIndependent,
  independenceBasis,
} from "./independence.js";
import type { ProjectVerifierRegistry } from "./registry.js";

export const PROJECT_VERIFICATION_STATES = [
  /** No registered verifier can actually execute in this deployment. */
  "UNAVAILABLE",
  /** A runtime exists, but this exact head was never verified. */
  "UNVERIFIED",
  /** A run for this exact head is open (STARTED with no result yet). */
  "VERIFYING",
  "PASS",
  "FAIL",
  "SCORE",
  "UNRESOLVED",
  "ERROR",
  /** A run exists but no longer describes this input/protocol. */
  "STALE",
] as const;
export type ProjectVerificationState = (typeof PROJECT_VERIFICATION_STATES)[number];

/** The derivation-level freshness of ONE run (richer than the stored value). */
export const PROJECT_VERIFICATION_RUN_FRESHNESS = [
  "CURRENT",
  /** The project head/revision/digest moved after this run. */
  "STALE_SUBJECT",
  /** The input moved DURING this run, or the repository moved after it (§5). */
  "STALE_INPUT",
  /** The verifier definition digest (the protocol) changed after this run. */
  "STALE_VERIFIER_DEFINITION",
] as const;
export type ProjectVerificationRunFreshness =
  (typeof PROJECT_VERIFICATION_RUN_FRESHNESS)[number];

/** §13: what a PASS/FAIL/SCORE actually means. Never "the world is true". */
export const PROJECT_VERIFICATION_VERDICT_SCOPE = "named_verifier_protocol_only" as const;

export interface ProjectVerificationRunView {
  readonly run: ProjectVerificationRun;
  readonly freshness: ProjectVerificationRunFreshness;
  /** TRUE iff the run describes the CURRENT head under the CURRENT protocol. */
  readonly current: boolean;
  readonly reasons: readonly string[];
  /** Whether the recorded independence class counts (§10). */
  readonly independent: boolean;
  readonly independenceBasis: string;
}

export interface ProjectVerificationStatus {
  readonly schemaVersion: 1;
  readonly projectId: string;
  /** The exact current ProjectIR head, or null when it cannot be materialized. */
  readonly subject: ProjectHeadVerificationSubject | null;
  /** The actual repository head, when a git seam exists (never invented). */
  readonly repositoryHead: string | null;
  /** null when no repository seam exists; otherwise headCommit === repositoryHead. */
  readonly repositoryConsistent: boolean | null;
  /** At least one registered verifier is EXECUTABLE in this deployment. */
  readonly runtimeAvailable: boolean;
  /** §15: runtimeAvailable AND at least one verifier counts as independent. */
  readonly independentVerifyAvailable: boolean;
  readonly registeredVerifierRefs: readonly string[];
  readonly executableVerifierRefs: readonly string[];
  readonly independentVerifierRefs: readonly string[];
  /** §10: displayed as declared, never silently upgraded. */
  readonly declaredSeparateVerifierRefs: readonly string[];
  readonly defaultVerifierRef: string | null;
  readonly latestRun: ProjectVerificationRunView | null;
  readonly currentSubjectRun: ProjectVerificationRunView | null;
  /** §26: the newest CURRENT, COMPLETED, INDEPENDENT run for this exact head. */
  readonly freshIndependentRun: ProjectVerificationRunView | null;
  /** Runs that never produced a verdict (a crash leaves one). */
  readonly unresolvedRunIds: readonly string[];
  readonly state: ProjectVerificationState;
  readonly verdictScope: typeof PROJECT_VERIFICATION_VERDICT_SCOPE;
  readonly detail: string;
  readonly derivedAt: string;
}

const VERDICT_STATES: Readonly<Record<ProjectVerificationVerdict, ProjectVerificationState>> =
  Object.freeze({
    PASS: "PASS",
    FAIL: "FAIL",
    SCORE: "SCORE",
    UNRESOLVED: "UNRESOLVED",
    ERROR: "ERROR",
  });

export function stateForVerdict(verdict: ProjectVerificationVerdict): ProjectVerificationState {
  return VERDICT_STATES[verdict];
}

export function deriveRunFreshness(input: {
  readonly run: ProjectVerificationRun;
  readonly subject: ProjectHeadVerificationSubject | null;
  readonly repositoryHead: string | null;
  readonly registry: ProjectVerifierRegistry;
}): { readonly freshness: ProjectVerificationRunFreshness; readonly reasons: readonly string[] } {
  const reasons: string[] = [];
  const { run, subject, repositoryHead, registry } = input;
  if (subject === null) {
    return Object.freeze({ freshness: "STALE_SUBJECT", reasons: Object.freeze(["the current project head cannot be materialized"]) });
  }
  // §B.13: the head rule applies ONLY to head subjects. A run over an attempt result is not a
  // current-head verification and must never be counted as one (A37's head side), and it must never
  // be judged by the ambient head — its freshness is rematerialized from canonical Work instead.
  if (run.subject.kind !== "CURRENT_PROJECT_HEAD") {
    reasons.push(
      "this run verified an attempt result, not the project head — the head-staleness rule does not apply to it",
    );
    return Object.freeze({ freshness: "STALE_SUBJECT", reasons: Object.freeze(reasons) });
  }
  const runSubject = run.subject;
  if (!sameSubject(runSubject, subject)) {
    reasons.push(
      `the project head moved: this run verified revision ${runSubject.projectRevision} (commit ${runSubject.headCommit}), the current head is revision ${subject.projectRevision} (commit ${subject.headCommit})`,
    );
    return Object.freeze({ freshness: "STALE_SUBJECT", reasons: Object.freeze(reasons) });
  }
  if (run.freshness === "STALE_INPUT") {
    reasons.push("the verified input moved while this run was in flight (§5: history, not current verification)");
    return Object.freeze({ freshness: "STALE_INPUT", reasons: Object.freeze(reasons) });
  }
  const definition = registry.get(run.verifierRef);
  if (definition === undefined) {
    reasons.push(
      `the verifier "${run.verifierRef}" is no longer registered, so its protocol can no longer be reproduced`,
    );
    return Object.freeze({ freshness: "STALE_VERIFIER_DEFINITION", reasons: Object.freeze(reasons) });
  }
  if (definition.digest !== run.verifierDefinitionDigest) {
    reasons.push(
      `the verifier definition digest changed (${run.verifierDefinitionDigest} -> ${definition.digest}): the protocol this run used is not the registered protocol any more`,
    );
    return Object.freeze({ freshness: "STALE_VERIFIER_DEFINITION", reasons: Object.freeze(reasons) });
  }
  if (repositoryHead !== null && repositoryHead !== runSubject.headCommit) {
    reasons.push(
      `the repository head moved to ${repositoryHead} after this run verified ${runSubject.headCommit}`,
    );
    return Object.freeze({ freshness: "STALE_INPUT", reasons: Object.freeze(reasons) });
  }
  return Object.freeze({ freshness: "CURRENT", reasons: Object.freeze([] as string[]) });
}

function viewOf(input: {
  readonly run: ProjectVerificationRun;
  readonly subject: ProjectHeadVerificationSubject | null;
  readonly repositoryHead: string | null;
  readonly registry: ProjectVerifierRegistry;
}): ProjectVerificationRunView {
  const derived = deriveRunFreshness(input);
  const definition = input.registry.get(input.run.verifierRef);
  const independent =
    definition === undefined ? input.run.independence === "MECHANICAL_INDEPENDENT" : countsAsIndependent(definition);
  return Object.freeze({
    run: input.run,
    freshness: derived.freshness,
    current: derived.freshness === "CURRENT",
    reasons: derived.reasons,
    independent,
    independenceBasis:
      definition === undefined
        ? `recorded independence ${input.run.independence} (the verifier is no longer registered)`
        : // The registered definition's real separation contract, not a bare
          // class token: the product surface explains WHY it counts (or does not).
          independenceBasis(definition),
  });
}

export interface DeriveProjectVerificationStatusInput {
  readonly projectId: string;
  readonly subject: ProjectHeadVerificationSubject | null;
  /** Why the subject could not be materialized, when `subject` is null. */
  readonly subjectError?: string | null | undefined;
  readonly repositoryHead: string | null;
  /** The append-only history, oldest first. */
  readonly runs: readonly ProjectVerificationRun[];
  readonly registry: ProjectVerifierRegistry;
  /** Refs the deployment can actually EXECUTE (a provider is bound). */
  readonly executableVerifierRefs: readonly string[];
  readonly defaultVerifierRef?: string | null | undefined;
  readonly derivedAt: string;
}

/**
 * §13. Pure and total: the same ProjectIR head, registry and history always
 * derive the same status, and an old run is staled by derivation only.
 */
export function deriveProjectVerificationStatus(
  input: DeriveProjectVerificationStatusInput,
): ProjectVerificationStatus {
  const registry = input.registry;
  const registeredVerifierRefs = Object.freeze(registry.list().map((definition) => definition.verifierRef));
  const executable = new Set(input.executableVerifierRefs);
  const executableVerifierRefs = Object.freeze(
    registeredVerifierRefs.filter((ref) => executable.has(ref)),
  );
  const independentVerifierRefs = Object.freeze(
    registry
      .list()
      .filter((definition) => executable.has(definition.verifierRef) && countsAsIndependent(definition))
      .map((definition) => definition.verifierRef),
  );
  const declaredSeparateVerifierRefs = Object.freeze(
    registry
      .list()
      .filter((definition) => definition.independenceClass === "DECLARED_SEPARATE")
      .map((definition) => definition.verifierRef),
  );
  const defaultVerifierRef =
    input.defaultVerifierRef ??
    independentVerifierRefs[0] ??
    executableVerifierRefs[0] ??
    registeredVerifierRefs[0] ??
    null;
  const runtimeAvailable = executableVerifierRefs.length > 0;
  const independentVerifyAvailable = runtimeAvailable && independentVerifierRefs.length > 0;

  const views = Object.freeze(
    input.runs.map((run) =>
      viewOf({ run, subject: input.subject, repositoryHead: input.repositoryHead, registry }),
    ),
  );
  const latestRun = views.length === 0 ? null : views[views.length - 1]!;
  const subjectViews =
    input.subject === null
      ? []
      : views.filter((view) => sameSubject(view.run.subject, input.subject!));
  const currentSubjectRun = subjectViews.length === 0 ? null : subjectViews[subjectViews.length - 1]!;
  const freshIndependentRun =
    [...subjectViews]
      .reverse()
      .find(
        (view) => view.current && view.run.status === "COMPLETED" && view.independent,
      ) ?? null;
  const unresolvedRunIds = Object.freeze(
    input.runs.filter((run) => run.status === "STARTED").map((run) => run.runId),
  );
  const repositoryConsistent =
    input.repositoryHead === null || input.subject === null
      ? null
      : input.repositoryHead === input.subject.headCommit;

  let state: ProjectVerificationState;
  let detail: string;
  if (input.subject === null) {
    state = "UNAVAILABLE";
    detail = `there is no current project head to verify: ${input.subjectError ?? "the ProjectIR could not be materialized"}`;
  } else if (!runtimeAvailable) {
    state = "UNAVAILABLE";
    detail =
      registeredVerifierRefs.length === 0
        ? "no verifier is registered in this deployment, so VERIFY has no runtime"
        : `no registered verifier is executable in this deployment (registered: ${registeredVerifierRefs.join(", ")})`;
  } else if (currentSubjectRun !== null && currentSubjectRun.run.status === "STARTED") {
    state = "VERIFYING";
    detail = `a run for this exact head is open (${currentSubjectRun.run.runId}) and has produced no verdict yet; nothing is claimed`;
  } else if (currentSubjectRun === null) {
    state = "UNVERIFIED";
    detail =
      input.runs.length === 0
        ? "no verification has ever run for this project"
        : "no recorded run covers this exact project head; previous runs are retained as history";
  } else if (!currentSubjectRun.current) {
    state = "STALE";
    detail = currentSubjectRun.reasons.join("; ");
  } else if (currentSubjectRun.run.status !== "COMPLETED" || currentSubjectRun.run.verdict === null) {
    state = "UNVERIFIED";
    detail = `the newest run for this head was ${currentSubjectRun.run.status} and established no verdict`;
  } else {
    state = stateForVerdict(currentSubjectRun.run.verdict);
    detail =
      state === "PASS"
        ? `the named verifier protocol "${currentSubjectRun.run.verifierRef}" passed for this exact project head; this is a protocol result, not truth`
        : `the named verifier protocol "${currentSubjectRun.run.verifierRef}" returned ${state} for this exact project head`;
  }

  return Object.freeze({
    schemaVersion: 1,
    projectId: input.projectId,
    subject: input.subject,
    repositoryHead: input.repositoryHead,
    repositoryConsistent,
    runtimeAvailable,
    independentVerifyAvailable,
    registeredVerifierRefs,
    executableVerifierRefs,
    independentVerifierRefs,
    declaredSeparateVerifierRefs,
    defaultVerifierRef,
    latestRun,
    currentSubjectRun,
    freshIndependentRun,
    unresolvedRunIds,
    state,
    verdictScope: PROJECT_VERIFICATION_VERDICT_SCOPE,
    detail,
    derivedAt: input.derivedAt,
  });
}

/** §19/§20: is verification DUE for the exact current head + default verifier? */
export function verificationIsDue(input: {
  readonly status: ProjectVerificationStatus;
  readonly verifierRef?: string | null | undefined;
}): { readonly due: boolean; readonly reason: string } {
  const { status } = input;
  const verifierRef = input.verifierRef ?? status.defaultVerifierRef;
  if (!status.independentVerifyAvailable) {
    return Object.freeze({
      due: false,
      reason: "VERIFY has no independent runtime in this deployment; the preference is retained but no candidate is created",
    });
  }
  if (verifierRef === null) {
    return Object.freeze({ due: false, reason: "no verifier ref is selected" });
  }
  const fresh = status.freshIndependentRun;
  if (fresh !== null && fresh.run.verifierRef === verifierRef) {
    return Object.freeze({
      due: false,
      reason: `the current head already has a fresh completed run (${fresh.run.runId}) under "${verifierRef}"; a fresh run prevents an automatic loop, and only a NEW head makes verification due again`,
    });
  }
  if (status.state === "VERIFYING") {
    return Object.freeze({ due: false, reason: "a run for this exact head is already open" });
  }
  return Object.freeze({
    due: true,
    reason:
      status.state === "UNVERIFIED"
        ? "the current project head has no verification under the selected verifier"
        : `verification is due again: ${status.detail}`,
  });
}
