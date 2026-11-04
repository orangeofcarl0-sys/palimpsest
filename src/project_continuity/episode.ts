/**
 * ALHS-A — the EPISODE CONCLUSION.
 *
 * The LHAPE-C pilot showed the same failure in all three conditions: a valid package existed within
 * 4–55% of the token budget, then the session kept editing and re-reading until the ceiling stopped
 * it. Nothing in the product represented "this episode's work is done" as an observable state, so the
 * only stopping rule left was the budget guard.
 *
 * This module adds that state WITHOUT adding a planner, a completion oracle or a second project store:
 *
 *   the MODEL states the judgement   (intent + statement + artifacts + what it waits for)
 *   the PRODUCT checks it against    (open tasks, open attempts, operator acceptance, blocked effects,
 *                                     artifact existence)
 *   the JOURNAL records it           (an ordinary REFERENCE_NOTE, parsed back by the pulse)
 *   the OPERATOR keeps authority     (a conclusion never accepts, promotes or approves anything)
 *
 * DELIVERED is therefore not "the goal is true". It is "the principal judged the episode's work
 * sufficient, and no mechanical project fact contradicted that judgement at this basis". A later
 * project fact reopens it. The distinction is deliberate: artifact existence is not goal completion,
 * all tasks satisfied is not business success, and a model's statement is not acceptance.
 *
 * Nothing here is canonical project state. The conclusion is a derived, advisory record with a basis;
 * the pulse re-derives its standing on every read and marks it REOPENED when the basis has moved.
 */
import { canonicalDigest } from "../schema/canonical.js";

export const EPISODE_MARKER = "<!-- pc1-episode-conclusion:v1 -->";

export const EPISODE_INTENTS = [
  "DELIVER",
  "WAIT_FOR_OPERATOR",
  "WAIT_FOR_EXTERNAL_EVENT",
  "REPLAN",
  "CONTINUE",
  "CHECKPOINT",
] as const;
export type EpisodeIntent = (typeof EPISODE_INTENTS)[number];

export const EPISODE_STATES = [
  "OPEN",
  "DELIVERED",
  "AWAITING_OPERATOR",
  "AWAITING_EXTERNAL_EVENT",
  "REPLANNING",
  "CHECKPOINT",
  "CONTINUING",
  "REOPENED",
] as const;
export type EpisodeState = (typeof EPISODE_STATES)[number];

export interface EpisodeReadinessFacts {
  readonly tasks: readonly {
    readonly taskId: string;
    readonly state: string;
    readonly workAcceptance?: string | undefined;
  }[];
  readonly attempts: readonly {
    readonly taskId: string | null;
    readonly state: string;
    readonly hostObserved: boolean;
  }[];
  readonly awaitingOperator: readonly string[];
  readonly unresolvedQuestions: readonly { readonly id: string; readonly title: string }[];
  readonly blockedEffects: readonly { readonly id: string; readonly detail: string }[];
  readonly negativeFindingRefs: readonly string[];
  readonly mechanicalActions: readonly string[];
}

export interface EpisodeReadiness {
  /** Tasks that still require work before this episode can honestly deliver. */
  readonly openTasks: readonly { readonly taskId: string; readonly state: string }[];
  /** Tasks whose execution failed or is blocked: a cited negative finding can make these deliverable. */
  readonly failedOrBlockedTasks: readonly { readonly taskId: string; readonly state: string }[];
  readonly openAttempts: readonly {
    readonly taskId: string | null;
    readonly state: string;
    readonly hostObserved: boolean;
  }[];
  readonly awaitingOperator: readonly string[];
  readonly unresolvedQuestions: readonly string[];
  readonly blockedEffects: readonly string[];
  readonly negativeFindingRefs: readonly string[];
  readonly mechanicalActions: readonly string[];
  /** Blockers that no document can resolve: live work, pending acceptance, blocked effects. */
  readonly deliveryBlockers: readonly string[];
  readonly detail: string;
}

const OPEN_ATTEMPT = new Set(["CREATED", "LEASED", "RUNNING"]);

