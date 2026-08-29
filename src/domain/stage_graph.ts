/**
 * Declared stage graphs (H1 §3.4 D-3 / G4): the scheduler's scan order and
 * transition paths are facts on the log (STAGE_GRAPH_DEFINED), not code.
 *
 * A StageGraphDefinition declares an ordered list of stages (one per task
 * state, scanned in declaration order), the task transitions available from
 * each stage, and optional guards (gate-clause chains) per transition. The
 * scheduler keeps its batch mechanics (attempt creation, promotion scan,
 * dependency scan) as fixed kernel behavior; the graph decides *which*
 * transition fires, in what order, and under which guards.
 *
 * The grammar is closed and fail-closed: events are the schedulable task
 * events, `when` conditions come from a closed registry that is valid only
 * from the states whose strategy produces them, a transition's `to` must be
 * exactly that event's target state, and non-terminal targets require a
 * declared stage. Anything else throws a TypeError naming the rule.
 */

import { DomainValidationError } from "./errors.js";
import { TASK_EVENT_TARGET, TASK_TERMINAL_STATES } from "./state_machine.js";
import { parseClause, type GateClause } from "./gate_clause.js";

/** Stage-graph stages are one per task state; terminal states declare no strategy. */
const STAGE_STATES: ReadonlySet<string> = new Set([
  ...TASK_TERMINAL_STATES,
  "BLOCKED",
  "READY",
  "ACTIVE",
  "VERIFYING",
]);

export type StageTransitionEvent =
  | "TASK_READY"
  | "TASK_STARTED"
  | "TASK_VERIFYING"
  | "TASK_SATISFIED"
  | "TASK_FAILED";

/**
 * TASK_BLOCKED / TASK_STALE are maintenance events the scheduler never
 * emits from decide(), so declared transitions cannot target them. Targets
 * are the state_machine table verbatim — one source of truth.
 */
export const STAGE_EVENT_TARGETS: Readonly<Record<StageTransitionEvent, string>> = {
  TASK_READY: TASK_EVENT_TARGET.TASK_READY!,
  TASK_STARTED: TASK_EVENT_TARGET.TASK_STARTED!,
  TASK_VERIFYING: TASK_EVENT_TARGET.TASK_VERIFYING!,
  TASK_SATISFIED: TASK_EVENT_TARGET.TASK_SATISFIED!,
  TASK_FAILED: TASK_EVENT_TARGET.TASK_FAILED!,
};

export type StageTransitionWhen =
  | "batch-completed-candidate"
  | "batch-failed-budget-remaining"
  | "attempt-limit-exhausted"
  | "promotion-committed"
  | "dependencies-satisfied"
  | "always";

/**
 * A `when` condition is only meaningful as the outcome of the stage
 * strategy that produces it, so each condition is valid only from the
 * states whose strategy can fire it.
 */
export const STAGE_WHEN_SOURCE_STATES: Readonly<Record<StageTransitionWhen, ReadonlySet<string>>> = {
  "batch-completed-candidate": new Set(["ACTIVE"]),
  "batch-failed-budget-remaining": new Set(["ACTIVE"]),
  "attempt-limit-exhausted": new Set(["ACTIVE"]),
  "promotion-committed": new Set(["VERIFYING"]),
  "dependencies-satisfied": new Set(["BLOCKED"]),
  "always": new Set(["READY"]),
};

/**
 * Declared transitions carry the reason the old pipeline hardcoded; the
 * READY activation keeps its own reason ("deterministic batch activation"),
 * which is why `always` has no entry here.
 */
export const STAGE_TRANSITION_REASONS: Readonly<Record<Exclude<StageTransitionWhen, "always">, string>> = {
  "batch-completed-candidate": "batch has a completed candidate",
  "batch-failed-budget-remaining": "batch failed with attempt budget remaining",
  "attempt-limit-exhausted": "attempt limit exhausted",
  "promotion-committed": "matching promotion committed",
  "dependencies-satisfied": "all dependencies satisfied",
};

