/**
 * R3-L0C-I-A-R-L-C-F §3/§7 Gate F1-D — THE COMPILER VERIFICATION BOUND TO ITS INPUTS.
 *
 * THE DEFECT THIS CLOSES, measured by `baseline/legacy-controls.mjs controlUnboundCompilerCache` by CALLING the real
 * function: `verifyCompiledSourceIsolated()` cached its verdict in a module-level variable whose key was the ABSENCE
 * of a value (`if (cachedVerification !== null) return cachedVerification`), and the returned object carried no
 * digest of the source bytes, the compiled bytes, the compiler options or the toolchain that were verified. So a
 * caller could not tell whether a cached PASS described the current inputs, and a changed input left it GREEN.
 *
 * THE REPAIR IS AN INPUT IDENTITY ON EVERY ENTRY. §7 requires the cache to be "bound to the exact verified source
 * and compiled inputs", to "include relevant compiler/toolchain configuration", to "invalidate when those inputs
 * change", and to ensure "the terminal gate cannot treat a stale cached PASS as current verification".
 *
 * So the cache is a MAP keyed by the input identity, and every entry carries that identity. A lookup whose identity
 * does not match the current one MISSES rather than returning the stale verdict — which is exactly the property the
 * baseline lacked. The identity covers the nine source files, the nine compiled files, the compiler options the
 * probe uses, and the compiler's own version.
 *
 * WHY THE EMIT IS STILL ISOLATED AND STILL ONCE. §7 forbids recompiling "the entire project for every Session or
 * every small helper test" and forbids the frozen shared `.emit-probe` path. The probe keeps the prior stage's
 * unique-name configuration and unique temp output, so no two concurrent verifications share a path; and the
 * identity-keyed cache means a suite that verifies repeatedly with unchanged inputs pays for ONE emit.
 *
 * WHY THE PAIR LIST IS RESTATED HERE. The frozen module does not export it, and importing the function to obtain it
 * would reintroduce the fixed path. It is carried as stage data, and the gates test asserts this verification and
 * the frozen one AGREE on the verdict and the pair count, so the restatement cannot silently drift.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL, REPO_ROOT } from './contract.mjs';

/** §7: the verified pairs, as stage data. Mirrors `scripts/r3l0cf/closure.mjs:182`. */
export const COMPILED_PAIRS = Object.freeze([
  Object.freeze(['src/effects/git_port.ts', 'dist/src/effects/git_port.js']),
  Object.freeze(['src/effects/runtime.ts', 'dist/src/effects/runtime.js']),
  Object.freeze(['src/tools/controller.ts', 'dist/src/tools/controller.js']),
  Object.freeze(['src/deployment/work_worker.ts', 'dist/src/deployment/work_worker.js']),
  Object.freeze(['src/domain/state_machine.ts', 'dist/src/domain/state_machine.js']),
  Object.freeze(['src/scheduler/scheduler.ts', 'dist/src/scheduler/scheduler.js']),
  Object.freeze(['src/state/attempt_authorization.ts', 'dist/src/state/attempt_authorization.js']),
  Object.freeze(['src/interaction/work_delegation.ts', 'dist/src/interaction/work_delegation.js']),
  Object.freeze(['src/project_world/basis_store.ts', 'dist/src/project_world/basis_store.js']),
]);

/** §7: the compiler options the probe uses, so the options are part of the identity rather than implicit. */
export const PROBE_COMPILER_OPTIONS = Object.freeze({
  declaration: false, declarationMap: false, sourceMap: false, composite: false, incremental: false,
});

const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileDigestOrMissing = (relative) => {
  const path = join(REPO_ROOT, relative);
  return existsSync(path) ? sha256(readFileSync(path)) : 'MISSING';
};

/** §7: normalize away the one expected difference — the probe emits without sourcemaps. */
function normalize(text) {
  return text.split(/\r?\n/u).filter((line) => !line.startsWith('//# sourceMappingURL')).join(NL).replace(/\n+$/u, '');
}

