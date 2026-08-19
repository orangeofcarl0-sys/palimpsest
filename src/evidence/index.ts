/** Evidence plane: Gate DSL definitions and evaluation (Research line). */

export {
  GateEngine,
  parseGateDefinition,
  type ClauseFlag,
  type GateClause,
  type GateDefinition,
  type GateResult,
} from "./gate_dsl.js";
export {
  CHANGE_CLASSES,
  changeClassInvalidates,
  classifyLateResult,
  computeInvalidationSet,
} from "./invalidation.js";
export type {
  ChangeClass,
  DependencyEdge,
  LateResultClass,
  RevisionDelta,
} from "./invalidation.js";