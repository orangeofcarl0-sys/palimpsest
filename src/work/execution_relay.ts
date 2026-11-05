/**
 * PWRS-A — EXECUTION RELAY: who executed, and what the product actually observed.
 *
 * The ALHS diagnostic measured the gap this module closes. A real worker started a governed task,
 * the host was killed before the worker committed, and the continuation principal wrote the candidate
 * into the worker's retained world, settled the attempt and recorded WAIT_FOR_OPERATOR. Every
 * canonical fact was true (attempt, world, result commit, completion contract, VERIFYING) and yet
 * "the worker produced this" was not true in any observable sense.
 *
 * The fix is NOT a second ledger and NOT an authorship oracle. It is the separation the diagnostic
 * demanded:
 *
 *     the WORK AUTHORIZATION   the attempt's envelope                 (already canonical)
 *     the EXECUTION OBSERVATION which invocation the host saw, and when (this module, host-local)
 *     the SETTLEMENT ACT       who closed the attempt                  (already canonical: the report)
 *     the DECLARATION          what a principal says it did            (recorded as DECLARED)
 *
 * The only durable record this module produces is ONE structured journal note per settlement. The
 * invocation list itself is HOST-LOCAL and NON-DURABLE, exactly like the job map: after a restart the
 * product has no invocation observations, and it says so (`UNATTRIBUTED`) rather than guessing. A
 * previous worker's committed bytes are not re-labelled as the principal's, and a principal's bytes
 * are never re-labelled as the worker's.
 *
 * WHAT AN ATTRIBUTION IS NOT. `ORIGINAL_WORKER_OBSERVED` means the settled tree existed at the end of
 * a worker invocation this host ran; it does not prove which process wrote each byte (a wrapper or a
 * sibling process could have written it), and Git author metadata is never consulted. The label is
 * about an observed WINDOW, not a forensic proof.
 *
 * Layer: L2 (`src/work/`). The ledger instance is created by the controller/composition and is
 * deliberately not persisted.
 */
import { canonicalDigest } from "../schema/canonical.js";

/** The journal marker for the ONE durable record this module produces. */
export const EXECUTION_RELAY_MARKER = "<!-- pc1-execution-relay:v1 -->";

export const EXECUTION_RELAY_SCHEMA = "pc1-execution-relay/v1" as const;

/** How an invocation ended, from the host's point of view. */
export const INVOCATION_OUTCOMES = ["OPEN", "ENDED", "UNCONFIRMED"] as const;
export type InvocationOutcome = (typeof INVOCATION_OUTCOMES)[number];

/**
 * ONE worker invocation the host ran.
 *
 * `headAtStart` is read from the attempt's world before the worker port is called; `headAtEnd` after
 * it returns. A world that moved while the port was running is therefore visible as a difference,
 * which is the only authorship-adjacent fact a filesystem can honestly provide.
 */
export interface ExecutionInvocation {
  readonly invocationId: string;
  readonly attemptId: string;
  readonly taskId: string;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly headAtStart: string;
  readonly headAtEnd: string | null;
  readonly outcome: InvocationOutcome;
  /** The DSH session id the port reported, when one was observed. Never required. */
  readonly sessionId: string | null;
}

/** The settlement act, as the caller can honestly describe it. */
export interface SettlementObservation {
  /** Which product path is closing the attempt. */
  readonly path: "WORKER" | "PRINCIPAL";
  /** The invocation that reported the work ready, when the worker path settled it. */
  readonly invocationId?: string | null | undefined;
  /**
   * A principal's DECLARED continuation in the attempt's world. It is a declaration, not evidence:
   * `livenessBasis` records whether the product observed the previous invocation end, or whether the
   * principal asserted the previous executor was abandoned.
   */
  readonly takeover?:
    | {
        readonly declaredAt: string;
        readonly declaredBy: "PRINCIPAL";
        readonly livenessBasis: "OBSERVED_EXIT" | "DECLARED_ABANDONED";
      }
    | undefined;
  /**
   * PWRS-D: the principal's explicit acknowledgement that the canonical tree holds inputs the
   * attempt's base never contained. Required for a principal settlement when such inputs exist; the
   * product lists them in the refusal, and the acknowledgement is recorded as a declaration.
   */
  readonly acknowledgeInputs?: boolean | undefined;
}

