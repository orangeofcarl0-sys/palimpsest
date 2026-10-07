/**
 * R3-L0C-R — THE AUTHORIZED ROUTE AS A SETTINGS SECTION.
 *
 * WHY THE ROUTE LIVES IN settings.yaml. The shipped `dsh-llm-pi-ai` adapter resolves provider routes from its
 * SETTINGS namespace (`llm-pi-ai`), not from the plugin's composition config. Its own base bundle says so:
 * the `llm-pi-ai` plugin is mounted with NO config and "zero routes until a `llm-pi-ai:` settings section
 * supplies provider profiles". A route declared in `cordis.patch.yml` is therefore never registered.
 *
 * THE MEASUREMENT THAT ESTABLISHED THIS, because it is the kind of thing that is easy to get wrong twice:
 * R3-L0C's profiles DID carry the route in `cordis.patch.yml`, and its sessions recorded BOTH
 * `deepseek-route` and `deepseek-official` as the effective provider. The ones that recorded `deepseek-route`
 * were the ones whose request happened to be served by the pi-ai twin; the rest fell through to the base
 * bundle's hardcoded `agent-default-model.provider: deepseek-official`. So the patch route was partially
 * effective at best, and the base default was the real fallback — which is why the new route has to be declared
 * where the adapter actually reads it.
 *
 * This module builds the settings document, and the route module remains the single source of the values so the
 * settings writer and the plan record cannot disagree.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';

import { PRIMARY_EXECUTOR } from './route.mjs';

const NL = String.fromCharCode(10);

/** The settings namespace the adapter reads provider routes from. */
export const SETTINGS_NAMESPACE = 'llm-pi-ai';

/**
 * The `llm-pi-ai` settings section for the authorized route.
 *
 * The shape follows the adapter's own resolver: a dict keyed by route id, each entry carrying the endpoint, the
 * protocol, the credential REF and the model list. `apiKeyEnv` is a ref, so the secret never appears here.
 */
export function llmPiAiSection(route = PRIMARY_EXECUTOR) {
  return Object.freeze({
    providers: Object.freeze({
      [route.providerId]: Object.freeze({
        displayName: route.displayName,
        api: route.api,
        baseURL: route.baseURL,
        apiKeyEnv: route.apiKeyEnv,
        models: Object.freeze([
          Object.freeze({
            id: route.modelId,
            name: route.displayName,
            contextWindow: route.contextWindow,
            maxTokens: route.maxTokens,
          }),
        ]),
      }),
    }),
  });
}

/**
 * The full settings document for a profile home.
 *
 * It carries the route section AND the default-model selection, so a worker starts on the authorized route
 * rather than on the base bundle's hardcoded vendor default.
 */
export function settingsDocument(route = PRIMARY_EXECUTOR, locale = 'en') {
  return Object.freeze({
    'agent-default-model': Object.freeze({ provider: route.providerId, model: route.modelId }),
    'llm-pi-ai': llmPiAiSection(route),
    locale: Object.freeze({ preference: locale }),
  });
}

/**
 * Render the settings document as YAML.
 *
 * A small emitter rather than a dependency: the document is a fixed shape, and writing it directly keeps the
 * exact key order and quoting under this module's control so the bytes are reproducible.
 */
export function renderSettingsYaml(route = PRIMARY_EXECUTOR, locale = 'en') {
  const lines = [
    'agent-default-model:',
    `  provider: ${route.providerId}`,
    `  model: ${route.modelId}`,
    'locale:',
    `  preference: ${locale}`,
    'llm-pi-ai:',
    '  providers:',
    `    ${route.providerId}:`,
    `      displayName: ${route.displayName}`,
    `      api: ${route.api}`,
    `      baseURL: ${route.baseURL}`,
    `      apiKeyEnv: ${route.apiKeyEnv}`,
    '      models:',
    `        - id: ${route.modelId}`,
    `          name: ${route.displayName}`,
    `          contextWindow: ${String(route.contextWindow)}`,
    `          maxTokens: ${String(route.maxTokens)}`,
    '',
  ];
  return lines.join(NL);
}

/** A digest of the rendered settings, so a profile's route declaration is checkable. */
export function settingsDigest(route = PRIMARY_EXECUTOR) {
  return createHash('sha256').update(renderSettingsYaml(route), 'utf8').digest('hex');
}

/**
 * The COMPOSITION patch entry that makes the runner actually use the route.
 *
 * The shipped host runner pins the model from `agent-default-model.currentSelection()`, which reads the
 * composition config, and the base bundle hardcodes the vendor default there. Declaring the route only in
 * `settings.yaml` or in the `llm-pi-ai` plugin config is not enough — measured: the same profile returned the
 * gateway route for a bare DSH run and the vendor default for the worker port.
 */
export function defaultModelPatch(route = PRIMARY_EXECUTOR) {
  return [
    '- id: agent-default-model',
    '  name: "@deepseek-ai/dsh-agent-default-model"',
    '  config:',
    `    provider: ${route.providerId}`,
    `    model: ${route.modelId}`,
  ].join(NL);
}

/** The expected effective route, so a run can assert what it should observe. */
export function expectedEffectiveRoute(route = PRIMARY_EXECUTOR) {
  return Object.freeze({ provider: route.providerId, model: route.modelId, source: 'settings.yaml llm-pi-ai section + agent-default-model' });
}
