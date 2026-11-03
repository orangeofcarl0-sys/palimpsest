/**
 * R3-L0C-G1 §7 — SOURCE-GROUNDED ARTIFACT LOCATOR COMPATIBILITY.
 *
 * THE DEFECT THIS ADDRESSES. G0 measured that two parsers in this repository disagree about the AttemptId a real
 * DSH session path encodes: `scripts/r3l0ciarlcf/artifact-identity.mjs attemptIdFromPath` requires `attempt-<hex>`
 * as a WHOLE PATH SEGMENT, while `scripts/r3l0c/instrumentation.mjs` uses a bare substring regex. On the same
 * real path the first returns null and the second returns a hex string.
 *
 * THE ACTUAL LAYOUT, verified read-only against a palimpsest-controlled directory (NOT a personal history):
 *
 *   <dshHome>/sessions/--<cwd-slug>--/worker-<uuid>/session.v4.jsonl.zstd
 *
 * where `<cwd-slug>` is the worker's working directory with every path separator replaced by `-` and wrapped in
 * `--`. The worker's cwd is the execution world `.palimpsest/worlds/<attemptId>`, so the canonical AttemptId is
 * embedded INSIDE the slug, followed by the slug's closing `--` rather than by `/` or end-of-string. That is
 * exactly why the segment-anchored parser misses it.
 *
 * WHY THIS IS A READ-ONLY LOCATOR AND NOT A REPLACEMENT. §7 forbids modifying the frozen Cost Bridge or the
 * existing R3 Artifact parser. This module therefore does not touch either; it provides the source-grounded
 * grammar and its tests, and it never connects to a paid Worker launch.
 *
 * WHAT PASSING ITS TESTS PROVES. `ARTIFACT_LOCATOR_GRAMMAR_TESTED` — nothing more. `REAL_DSH_ARTIFACT_COMPATIBILITY`
 * requires authentic project-specific DSH evidence from the frozen experiment, which G1 does not have.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import { LOCATOR_EVIDENCE_LEVELS, NL } from './contract.mjs';

/** §7: the DSH session file name, matching the existing instrumentation parser. */
export const DSH_SESSION_FILE = 'session.v4.jsonl.zstd';

/** §7: the worker directory prefix, from the real layout. */
export const WORKER_DIR_PREFIX = 'worker-';

/** §7: the slug delimiter. A slug is `--<encoded-cwd>--`. */
export const SLUG_DELIMITER = '--';

/** §7: the execution-world segment the canonical AttemptId lives in. */
export const WORLDS_SEGMENT = '-worlds-';

/** §7: the AttemptId prefix and hex length, matching `stableEntityId("attempt", digest)`. */
export const ATTEMPT_PREFIX = 'attempt-';
export const ATTEMPT_HEX_LENGTH = 32;

/** §7: the locator outcomes. Ambiguity and absence are DIFFERENT results, not both "null". */
export const LOCATOR_OUTCOMES = Object.freeze({
  DISCOVERED_UNIQUE: 'DISCOVERED_UNIQUE',
  ABSENT: 'ABSENT',
  AMBIGUOUS: 'AMBIGUOUS',
  IDENTITY_UNPARSEABLE: 'IDENTITY_UNPARSEABLE',
  OUTSIDE_SCOPED_HOME: 'OUTSIDE_SCOPED_HOME',
  ESCAPE_REFUSED: 'ESCAPE_REFUSED',
  /** R3-L0C-G1-B §8 B5: the scan could not cover every directory, so no absence or uniqueness may be claimed. */
  DISCOVERY_INCOMPLETE: 'DISCOVERY_INCOMPLETE',
  /** R3-L0C-G1-B §8 B5: the expected identity itself is malformed, so no comparison is meaningful. */
  MALFORMED_EXPECTED_IDENTITY: 'MALFORMED_EXPECTED_IDENTITY',
});

/**
 * §7: DECODE THE CWD SLUG.
 *
 * The slug is `--` + the cwd with `/` (and `\`) replaced by `-` + `--`. Decoding is LOSSY in general — a path
 * segment that genuinely contained `-` is indistinguishable from a separator — so this function does NOT
 * reconstruct a path. It returns the slug's inner text, which is what the AttemptId extraction needs.
 */
