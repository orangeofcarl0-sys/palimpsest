/**
 * PLMP-BIND-1 minimal binding kernel (G10-B3 spike).
 *
 * Frozen-contract surface only: types, strict parser, canonicalization/digest,
 * pure resolver, freshness validation. No storage, no runtime wiring, no
 * DSH/Ordarium integration, no PersistentPoint implementation. Deferred
 * contract extensions (provider/model/tool/workspace selections,
 * RunConfiguration binding delta) are intentionally absent.
 */

export * from "./contract.js";
export {
  computeBindingDefinitionDigest,
  computeBindingResolutionDigest,
  bindingDefinitionDigestContent,
  bindingResolutionDigestContent,
  stableStringify,
} from "./digest.js";
export {
  parseBindingDefinition,
  validateSubjectCoverage,
  BindingParseError,
  BindingConfigurationError,
} from "./parser.js";
export {
  MINIMAL_RESOLVER_POLICY,
  compileBindingIntentSource,
  resolveBindingCore,
  materializeResolutionResult,
} from "./resolver.js";
export type {
  ResolverInput,
  ResolverSnapshot,
  BindingCatalogPoint,
  SubjectRequirementFixture,
  SemanticResolutionResult,
} from "./resolver.js";
export { evaluateFreshness } from "./freshness.js";
export type { Freshness, FreshnessBasis } from "./freshness.js";
