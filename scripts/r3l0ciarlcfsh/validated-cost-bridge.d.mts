/** R3-L0C-I-A-R-L-C-F-S-H — TYPES FOR validated-cost-bridge.mjs. */

export const NL: string;

export const VALIDATED_COST_OUTCOMES: readonly any[];
export function validatedCostBridge(input: {
  journalPath: string; runRoot: string; plannedSessions?: readonly string[] | null;
  artifactRoot?: string | null; dshHomePath?: string | null; witnesses?: Record<string, unknown>;
}): Promise<Record<string, any>>;
export function validatedCostCompleteness(costAttribution: unknown): Promise<Record<string, any>>;
