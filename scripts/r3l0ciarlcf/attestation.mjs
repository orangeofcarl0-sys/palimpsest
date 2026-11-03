/**
 * R3-L0C-I-A-R-L-C-F §7 — THE IN-RUN EXECUTABLE AND ENVIRONMENT ATTESTATION.
 *
 * WHAT THIS PRESERVES. The prior stage's three-point sequence is kept exactly: S0 before the run's own
 * installation, S1 after it and before the matrix, S2 after the matrix and before final validity admission; S1 must
 * match the expected installed repository bundle, S2 must match S1, and the competing-writer test compares S2
 * against S1 so this run's own install cannot mask another writer's change. §7 requires that sequence preserved and
 * it is.
 *
 * WHAT THIS CHANGES. The compiled verification is the INPUT-BOUND one from `compiler-cache.mjs`, so the terminal
 * gate cannot treat a stale cached PASS as current verification. The attestation carries the verification's INPUT
 * IDENTITY, and the terminal condition requires it.
 *
 * WHAT IS DISCLOSED RATHER THAN CLAIMED. §7: "Report the exact runtime coverage that has been verified and the
 * dependencies that remain outside it." So `coverageLimitations` names what the attestation does NOT cover, and the
 * installer is reported as a mitigation rather than as proof.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { NL, REPO_ROOT } from './contract.mjs';
import { verifyCompiledSourceBoundToInputs } from './compiler-cache.mjs';

/** §7: the source-to-compiled verification this stage uses — the input-bound one. */
export async function verifyCompiledSource() {
  return verifyCompiledSourceBoundToInputs();
}

/** §7: the installer's own bookkeeping file, excluded from the byte comparison. */
export const INSTALLER_MARKER = '.r3l0ciar-install.json';

/** §7: the two installed bundle targets, as the frozen installer writes them. */
export const BUNDLE_TARGETS = Object.freeze([
  Object.freeze({ source: 'host/dsh', installedName: 'palimpsest-dsh-host' }),
  Object.freeze({ source: 'host/deployment', installedName: 'palimpsest-host-deployment' }),
]);

/** §7: COMPARE THE INSTALLED BUNDLE AGAINST THE REPOSITORY, FILE BY FILE, OVER BYTES. */
export function compareInstalledBundle(input) {
  const { dshHomePath } = input;
  const nodeModules = join(dshHomePath, 'profiles', 'node_modules');
  const targets = [];
  for (const target of BUNDLE_TARGETS) {
    const source = join(REPO_ROOT, target.source);
    const installed = join(nodeModules, target.installedName);
    const sourceExists = existsSync(source);
    const installedExists = existsSync(installed);
    const sourceFiles = sourceExists ? treeDigests(source) : {};
    const installedFiles = installedExists ? treeDigests(installed) : {};
    const sourceNames = Object.keys(sourceFiles).sort();
    const installedNames = Object.keys(installedFiles).filter((name) => name !== INSTALLER_MARKER).sort();
    const missingInInstall = sourceNames.filter((name) => !(name in installedFiles));
    const extraInInstall = installedNames.filter((name) => !(name in sourceFiles));
    const differing = sourceNames.filter((name) => name in installedFiles && sourceFiles[name] !== installedFiles[name]);
    targets.push(Object.freeze({
      source: target.source, installedName: target.installedName,
      sourceExists, installedExists,
      sourceFileCount: sourceNames.length, installedFileCount: installedNames.length,
      missingInInstall: Object.freeze(missingInInstall),
      extraInInstall: Object.freeze(extraInInstall),
      differing: Object.freeze(differing),
      identical: sourceExists && installedExists && missingInInstall.length === 0 && extraInInstall.length === 0 && differing.length === 0,
    }));
  }
  return Object.freeze({
    kind: 'installed host-bundle comparison',
    nodeModules,
    targets: Object.freeze(targets),
    allIdentical: targets.every((target) => target.identical === true),
    excludedInstallerBookkeeping: INSTALLER_MARKER,
    comparedFileByFile: true,
  });
}

/** §7: SAMPLE THE SHARED INSTALLATION'S DIGEST, over the installed bundle directories only. */
export function sampleInstallationDigest(input) {
  const { dshHomePath } = input;
  const nodeModules = join(dshHomePath, 'profiles', 'node_modules');
  const parts = [];
  for (const target of BUNDLE_TARGETS) {
    const installed = join(nodeModules, target.installedName);
    const files = existsSync(installed) ? treeDigests(installed) : {};
    const filtered = Object.fromEntries(Object.entries(files).filter(([name]) => name !== INSTALLER_MARKER));
    parts.push(`${target.installedName}:${digestOfMap(filtered)}`);
  }
  return createHash('sha256').update(parts.sort().join(NL), 'utf8').digest('hex');
}