export const EXECUTION_ATTRIBUTIONS = [
  /** The settled tree existed at the end of a worker invocation this host ran (first invocation). */
  "ORIGINAL_WORKER_OBSERVED",
  /** The same, for a later invocation of the same attempt. */
  "SUBSEQUENT_WORKER_OBSERVED",
  /** A principal declared it continued the world and the settled tree is the declared result. */
  "PRINCIPAL_RECOVERY",
  /** Worker invocations exist AND the settled tree moved beyond every observed end. */
  "MULTI_EXECUTOR",
  /** No observation supports any executor (restart, another host, or bytes moved off-window). */
  "UNATTRIBUTED",
] as const;
export type ExecutionAttributionKind = (typeof EXECUTION_ATTRIBUTIONS)[number];

export const EXECUTOR_ROLES = ["ORIGINAL_WORKER", "SUBSEQUENT_WORKER", "PRINCIPAL", "MULTIPLE", "UNKNOWN"] as const;
export type ExecutorRole = (typeof EXECUTOR_ROLES)[number];

export interface ExecutionAttribution {
  readonly schema: "pc1-execution-attribution/v1";
  readonly attribution: ExecutionAttributionKind;
  readonly executor: ExecutorRole;
  readonly settledBy: "WORKER_TRANSPORT" | "PRINCIPAL";
  /** How many worker invocations this host observed for the attempt. */
  readonly workerInvocations: number;
  /** The invocation whose end head equals the settled head, when one does. */
  readonly matchedInvocationId: string | null;
  readonly liveness: "OBSERVED_EXIT" | "DECLARED_ABANDONED" | "UNOBSERVED";
  /**
   * Whether the settled bytes come from a worker invocation without a principal takeover. An
   * independent-verification requirement cannot be satisfied by production that was not observed.
   */
  readonly independenceEligible: boolean;
  /** OBSERVED = a host window matched; DECLARED = the caller asserted it; UNKNOWN = nothing supports it. */
  readonly evidence: "OBSERVED" | "DECLARED" | "UNKNOWN";
  readonly detail: string;
}

const workerAttribution = (
  invocation: ExecutionInvocation,
  index: number,
  settledBy: "WORKER_TRANSPORT" | "PRINCIPAL",
  liveness: ExecutionAttribution["liveness"],
): ExecutionAttribution => {
  const kind: ExecutionAttributionKind =
    index === 0 ? "ORIGINAL_WORKER_OBSERVED" : "SUBSEQUENT_WORKER_OBSERVED";
  const executor: ExecutorRole = index === 0 ? "ORIGINAL_WORKER" : "SUBSEQUENT_WORKER";
  return Object.freeze({
    schema: "pc1-execution-attribution/v1" as const,
    attribution: kind,
    executor,
    settledBy,
    workerInvocations: index + 1,
    matchedInvocationId: invocation.invocationId,
    liveness,
    // The bytes were produced inside an observed worker window and no takeover was declared.
    independenceEligible: liveness === "OBSERVED_EXIT",
    evidence: "OBSERVED" as const,
    detail:
      `the settled head ${(invocation.headAtEnd ?? "").slice(0, 12)} equals the head observed when worker invocation ` +
      `${invocation.invocationId} ended; ${settledBy === "WORKER_TRANSPORT" ? "the worker transport closed the attempt" : "a principal closed an attempt the worker had already finished"}. ` +
      "This is an observed window, not a byte-level authorship proof, and Git author metadata was not consulted",
  });
};

/**
 * Attribute ONE settled result from the host's own invocation observations.
 *
 * The rules are deliberately few, and each one can only DOWNGRADE a claim:
 *
 *   · a settled head equal to an observed end head  → that invocation produced the tree
 *   · a declared takeover with no matching window   → principal recovery (possibly multi-executor)
 *   · no matching window and no declaration         → unattributed (never the principal by default)
 */