export function decodeCwdSlug(name) {
  if (typeof name !== 'string' || !name.startsWith(SLUG_DELIMITER) || !name.endsWith(SLUG_DELIMITER) || name.length <= SLUG_DELIMITER.length * 2) {
    return null;
  }
  return name.slice(SLUG_DELIMITER.length, name.length - SLUG_DELIMITER.length);
}

/**
 * §7: EXTRACT THE CANONICAL ATTEMPT ID FROM A DECODED SLUG.
 *
 * The grammar requires the `-worlds-` boundary AND the AttemptId to be a complete token inside the slug: it must
 * be preceded by `worlds-` and followed by either the END of the slug or a `-`. The trailing `-` is what the
 * segment-anchored parser cannot express, because inside the slug it is a SEPARATOR rather than a path boundary.
 *
 * §7 rule 5: a partial/prefix collision is rejected — the hex run must be EXACTLY the canonical length, so a
 * 33-hex token is not a valid identity and neither is a truncated 31-hex one.
 */
export function attemptIdFromSlug(slug) {
  if (typeof slug !== 'string') return null;
  const index = slug.lastIndexOf(WORLDS_SEGMENT);
  if (index < 0) return null;
  const tail = slug.slice(index + WORLDS_SEGMENT.length);
  if (!tail.startsWith(ATTEMPT_PREFIX)) return null;
  const hexStart = ATTEMPT_PREFIX.length;
  let hexEnd = hexStart;
  while (hexEnd < tail.length && /[0-9a-fA-F]/u.test(tail[hexEnd])) hexEnd += 1;
  const hex = tail.slice(hexStart, hexEnd);
  /** §7 rules 3/5: the boundary must be the END of the slug or a separator, and the run must be exact. */
  const boundaryOk = hexEnd === tail.length || tail[hexEnd] === '-';
  if (!boundaryOk || hex.length !== ATTEMPT_HEX_LENGTH) return null;
  return hex.toLowerCase();
}

/**
 * §7: EXTRACT THE ATTEMPT ID FROM A FULL ARTIFACT PATH, using the documented layout.
 *
 * The path must end in `<slug>/worker-<uuid>/session.v4.jsonl.zstd`, so the worker directory and the session file
 * are both part of the grammar — a path that merely contains a slug somewhere is not a match.
 */
export function attemptIdFromArtifactPath(path) {
  const normalized = String(path ?? '').replace(/\\/gu, '/');
  const parts = normalized.split('/');
  if (parts.length < 3) return null;
  const file = parts[parts.length - 1];
  const workerDir = parts[parts.length - 2];
  const slugDir = parts[parts.length - 3];
  if (file !== DSH_SESSION_FILE) return null;
  if (!workerDir.startsWith(WORKER_DIR_PREFIX)) return null;
  const slug = decodeCwdSlug(slugDir);
  if (slug === null) return null;
  return attemptIdFromSlug(slug);
}

/** §7 rule 9: whether `child` stays inside `root`, by relative resolution and real-path canonicalization. */
export function isInsideRoot(input) {
  const { root, child } = input;
  const rel = relative(resolve(root), resolve(child));
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false;
  try {
    const realRel = relative(realpathSync(resolve(root)), realpathSync(resolve(child)));
    return realRel !== '' && !realRel.startsWith('..') && !isAbsolute(realRel);
  } catch {
    /** §7: an unresolvable real path is not proof of containment, so it is refused. */
    return false;
  }
}

/**
 * R3-L0C-G1-B §8 B5: NORMALIZE AN EXPECTED ATTEMPT IDENTITY UNDER ONE EXPLICIT CONTRACT.
 *
 * The Work Owner produces the CANONICAL `attempt-<32hex>` form, while the CWD slug encodes only the bare hex. G1
 * compared the slug's bare hex against whatever the caller passed, so the canonical identity was rejected. The
 * normalization accepts BOTH forms and rejects everything else — a malformed prefix, a wrong hex length, or a
 * prefix collision — rather than making the comparison lenient.
 */
export function normalizeAttemptIdentity(value) {
  if (typeof value !== 'string') return Object.freeze({ ok: false, bare: null, canonical: null, reason: 'the expected AttemptId is not a string' });
  const lower = value.trim().toLowerCase();
  const bare = lower.startsWith(ATTEMPT_PREFIX) ? lower.slice(ATTEMPT_PREFIX.length) : lower;
  if (!/^[0-9a-f]+$/u.test(bare)) return Object.freeze({ ok: false, bare: null, canonical: null, reason: 'the expected AttemptId is not hexadecimal' });
  if (bare.length !== ATTEMPT_HEX_LENGTH) return Object.freeze({ ok: false, bare: null, canonical: null, reason: `the expected AttemptId hex is ${String(bare.length)} characters, not ${String(ATTEMPT_HEX_LENGTH)}` });
  return Object.freeze({ ok: true, bare, canonical: `${ATTEMPT_PREFIX}${bare}`, reason: null });
}

