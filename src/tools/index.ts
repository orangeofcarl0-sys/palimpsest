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