export function attributeSettlement(input: {
  readonly invocations: readonly ExecutionInvocation[];
  readonly observation: SettlementObservation;
  readonly settledHead: string;
}): ExecutionAttribution {
  const { observation, settledHead } = input;
  const ended = input.invocations.filter((invocation) => invocation.outcome === "ENDED");
  const matchedIndex = ended.findIndex((invocation) => invocation.headAtEnd === settledHead);
  const matched = matchedIndex >= 0 ? ended[matchedIndex]! : null;
  const settledBy = observation.path === "PRINCIPAL" ? "PRINCIPAL" : "WORKER_TRANSPORT";
  const takeover = observation.takeover;
  /**
   * An invocation that ENDED is itself an observed exit; a declaration can only downgrade or confirm
   * the UNOBSERVED case. Reading it the other way round would make a real worker's result ineligible
   * for independent verification just because a principal closed the attempt.
   */
  const matchedLiveness = takeover?.livenessBasis ?? "OBSERVED_EXIT";
  const unmatchedLiveness = takeover?.livenessBasis ?? "UNOBSERVED";

  if (matched !== null) {
    /**
     * The principal may have declared a takeover and then committed nothing new; in that case the
     * settled tree is still the worker's observed result. The declaration is retained on the record
     * (as `liveness`), but it does not overwrite what the window shows.
     */
    return Object.freeze({
      ...workerAttribution(matched, matchedIndex, settledBy, matchedLiveness),
      workerInvocations: ended.length,
    });
  }

  if (ended.length > 0) {
    return Object.freeze({
      schema: "pc1-execution-attribution/v1" as const,
      attribution: "MULTI_EXECUTOR" as const,
      executor: "MULTIPLE" as const,
      settledBy,
      workerInvocations: ended.length,
      matchedInvocationId: null,
      liveness: unmatchedLiveness,
      independenceEligible: false,
      evidence: takeover === undefined ? ("UNKNOWN" as const) : ("DECLARED" as const),
      detail:
        `the attempt had ${String(ended.length)} observed worker invocation(s), but the settled head ${settledHead.slice(0, 12)} ` +
        "is not any invocation's end head — the work contains changes made outside the observed worker window, so it is " +
        "recorded as multi-executor and is NOT eligible as independent worker production",
    });
  }

  if (takeover !== undefined) {
    return Object.freeze({
      schema: "pc1-execution-attribution/v1" as const,
      attribution: "PRINCIPAL_RECOVERY" as const,
      executor: "PRINCIPAL" as const,
      settledBy,
      workerInvocations: 0,
      matchedInvocationId: null,
      liveness: unmatchedLiveness,
      independenceEligible: false,
      evidence: "DECLARED" as const,
      detail:
        `the principal declared a continuation of this attempt's world (${takeover.livenessBasis}) and no worker invocation ` +
        "was observed by this host; the bytes are recorded as principal recovery, eligible for operator acceptance and NOT " +
        "as independent worker production",
    });
  }

  return Object.freeze({
    schema: "pc1-execution-attribution/v1" as const,
    attribution: "UNATTRIBUTED" as const,
    executor: "UNKNOWN" as const,
    settledBy,
    workerInvocations: 0,
    matchedInvocationId: null,
    liveness: "UNOBSERVED" as const,
    independenceEligible: false,
    evidence: "UNKNOWN" as const,
    detail:
      "this host observed no worker invocation for the attempt (a restart, another host, or the bytes moved outside any " +
      "observed window), and no principal takeover was declared, so the product records the result as unattributed rather " +
      "than guessing who wrote it",
  });
}

/**
 * THE HOST-LOCAL INVOCATION LEDGER.
 *
 * Non-durable by design: it is the observation memory of ONE host process, like the job map. A restart
 * loses it, and every consumer must treat the absence as UNOBSERVED rather than as "no worker ran".
 */
export interface ExecutionInvocationLedger {
  begin(input: {
    readonly attemptId: string;
    readonly taskId: string;
    readonly headAtStart: string;
    readonly sessionId?: string | null | undefined;
  }): ExecutionInvocation;
  end(
    invocationId: string,
    input: { readonly headAtEnd: string; readonly outcome: Exclude<InvocationOutcome, "OPEN"> },
  ): ExecutionInvocation | null;
  list(attemptId: string): readonly ExecutionInvocation[];
  openFor(attemptId: string): ExecutionInvocation | null;
  lastEndedFor(attemptId: string): ExecutionInvocation | null;
}