/**
 * Build the factual readiness projection. It is not a completion verdict: it names what would
 * contradict a DELIVER conclusion, and leaves the semantic judgement to the principal.
 */
export function evaluateEpisodeReadiness(facts: EpisodeReadinessFacts): EpisodeReadiness {
  const openTasks = facts.tasks
    .filter((task) => task.state !== "SATISFIED" && task.state !== "STALE" && task.state !== "FAILED" && task.state !== "BLOCKED")
    .map((task) => ({ taskId: task.taskId, state: task.state }));
  const failedOrBlockedTasks = facts.tasks
    .filter((task) => task.state === "FAILED" || task.state === "BLOCKED")
    .map((task) => ({ taskId: task.taskId, state: task.state }));
  const openAttempts = facts.attempts
    .filter((attempt) => OPEN_ATTEMPT.has(attempt.state))
    .map((attempt) => ({ taskId: attempt.taskId, state: attempt.state, hostObserved: attempt.hostObserved }));

  const blockers: string[] = [];
  for (const task of openTasks) blockers.push(`task ${task.taskId} is ${task.state}`);
  for (const attempt of openAttempts) {
    blockers.push(
      `attempt for ${attempt.taskId ?? "unknown"} is ${attempt.state}${attempt.hostObserved ? " and a host job is active" : " but no host job is observed — inspect the world rather than assuming it is alive"}`,
    );
  }
  for (const ref of facts.awaitingOperator) blockers.push(`${ref} awaits an operator acceptance decision`);
  for (const effect of facts.blockedEffects) blockers.push(`blocked effect ${effect.id}: ${effect.detail}`);

  const detail =
    blockers.length === 0
      ? "no mechanical project fact contradicts a DELIVER conclusion; this does not mean the goal is met — that remains the principal's judgement and the operator's acceptance"
      : `${String(blockers.length)} mechanical fact(s) contradict a DELIVER conclusion; resolve them or record a different intent`;

  return Object.freeze({
    openTasks: Object.freeze(openTasks),
    failedOrBlockedTasks: Object.freeze(failedOrBlockedTasks),
    openAttempts: Object.freeze(openAttempts),
    awaitingOperator: Object.freeze([...facts.awaitingOperator]),
    unresolvedQuestions: Object.freeze(facts.unresolvedQuestions.map((question) => question.id)),
    blockedEffects: Object.freeze(facts.blockedEffects.map((effect) => effect.id)),
    negativeFindingRefs: Object.freeze([...facts.negativeFindingRefs]),
    mechanicalActions: Object.freeze([...facts.mechanicalActions]),
    deliveryBlockers: Object.freeze(blockers),
    detail,
  });
}

export interface EpisodeArtifactState {
  readonly path: string;
  readonly present: boolean;
  readonly tracked: boolean;
  /** Present in HEAD with no working-tree change for this path. */
  readonly committed: boolean;
  /**
   * PWRS-C: the artifact's content digest at the basis the conclusion recorded, so a later read can
   * tell that the bytes changed even when the ProjectIR revision and the Git HEAD did not. Absent on
   * conclusions recorded before this field existed.
   */
  readonly digest?: string | null | undefined;
  /** Where the bytes were found: the live worktree, a governed candidate's result commit, or nowhere. */
  readonly source?: "WORKTREE" | "RESULT_COMMIT" | "ABSENT" | undefined;
  /** The result commit a governed candidate was read from, when `source` is RESULT_COMMIT. */
  readonly commit?: string | null | undefined;
  readonly detail: string;
}

