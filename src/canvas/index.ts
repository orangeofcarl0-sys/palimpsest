/** PLMP-CANVAS (21 号规格): the canvas definition layer - client-side
 * authoring scratchpad compiled to the existing proposal face. Zero
 * orchestration-contract touch; the ledger stays the only server truth. */

export {
  emptyCanvasDoc,
  parseCanvasDoc,
  ROOT_Z,
} from "./doc.js";
export type {
  CanvasDoc,
  CanvasGroup,
  CanvasNode,
  CanvasNodeType,
  CanvasTaskPayload,
} from "./doc.js";

export { canvasCompile, canvasInsertFragment, proposalFragment } from "./compile.js";

export { canvasDiff } from "./diff.js";
export type {
  CanvasDiffChanged,
  CanvasDiffEntry,
  CanvasDiffResult,
  LiveTaskView,
} from "./diff.js";

export { canvasLayout } from "./layout.js";
export type { CanvasLayoutName } from "./layout.js";

export { satelliteAttempts, traceRows } from "./derive.js";
export type { SatelliteAttempt, TraceRow, TraceSpan } from "./derive.js";