/**
 * §7: THE INPUT IDENTITY THE CACHE IS KEYED BY.
 *
 * Every input that could change the verdict is folded in: the source bytes, the compiled bytes, the compiler
 * options the probe uses, the compiler's own version, and the pair count. A change to any of them produces a
 * DIFFERENT key, so the lookup misses and the verification re-runs.
 */
export function compiledVerificationInputIdentity() {
  const sourceDigests = Object.fromEntries(COMPILED_PAIRS.map(([source]) => [source, fileDigestOrMissing(source)]));
  const compiledDigests = Object.fromEntries(COMPILED_PAIRS.map(([, compiled]) => [compiled, fileDigestOrMissing(compiled)]));
  const compilerOptionsDigest = sha256(JSON.stringify({ ...PROBE_COMPILER_OPTIONS, tsconfig: readBaseCompilerOptions() }));
  const toolchainIdentity = compilerVersion();
  const identity = sha256(JSON.stringify({ sourceDigests, compiledDigests, compilerOptionsDigest, toolchainIdentity, pairCount: COMPILED_PAIRS.length }));
  return Object.freeze({
    identity,
    sourceDigests: Object.freeze(sourceDigests),
    compiledDigests: Object.freeze(compiledDigests),
    compilerOptionsDigest,
    toolchainIdentity,
    pairCount: COMPILED_PAIRS.length,
    missingSources: Object.freeze(Object.entries(sourceDigests).filter(([, digest]) => digest === 'MISSING').map(([name]) => name)),
    missingCompiled: Object.freeze(Object.entries(compiledDigests).filter(([, digest]) => digest === 'MISSING').map(([name]) => name)),
  });
}

/** §7: the base compiler options, so a tsconfig change moves the identity. */
function readBaseCompilerOptions() {
  try {
    const parsed = JSON.parse(readFileSync(join(REPO_ROOT, 'tsconfig.json'), 'utf8'));
    return parsed.compilerOptions ?? {};
  } catch {
    return null;
  }
}

