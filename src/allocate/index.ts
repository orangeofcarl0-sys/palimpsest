/** Dynamic compute allocation (Research line R5) and its telemetry adapter (PLMP-ALC-1). */

export { allocate } from "./allocator.js";
export type { Allocation, AllocationEstimates, Escalation, Uncertainty, Verifiability } from "./allocator.js";
export {
  adjustAllocation,
  DOWNGRADE_ABOVE,
  ELIGIBILITY_MIN_ATTEMPTS,
  ESCALATE_BELOW,
} from "./telemetry_adapter.js";
export type { AdjustAllocationInput, AllocationTelemetryStats } from "./telemetry_adapter.js";
