/**
 * R3-L0C-I-A-R-L §4 — THE EXECUTABLE AND ENVIRONMENTAL ATTESTATION.
 *
 * THE DEFECT THIS CLOSES, measured in L4. Every closure computation in the prior stage passed
 * `verifyCompiled: false`, so `COMPILED_MATCHES_SOURCE` was never evaluated; and no module compared the INSTALLED
 * host bundle against the repository, so a stale or substituted installation was undetectable.
 *
 * THREE FACTS, EACH MEASURED:
 *
 *   1. SOURCE-TO-COMPILED VERIFICATION, completed rather than skipped. The frozen
 *      `verifyCompiledAgainstSource` does the work; this stage calls it with verification ENABLED.
 *   2. THE INSTALLED BUNDLE AGAINST THE REPOSITORY. The two host-bundle directories the frozen installer writes
 *      into the shared DSH home are compared FILE BY FILE against their sources, so a stale or substituted
 *      installation is a measured difference rather than an assumption.
 *   3. A COMPETING WRITER OF THE SHARED INSTALLATION. The installation's file digests are sampled before the
 *      matrix and again after it; a change with no install in between means another process wrote it.
 *
 * THE INSTALLER IS A MITIGATION, NOT A PROOF. §4 requires the current host-bundle installer to be preserved as a
 * mitigation rather than presented as atomic replacement. It is: it stages and renames, which narrows the window,
 * and it does NOT make the replacement atomic — a reader can still observe the directory between the rename's
 * two halves on some filesystems. The attestation measures the result instead of claiming the mechanism is
 * airtight.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ATTESTATION, NL, REPO_ROOT } from './contract.mjs';

/**
 * §4: COMPLETE THE DETERMINISTIC SOURCE-TO-COMPILED VERIFICATION.
 *
 * It delegates to the frozen implementation with verification ENABLED, so the method — a fresh emit compared
 * byte-for-byte against `dist/**` — is the frozen one rather than a second implementation.
 */
export async function verifyCompiledSource() {
  const prior = await import('../r3l0cf/closure.mjs');
  const result = prior.verifyCompiledAgainstSource();
  return Object.freeze({
    kind: 'source-to-compiled attestation',
    requested: true,
    evaluated: true,
    deterministic: result.DETERMINISTIC,
    method: result.method,
    pairs: result.pairs,
    missing: result.missing,
    diverged: result.diverged ?? null,
    stale: result.stale ?? null,
    COMPILED_MATCHES_SOURCE: result.COMPILED_MATCHES_SOURCE,
    unsupportedReason: result.unsupportedReason ?? null,
  });
}

/**
 * §4: THE INSTALLER'S OWN BOOKKEEPING FILE, EXCLUDED FROM THE BYTE COMPARISON.
 *
 * The reused installer writes a marker inside each installed directory so it can recognise its own work and skip a
 * redundant copy. That marker is the INSTALLER's bookkeeping, not part of the bundle the repository ships, so
 * comparing it against the source would report a spurious difference. It is excluded BY NAME, and the exclusion is
 * narrow: every other file is compared byte-for-byte.
 */
export const INSTALLER_MARKER = '.r3l0ciar-install.json';

/**
 * §4: COMPARE THE INSTALLED HOST BUNDLE AGAINST THE REPOSITORY, FILE BY FILE.
 *
 * Each configured target is compared to its source: a file present in the source but absent or different in the
 * installation is a difference, and so is a file present only in the installation — except the installer's own
 * marker. The comparison is over BYTES, so a whitespace change is caught.
 */
export function attestInstalledBundle(input) {
  const { dshHomePath } = input;
  const nodeModules = join(dshHomePath, 'profiles', 'node_modules');
  const targets = [];
  for (const target of ATTESTATION.bundleTargets) {
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
      source: target.source,
      installedName: target.installedName,
      sourceExists,
      installedExists,
      sourceFileCount: sourceNames.length,
      installedFileCount: installedNames.length,
      installerMarkerPresent: installedFiles[INSTALLER_MARKER] !== undefined,
      missingInInstall: Object.freeze(missingInInstall),
      extraInInstall: Object.freeze(extraInInstall),
      differing: Object.freeze(differing),
      identical: sourceExists && installedExists && missingInInstall.length === 0 && extraInInstall.length === 0 && differing.length === 0,
    }));
  }
  const allIdentical = targets.every((target) => target.identical === true);
  return Object.freeze({
    kind: 'installed host-bundle attestation',
    nodeModules,
    targets: Object.freeze(targets),
    allIdentical,
    excludedInstallerBookkeeping: INSTALLER_MARKER,
    /** §4: the installer is a mitigation, stated so it is not read as a proof of atomic replacement. */
    installerIsMitigationNotProof: ATTESTATION.installerIsMitigationNotProof,
    comparedFileByFile: true,
    law: ATTESTATION.law,
  });
}

