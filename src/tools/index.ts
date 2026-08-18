/** Palimpsest tool surface: DSH host contract, controller, seven tools. */

export type {
  DshContentBlock,
  DshPluginContext,
  DshToolDefinition,
  DshToolRegistry,
  DshToolRunContext,
} from "./dsh_types.js";
export { ProjectController, buildProjectIr, DEFAULT_HEAD_COMMIT } from "./controller.js";
export type {
  ControllerStatusView,
  GateInput,
  PlanInput,
  ProjectControllerOptions,
  ReportInput,
  StartProjectInput,
} from "./controller.js";
export { definePalimpsestTools } from "./tools.js";
export { RoleSlotPolicy, BudgetLedger, DEFAULT_ROLE_SLOTS, DEFAULT_HARD_CAP, DEFAULT_SOFT_CAP } from "./parallel.js";
export type { BudgetOptions, ParallelOptions, RoleSlotOptions } from "./parallel.js";