export interface StageGraphStage {
  id: string;
  state: string;
}

export interface StageGraphTransition {
  from: string;
  event: StageTransitionEvent;
  to: string;
  when: StageTransitionWhen;
}

export interface StageGraphDefinition {
  stages: StageGraphStage[];
  transitions: StageGraphTransition[];
  guards: Record<string, GateClause[]>;
  declared_by: string;
  reason: string;
}

/** Fail-closed parse of a stage graph declaration (guards included, clauses parsed). */
export function parseStageGraphDefinition(value: unknown): StageGraphDefinition {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("stage graph definition must be an object");
  }
  const raw = value as Record<string, unknown>;

  if (!Array.isArray(raw.stages) || raw.stages.length === 0) {
    throw new TypeError("stage graph stages must be a non-empty array");
  }
  const stages: StageGraphStage[] = [];
  const stageIds = new Set<string>();
  const stageByState = new Map<string, StageGraphStage>();
  for (const entry of raw.stages) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TypeError("stage entry must be an object");
    }
    const stage = entry as Record<string, unknown>;
    const id = stage.id;
    if (typeof id !== "string" || id.length === 0) {
      throw new TypeError("stage id must be a non-empty string");
    }
    const state = stage.state;
    if (typeof state !== "string" || !STAGE_STATES.has(state)) {
      throw new TypeError(`stage state must be a declared task state, got '${String(state)}'`);
    }
    if (stageIds.has(id)) throw new TypeError(`duplicate stage id '${id}'`);
    if (stageByState.has(state)) throw new TypeError(`duplicate stage state '${state}'`);
    stageIds.add(id);
    const declared = { id, state };
    stages.push(declared);
    stageByState.set(state, declared);
  }

  if (!Array.isArray(raw.transitions) || raw.transitions.length === 0) {
    throw new TypeError("stage graph transitions must be a non-empty array");
  }
  const transitions: StageGraphTransition[] = [];
  const seenTransitions = new Set<string>();
  for (const entry of raw.transitions) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TypeError("transition entry must be an object");
    }
    const transition = entry as Record<string, unknown>;
    const from = transition.from;
    if (typeof from !== "string" || !stageIds.has(from)) {
      throw new TypeError(`transition from '${String(from)}' is not a declared stage id`);
    }
    const event = transition.event;
    if (typeof event !== "string" || !(event in STAGE_EVENT_TARGETS)) {
      throw new TypeError(`unknown task event '${String(event)}'`);
    }
    const to = transition.to;
    if (typeof to !== "string" || to !== STAGE_EVENT_TARGETS[event as StageTransitionEvent]) {
      throw new TypeError(`transition to '${String(to)}' does not match the target state of '${event}'`);
    }
    if (!TASK_TERMINAL_STATES.has(to) && !stageByState.has(to)) {
      throw new TypeError(`transition to '${to}' requires a declared stage with that state`);
    }
    const when = transition.when;
    if (typeof when !== "string" || !(when in STAGE_WHEN_SOURCE_STATES)) {
      throw new TypeError(`unknown transition when '${String(when)}'`);
    }
    const fromState = stages.find((stage) => stage.id === from)!.state;
    if (!STAGE_WHEN_SOURCE_STATES[when as StageTransitionWhen].has(fromState)) {
      throw new TypeError(`transition when '${when}' is not valid from state '${fromState}'`);
    }
    const key = `${from}:${event}:${to}`;
    if (seenTransitions.has(key)) throw new TypeError(`duplicate transition '${key}'`);
    seenTransitions.add(key);
    transitions.push({
      from,
      event: event as StageTransitionEvent,
      to,
      when: when as StageTransitionWhen,
    });
  }

  if (typeof raw.guards !== "object" || raw.guards === null || Array.isArray(raw.guards)) {
    throw new TypeError("stage graph guards must be an object");
  }
  const guards: Record<string, GateClause[]> = {};
  for (const [key, clauses] of Object.entries(raw.guards as Record<string, unknown>)) {
    if (!seenTransitions.has(key)) {
      throw new TypeError(`guard key '${key}' does not reference a declared transition`);
    }
    if (!Array.isArray(clauses)) throw new TypeError(`guard '${key}' must be a clause array`);
    guards[key] = clauses.map(parseClause);
  }

  const declaredBy = raw.declared_by;
  if (typeof declaredBy !== "string" || declaredBy.length === 0) {
    throw new TypeError("declared_by must be a non-empty string");
  }
  const reason = raw.reason;
  if (typeof reason !== "string" || reason.length === 0) {
    throw new TypeError("reason must be a non-empty string");
  }

  return { stages, transitions, guards, declared_by: declaredBy, reason };
}