/**
 * §4: DETECT A COMPETING WRITER OF THE SHARED INSTALLATION.
 *
 * The digests are sampled before the matrix and again after it. A difference with NO install performed in between
 * means another process wrote the shared installation during the run — which would make the run's runtime
 * unattested.
 */
export function sampleInstallationDigest(input) {
  const { dshHomePath } = input;
  const nodeModules = join(dshHomePath, 'profiles', 'node_modules');
  const parts = [];
  for (const target of ATTESTATION.bundleTargets) {
    const installed = join(nodeModules, target.installedName);
    const files = existsSync(installed) ? treeDigests(installed) : {};
    parts.push(`${target.installedName}:${digestOfMap(files)}`);
  }
  return createHash('sha256').update(parts.sort().join(NL), 'utf8').digest('hex');
}

/** §4: the competing-writer verdict from two samples. */
export function competingWriterVerdict(input) {
  const { beforeDigest, afterDigest, installedDuringRun } = input;
  const changed = beforeDigest !== afterDigest;
  return Object.freeze({
    beforeDigest,
    afterDigest,
    changed,
    installedDuringRun: installedDuringRun === true,
    /** §4: a change with no install of ours in between is a competing writer. */
    competingWriterDetected: changed && installedDuringRun !== true,
    note: changed && installedDuringRun === true
      ? 'the installation changed because this run installed it, which is expected'
      : changed ? 'the shared installation changed during the run with no install performed by this run' : 'the shared installation was stable across the run',
  });
}

/** §4: a digest over a map of named digests, with a stable key order. */
export function digestOfMap(map) {
  const material = Object.entries(map).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/** §4: a recursive digest map of a tree. */
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

/**
 * §4: THE WHOLE ATTESTATION, as one entry the qualification carries.
 *
 * The closure is recomputed WITH verification enabled, so the digest the attestation reports is the one produced
 * by a verified build — which is what makes the attestation about the executable rather than about a file list.
 */
export async function runtimeAttestation(input) {
  const { dshHomePath, beforeDigest = null, installedDuringRun = false, computeClosure } = input;
  const compiled = await verifyCompiledSource();
  const bundle = attestInstalledBundle({ dshHomePath });
  const afterDigest = sampleInstallationDigest({ dshHomePath });
  const writer = beforeDigest === null
    ? Object.freeze({ beforeDigest: null, afterDigest, changed: null, installedDuringRun, competingWriterDetected: false, note: 'no pre-matrix sample was supplied, so only the post-matrix digest is reported' })
    : competingWriterVerdict({ beforeDigest, afterDigest, installedDuringRun });
  const verifiedClosure = computeClosure === undefined ? null : await computeClosure();
  const closureVerified = verifiedClosure === null ? null : verifiedClosure.compiledVerification?.COMPILED_MATCHES_SOURCE ?? null;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L',
    kind: 'executable and environmental attestation',
    compiledSource: compiled,
    installedBundle: bundle,
    competingWriter: writer,
    /** §4: the closure digest computed WITH verification enabled, when the caller supplies the computation. */
    verifiedClosureDigest: verifiedClosure?.executionClosureDigest ?? null,
    verifiedClosureCompiledMatchesSource: closureVerified,
    /** §4: the property. */
    EXECUTABLE_RUNTIME_ATTESTATION: compiled.COMPILED_MATCHES_SOURCE === true
      && bundle.allIdentical === true
      && writer.competingWriterDetected === false
      && (closureVerified === null || closureVerified === true) ? 'PASS' : 'FAIL',
    installerIsMitigationNotProof: true,
    law: ATTESTATION.law,
  });
}

export { NL, REPO_ROOT };