export interface EpisodeConclusion {
  readonly schema: "pc1-episode-conclusion/v1";
  readonly conclusionId: string;
  readonly intent: EpisodeIntent;
  readonly statement: string;
  readonly artifacts: readonly string[];
  readonly waitingOn: string | null;
  readonly nextStep: string | null;
  readonly evidenceRefs: readonly string[];
  readonly recordedAt: string;
  readonly basis: {
    readonly projectRevision: number;
    readonly projectDigest: string;
    readonly headCommit: string;
  };
  readonly check: {
    readonly deliveryBlockers: readonly string[];
    readonly awaitingOperator: readonly string[];
    readonly openTasks: readonly string[];
    readonly openAttempts: readonly string[];
    readonly unresolvedQuestions: readonly string[];
    readonly blockedEffects: readonly string[];
    /**
     * Provenance facts for the named artifacts. Additive: a conclusion recorded before this field
     * existed parses with it absent. DELIVER does not require a commit; the facts are reported so a
     * reader can see that the final bytes are only in the working tree.
     */
    readonly artifacts?: readonly EpisodeArtifactState[];
  };
}

export interface EpisodeConclusionInput {
  readonly intent: EpisodeIntent;
  readonly statement: string;
  readonly artifacts?: readonly string[] | undefined;
  readonly waitingOn?: string | null | undefined;
  readonly nextStep?: string | null | undefined;
  readonly evidenceRefs?: readonly string[] | undefined;
}

/** What the product answers after a conclusion attempt. RECORDED never means accepted. */
export interface EpisodeConclusionResult {
  readonly state: "RECORDED" | "REFUSED" | "UNAVAILABLE";
  readonly conclusion: EpisodeConclusion | null;
  readonly episode: PulseEpisode | null;
  readonly detail: string;
  readonly blockers: readonly string[];
  readonly readiness: EpisodeReadiness | null;
  /** Facts about the named artifacts' Git provenance; never a refusal by themselves. */
  readonly warnings?: readonly string[];
  readonly session: {
    readonly mayEnd: boolean;
    readonly detail: string;
  };
}

export interface EpisodeService {
  conclude(input: EpisodeConclusionInput): Promise<EpisodeConclusionResult>;
}

export interface EpisodeValidation {
  readonly ok: boolean;
  readonly blockers: readonly string[];
}

