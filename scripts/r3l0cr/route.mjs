/**
 * R3-L0C-R — THE AUTHORIZED EXECUTOR ROUTE, AND THE DEVIATION IT CARRIES.
 *
 * WHY THIS MODULE EXISTS RATHER THAN AN EDIT TO THE FROZEN PLAN. R3-L0C froze `PRIMARY_EXECUTOR` inside
 * `scripts/r3l0c/plan.mjs`, and its plan records that module's digest. Editing the frozen module would make
 * R3-L0C's committed evidence describe code that no longer exists, which §19 forbids: the prior stage's evidence
 * is immutable. So the authorized route is defined HERE, in the stage that was authorized to change it, and the
 * R3-L0C-R runner reads it from here. R3-L0C's modules are not touched.
 *
 * THE AUTHORIZATION. The user authorized replacing the executor route with `omnigate2api/deepseek-v4.1-flash` and
 * directed that the change be recorded as an explicit deviation rather than classified as a model-stack change.
 * Both halves are honoured: the route is replaced, and the deviation is recorded as DATA in
 * `EXECUTOR_ROUTE_DEVIATION` rather than left to prose.
 *
 * WHAT DID AND DID NOT CHANGE, stated precisely because the distinction is what keeps the replication comparable:
 *
 *   CHANGED     provider id, base URL, channel (a local gateway instead of the vendor endpoint), model id,
 *               and the credential ref
 *   PRESERVED   the MODEL FAMILY (`deepseek`), the reasoning surface, the frozen corpus, the invariants, the
 *               diagnostics, the capital, the selected-handle semantics, the verdict thresholds, the arm order
 *               and the seed
 *
 * The family is preserved, which is the property that matters most: the replication still runs on the family the
 * frozen design names, so its result bears on the same question.
 *
 * WHY THE PREVIOUS ROUTE WAS REPLACED. It returned `HTTP 402 Insufficient Balance`, verified by calling the
 * vendor endpoint directly. That is a billing state, not a transient failure, so it could not be waited out
 * within the stage.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

const NL = String.fromCharCode(10);

/**
 * The authorized route.
 *
 * `apiKeyEnv` is a CREDENTIAL REF, not a literal: the shipped llm adapter resolves it through the credentials
 * store. `CA2A_API_KEY` is the ref that already holds this gateway's key, verified by comparing the stored value
 * against the gateway credential rather than assumed from the name.
 */
export const PRIMARY_EXECUTOR = Object.freeze({
  routeId: 'omnigate2api-deepseek-v41-flash',
  providerId: 'omnigate-route',
  modelId: 'deepseek-v4.1-flash',
  displayName: 'DeepSeek v4.1 Flash (omnigate2api)',
  /** PRESERVED: the frozen design names the `deepseek` family, and this route is the same family. */
  modelFamily: 'deepseek',
  api: 'openai-completions',
  baseURL: 'http://127.0.0.1:7866/v1',
  /** The credential ref the shipped adapter resolves; it already holds this gateway's key. */
  apiKeyEnv: 'CA2A_API_KEY',
  /** The gateway reports these; recorded so a context-window claim is not inferred from the vendor's docs. */
  contextWindow: 1_000_000,
  maxTokens: 128_000,
  /** §13 of R3-L0C: no model-specific prompt tuning anywhere, and the replacement does not introduce any. */
  modelSpecificPromptTuning: false,
  switchableAfterTrial1: false,
  /** The availability evidence, from a direct probe of the gateway BEFORE the plan was re-frozen. */
  availabilityEvidence: 'a direct completion and a direct streaming completion on this gateway both returned 200 with the model echoing deepseek-v4.1-flash; the model is listed by the gateway and enabled in the ZCode provider config',
});

/** The route that was replaced, kept so the deviation is auditable rather than merely stated. */
export const SUPERSEDED_EXECUTOR = Object.freeze({
  routeId: 'deepseek-direct',
  providerId: 'deepseek-route',
  modelId: 'deepseek-flash',
  modelFamily: 'deepseek',
  baseURL: 'https://api.deepseek.com',
  apiKeyEnv: 'DEEPSEEK_API_KEY',
  supersededReason: 'HTTP 402 Insufficient Balance, verified by a direct request to the vendor endpoint',
});

