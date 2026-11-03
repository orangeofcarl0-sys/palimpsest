/**
 * PC1-V1 R1 — the identity of one mechanical completion check.
 *
 * A predicate alone is not an obligation: two different commands may both be labelled `tests_pass`,
 * and one run must not satisfy both. These digests are derived from the exact command/artifact set,
 * so a gate clause can name the observation it requires without changing the Evidence schema or
 * reinterpreting historical atoms (`value` is already an open map).
 */
import { canonicalDigest } from "../schema/canonical.js";

const COMMAND_DOMAIN = "palimpsest.command-evidence.v1";
const ARTIFACT_DOMAIN = "palimpsest.required-artifacts.v1";

export function commandDigest(command: readonly string[]): string {
  return canonicalDigest({ domain: COMMAND_DOMAIN, command: [...command] });
}

export function artifactSetDigest(paths: readonly string[]): string {
  return canonicalDigest({ domain: ARTIFACT_DOMAIN, paths: [...new Set(paths)].sort() });
}