function text(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Check a conclusion against the readiness facts. The model chooses the intent; the product refuses
 * a conclusion whose own facts contradict it. It never upgrades a conclusion.
 */
export function validateEpisodeConclusion(input: {
  readonly conclusion: EpisodeConclusionInput;
  readonly readiness: EpisodeReadiness;
  /** Returns null when the deployment cannot check the path, else whether it exists as a file. */
  readonly artifactExists: ((path: string) => boolean | null) | undefined;
}): EpisodeValidation {
  const { conclusion, readiness } = input;
  const blockers: string[] = [];
  const statement = text(conclusion.statement);
  if (statement.length < 10) blockers.push("a conclusion needs a statement of at least 10 characters explaining the judgement");

  if (conclusion.intent === "DELIVER") {
    const artifacts = (conclusion.artifacts ?? []).map(text).filter((path) => path !== "");
    if (artifacts.length === 0) {
      const cited = (conclusion.evidenceRefs ?? []).filter((ref) => readiness.negativeFindingRefs.includes(ref));
      if (readiness.negativeFindingRefs.length === 0 || cited.length === 0) {
        blockers.push(
          "DELIVER needs at least one artifact path, or a cited accepted negative finding when the honest conclusion is that the objective cannot be met",
        );
      }
    } else if (input.artifactExists !== undefined) {
      for (const path of artifacts) {
        const exists = input.artifactExists(path);
        if (exists === false) blockers.push(`artifact does not exist at this repository: ${path}`);
      }
    }
    blockers.push(...readiness.deliveryBlockers);
    if (readiness.failedOrBlockedTasks.length > 0) {
      const negativeCited = (conclusion.evidenceRefs ?? []).some((ref) => readiness.negativeFindingRefs.includes(ref));
      if (!negativeCited) {
        for (const task of readiness.failedOrBlockedTasks) {
          blockers.push(`task ${task.taskId} is ${task.state}; cite a recorded negative finding to deliver a negative conclusion, or record a checkpoint`);
        }
      }
    }
  } else if (conclusion.intent === "WAIT_FOR_OPERATOR") {
    if (readiness.awaitingOperator.length === 0) {
      blockers.push("nothing in this project currently awaits an operator acceptance decision");
    }
  } else if (conclusion.intent === "WAIT_FOR_EXTERNAL_EVENT") {
    if (text(conclusion.waitingOn) === "") blockers.push("WAIT_FOR_EXTERNAL_EVENT needs waitingOn naming the external fact or event");
  } else if (conclusion.intent === "CONTINUE" || conclusion.intent === "REPLAN" || conclusion.intent === "CHECKPOINT") {
    if (text(conclusion.nextStep) === "") blockers.push(`${conclusion.intent} needs nextStep naming the work the next episode should take`);
  }

  return Object.freeze({ ok: blockers.length === 0, blockers: Object.freeze(blockers) });
}

export function makeEpisodeConclusion(input: {
  readonly conclusion: EpisodeConclusionInput;
  readonly readiness: EpisodeReadiness;
  readonly basis: EpisodeConclusion["basis"];
  readonly recordedAt: string;
  readonly artifactStates?: readonly EpisodeArtifactState[] | undefined;
}): EpisodeConclusion {
  const body = {
    schema: "pc1-episode-conclusion/v1" as const,
    intent: input.conclusion.intent,
    statement: text(input.conclusion.statement),
    artifacts: Object.freeze((input.conclusion.artifacts ?? []).map(text).filter((path) => path !== "")),
    waitingOn: text(input.conclusion.waitingOn) === "" ? null : text(input.conclusion.waitingOn),
    nextStep: text(input.conclusion.nextStep) === "" ? null : text(input.conclusion.nextStep),
    evidenceRefs: Object.freeze((input.conclusion.evidenceRefs ?? []).map(text).filter((ref) => ref !== "")),
    recordedAt: input.recordedAt,
    basis: Object.freeze({ ...input.basis }),
    check: Object.freeze({
      deliveryBlockers: Object.freeze([...input.readiness.deliveryBlockers]),
      awaitingOperator: Object.freeze([...input.readiness.awaitingOperator]),
      openTasks: Object.freeze(input.readiness.openTasks.map((task) => `${task.taskId}:${task.state}`)),
      openAttempts: Object.freeze(
        input.readiness.openAttempts.map(
          (attempt) => `${attempt.taskId ?? "unknown"}:${attempt.state}:${attempt.hostObserved ? "observed" : "unobserved"}`,
        ),
      ),
      unresolvedQuestions: Object.freeze([...input.readiness.unresolvedQuestions]),
      blockedEffects: Object.freeze([...input.readiness.blockedEffects]),
      artifacts: Object.freeze((input.artifactStates ?? []).map((state) => Object.freeze({ ...state }))),
    }),
  };
  return Object.freeze({ ...body, conclusionId: `episode-${canonicalDigest(body).slice(0, 24)}` });
}

/** Provenance facts are reported, never turned into an acceptance or a refusal by themselves. */
export function episodeArtifactWarnings(states: readonly EpisodeArtifactState[]): readonly string[] {
  const warnings: string[] = [];
  for (const state of states) {
    if (!state.present) {
      warnings.push(`artifact ${state.path} was not found`);
    } else if (!state.tracked) {
      warnings.push(`artifact ${state.path} is not tracked by Git; the final bytes exist only in the working tree`);
    } else if (!state.committed) {
      warnings.push(`artifact ${state.path} is tracked but has uncommitted changes; HEAD does not contain the final bytes`);
    }
  }
  return Object.freeze(warnings);
}

/**
 * PWRS-C: why a recorded artifact state is no longer current, as bare facts.
 *
 * Used by the pure episode builder AND by the composition's per-read overlay, so the two cannot drift
 * on what counts as "the artifact changed". Only recorded facts can be compared: an old conclusion
 * without a digest is not reopened by a digest it never had.
 */
export function artifactChangeReasons(
  recorded: readonly EpisodeArtifactState[],
  now: readonly EpisodeArtifactState[],
): readonly string[] {
  const current = new Map(now.map((state) => [state.path, state]));
  const reasons: string[] = [];
  for (const before of recorded) {
    const after = current.get(before.path);
    if (after === undefined) continue;
    if (before.digest !== undefined && before.digest !== null) {
      if (after.digest !== before.digest) {
        reasons.push(
          `artifact ${before.path} changed content (${(before.digest ?? "").slice(0, 12)} → ${(after.digest ?? "absent").slice(0, 12)})`,
        );
      }
    } else if (before.present !== after.present) {
      reasons.push(`artifact ${before.path} is now ${after.present ? "present" : "absent"}`);
    }
  }
  return Object.freeze(reasons);
}

/** Parse a recorded conclusion from an ordinary journal entry, ignoring anything else. */
export function parseEpisodeConclusion(body: string): EpisodeConclusion | null {
  const at = body.indexOf(EPISODE_MARKER);
  if (at < 0) return null;
  try {
    const parsed = JSON.parse(body.slice(at + EPISODE_MARKER.length).trim()) as EpisodeConclusion;
    if (parsed.schema !== "pc1-episode-conclusion/v1") return null;
    if (!(EPISODE_INTENTS as readonly string[]).includes(parsed.intent)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface PulseEpisode {
  readonly state: EpisodeState;
  readonly conclusion: EpisodeConclusion | null;
  /** False when the project revised, moved its head, or recorded any journal fact after the conclusion. */
  readonly current: boolean;
  readonly changedSince: readonly string[];
  readonly readiness: EpisodeReadiness;
  readonly detail: string;
}

const INTENT_STATE: Readonly<Record<EpisodeIntent, EpisodeState>> = Object.freeze({
  DELIVER: "DELIVERED",
  WAIT_FOR_OPERATOR: "AWAITING_OPERATOR",
  WAIT_FOR_EXTERNAL_EVENT: "AWAITING_EXTERNAL_EVENT",
  REPLAN: "REPLANNING",
  CONTINUE: "CONTINUING",
  CHECKPOINT: "CHECKPOINT",
});

export interface JournalFact {
  readonly entryId: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly recordedAt?: string | undefined;
}

/**
 * Derive the episode view from the journal plus the current basis. The conclusion is advisory: the
 * pulse shows it, but every read re-checks whether the project has moved since it was recorded.
 */
export function buildPulseEpisode(input: {
  readonly entries: readonly JournalFact[];
  readonly readiness: EpisodeReadiness;
  readonly basis: { readonly projectRevision: number; readonly projectDigest: string; readonly headCommit: string };
  /**
   * PWRS-C: the CURRENT state of the artifacts the conclusion named, when the caller can observe
   * them. A digest/source change reopens the conclusion even if the project revision and HEAD did
   * not move — which is exactly the case a file edit without a commit produces.
   */
  readonly artifactStatesNow?: readonly EpisodeArtifactState[] | undefined;
  /** Current task states, so a resolved operator acceptance can be named rather than inferred. */
  readonly taskStates?: ReadonlyMap<string, string> | undefined;
  /**
   * Which journal entries are BASIS-BEARING. Default: every entry after the conclusion reopens it
   * (the pre-PWRS behavior). The pulse passes a predicate that keeps only structured records, so an
   * unrelated plain note no longer reopens every delivery for no reason.
   */
  readonly basisRelevant?: ((entry: JournalFact) => boolean) | undefined;
}): PulseEpisode {
  let lastIndex = -1;
  let conclusion: EpisodeConclusion | null = null;
  for (let index = 0; index < input.entries.length; index += 1) {
    const parsed = parseEpisodeConclusion(input.entries[index]!.body);
    if (parsed !== null) {
      lastIndex = index;
      conclusion = parsed;
    }
  }
  if (conclusion === null) {
    return Object.freeze({
      state: "OPEN",
      conclusion: null,
      current: true,
      changedSince: Object.freeze([]),
      readiness: input.readiness,
      detail:
        "no episode conclusion is recorded; this episode is OPEN. Continue the work, or record a conclusion when the goal has been handled, acceptance is pending, an external fact is awaited, or a checkpoint is the honest next state",
    });
  }

  const changedSince: string[] = [];
  if (conclusion.basis.projectRevision !== input.basis.projectRevision) {
    changedSince.push(`project revision moved from ${String(conclusion.basis.projectRevision)} to ${String(input.basis.projectRevision)}`);
  }
  if (conclusion.basis.headCommit !== input.basis.headCommit) {
    changedSince.push(`repository head moved from ${conclusion.basis.headCommit.slice(0, 12)} to ${input.basis.headCommit.slice(0, 12)}`);
  }
  const relevant = input.basisRelevant;
  for (const entry of input.entries.slice(lastIndex + 1)) {
    if (relevant !== undefined && !relevant(entry)) continue;
    changedSince.push(`journal ${entry.entryId} (${entry.kind}) "${entry.title}" was recorded after the conclusion`);
  }
  /**
   * PWRS-C artifact currentness. Compared only when BOTH sides carry a digest: an old conclusion
   * (recorded before digests existed) cannot be reopened by a fact it never recorded, and pretending
   * otherwise would manufacture a change.
   */
  if (input.artifactStatesNow !== undefined) {
    changedSince.push(...artifactChangeReasons(conclusion.check.artifacts ?? [], input.artifactStatesNow));
  }
  /** A pending operator acceptance that was resolved is a real change, not a stale judgement. */
  if (input.taskStates !== undefined) {
    for (const ref of conclusion.check.awaitingOperator) {
      const taskId = ref.startsWith("task:") ? ref.slice("task:".length) : ref;
      const state = input.taskStates.get(taskId);
      if (state === "SATISFIED") {
        changedSince.push(`the operator accepted task ${taskId}; the pending acceptance the conclusion named is resolved`);
      }
    }
  }
  const current = changedSince.length === 0;

  return Object.freeze({
    state: current ? INTENT_STATE[conclusion.intent] : "REOPENED",
    conclusion,
    current,
    changedSince: Object.freeze(changedSince),
    readiness: input.readiness,
    detail: current
      ? `the principal recorded ${conclusion.intent} at revision ${String(conclusion.basis.projectRevision)}; this is a judgement, not acceptance, and the operator retains authority`
      : `the conclusion is REOPENED: ${changedSince.join("; ")}. Re-read the current state before relying on the earlier judgement`,
  });
}

/** The journal body for a conclusion. Ordinary REFERENCE_NOTE content with one structured marker. */
export function episodeConclusionBody(conclusion: EpisodeConclusion): string {
  return [
    "## Episode conclusion (advisory, not acceptance)",
    "",
    `Intent: ${conclusion.intent}`,
    `Statement: ${conclusion.statement}`,
    conclusion.artifacts.length === 0 ? "Artifacts: none" : `Artifacts:\n${conclusion.artifacts.map((path) => `- ${path}`).join("\n")}`,
    `Waiting on: ${conclusion.waitingOn ?? "(none)"}`,
    `Next step: ${conclusion.nextStep ?? "(none)"}`,
    `Evidence: ${conclusion.evidenceRefs.length === 0 ? "(none)" : conclusion.evidenceRefs.join(", ")}`,
    `Basis: revision ${String(conclusion.basis.projectRevision)}, head ${conclusion.basis.headCommit}`,
    conclusion.check.artifacts === undefined || conclusion.check.artifacts.length === 0
      ? "Artifact provenance: (not recorded)"
      : `Artifact provenance:\n${conclusion.check.artifacts
          .map(
            (state) =>
              `- ${state.path}: present=${String(state.present)} tracked=${String(state.tracked)} committed=${String(state.committed)} ` +
              `source=${state.source ?? "unrecorded"} digest=${(state.digest ?? "unrecorded").slice(0, 12)}` +
              `${state.commit === undefined || state.commit === null ? "" : ` commit=${state.commit.slice(0, 12)}`}`,
          )
          .join("\n")}`,
    "",
    "This record states what the principal judged about the episode. It accepts no artifact, promotes no result and approves no expenditure. A new project fact reopens it.",
    "",
    EPISODE_MARKER,
    JSON.stringify(conclusion),
  ].join("\n");
}