export function makeExecutionInvocationLedger(input: {
  readonly now?: (() => string) | undefined;
} = {}): ExecutionInvocationLedger {
  const now = input.now ?? (() => new Date().toISOString());
  const byAttempt = new Map<string, ExecutionInvocation[]>();
  let counter = 0;

  const list = (attemptId: string): readonly ExecutionInvocation[] =>
    Object.freeze([...(byAttempt.get(attemptId) ?? [])]);

  const replace = (attemptId: string, invocation: ExecutionInvocation): void => {
    const current = byAttempt.get(attemptId) ?? [];
    byAttempt.set(
      attemptId,
      current.map((candidate) => (candidate.invocationId === invocation.invocationId ? invocation : candidate)),
    );
  };

  return Object.freeze({
    begin(input: {
      readonly attemptId: string;
      readonly taskId: string;
      readonly headAtStart: string;
      readonly sessionId?: string | null | undefined;
    }): ExecutionInvocation {
      counter += 1;
      const invocation = Object.freeze({
        invocationId: `wiv-${counter.toString(36)}-${canonicalDigest({ attemptId: input.attemptId, at: now(), n: counter }).slice(0, 8)}`,
        attemptId: input.attemptId,
        taskId: input.taskId,
        startedAt: now(),
        endedAt: null,
        headAtStart: input.headAtStart,
        headAtEnd: null,
        outcome: "OPEN" as const,
        sessionId: input.sessionId ?? null,
      });
      const current = byAttempt.get(input.attemptId) ?? [];
      byAttempt.set(input.attemptId, [...current, invocation]);
      return invocation;
    },
    end(
      invocationId: string,
      ended: { readonly headAtEnd: string; readonly outcome: Exclude<InvocationOutcome, "OPEN"> },
    ): ExecutionInvocation | null {
      for (const [attemptId, invocations] of byAttempt) {
        const found = invocations.find((invocation) => invocation.invocationId === invocationId);
        if (found === undefined) continue;
        if (found.outcome !== "OPEN") return found;
        const updated: ExecutionInvocation = Object.freeze({
          ...found,
          endedAt: now(),
          headAtEnd: ended.headAtEnd,
          outcome: ended.outcome,
        });
        replace(attemptId, updated);
        return updated;
      }
      return null;
    },
    list,
    openFor(attemptId: string): ExecutionInvocation | null {
      return list(attemptId).find((invocation) => invocation.outcome === "OPEN") ?? null;
    },
    lastEndedFor(attemptId: string): ExecutionInvocation | null {
      const ended = list(attemptId).filter((invocation) => invocation.outcome === "ENDED");
      return ended.length === 0 ? null : ended[ended.length - 1]!;
    },
  });
}

/* ------------------------------------------------------------------ *
 * Relay routes — what a principal may do with an open attempt
 * ------------------------------------------------------------------ */

export const RELAY_ROUTES = ["RESUME", "TAKEOVER", "SUCCESSOR"] as const;
export type RelayRoute = (typeof RELAY_ROUTES)[number];

export interface RelayRouteAvailability {
  readonly route: RelayRoute;
  readonly available: boolean;
  readonly requiresDeclaration: boolean;
  readonly blocker: string | null;
}

export interface RelayAvailability {
  readonly attemptId: string;
  readonly attemptState: string;
  readonly routes: readonly RelayRouteAvailability[];
  /** The invocation the host can still observe as running, if any. */
  readonly openInvocationId: string | null;
  readonly lastInvocation: ExecutionInvocation | null;
  readonly detail: string;
}

/**
 * Decide which continuation routes are actually available for one open attempt.
 *
 * This grants nothing: it only refuses routes whose safety precondition is absent. The canonical
 * admission (scheduler lane, head basis, envelope) is still enforced by `prepare`/`settle`.
 */
export function relayAvailability(input: {
  readonly attemptId: string;
  readonly attemptState: string;
  readonly hostJobActive: boolean;
  readonly invocations: readonly ExecutionInvocation[];
}): RelayAvailability {
  const open = input.invocations.find((invocation) => invocation.outcome === "OPEN") ?? null;
  const ended = [...input.invocations].reverse().find((invocation) => invocation.outcome === "ENDED") ?? null;
  const unconfirmed =
    [...input.invocations].reverse().find((invocation) => invocation.outcome === "UNCONFIRMED") ?? null;
  const last = [...input.invocations].reverse()[0] ?? null;
  const isOpenAttempt = input.attemptState === "CREATED" || input.attemptState === "LEASED" || input.attemptState === "RUNNING";
  const running = input.hostJobActive || open !== null;

  const routes: RelayRouteAvailability[] = [];
  routes.push(
    Object.freeze({
      route: "RESUME" as const,
      available: isOpenAttempt && running,
      requiresDeclaration: false,
      blocker: !isOpenAttempt
        ? "the attempt is not open"
        : running
          ? null
          : "no worker invocation is running in this host; resuming the SAME attempt with a new worker would put a second writer into a world whose occupant is not observed",
    }),
  );
  routes.push(
    Object.freeze({
      route: "TAKEOVER" as const,
      available:
        isOpenAttempt &&
        !running &&
        (ended !== null || (input.invocations.length === 0 && unconfirmed === null)),
      requiresDeclaration: ended === null,
      blocker: !isOpenAttempt
        ? "the attempt is not open"
        : running
          ? "a worker invocation is still running in this host; stop it or wait for the observed exit before taking over its world"
          : unconfirmed !== null
            ? "this host's last invocation ended without a confirmed process exit; the world may still be written, so an in-place takeover is refused — continue in an isolated successor world instead"
            : null,
    }),
  );
  routes.push(
    Object.freeze({
      route: "SUCCESSOR" as const,
      available: isOpenAttempt && !running,
      requiresDeclaration: true,
      blocker: !isOpenAttempt
        ? "the attempt is not open"
        : running
          ? "a worker invocation is still running in this host; a successor would orphan work that is still being written"
          : null,
    }),
  );

  return Object.freeze({
    attemptId: input.attemptId,
    attemptState: input.attemptState,
    routes: Object.freeze(routes),
    openInvocationId: open?.invocationId ?? null,
    lastInvocation: last,
    detail:
      "routes are product safety preconditions, not authority: RESUME keeps the same attempt and world, TAKEOVER closes the same attempt after an observed exit (or an explicit declaration), and SUCCESSOR closes it and continues in a NEW world at the same basis",
  });
}

