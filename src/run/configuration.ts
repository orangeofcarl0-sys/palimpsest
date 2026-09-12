/**
 * G10-C1 RunConfiguration — the run-scoped semantic configuration artifact.
 *
 * C1 inventory verdict (§14–§16): every run-scoped-looking candidate in
 * production is owned elsewhere — declared role tables and stage-graph
 * concurrency are Work/scheduler-owned facts on the event log, attempt
 * budgets/maxSteps are effect-owned runtime-loop options, model/provider
 * advisory state is Runtime(DSH)-owned and explicitly deferred by
 * PLMP-BIND-1. No field currently answers the minimality question
 * ("if omitted, can two semantically different run-planning requests become
 * indistinguishable in a way that affects the current Binding/plan result?")
 * with YES. Therefore the canonical DEFAULT configuration is implemented —
 * a real semantic state ("no run-scoped specialization"), not a placeholder.
 *
 * Identity: run-scoped, digest-only. No RunConfigurationId/revision/parent —
 * no durable lineage requirement exists (C1 §18). When a real run-scoped
 * field emerges, the parser/materializer extend and the digest content grows;
 * until then the canonical default is the ONLY valid configuration.
 *
 * Discipline (§19): the materializer CREATES; the parser VALIDATES
 * (schemaVersion, unknown-field rejection, digest fail-closed against the
 * canonical content, deep-frozen output, caller-input detachment). No
 * persistence. The SHA-256/canonical-JSON digest is an implementation choice,
 * not PLMP-UAS-1 frozen semantics.
 */

import { canonicalDigest } from "../schema/canonical.js";

export const RUN_CONFIGURATION_DIGEST_DOMAIN = "palimpsest.run-configuration.v1";

export interface RunConfiguration {
  readonly schemaVersion: 1;
  readonly digest: string;
}

export class RunConfigurationParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunConfigurationParseError";
  }
}

/**
 * The canonical digest content: the run-scoped specialization is EMPTY. The
 * same default configuration has the same digest across runs — acceptable and
 * intended (digest identity, no instance identity).
 */
export function runConfigurationDigestContent(): Record<string, unknown> {
  return {
    domain: RUN_CONFIGURATION_DIGEST_DOMAIN,
    content: {},
  };
}

export function computeRunConfigurationDigest(): string {
  return canonicalDigest(runConfigurationDigestContent());
}

/** Materializer: CREATE the canonical default configuration (validate, digest, freeze). */
export function materializeRunConfiguration(): RunConfiguration {
  return Object.freeze({
    schemaVersion: 1 as const,
    digest: computeRunConfigurationDigest(),
  });
}

function fail(message: string): never {
  throw new RunConfigurationParseError(message);
}

/**
 * Strict parser from `unknown` (the RunConfiguration trust boundary). Until
 * real run-scoped fields exist, the only valid configuration is the canonical
 * default: exact keys, schemaVersion 1, digest equal to the canonical content
 * digest (fail-closed — a tampered digest is never accepted). Deep-frozen.
 */
export function parseRunConfiguration(raw: unknown): RunConfiguration {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    fail("RunConfiguration must be an object");
  }
  const object = raw as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (key !== "schemaVersion" && key !== "digest") fail(`unknown RunConfiguration field "${key}"`);
  }
  if (!Object.hasOwn(object, "schemaVersion") || !Object.hasOwn(object, "digest")) {
    fail("RunConfiguration requires schemaVersion and digest");
  }
  if (object.schemaVersion !== 1) fail("RunConfiguration.schemaVersion must be 1");
  if (typeof object.digest !== "string" || object.digest.length === 0) {
    fail("RunConfiguration.digest must be a non-empty string");
  }
  const computed = computeRunConfigurationDigest();
  if (object.digest !== computed) {
    fail(
      `digest mismatch: supplied ${object.digest}, computed ${computed} ` +
        "(with no run-scoped fields, only the canonical default configuration is valid)",
    );
  }
  return Object.freeze({ schemaVersion: 1 as const, digest: object.digest });
}