/** §7: THE COMPETING-WRITER VERDICT FROM S1 AND S2. `installedDuringRun` does NOT suppress detection. */
export function competingWriterVerdict(input) {
  const { s1Digest, s2Digest, s0Digest = null, installedDuringRun = false } = input;
  const changedAfterInstall = s1Digest !== s2Digest;
  return Object.freeze({
    s0Digest, s1Digest, s2Digest,
    installedDuringRun: installedDuringRun === true,
    changedAfterInstall,
    changedSinceStart: s0Digest !== null && s0Digest !== s2Digest,
    competingWriterDetected: changedAfterInstall,
    installedDuringRunSuppressesDetection: false,
    s0ToS1IsThisRunsOwnInstall: s0Digest !== null && s0Digest !== s1Digest,
    note: changedAfterInstall
      ? 'the installed bundle changed between the post-installation baseline S1 and the post-matrix sample S2, with no install by this run in between, so another writer modified the shared installation'
      : 'the installed bundle was stable between the post-installation baseline S1 and the post-matrix sample S2',
  });
}

/**
 * §7: THE WHOLE IN-RUN ATTESTATION, as one entry the terminal admission reads.
 *
 * It reports the three points, the S1-vs-expected comparison, the S2-vs-S1 comparison, the competing-writer
 * verdict, the input-bound compiled verification WITH its input identity, and — as a DISCLOSED limitation — what
 * lies outside the attested closure. A skipped compiled verification is a FAIL, never a pass.
 */
export async function inRunAttestation(input) {
  const { dshHomePath, s0Digest = null, s1Digest, s2Digest, installedDuringRun = false, compiledVerification } = input;
  const expectedBundle = compareInstalledBundle({ dshHomePath });
  const s1MatchesExpectedBundle = expectedBundle.allIdentical === true;
  const s2MatchesS1 = s1Digest === s2Digest;
  const writer = competingWriterVerdict({ s0Digest, s1Digest, s2Digest, installedDuringRun });
  const compiled = compiledVerification ?? null;
  const compiledEvaluated = compiled?.COMPILED_MATCHES_SOURCE === true;
  const compiledSkipped = compiled === null || compiled === undefined || compiled.COMPILED_MATCHES_SOURCE === null || compiled.COMPILED_MATCHES_SOURCE === undefined;
  /** §7: the cache must be BOUND to its inputs, so a stale cached PASS cannot satisfy this condition. */
  const compiledInputIdentity = compiled?.inputIdentity ?? null;
  const compiledBoundToInputs = typeof compiledInputIdentity === 'string' && compiledInputIdentity !== '' && compiled?.verifiedInputs !== undefined && compiled?.verifiedInputs !== null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C-F',
    kind: 'in-run executable and environmental attestation',
    s0Digest, s1Digest, s2Digest,
    expectedBundle,
    s1MatchesExpectedBundle,
    s2MatchesS1,
    writer,
    competingWriterDetected: writer.competingWriterDetected,
    installedDuringRunSuppressesDetection: false,
    compiledSource: compiled,
    compiledVerificationEvaluated: compiledEvaluated,
    compiledVerificationSkipped: compiledSkipped,
    /** §7: the input identity the cached verdict is bound to, so a stale entry is detectable. */
    compiledInputIdentity,
    compiledBoundToInputs,
    /** §7: what the attestation does NOT cover, stated rather than implied. */
    coverageLimitations: Object.freeze([
      'the global DSH installation itself is not part of this repository\'s execution closure, so its bytes are not attested',
      'the host-bundle installer stages and renames, which narrows the replacement window but does NOT make it atomic on every filesystem',
      'the compiled verification covers the nine named source/compiled pairs, not the entire src tree',
    ]),
    installerIsMitigationNotProof: true,
    /** §7: the property. Every part must hold, a skipped compiled verification is not a pass, and the cache must be input-bound. */
    IN_RUN_ATTESTATION: s1MatchesExpectedBundle && s2MatchesS1 && writer.competingWriterDetected === false && compiledEvaluated && compiledBoundToInputs ? 'PASS' : 'FAIL',
    law: 'the competing-writer test compares S2 against S1 — the post-installation baseline — and the compiled verification must be bound to its inputs, so a stale cached PASS is not a current verification',
  });
}

/* ================================================================ helpers */

/** §7: a digest over a map of named digests, with a stable key order. */
export function digestOfMap(map) {
  const material = Object.entries(map).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/** §7: a recursive digest map of a tree. */
export function treeDigests(root) {
  const files = {};
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path, depth + 1);
      else if (entry.isFile()) {
        const relative = path.slice(root.length + 1).replace(/\\/gu, '/');
        try { files[relative] = createHash('sha256').update(readFileSync(path)).digest('hex'); } catch { files[relative] = 'UNREADABLE'; }
      }
    }
  };
  walk(root, 0);
  return files;
}

export { NL, REPO_ROOT };
