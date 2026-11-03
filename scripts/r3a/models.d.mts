/** R3-A0 models module type declarations (harness-only; consumed by the TypeScript tests). */
export declare const COMMON_RENDERER: Readonly<{ rendererId: string; rendererVersion: number; familySpecific: boolean }>;
export declare const MODEL_ROUTES: readonly {
  readonly routeId: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly displayName: string;
  readonly modelFamily: string;
  readonly vendor: string;
  readonly api: string;
  readonly baseURL: string;
  readonly apiKeyEnv: string;
  readonly contextWindow: number;
  readonly maxTokens: number;
  readonly materialDistinctness: Readonly<{ vendor: string; family: string; reasoningArchitecture: string; toolUsePostTraining: string; capabilityTier: string }>;
  readonly verifiedEndToEnd: boolean;
  readonly verificationNote?: string;
}[];
export declare function distinctFamilies(routes?: readonly any[]): readonly string[];
export declare function verifiedRoutes(routes?: readonly any[]): readonly any[];
export declare function routeFor(modelId: string): any;