/* ------------------------------------------------------------------ *
 * The durable settlement record
 * ------------------------------------------------------------------ */

export interface ExecutionRelayRecord {
  readonly schema: typeof EXECUTION_RELAY_SCHEMA;
  readonly recordId: string;
  readonly taskId: string;
  readonly attemptId: string;
  readonly resultCommit: string;
  readonly baseCommit: string;
  readonly attribution: ExecutionAttribution;
  readonly recordedAt: string;
}

/** The ONE write port a composition implements: a durable note per settlement. */
export interface ExecutionRelayRecorderPort {
  record(input: {
    readonly taskId: string;
    readonly attemptId: string;
    readonly baseCommit: string;
    readonly resultCommit: string;
    readonly attribution: ExecutionAttribution;
  }): Promise<void>;
}

export function makeExecutionRelayRecord(input: {  readonly taskId: string;
  readonly attemptId: string;
  readonly resultCommit: string;
  readonly baseCommit: string;
  readonly attribution: ExecutionAttribution;
  readonly recordedAt: string;
}): ExecutionRelayRecord {
  const body = {
    schema: EXECUTION_RELAY_SCHEMA,
    taskId: input.taskId,
    attemptId: input.attemptId,
    resultCommit: input.resultCommit,
    baseCommit: input.baseCommit,
    attribution: input.attribution,
    recordedAt: input.recordedAt,
  };
  return Object.freeze({ ...body, recordId: `relay-${canonicalDigest(body).slice(0, 24)}` });
}

export function executionRelayBody(record: ExecutionRelayRecord): string {
  return [
    "## Execution relay record (observed attribution)",
    "",
    `Task: ${record.taskId}`,
    `Attempt: ${record.attemptId}`,
    `Result commit: ${record.resultCommit}`,
    `Attribution: ${record.attribution.attribution} (executor=${record.attribution.executor}, settledBy=${record.attribution.settledBy})`,
    `Independence eligible: ${String(record.attribution.independenceEligible)}`,
    `Detail: ${record.attribution.detail}`,
    "",
    "This record states which execution window the product observed for the settled bytes. It accepts nothing, promotes nothing and is not a byte-level authorship proof.",
    "",
    EXECUTION_RELAY_MARKER,
    JSON.stringify(record),
  ].join("\n");
}

export function parseExecutionRelay(body: string): ExecutionRelayRecord | null {
  const at = body.indexOf(EXECUTION_RELAY_MARKER);
  if (at < 0) return null;
  try {
    const parsed = JSON.parse(body.slice(at + EXECUTION_RELAY_MARKER.length).trim()) as ExecutionRelayRecord;
    if (parsed.schema !== EXECUTION_RELAY_SCHEMA) return null;
    if (!(EXECUTION_ATTRIBUTIONS as readonly string[]).includes(parsed.attribution?.attribution)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** The latest relay record per attempt, in journal order. The journal is the durable read. */
export function executionRelayRecords(
  entries: readonly { readonly body: string }[],
): readonly ExecutionRelayRecord[] {
  const byAttempt = new Map<string, ExecutionRelayRecord>();
  for (const entry of entries) {
    const parsed = parseExecutionRelay(entry.body);
    if (parsed !== null) byAttempt.set(parsed.attemptId, parsed);
  }
  return Object.freeze([...byAttempt.values()]);
}
