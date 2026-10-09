/**
 * R3-L0C-I-A-R §2 — THE STAGE-OWNED, RACE-TOLERANT HOST-BUNDLE INSTALLER.
 *
 * THE HAZARD THIS CLOSES, measured rather than guessed. The frozen `installHostBundle` in `scripts/gates/env.mjs`
 * installs the host bundle into the SHARED global DSH home with a non-atomic pair:
 *
 *     rmSync(target, { recursive: true, force: true });
 *     cpSync(source, target, { recursive: true });
 *
 * vitest runs test files in PARALLEL processes, and several stage suites call it — measured: four test files do,
 * and the failure appeared as
 *
 *     Error: ENOTEMPTY, Directory not empty: C:\Users\...\.dsh\profiles\node_modules\palimpsest-dsh-host
 *     at installHostBundle scripts/gates/env.mjs:137
 *
 * because one process was `cpSync`-ing into the directory another had just `rmSync`-ed. That file belongs to
 * stage R1-H and is FROZEN, so it cannot be repaired here. What this stage CAN do is stop CONTRIBUTING to the
 * race: `makeProfile` takes the installer as an injected parameter, so this stage supplies its own.
 *
 * THE REPAIR HAS TWO PARTS, and neither changes what is installed:
 *
 *   1. AN IDEMPOTENT FAST PATH. The bundle's bytes are the same repository every time, so an install whose target
 *      already carries the current marker is a NO-OP. After the first install, this stage performs no destructive
 *      copy at all — which removes its window rather than merely narrowing it.
 *   2. A TOLERANT SLOW PATH. When a copy IS needed, the Windows transient errors a concurrent remover produces
 *      (`ENOTEMPTY`, `EPERM`, `EBUSY`) are retried with a short backoff, and the copy lands in a staging
 *      directory that is renamed into place, so a reader never observes a half-written bundle.
 *
 * WHY A MARKER AND NOT A DIGEST. A digest would have to read every file on every call, which is the cost the fast
 * path exists to avoid. The marker records the source's own identifying facts (the repository root and the two
 * source directories' newest mtimes), which is enough to decide "the same bundle is already there" — and a stale
 * marker simply causes a real reinstall, which is the safe direction.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NL } from './contract.mjs';

/** §2: the marker file, written INSIDE the installed bundle so a reinstall can recognise itself. */
export const INSTALL_MARKER = '.r3l0ciar-install.json';

/** §2: the two source directories the frozen installer copies, and the names it installs them under. */
export const BUNDLE_SOURCES = Object.freeze([
  Object.freeze({ relative: 'host/dsh', name: 'palimpsest-dsh-host' }),
  Object.freeze({ relative: 'host/deployment', name: 'palimpsest-host-deployment' }),
]);

/** §2: the transient Windows errors a concurrent remover produces. */
const TRANSIENT = Object.freeze(['ENOTEMPTY', 'EPERM', 'EBUSY', 'EACCES']);

/**
 * §2: INSTALL THE HOST BUNDLE, IDEMPOTENTLY AND TOLERANTLY.
 *
 * The signature matches the frozen installer's, so `makeProfile` can be handed this function unchanged.
 */
export function installHostBundleSafely(input) {
  const { repo, realDshHome } = input;
  const nodeModules = join(realDshHome, 'profiles', 'node_modules');
  const marker = describeBundle(repo);
  const installed = [];

  for (const source of BUNDLE_SOURCES) {
    const from = join(repo, source.relative);
    const to = join(nodeModules, source.name);
    /** 1. THE IDEMPOTENT FAST PATH: the same bundle is already installed, so nothing is copied. */
    if (isCurrent(to, marker)) {
      installed.push(Object.freeze({ name: source.name, action: 'ALREADY_CURRENT', copied: false }));
      continue;
    }
    mkdirSync(nodeModules, { recursive: true });
    /** 2. THE TOLERANT SLOW PATH: stage, then rename, with bounded retries. */
    const staged = `${to}.staging-${String(process.pid)}-${String(Date.now())}`;
    withRetry(() => {
      rmSync(staged, { recursive: true, force: true });
      cpSync(from, staged, { recursive: true });
      writeFileSync(join(staged, INSTALL_MARKER), `${JSON.stringify(marker, null, 2)}${NL}`, 'utf8');
      rmSync(to, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      renameSync(staged, to);
    });
    installed.push(Object.freeze({ name: source.name, action: 'REINSTALLED', copied: true }));
  }

  return Object.freeze({ nodeModules, marker, installed: Object.freeze(installed), raceTolerant: true, idempotent: true });
}

/** §2: the identifying facts of the source bundle, so "already installed" is decided rather than assumed. */
export function describeBundle(repo) {
  const sources = {};
  for (const source of BUNDLE_SOURCES) {
    const path = join(repo, source.relative);
    try { sources[source.name] = { relative: source.relative, mtimeMs: statSync(path).mtimeMs }; } catch { sources[source.name] = { relative: source.relative, mtimeMs: null }; }
  }
  return Object.freeze({ repo, sources: Object.freeze(sources) });
}

/** §2: whether the installed bundle already carries the current marker. */
function isCurrent(target, marker) {
  const markerPath = join(target, INSTALL_MARKER);
  if (!existsSync(markerPath)) return false;
  try {
    const installed = JSON.parse(readFileSync(markerPath, 'utf8'));
    return JSON.stringify(installed) === JSON.stringify(marker);
  } catch {
    return false;
  }
}

/** §2: run an action, retrying only the transient errors a concurrent remover produces. */
function withRetry(action, attempts = 6) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      action();
      return true;
    } catch (error) {
      lastError = error;
      if (!TRANSIENT.includes(String(error?.code))) throw error;
      sleepSync(50 * (attempt + 1));
    }
  }
  throw lastError;
}

/** §2: a synchronous wait, because the installer is called synchronously by `makeProfile`. */
function sleepSync(ms) {
  const shared = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(shared, 0, 0, ms);
}

export { NL };