/**
 * The deviation, recorded as data.
 *
 * It names what changed, what is preserved, the authorization, and the consequence for interpretation. The
 * consequence matters: a route change means the replication runs on a DIFFERENT execution channel than Run 1, so
 * the replication's numbers are not attributable to Run 1's channel — which is already true for another reason,
 * since Run 1's treatment was never applied.
 */
export const EXECUTOR_ROUTE_DEVIATION = Object.freeze({
  id: 'EXECUTOR_ROUTE_REPLACED_UNDER_EXPLICIT_AUTHORIZATION',
  authorizedBy: 'explicit user authorization',
  authorizationText: 'authorized replacing the experiment stack with omnigate2api/deepseek-v4.1-flash, recorded as an explicit deviation rather than classified as a model-stack change',
  classification: 'EXPLICITLY_RECORDED_DEVIATION',
  classifiedAsModelStackChange: false,
  changed: Object.freeze([
    Object.freeze({ field: 'providerId', from: 'deepseek-route', to: 'omnigate-route' }),
    Object.freeze({ field: 'routeId', from: 'deepseek-direct', to: 'omnigate2api-deepseek-v41-flash' }),
    Object.freeze({ field: 'baseURL', from: 'https://api.deepseek.com', to: 'http://127.0.0.1:7866/v1' }),
    Object.freeze({ field: 'modelId', from: 'deepseek-flash', to: 'deepseek-v4.1-flash' }),
    Object.freeze({ field: 'apiKeyEnv', from: 'DEEPSEEK_API_KEY', to: 'CA2A_API_KEY' }),
  ]),
  preserved: Object.freeze([
    'modelFamily (deepseek)',
    'project corpus',
    'I1 and I2 semantics',
    'diagnostic oracle',
    'capital bodies',
    'selected-handle semantics',
    'H/C treatment definition',
    'reconstruction-compression verdict',
    'net-cost verdict',
    'original 16-session arm order',
    'randomization seed',
  ]),
  /** The interpretation consequence, stated so no report over-reads the replication. */
  interpretationConsequence: 'the replication executes on a different channel than Run 1, so no cross-run channel comparison is possible or claimed; Run 1 contributes zero observations to the treatment verdicts regardless, because its treatment was never applied',
  /** §9: this is a PRE-exposure change, so it requires a NEW plan commit rather than an amendment. */
  exposureState: 'PRE_EXPOSURE — the R3-L0C-R replication never launched a model, so this is a pre-exposure change',
  requiresNewPlanCommit: true,
  planAmended: false,
});

/**
 * The route as the harness writes it into a DSH profile.
 *
 * Kept here rather than inlined so the profile writer and the plan record cannot disagree about the route.
 */
export function routeForProfile(route = PRIMARY_EXECUTOR) {
  return Object.freeze({
    providerId: route.providerId,
    displayName: route.displayName,
    apiKeyEnv: route.apiKeyEnv,
    api: route.api,
    baseURL: route.baseURL,
    modelId: route.modelId,
    contextWindow: route.contextWindow,
    maxTokens: route.maxTokens,
  });
}

/** The deviation summary, for a report header. */
export function deviationSummary() {
  return Object.freeze({
    id: EXECUTOR_ROUTE_DEVIATION.id,
    classification: EXECUTOR_ROUTE_DEVIATION.classification,
    classifiedAsModelStackChange: EXECUTOR_ROUTE_DEVIATION.classifiedAsModelStackChange,
    from: `${SUPERSEDED_EXECUTOR.modelId} @ ${SUPERSEDED_EXECUTOR.baseURL}`,
    to: `${PRIMARY_EXECUTOR.modelId} @ ${PRIMARY_EXECUTOR.baseURL}`,
    familyPreserved: PRIMARY_EXECUTOR.modelFamily === SUPERSEDED_EXECUTOR.modelFamily,
    newline: NL,
  });
}
