/** Telemetry: model performance table (R6) and its Ordarium state-kind persistence (PLMP-TLM-1). */

export { MODEL_MIN_ATTEMPTS, ModelPerformanceTable } from "./performance_table.js";
export type {
  ModelStat,
  PerformanceSnapshot,
  TaskOutcome,
  TelemetryRecord,
} from "./performance_table.js";
export { TELEMETRY_NAMESPACE, TelemetryStateSync } from "./state_persistence.js";
export type { TelemetryDeltaValue } from "./state_persistence.js";
