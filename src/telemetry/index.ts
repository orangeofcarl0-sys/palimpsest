/** Telemetry: model performance table (Research line R6). */

export { ModelPerformanceTable } from "./performance_table.js";
export {
  TELEMETRY_TABLE,
  ensureTelemetryTable,
  rebuildTelemetry,
  writeTelemetry,
} from "./persistence.js";
export type {
  ModelStat,
  PerformanceSnapshot,
  TaskOutcome,
  TelemetryRecord,
} from "./performance_table.js";