/**
 * §7: DISCOVER THE SCHEDULED ATTEMPT'S ARTIFACT UNDER A SCOPED DSH HOME.
 *
 * Every §7 rule is a REFUSAL here rather than a preference:
 *   1. the home must be scoped and the candidate must stay inside it;
 *   2/3. the documented grammar must prove the AttemptId boundary;
 *   4. the identity comparison is exact normalized equality over the canonical/bare contract;
 *   5. a prefix collision is rejected by the exact-length rule in `attemptIdFromSlug`;
 *   6. two candidates for one attempt is AMBIGUOUS, never a pick;
 *   7. a candidate with no parseable identity is not a candidate;
 *   8. an unrelated session is rejected by the identity comparison;
 *   9. a symlink or traversal escape is refused;
 *   10. recency is NEVER a selector;
 *   11. R3-L0C-G1-B §8: a traversal that could not scan every directory reports DISCOVERY_INCOMPLETE rather than
 *       claiming an exhaustive search.
 */
export function discoverScheduledArtifact(input) {
  const { dshHomePath, expectedAttemptId, maxDepth = 6 } = input;
  if (dshHomePath === null || dshHomePath === undefined || expectedAttemptId === null || expectedAttemptId === undefined) {
    return Object.freeze({ outcome: LOCATOR_OUTCOMES.ABSENT, discovered: false, artifactPath: null, attemptId: null, candidates: Object.freeze([]), reason: 'no scoped home or no expected AttemptId was supplied', selectedLatestByMtime: false, discoveryIncomplete: false });
  }
  /** §8 B5: normalize the expected identity ONCE, under the explicit contract. */
  const expected = normalizeAttemptIdentity(expectedAttemptId);
  if (expected.ok !== true) {
    return Object.freeze({
      outcome: LOCATOR_OUTCOMES.MALFORMED_EXPECTED_IDENTITY, discovered: false, artifactPath: null, attemptId: null,
      candidates: Object.freeze([]), reason: `the expected AttemptId is malformed: ${expected.reason}`,
      selectedLatestByMtime: false, discoveryIncomplete: false,
    });
  }
  const home = resolve(dshHomePath);
  const sessionsRoot = join(home, 'sessions');
  if (!existsSync(sessionsRoot)) {
    return Object.freeze({ outcome: LOCATOR_OUTCOMES.ABSENT, discovered: false, artifactPath: null, attemptId: null, candidates: Object.freeze([]), reason: `no sessions directory exists under the scoped home ${home}`, selectedLatestByMtime: false, discoveryIncomplete: false });
  }

  const found = [];
  const refused = [];
  /** §8 B5: the directories the traversal could NOT enter, so an incomplete scan is reportable. */
  const unscanned = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) {
      /** §8: the bound was reached with a directory still uninspected, so the search is NOT exhaustive. */
      unscanned.push(Object.freeze({ path: dir, reason: `the declared depth bound ${String(maxDepth)} was reached before this directory was scanned` }));
      return;
    }
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch (error) {
      /** §8 B5-N8: an unreadable directory is an INCOMPLETE scan, not an absence of candidates. */
      unscanned.push(Object.freeze({ path: dir, reason: `the directory could not be read: ${String(error?.message ?? error).slice(0, 120)}` }));
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      /** §7 rule 9: a link is refused, because its identity is the target's rather than the path's. */
      let stats;
      try { stats = lstatSync(path); } catch { continue; }
      if (stats.isSymbolicLink()) {
        if (entry.name === DSH_SESSION_FILE) refused.push(Object.freeze({ path, reason: 'the candidate is a symbolic link or reparse point' }));
        continue;
      }
      if (stats.isDirectory()) { walk(path, depth + 1); continue; }
      if (entry.name !== DSH_SESSION_FILE) continue;
      /** §7 rule 9: a traversal escape out of the scoped home is refused. */
      if (!isInsideRoot({ root: home, child: path })) {
        refused.push(Object.freeze({ path, reason: 'the candidate resolves outside the scoped DSH home' }));
        continue;
      }
      const attemptId = attemptIdFromArtifactPath(path);
      /** §7 rule 7: no parseable identity means it is not a candidate for ANY attempt. */
      if (attemptId === null) continue;
      found.push(Object.freeze({ path, attemptId }));
    }
  };
  walk(sessionsRoot, 0);

  /** §7 rule 4 / §8: exact normalized equality over the canonical-or-bare contract. */
  const matches = found.filter((candidate) => candidate.attemptId === expected.bare);
  if (matches.length === 0) {
    /**
     * §8 B5: AN INCOMPLETE SCAN CANNOT REPORT ABSENCE. A unique candidate found in a partially scanned space is
     * not proof of global uniqueness, and neither is an empty result from a space that was not fully searched.
     */
    if (unscanned.length > 0) {
      return Object.freeze({
        outcome: LOCATOR_OUTCOMES.DISCOVERY_INCOMPLETE, discovered: false, artifactPath: null, attemptId: null,
        candidates: Object.freeze(found),
        refused: Object.freeze(refused),
        unscanned: Object.freeze(unscanned),
        reason: `the search could not scan ${String(unscanned.length)} directory(ies), so it is NOT exhaustive and no absence can be claimed`,
        selectedLatestByMtime: false, discoveryIncomplete: true,
      });
    }
    return Object.freeze({
      outcome: refused.length > 0 ? LOCATOR_OUTCOMES.ESCAPE_REFUSED : LOCATOR_OUTCOMES.ABSENT,
      discovered: false, artifactPath: null, attemptId: null,
      candidates: Object.freeze(found),
      refused: Object.freeze(refused),
      unscanned: Object.freeze(unscanned),
      reason: refused.length > 0
        ? `no candidate matched the expected AttemptId, and ${String(refused.length)} candidate(s) were refused as unsafe`
        : 'no artifact under the scoped home encodes the expected AttemptId',
      selectedLatestByMtime: false, discoveryIncomplete: false,
    });
  }
  /** §7 rule 6 / §8: ambiguity is reported, never resolved by picking one. */
  if (matches.length > 1) {
    return Object.freeze({
      outcome: LOCATOR_OUTCOMES.AMBIGUOUS, discovered: false, artifactPath: null, attemptId: null,
      candidates: Object.freeze(matches),
      unscanned: Object.freeze(unscanned),
      reason: `${String(matches.length)} artifacts encode the same AttemptId, so the candidate is ambiguous and no artifact is selected`,
      selectedLatestByMtime: false, discoveryIncomplete: unscanned.length > 0,
    });
  }
  /** §8 B5: even a unique match is NOT claimed as globally unique when the scan was incomplete. */
  if (unscanned.length > 0) {
    return Object.freeze({
      outcome: LOCATOR_OUTCOMES.DISCOVERY_INCOMPLETE, discovered: false, artifactPath: null, attemptId: null,
      candidates: Object.freeze(matches),
      unscanned: Object.freeze(unscanned),
      reason: `one candidate matched, but ${String(unscanned.length)} directory(ies) could not be scanned, so global uniqueness is NOT established`,
      selectedLatestByMtime: false, discoveryIncomplete: true,
    });
  }
  return Object.freeze({
    outcome: LOCATOR_OUTCOMES.DISCOVERED_UNIQUE, discovered: true,
    artifactPath: matches[0].path, attemptId: matches[0].attemptId,
    canonicalAttemptId: `${ATTEMPT_PREFIX}${matches[0].attemptId}`,
    candidates: Object.freeze(matches),
    reason: null, selectedLatestByMtime: false, discoveryIncomplete: false,
  });
}

/** §7: the evidence level a passing grammar test proves, stated so no caller conflates it with real compatibility. */
export function locatorEvidenceLevel() {
  return Object.freeze({
    provedByGrammarTests: LOCATOR_EVIDENCE_LEVELS.TESTED,
    requiresAuthenticEvidence: LOCATOR_EVIDENCE_LEVELS.REAL,
    realCompatibilityEstablished: false,
    note: 'synthetic and source-grounded path tests prove the GRAMMAR; REAL_DSH_ARTIFACT_COMPATIBILITY needs authentic frozen-experiment evidence',
  });
}

export { NL, sep };
