/**
 * R3-A2 §"Common cognitive interface"/§"Primary qualification evidence" — THE FROZEN SENTINEL MODEL STACKS.
 *
 * §"This stage uses ONLY the existing low-cost sentinel model stacks: DeepSeek Flash, GLM Flash." This module
 * names exactly those two routes and nothing else. Kimi K3 is deliberately ABSENT: §"Do not run Kimi K3" and
 * §"Do not search for additional models" make its presence in a schedule an error rather than an option.
 *
 * The two stacks are carried forward from R3-AE's verified routes with their `materialDistinctness` records
 * intact. §"Common cognitive interface" is explicit that DeepSeek and GLM remain DIFFERENT MODEL STACKS and
 * that this stage must not claim pure model-architecture isolation: the routes differ in vendor, in tool-use
 * post-training lineage and in reasoning formatting, and GLM reaches the harness through a local gateway.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

import { MODEL_ROUTES } from '../r3a/models.mjs';

/** §"Common cognitive interface": the ONE renderer every family runs. Identical to R3-A0's, unchanged. */
export const COMMON_RENDERER = Object.freeze({
  rendererId: 'dsh-common-worker',
  rendererVersion: 1,
  familySpecific: false,
  note: 'the same renderer R3-A0/R3-AE froze; no model-specific prompt tuning exists',
});

/** §"This stage uses ONLY the existing low-cost sentinel model stacks" — the frozen sentinel model ids. */
export const SENTINEL_MODEL_IDS = Object.freeze(['deepseek-flash', 'glm-5.3-flash']);

/** §"Do not run Kimi K3": recorded so a schedule containing it is visibly a deviation, not an oversight. */
export const EXCLUDED_MODEL_IDS = Object.freeze(['kimi-k3']);

/**
 * §"Common cognitive interface": THE SENTINEL ROUTES.
 *
 * Read from the R3-A0 registry rather than re-declared, so a sentinel stack cannot silently drift away from
 * the route R3-A0 verified end-to-end. The filter is by model id against the frozen sentinel list.
 */
export const MODEL_ROUTES_SENTINEL = Object.freeze(MODEL_ROUTES.filter((route) => SENTINEL_MODEL_IDS.includes(route.modelId)));

/**
 * §"Experiment economics": THE DECLARED PRICES, per route.
 *
 * A price is recorded ONLY where this stage can name a published rate for the route. Neither sentinel route
 * declares one here, because the DeepSeek direct route and the local omnigate gateway do not expose a
 * provider-reported monetary cost in the trial telemetry. §"Experiment economics" says "Do not invent
 * unavailable cost values", so both entries are `null` WITH the reason, and the cost accounting reports token
 * counts as the honest currency of this stage.
 */
export const DECLARED_PRICES = Object.freeze({
  'deepseek-flash': Object.freeze({
    usdPerMillionInputTokens: null,
    usdPerMillionOutputTokens: null,
    usdPerMillionCachedTokens: null,
    source: null,
    reason: 'the DeepSeek direct route reports token counts but no provider-reported monetary cost, and this stage will not invent a price to multiply them by',
  }),
  'glm-5.3-flash': Object.freeze({
    usdPerMillionInputTokens: null,
    usdPerMillionOutputTokens: null,
    usdPerMillionCachedTokens: null,
    source: null,
    reason: 'GLM reaches the harness through a local gateway that reports token counts but no provider-reported monetary cost, and this stage will not invent a price to multiply them by',
  }),
});

/** The sentinel route for a model id, or undefined. */
export function sentinelRouteFor(modelId) {
  return MODEL_ROUTES_SENTINEL.find((route) => route.modelId === modelId);
}

/** §"Common cognitive interface": the renderer record a trial carries. */
export function rendererRecordFor(route) {
  return Object.freeze({
    rendererId: COMMON_RENDERER.rendererId,
    rendererVersion: COMMON_RENDERER.rendererVersion,
    familySpecific: COMMON_RENDERER.familySpecific,
    modelId: route.modelId,
    modelFamily: route.modelFamily,
    providerId: route.providerId,
    routeId: route.routeId,
  });
}

/** §"Common cognitive interface": the two sentinel families, so a report can name them without filtering. */
export function sentinelFamilies() {
  return [...new Set(MODEL_ROUTES_SENTINEL.map((route) => route.modelFamily))].sort();
}
