/**
 * G10-C1 run grounding package: the RunConfiguration artifact and the
 * RunDefinition planning composite (refs-only; no persistence; no runtime
 * realization). The binding compiler consumes these artifacts; the scheduler
 * stays downstream.
 */

export {
  RUN_CONFIGURATION_DIGEST_DOMAIN,
  computeRunConfigurationDigest,
  materializeRunConfiguration,
  parseRunConfiguration,
  RunConfigurationParseError,
  runConfigurationDigestContent,
} from "./configuration.js";
export type { RunConfiguration } from "./configuration.js";
export {
  RUN_DEFINITION_DIGEST_DOMAIN,
  materializeRunDefinition,
  runDefinitionDigestContent,
  runDefinitionDigestOf,
} from "./definition.js";
export type {
  RunDefinition,
  RunDefinitionDigestInput,
  RunDefinitionRef,
} from "./definition.js";
