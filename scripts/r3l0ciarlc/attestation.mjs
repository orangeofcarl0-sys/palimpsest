/**
 * R3-L0C-I-A-R-L-C §6 Gate D — THE IN-RUN EXECUTABLE AND ENVIRONMENT ATTESTATION.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlAttestationOutsideGate` by CALLING the
 * real function: `competingWriterVerdict({ beforeDigest, afterDigest, installedDuringRun: true })` returned
 * `competingWriterDetected: false`, so a change to the shared installation observed while this run installed was
 * reported as EXPECTED rather than as another writer — which is exactly the case in which this stage runs. And the
 * prior pipeline took ONE sample before the matrix and never rechecked it as a mandatory admission condition, so
 * the attestation could not refuse completion.
 *
 * THE REPAIR IS THREE MEASUREMENT POINTS, and the middle one is the correction:
 *
 *   S0  before the run's own installation. Recorded so the sequence is auditable. It is NOT used as the
 *       competing-writer baseline, because this run's own legitimate installation happens between S0 and S2.
 *   S1  AFTER installation and BEFORE the matrix. This is the post-installation baseline, and it must match the
 *       expected installed repository bundle.
 *   S2  AFTER the matrix and BEFORE final validity admission. It must match S1. A change between S1 and S2 is a
 *       competing writer, whatever `installedDuringRun` says — because this run installed BEFORE S1.
 *
 * WHY S1 AND NOT S0 IS THE BASELINE. §6 states it: "Do not use the difference from S0 to S2 as the competing-writer
 * test because this stage's legitimate installation may occur between those samples." Using S0 would make this
 * run's own install look like a competing writer; using S1 makes the comparison about what happened AFTER this run
 * finished installing.
 *
 * THE EXECUTABLE ROUTE, AND WHAT IS DISCLOSED. The shipped worker entry and the dynamically loaded product modules
 * are inside the attested closure (the frozen runtime manifest covers them). What is OUTSIDE it is disclosed
 * rather than reported as verified: the global DSH installation itself is not part of this repository's closure.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { ATTESTATION_POINTS, ATTESTATION_RULES, NL, REPO_ROOT } from './contract.mjs';
import { verifyCompiledSourceIsolated } from './compiled-verification.mjs';

/**
 * §6: THE SOURCE-TO-COMPILED VERIFICATION THIS STAGE USES.
 *
 * It is the ISOLATED implementation, for a MEASURED reason: the frozen `verifyCompiledAgainstSource` emits into a
 * FIXED path at the repository root, and a second concurrent caller receives `EPERM` from its cleanup. Measured
 * under a full parallel run of this stage's suite. The method is identical; only the probe location differs, and
 * `test/r3l0ciarlc_gates.test.ts` asserts the two agree on the verdict and the pair count.
 */
export async function verifyCompiledSource() {
  return verifyCompiledSourceIsolated();
}

/** §6: the installer's own bookkeeping file, excluded from the byte comparison. */
export const INSTALLER_MARKER = '.r3l0ciar-install.json';

/** §6: the two installed bundle targets, as the frozen installer writes them. */
export const BUNDLE_TARGETS = Object.freeze([
  Object.freeze({ source: 'host/dsh', installedName: 'palimpsest-dsh-host' }),
  Object.freeze({ source: 'host/deployment', installedName: 'palimpsest-host-deployment' }),
]);

/**
 * §6: COMPARE THE INSTALLED BUNDLE AGAINST THE REPOSITORY, FILE BY FILE.
 *
 * The comparison is over BYTES, so a whitespace change is caught. A file present in the source but absent or
 * different in the installation is a difference, and so is a file present only in the installation — except the
 * installer's own marker, which is the INSTALLER's bookkeeping and not part of the bundle the repository ships.
 */
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
  const allIdentical = targets.every((target) => target.identical === true);
  return Object.freeze({
    kind: 'installed host-bundle comparison',
    nodeModules,
    targets: Object.freeze(targets),
    allIdentical,
    excludedInstallerBookkeeping: INSTALLER_MARKER,
    comparedFileByFile: true,
  });
}

/**
 * §6: SAMPLE THE SHARED INSTALLATION'S DIGEST.
 *
 * The sample is over the INSTALLED bundle directories only, with a stable key order, so two samples are comparable
 * and a change anywhere in the installed bundle moves it. The installer's marker is EXCLUDED, because the
 * installer rewrites it on every install and its change is the installer's own bookkeeping rather than a change to
 * the bundle.
 */
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

/**
 * §6: THE COMPETING-WRITER VERDICT FROM S1 AND S2.
 *
 * THE CORRECTION IS HERE. The prior stage suppressed detection whenever `installedDuringRun` was true. This one
 * compares S2 against S1 — the POST-INSTALLATION baseline — so this run's own installation (which happened BEFORE
 * S1) cannot mask another writer's change (which happens AFTER S1). `installedDuringRun` is still carried, but it
 * no longer suppresses anything; it is reported as the reason the S0/S1 difference is expected.
 */
export function competingWriterVerdict(input) {
  const { s1Digest, s2Digest, s0Digest = null, installedDuringRun = false } = input;
  const changedAfterInstall = s1Digest !== s2Digest;
  return Object.freeze({
    s0Digest, s1Digest, s2Digest,
    installedDuringRun: installedDuringRun === true,
    changedAfterInstall,
    changedSinceStart: s0Digest !== null && s0Digest !== s2Digest,
    /** §6: the verdict compares S2 against S1, and installedDuringRun does NOT suppress it. */
    competingWriterDetected: changedAfterInstall,
    installedDuringRunSuppressesDetection: false,
    s0ToS1IsThisRunsOwnInstall: s0Digest !== null && s0Digest !== s1Digest,
    note: changedAfterInstall
      ? 'the installed bundle changed between the post-installation baseline S1 and the post-matrix sample S2, with no install by this run in between, so another writer modified the shared installation'
      : 'the installed bundle was stable between the post-installation baseline S1 and the post-matrix sample S2',
    law: ATTESTATION_RULES.law,
  });
}

/**
 * §6: THE WHOLE IN-RUN ATTESTATION, as one entry the terminal admission reads.
 *
 * It reports the three points, the S1-vs-expected comparison, the S2-vs-S1 comparison, the competing-writer
 * verdict, and — as a DISCLOSED limitation — what lies outside the attested closure. A skipped source-to-compiled
 * verification is a FAIL, never a pass.
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
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R-L-C',
    kind: 'in-run executable and environmental attestation',
    points: ATTESTATION_POINTS,
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
    /** §6: what the attestation does NOT cover, stated rather than implied. */
    coverageLimitations: Object.freeze([
      'the global DSH installation itself is not part of this repository\'s execution closure, so its bytes are not attested',
      'the host-bundle installer stages and renames, which narrows the replacement window but does NOT make it atomic on every filesystem',
    ]),
    installerIsMitigationNotProof: true,
    /** §6: the property. Every part must hold, and a skipped compiled verification is not a pass. */
    IN_RUN_ATTESTATION: s1MatchesExpectedBundle && s2MatchesS1 && writer.competingWriterDetected === false && compiledEvaluated ? 'PASS' : 'FAIL',
    law: ATTESTATION_RULES.law,
  });
}

/* ================================================================ helpers */

/** §6: a digest over a map of named digests, with a stable key order. */
export function digestOfMap(map) {
  const material = Object.entries(map).sort(([left], [right]) => (left < right ? -1 : 1)).map(([path, digest]) => `${path}:${digest}`).join(NL);
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

/** §6: a recursive digest map of a tree. */
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
