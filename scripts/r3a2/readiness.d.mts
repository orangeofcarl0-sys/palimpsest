/** R3-A2 readiness module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const READINESS_STATES: Readonly<{ TASK_READY: string; MODEL_READY: string; LOCAL_PAIR_READY: string; BRIDGE_READY: string }>;
export declare function graphEdges(pairs: readonly any[]): readonly { readonly fixtureId: string; readonly taskFamily: string; readonly modelId: string; readonly modelFamily: string }[];
export declare function connectedComponents(edges: readonly any[]): readonly { readonly nodes: readonly string[]; readonly taskFamilies: readonly string[]; readonly modelFamilies: readonly string[] }[];
export declare function readiness(pairs: readonly any[], sentinelFamilies: readonly string[]): Readonly<{
  TASK_READY: boolean;
  MODEL_READY: boolean;
  LOCAL_PAIR_READY: boolean;
  BRIDGE_READY: boolean;
  fullTwoByTwoCrossExists: boolean;
  fullCrosses: readonly unknown[];
  qualifiedEdgeCount: number;
  taskFamilies: readonly string[];
  modelFamilies: readonly string[];
  modelsOnTwoTaskFamilies: readonly string[];
  fixturesOnBothSentinelFamilies: readonly string[];
  sentinelFamiliesWithAQualifiedFixture: readonly string[];
  sentinelFamiliesWithoutAQualifiedFixture: readonly string[];
  components: readonly unknown[];
  confoundNote: string;
  edges: readonly unknown[];
}>;
export declare function continuation(readinessReport: any): Readonly<{ next: string; reason: string; allowed: boolean }>;
