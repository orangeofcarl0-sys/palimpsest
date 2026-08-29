/** Authoritative domain rules: state machines, policies, aggregate validation. */

export {
  DomainValidationError,
  PolicyError,
  SchedulerInvariantError,
} from "./errors.js";
export { actionKey, stableEntityId } from "./idempotency.js";
export {
  ATTEMPT_ALLOWED_SOURCES,
  ATTEMPT_EVENT_TARGET,
  ATTEMPT_OPEN_STATES,
  ATTEMPT_TERMINAL_STATES,
  TASK_ACTIVE_STATES,
  TASK_ALLOWED_SOURCES,
  TASK_EVENT_TARGET,
  TASK_TERMINAL_STATES,
  validateTaskGraph,
} from "./state_machine.js";
export { AggregateValidator } from "./aggregate.js";
export { TaskPolicy, type AuthorizedTaskEnvelope, type TaskPolicyInput } from "./policy.js";
export {
  evalClause,
  parseClause,
  parseGateDefinition,
  type ClauseFlag,
  type GateClause,
  type GateDefinition,
} from "./gate_clause.js";
export {
  DEFAULT_STAGE_GRAPH,
  STAGE_EVENT_TARGETS,
  STAGE_TRANSITION_REASONS,
  STAGE_WHEN_SOURCE_STATES,
  parseStageGraphDefinition,
  validateStageGraphReachability,
  type StageGraphDefinition,
  type StageGraphStage,
  type StageGraphTransition,
  type StageTransitionEvent,
  type StageTransitionWhen,
} from "./stage_graph.js";