/** §7: the compiler's own version, so a toolchain change moves the identity. */
function compilerVersion() {
  try {
    return execFileSync(process.execPath, [join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--version'], { cwd: REPO_ROOT, encoding: 'utf8', timeout: 120_000 }).trim();
  } catch (error) {
    return `UNRESOLVED:${String(error?.message ?? error).slice(0, 80)}`;
  }
}

/**
 * §7: THE IDENTITY-KEYED CACHE.
 *
 * The key is the input identity, not the absence of a value. A lookup with a DIFFERENT identity misses, so a
 * changed input can never leave a stale PASS in place. A cached FAILURE is cached too, so a broken tree is reported
 * consistently rather than intermittently.
 */
const cache = new Map();

/**
 * §7: VERIFY THE COMPILED ARTIFACTS AGAINST THE SOURCE, IN AN ISOLATED PROBE, BOUND TO THE CURRENT INPUTS.
 *
 * Returns the verification WITH its input identity attached. `cacheHit` reports whether the emit was skipped
 * because the identity matched a previous verification.
 */
export function verifyCompiledSourceBoundToInputs() {
  const current = compiledVerificationInputIdentity();
  const cached = cache.get(current.identity);
  if (cached !== undefined) {
    return Object.freeze({ ...cached, cacheHit: true, inputIdentity: current.identity, verifiedInputs: current });
  }
  const verification = computeIsolatedVerification(current);
  const entry = Object.freeze({ ...verification, cacheHit: false, inputIdentity: current.identity, verifiedInputs: current });
  cache.set(current.identity, entry);
  return entry;
}

/** §7: an uncached re-verification, for a caller that must bypass the cache. */
export function reverifyCompiledSource() {
  const current = compiledVerificationInputIdentity();
  const verification = computeIsolatedVerification(current);
  const entry = Object.freeze({ ...verification, cacheHit: false, inputIdentity: current.identity, verifiedInputs: current });
  cache.set(current.identity, entry);
  return entry;
}

/** §7: the measurement, so the cache is one lookup and the method stays readable. */
function computeIsolatedVerification(identity) {
  let probeRoot = null;
  let probeConfig = null;
  try {
    probeRoot = mkdtempSync(join(tmpdir(), 'r3l0ciarlcf-emit-'));
    const outDir = join(probeRoot, 'emit');
    /**
     * THE CONFIG LIVES AT THE REPOSITORY ROOT UNDER A UNIQUE NAME, and both halves are required. `include` and
     * `types: ["node"]` resolve relative to the CONFIG FILE's directory, so a config in the temp root finds neither
     * `src/**` nor `@types/node` and the emit fails — measured in the prior stage. A UNIQUE name means no two
     * concurrent verifications share a path, which is the prior stage's own repair and is preserved here.
     */
    probeConfig = join(REPO_ROOT, `.r3l0ciarlcf-emit-${String(process.pid)}-${Math.random().toString(36).slice(2, 10)}.json`);
    const base = JSON.parse(readFileSync(join(REPO_ROOT, 'tsconfig.json'), 'utf8'));
    const compilerOptions = { ...base.compilerOptions, ...PROBE_COMPILER_OPTIONS, outDir };
    writeFileSync(probeConfig, `${JSON.stringify({ compilerOptions, include: ['src/**/*.ts'] }, null, 2)}${NL}`, 'utf8');
    execFileSync(process.execPath, [join(REPO_ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', probeConfig], { cwd: REPO_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 600_000 });

    const diverged = [];
    for (const [source, compiled] of COMPILED_PAIRS) {
      const emittedPath = join(outDir, compiled.replace(/^dist\//u, ''));
      const distPath = join(REPO_ROOT, compiled);
      if (!existsSync(emittedPath) || !existsSync(distPath)) continue;
      const emitted = normalize(readFileSync(emittedPath, 'utf8'));
      const shipped = normalize(readFileSync(distPath, 'utf8'));
      if (emitted !== shipped) {
        const emittedLines = emitted.split(NL);
        const shippedLines = shipped.split(NL);
        const firstDifference = emittedLines.findIndex((line, index) => line !== shippedLines[index]);
        diverged.push(Object.freeze({ source, compiled, firstDifferingLine: firstDifference === -1 ? null : firstDifference + 1 }));
      }
    }
    const missing = Object.freeze([...identity.missingSources, ...identity.missingCompiled]);
    return Object.freeze({
      kind: 'input-bound compiled-against-source verification',
      pairs: COMPILED_PAIRS.length,
      missing,
      DETERMINISTIC: 'SUPPORTED',
      method: 'a fresh emit of src/** with the project\'s own compiler options, compared byte-for-byte against dist/**, into a UNIQUE per-process probe directory, with the verdict bound to the input identity',
      probeIsolation: 'a unique directory under the system temp root and a unique config name at the repository root, so two concurrent verifications cannot observe each other\'s window',
      normalization: 'the `//# sourceMappingURL` comment is removed from both sides, because the probe emits without sourcemaps',
      diverged: Object.freeze(diverged),
      COMPILED_MATCHES_SOURCE: missing.length === 0 && diverged.length === 0,
    });
  } catch (error) {
    /** §7: a verification that could not run is reported as UNSUPPORTED, never as a pass. */
    return Object.freeze({
      kind: 'input-bound compiled-against-source verification',
      pairs: COMPILED_PAIRS.length,
      missing: Object.freeze([...identity.missingSources, ...identity.missingCompiled]),
      DETERMINISTIC: 'UNSUPPORTED',
      unsupportedReason: `the deterministic emit could not be produced: ${String(error?.message ?? error).slice(0, 200)}`,
      diverged: Object.freeze([]),
      COMPILED_MATCHES_SOURCE: null,
    });
  } finally {
    if (probeConfig !== null) {
      try { rmSync(probeConfig, { force: true }); } catch { /* the OS may hold a handle briefly; the verdict is already made */ }
    }
    if (probeRoot !== null) {
      try { rmSync(probeRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* the OS may hold a handle briefly; the verdict is already made */ }
    }
  }
}

/** §7: the cache size, so a test can observe that a changed identity MISSES rather than reusing a stale entry. */
export function compilerCacheSize() {
  return cache.size;
}

/** §7: clear the cache, so a test can measure a cold verification. */
export function clearCompilerCache() {
  cache.clear();
}

export { NL };