/**
 * Governance clause G4: every task state actually occupied in the project
 * must be a declared stage, and that stage must be able to reach a terminal
 * state through declared transitions — otherwise occupied tasks could never
 * finish. Terminal occupied states are already finished and need no path.
 * Pure: inspects only the graph.
 */
export function validateStageGraphReachability(
  graph: StageGraphDefinition,
  occupiedStates: readonly string[],
): void {
  const stageByState = new Map<string, StageGraphStage>();
  for (const stage of graph.stages) stageByState.set(stage.state, stage);

  // Fixpoint over "can reach a terminal state": a stage qualifies when some
  // declared transition targets a terminal state or a qualifying stage's
  // state. Cycle-safe by construction (monotone growth of the good set).
  const good = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const stage of graph.stages) {
      if (good.has(stage.id)) continue;
      for (const transition of graph.transitions) {
        if (transition.from !== stage.id) continue;
        const target = stageByState.get(transition.to);
        if (TASK_TERMINAL_STATES.has(transition.to) || (target !== undefined && good.has(target.id))) {
          good.add(stage.id);
          changed = true;
          break;
        }
      }
    }
  }

  for (const state of occupiedStates) {
    if (TASK_TERMINAL_STATES.has(state)) continue;
    const stage = stageByState.get(state);
    if (stage === undefined) {
      throw new DomainValidationError(`stage graph does not declare the occupied state '${state}'`);
    }
    if (!good.has(stage.id)) {
      throw new DomainValidationError(
        `stage '${stage.id}' cannot reach a terminal state through declared transitions`,
      );
    }
  }
}

/**
 * H1 §3.4 genesis: the default graph is the phase0-2 hardcoded pipeline
 * declared verbatim — same stage precedence, same transitions in the same
 * evaluate order, no guards. Behavior is unchanged; it is now replayable
 * data instead of code.
 */
export const DEFAULT_STAGE_GRAPH: StageGraphDefinition = {
  stages: [
    { id: "active", state: "ACTIVE" },
    { id: "verifying", state: "VERIFYING" },
    { id: "blocked", state: "BLOCKED" },
    { id: "ready", state: "READY" },
  ],
  transitions: [
    { from: "active", event: "TASK_VERIFYING", to: "VERIFYING", when: "batch-completed-candidate" },
    { from: "active", event: "TASK_READY", to: "READY", when: "batch-failed-budget-remaining" },
    { from: "active", event: "TASK_FAILED", to: "FAILED", when: "attempt-limit-exhausted" },
    { from: "verifying", event: "TASK_SATISFIED", to: "SATISFIED", when: "promotion-committed" },
    { from: "blocked", event: "TASK_READY", to: "READY", when: "dependencies-satisfied" },
    { from: "ready", event: "TASK_STARTED", to: "ACTIVE", when: "always" },
  ],
  guards: {},
  declared_by: "genesis",
  reason: "verbatim declaration of the phase0-2 hardcoded scheduler pipeline",
};
