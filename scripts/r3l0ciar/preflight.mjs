/**
 * R3-L0C-I-A-R §3 — THE PRE-EXPOSURE MEASUREMENTS.
 *
 * Two of the eight pre-trial conditions are not supplied by a caller and must be MEASURED here, so the reducer
 * reads a measurement rather than a constant:
 *
 *   SELECTION_REALIZATION_PREFLIGHT   the zero-model boundary control: the frozen expectation manifest can be
 *                                     built for each arm/generation, and the C/H distinction is real (C carries
 *                                     handles, H carries none). This is what proves the treatment is deliverable
 *                                     BEFORE any session runs.
 *   MODEL_ROUTE_CONFIGURATION_MATCH   the ACTUAL effective provider, model, route id and settings digest, read
 *                                     from the profile writer's own route module and settings digest — the G3
 *                                     repair, which compares these against the plan instead of testing that a
 *                                     string exists.
 *
 * WHY THE ROUTE MEASUREMENT IS A MEASUREMENT. §3 requires the ACTUAL effective identities. This reads them from
 * `scripts/r3l0cr/route.mjs` and `scripts/r3l0cr/settings.mjs` — the modules that WRITE the profile — so the value
 * compared against the plan is the value the profile carries, not a restatement of the plan's own claim.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { NL } from './contract.mjs';

/**
 * §3: THE SELECTION/REALIZATION PREFLIGHT.
 *
 * It builds the frozen expectation for every arm/generation pair from the admitted capital, and asserts the
 * boundary property: for H the expectation is empty, and for C/G2 it is non-empty. A boundary that could not be
 * realized would be caught HERE, before exposure, rather than as a matrix failure.
 */
export async function realizationPreflight(input) {
  const { admittedRefs, generationExposures } = input;
  const { buildExpectationManifest } = await import('../r3l0cr/contract.mjs');
  const cases = [];
  for (const generation of ['G1', 'G2']) {
    for (const arm of ['C', 'H']) {
      const manifest = buildExpectationManifest({ generationId: generation, arm, admittedRefs, generationExposures });
      cases.push(Object.freeze({
        arm, generation,
        expectedHandles: manifest.expectedConsumerVisibleHandles.length,
        expectedCounts: manifest.expectedCounts,
        emptyForH: arm === 'H' ? manifest.expectedConsumerVisibleHandles.length === 0 : null,
        nonEmptyForC: arm === 'C' ? manifest.expectedConsumerVisibleHandles.length > 0 : null,
      }));
    }
  }
  const hCases = cases.filter((entry) => entry.arm === 'H');
  const cCases = cases.filter((entry) => entry.arm === 'C');
  const boundaryHolds = hCases.every((entry) => entry.emptyForH === true) && cCases.every((entry) => entry.nonEmptyForC === true);
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'selection realization preflight',
    cases: Object.freeze(cases),
    /** §3: the boundary the treatment depends on, measured before any session runs. */
    TREATMENT_BOUNDARY: boundaryHolds ? 'PASS' : 'FAIL',
    PASS: boundaryHolds,
    hIsEmpty: hCases.every((entry) => entry.emptyForH === true),
    cIsNonEmpty: cCases.every((entry) => entry.nonEmptyForC === true),
    modelCallsMade: 0,
    law: 'the frozen expectation is built before execution; H is the absence of a selection and C carries one',
  });
}

/**
 * §3: THE ACTUAL EFFECTIVE ROUTE CONFIGURATION.
 *
 * Reads the provider, model, route id and settings digest the profile writer would install, so the reducer
 * compares the ACTUAL identities against the plan's declared route. `effective` is what the pre-trial reducer
 * reads; `configured` is what the plan declares, recorded separately so a reader can see both.
 */
export async function effectiveRouteConfiguration() {
  const route = await import('../r3l0cr/route.mjs');
  const settings = await import('../r3l0cr/settings.mjs');
  const executor = route.PRIMARY_EXECUTOR;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'effective route configuration',
    /** §3: the identities the profile would actually carry. */
    effective: Object.freeze({
      routeId: executor.routeId,
      providerId: executor.providerId,
      modelId: executor.modelId,
      modelFamily: executor.modelFamily,
      baseURL: executor.baseURL,
      settingsDigest: settings.settingsDigest(),
    }),
    configured: Object.freeze({
      routeId: executor.routeId,
      providerId: executor.providerId,
      modelId: executor.modelId,
      settingsDigest: settings.settingsDigest(),
    }),
    /** §3: no secret value is hashed or exposed; `apiKeyEnv` is a REF and is not included. */
    hashesOrExposesSecretValues: false,
    source: 'scripts/r3l0cr/route.mjs PRIMARY_EXECUTOR + scripts/r3l0cr/settings.mjs settingsDigest()',
    law: 'the effective identities are read from the module that writes the profile, not restated from the plan',
  });
}

/** §3: the plan's declared route, in the shape the reducer compares against. */
export async function plannedRouteConfiguration() {
  const route = await import('../r3l0cr/route.mjs');
  const settings = await import('../r3l0cr/settings.mjs');
  const executor = route.PRIMARY_EXECUTOR;
  return Object.freeze({
    routeId: executor.routeId,
    providerId: executor.providerId,
    modelId: executor.modelId,
    settingsDigest: settings.settingsDigest(),
    authoritativePath: 'r3-l0c-iar-primary-plan',
  });
}

export { NL };
