/**
 * R3-L0C-I-A-R-L-C §6 Gate D — THE ISOLATED SOURCE-TO-COMPILED VERIFICATION.
 *
 * THE RACE THIS CLOSES, MEASURED RATHER THAN GUESSED. The frozen `verifyCompiledAgainstSource`
 * (`scripts/r3l0cf/closure.mjs:232`) emits into a FIXED path at the repository root — `.emit-probe` and
 * `tsconfig.emit-probe.json` — and removes it afterwards. Measured under a full parallel run: two processes that
 * verify concurrently collide, and one receives `EPERM, Permission denied: .emit-probe` from the `rmSync` at
 * `closure.mjs:278`. The first full run of this stage's suite reproduced it in the prior stage's own
 * `r3l0ciarl_gates.test.ts`, because this stage's new test file added a concurrent caller of the same fixed path.
 *
 * THE REPAIR IS AT THE CAUSE, NOT A RETRY. The shared resource is a fixed directory name; the fix is to stop
 * sharing it. This module performs the SAME method — a fresh emit of `src/**` with the project's own compiler
 * options, compared byte-for-byte against `dist/**` — into a UNIQUE per-process, per-call directory under the
 * system temp root. Two concurrent verifications then cannot observe each other's window, and the frozen function
 * is left byte-identical for its own callers.
 *
 * WHY THE PAIR LIST IS RESTATED HERE RATHER THAN IMPORTED. The frozen module does not export it, and importing the
 * function to obtain it would reintroduce the fixed path. It is therefore carried as stage data, and
 * `test/r3l0ciarlc_gates.test.ts` asserts that this verification and the frozen one AGREE on the verdict and the
 * pair count — so the restatement cannot silently drift from the method it mirrors.
 *
 * WHAT IT DOES NOT DO. It does not weaken the check: a missing compiled artifact, an unsupported compiler, or a
 * divergence is still reported, and `COMPILED_MATCHES_SOURCE` is still the conjunction. §6 requires that a skipped
 * verification is never a PRIMARY attestation pass, and this reports `null` (not `true`) when it cannot run.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { NL, REPO_ROOT } from './contract.mjs';

/**
 * §6: THE VERIFIED PAIRS, as stage data.
 *
 * Each is a load-bearing module the harness imports: `dist/**` is what runs, `src/**` is what was audited, and a
 * stale or divergent pair is a real experimental hazard. The list mirrors `scripts/r3l0cf/closure.mjs:182`.
 */
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

/** §6: normalize away the one expected difference — the probe emits without sourcemaps. */
function normalize(text) {
  return text
    .split(/\r?\n/u)
    .filter((line) => !line.startsWith('//# sourceMappingURL'))
    .join(NL)
    .replace(/\n+$/u, '');
}

/**
 * §6: VERIFY THE COMPILED ARTIFACTS AGAINST THE SOURCE, IN AN ISOLATED PROBE DIRECTORY.
 *
 * A unique directory under the system temp root, so no two concurrent verifications share a path. The probe
 * configuration and the emit directory are both removed in a `finally`, and a failure to remove them does not
 * change the verdict — the verification has already been made.
 */
export function verifyCompiledSourceIsolated() {
  const missing = COMPILED_PAIRS.filter(([, compiled]) => !existsSync(join(REPO_ROOT, compiled))).map(([, compiled]) => compiled);
  let probeRoot = null;
  let probeConfig = null;
  try {
    probeRoot = mkdtempSync(join(tmpdir(), 'r3l0ciarlc-emit-'));
    const outDir = join(probeRoot, 'emit');
    /**
     * THE CONFIG LIVES AT THE REPOSITORY ROOT UNDER A UNIQUE NAME, and both halves of that are required.
     *
     * `include` and `types: ["node"]` resolve relative to the CONFIG FILE's directory, so a config in the temp root
     * finds neither `src/**` nor `@types/node` and the emit fails — measured. Keeping it at the repository root
     * anchors resolution exactly as the frozen implementation's fixed-name config does. Making the NAME unique is
     * the repair: the frozen implementation writes `tsconfig.emit-probe.json` and `.emit-probe`, both FIXED paths,
     * so two concurrent verifications race and one receives `EPERM` from the cleanup — also measured. A unique
     * config name and a unique temp output directory mean no two verifications share any path.
     */
    probeConfig = join(REPO_ROOT, `.r3l0ciarlc-emit-${String(process.pid)}-${Math.random().toString(36).slice(2, 10)}.json`);
    const base = JSON.parse(readFileSync(join(REPO_ROOT, 'tsconfig.json'), 'utf8'));
    const compilerOptions = {
      ...base.compilerOptions,
      declaration: false,
      declarationMap: false,
      sourceMap: false,
      composite: false,
      incremental: false,
      outDir,
    };
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
    return Object.freeze({
      kind: 'isolated compiled-against-source verification',
      pairs: COMPILED_PAIRS.length,
      missing: Object.freeze(missing),
      DETERMINISTIC: 'SUPPORTED',
      method: 'a fresh emit of src/** with the project\'s own compiler options, compared byte-for-byte against dist/**, into a UNIQUE per-process probe directory',
      probeIsolation: 'a unique directory under the system temp root, so two concurrent verifications cannot observe each other\'s window (the frozen implementation uses a fixed path at the repository root, which two processes race)',
      normalization: 'the `//# sourceMappingURL` comment is removed from both sides, because the probe emits without sourcemaps',
      diverged: Object.freeze(diverged),
      COMPILED_MATCHES_SOURCE: missing.length === 0 && diverged.length === 0,
    });
  } catch (error) {
    /** §6: a verification that could not run is reported as UNSUPPORTED, never as a pass. */
    return Object.freeze({
      kind: 'isolated compiled-against-source verification',
      pairs: COMPILED_PAIRS.length,
      missing: Object.freeze(missing),
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

export { NL };
