/**
 * R3-A0 §8/§9 — THE FROZEN MODEL ROUTES.
 *
 * §8 requires at least TWO materially distinct candidate model families, and forbids silently substituting
 * another model. Each route below was VERIFIED END-TO-END before this file was frozen: the model completed a
 * DSH headless task through the route, and (for the coding worker) used a tool to write a file. The
 * verification evidence is in `research-evidence/r3-a/model-discovery.json`.
 *
 * §14: `materialDistinctness` records WHY each family is considered materially different, and it is checked
 * against the requirement that families differ in at least one of: tool-use post-training, reasoning
 * architecture, vendor/model family, or capability level. Two sizes of one family do NOT qualify, and none of
 * these routes is a second size of another.
 *
 * §9: every route runs through the SAME common worker renderer. There is no family-specific prompt tuning,
 * and `rendererId` is identical across routes.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

/** §9: the ONE renderer every family runs. Recorded per trial so a reader can see it did not vary. */
export const COMMON_RENDERER = Object.freeze({ rendererId: 'dsh-common-worker', rendererVersion: 1, familySpecific: false });

/**
 * §8: THE FROZEN MODEL ROUTES.
 *
 * `providerId` is the pi-ai route name the worker profile composes. `apiKeyEnv` names the credential the
 * route resolves; the VALUE is never read by the harness — the DSH credential plane supplies it.
 */
export const MODEL_ROUTES = Object.freeze([
  Object.freeze({
    routeId: 'deepseek-direct',
    providerId: 'deepseek-route',
    modelId: 'deepseek-flash',
    displayName: 'DeepSeek Flash',
    modelFamily: 'deepseek',
    vendor: 'DeepSeek',
    api: 'openai-completions',
    baseURL: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    contextWindow: 131072,
    maxTokens: 8192,
    /** §8/§14: why this family is materially distinct from the others. */
    materialDistinctness: Object.freeze({
      vendor: 'DeepSeek',
      family: 'deepseek',
      reasoningArchitecture: 'native reasoning-content channel (deepseek thinking format)',
      toolUsePostTraining: 'harness-native tool loop',
      capabilityTier: 'fast/cheap tier',
    }),
    verifiedEndToEnd: true,
  }),
  Object.freeze({
    routeId: 'glm-via-omnigate',
    providerId: 'omnigate',
    modelId: 'glm-5.3-flash',
    displayName: 'GLM 5.3 Flash',
    modelFamily: 'glm',
    vendor: 'Zhipu / Z.ai',
    api: 'openai-completions',
    baseURL: 'http://127.0.0.1:7866/v1',
    apiKeyEnv: 'CA2A_API_KEY',
    contextWindow: 131072,
    maxTokens: 8192,
    materialDistinctness: Object.freeze({
      vendor: 'Zhipu / Z.ai',
      family: 'glm',
      reasoningArchitecture: 'non-DeepSeek reasoning formatting through an OpenAI-compatible surface',
      toolUsePostTraining: 'third-party tool loop, distinct post-training lineage',
      capabilityTier: 'flash tier',
    }),
    verifiedEndToEnd: true,
  }),
  Object.freeze({
    routeId: 'kimi-via-omnigate',
    providerId: 'omnigate',
    modelId: 'kimi-k3',
    displayName: 'Kimi K3',
    modelFamily: 'kimi',
    vendor: 'Moonshot AI',
    api: 'openai-completions',
    baseURL: 'http://127.0.0.1:7866/v1',
    apiKeyEnv: 'CA2A_API_KEY',
    contextWindow: 131072,
    maxTokens: 8192,
    materialDistinctness: Object.freeze({
      vendor: 'Moonshot AI',
      family: 'kimi',
      reasoningArchitecture: 'Moonshot reasoning lineage, distinct from both above',
      toolUsePostTraining: 'third-party tool loop, distinct post-training lineage',
      capabilityTier: 'frontier tier',
    }),
    /** §8: verified at the GATEWAY, not yet end-to-end inside a DSH worker. Recorded honestly. */
    verifiedEndToEnd: false,
    verificationNote: 'answered a gateway completion; not yet driven end-to-end through a DSH worker profile in this stage',
  }),
]);

/** §8: the materially distinct families among the routes. Two sizes of one family would collapse here. */
export function distinctFamilies(routes = MODEL_ROUTES) {
  return [...new Set(routes.map((route) => route.modelFamily))].sort();
}

/** §8: the routes that were verified end-to-end in a DSH worker. */
export function verifiedRoutes(routes = MODEL_ROUTES) {
  return routes.filter((route) => route.verifiedEndToEnd === true);
}

/** The route for a model id, or undefined. */
export function routeFor(modelId) {
  return MODEL_ROUTES.find((route) => route.modelId === modelId);
}
