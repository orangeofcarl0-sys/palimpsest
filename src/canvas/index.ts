/** PLMP-CANVAS (21 号规格): the canvas definition layer - client-side
 * authoring scratchpad compiled to the existing proposal face. Zero
 * orchestration-contract touch; the ledger stays the only server truth. */

export {
  allocateCanvasEdgeId,
  allocateCanvasNodeId,
  emptyCanvasDoc,
  familyCountersOf,
  parseCanvasDoc,
  ROOT_Z,
  upgradeCanvasV2ToV3,
} from "./doc.js";
export type {
  CanvasDoc,
  CanvasEdge,
  CanvasGroup,
  CanvasIdentityState,
  CanvasNode,
  CanvasNodeType,
  CanvasTaskPayload,
} from "./doc.js";

export { canvasCompile, canvasInsertFragment } from "./compile.js";

export {
  canvasAddEdge,
  canvasAddGroup,
  canvasAddNode,
  canvasDuplicateNode,
  canvasMoveNodeScope,
  canvasReconnectEdge,
  canvasRemoveEdge,
  canvasRemoveGroup,
  canvasRemoveNode,
} from "./mutate.js";

export { canvasRoundTripDiff, liftToAgentGraph, unloadToCanvasDoc } from "./lift.js";

export { canvasDiff } from "./diff.js";
export type {
  CanvasDiffChanged,
  CanvasDiffEntry,
  CanvasDiffResult,
  LiveTaskView,
} from "./diff.js";

export { canvasLayout } from "./layout.js";
export type { CanvasLayoutName } from "./layout.js";

export { reconcileCanvasPresentation } from "./presentation.js";

export { satelliteAttempts, traceRows } from "./derive.js";
export type { SatelliteAttempt, TraceRow, TraceSpan } from "./derive.js";
