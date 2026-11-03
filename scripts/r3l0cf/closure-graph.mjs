/**
 * R3-L0C-I Gate 4 — THE IMPORT-GRAPH CLOSURE DERIVATION.
 *
 * §"Expand CLOSURE_FILES to cover every imported load-bearing module". A hand-written list has the failure mode
 * this module exists to remove: it is complete for the code as it stood when somebody read it, and silently
 * incomplete the moment a new import is added. So the closure set is DERIVED by walking the actual imports of the
 * primary entry point, and the hand-written list is checked AGAINST the derivation rather than trusted.
 *
 * THE WALK IS STATIC AND DELIBERATELY CONSERVATIVE. It reads each module's `import`/`export ... from` specifiers,
 * resolves relative ones to real paths, and follows them. It does NOT execute anything, and it does NOT follow
 * bare package specifiers — a package is covered by its recorded VERSION rather than by its bytes, which is what
 * Gate 4 means by "the real toolchain/package versions participate in the aggregate digest".
 *
 * WHY A MISSING MODULE IS A REFUSAL RATHER THAN A WARNING. Gate 4 says "Reject missing or unverified closure
 * inputs." A closure that silently omits an unreadable module would certify a runtime it never looked at, so a
 * specifier that resolves to a file outside the covered set is reported, and a listed file that does not exist is
 * reported as MISSING rather than hashed as a placeholder.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { CLOSURE_FILES, REPO_ROOT } from './contract.mjs';

const NL = String.fromCharCode(10);

/** Gate 4: the primary entry points whose imports define the load-bearing set. */
export const CLOSURE_ENTRY_POINTS = Object.freeze([
  'scripts/r3l0cf/primary-matrix-driver.mjs',
  'scripts/r3l0cf/primary-matrix.mjs',
  'scripts/r3l0cf/fail-stop.mjs',
  'scripts/r3l0cf/qualification.mjs',
  'scripts/r3l0c/generation-child.mjs',
  'scripts/r3l0c/matrix.mjs',
  'scripts/r3l0cr/matrix.mjs',
]);

/** Gate 4: the import specifier forms this walker follows. */
const STATIC_IMPORT = /(?:^|\n)\s*(?:import|export)\s[^;\n]*?from\s+['"]([^'"]+)['"]/gu;
const DYNAMIC_IMPORT = /import\(\s*['"]([^'"]+)['"]\s*\)/gu;
const SIDE_EFFECT_IMPORT = /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/gu;

/** Every specifier a module names, of any of the three forms. */
export function importSpecifiersOf(sourceText) {
  const found = new Set();
  for (const pattern of [STATIC_IMPORT, DYNAMIC_IMPORT, SIDE_EFFECT_IMPORT]) {
    pattern.lastIndex = 0;
    for (const match of String(sourceText).matchAll(pattern)) found.add(match[1]);
  }
  return Object.freeze([...found]);
}

/** Whether a specifier names a relative or absolute file rather than a package. */
function isFileSpecifier(specifier) {
  return specifier.startsWith('./') || specifier.startsWith('../') || specifier.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(specifier);
}

/** Resolve a file specifier against the importing module, as a repo-relative POSIX path, or null. */
function resolveSpecifier(fromRelative, specifier) {
  const base = dirname(join(REPO_ROOT, fromRelative));
  const candidates = [
    resolve(base, specifier),
    resolve(base, `${specifier}.mjs`),
    resolve(base, `${specifier}.js`),
    resolve(base, specifier, 'index.mjs'),
    resolve(base, specifier, 'index.js'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return relative(REPO_ROOT, candidate).split(sep).join('/');
    }
  }
  return null;
}

/**
 * Gate 4: WALK THE IMPORT GRAPH FROM THE ENTRY POINTS.
 *
 * Returns the reachable repo-relative modules and the bare package specifiers encountered. The packages are
 * RETURNED rather than followed, so a caller can record their versions in the aggregate digest.
 */
export function walkImportGraph(input = {}) {
  const entryPoints = input.entryPoints ?? CLOSURE_ENTRY_POINTS;
  const visited = new Set();
  const packages = new Set();
  const unresolved = [];
  const queue = [...entryPoints];
  while (queue.length > 0) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    if (!existsSync(join(REPO_ROOT, current))) {
      unresolved.push(Object.freeze({ from: null, specifier: current, reason: 'ENTRY_POINT_MISSING' }));
      continue;
    }
    visited.add(current);
    const text = readFileSync(join(REPO_ROOT, current), 'utf8');
    for (const specifier of importSpecifiersOf(text)) {
      if (!isFileSpecifier(specifier)) {
        /** A bare specifier is a package; it is recorded by version rather than walked. */
        packages.add(packageNameOf(specifier));
        continue;
      }
      const resolved = resolveSpecifier(current, specifier);
      if (resolved === null) {
        unresolved.push(Object.freeze({ from: current, specifier, reason: 'SPECIFIER_UNRESOLVED' }));
        continue;
      }
      if (!visited.has(resolved)) queue.push(resolved);
    }
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'import graph walk',
    entryPoints: Object.freeze([...entryPoints]),
    modules: Object.freeze([...visited].sort()),
    moduleCount: visited.size,
    packages: Object.freeze([...packages].sort()),
    unresolved: Object.freeze(unresolved),
  });
}

/** The package name of a bare specifier: `@scope/name` or `name`, without a subpath. */
export function packageNameOf(specifier) {
  const parts = String(specifier).split('/');
  if (specifier.startsWith('@')) return parts.slice(0, 2).join('/');
  return parts[0] ?? specifier;
}

/**
 * Gate 4: VERIFY THE DECLARED CLOSURE AGAINST THE DERIVED GRAPH.
 *
 * Three findings, and each is a refusal rather than a warning:
 *
 *   MISSING_FILES      a declared file that does not exist — the closure would hash a placeholder
 *   UNDECLARED_MODULES a reachable module the closure does not declare — the closure is incomplete
 *   UNRESOLVED         a specifier the walker could not resolve — the graph is not fully known
 *
 * A module reachable ONLY through the product's own `src/**` is exempt from the undeclared check, because the
 * product is covered through its SOURCE_CLOSURE and COMPILED_RUNTIME_CLOSURE entries by directory rather than by
 * an exhaustive per-file list. The exemption is explicit and narrow, and it is REPORTED so a reader can see what
 * was exempted rather than trusting a filter.
 */
export function verifyClosureCompleteness(input = {}) {
  const declared = new Set([
    ...Object.values(CLOSURE_FILES).flat(),
    ...(input.extra ?? []),
  ]);
  const graph = input.graph ?? walkImportGraph();
  const missingFiles = [...declared].filter((file) => !existsSync(join(REPO_ROOT, file)));
  /** A module under `dist/` is covered by its compiled counterpart, and a `.d.mts` is a declaration, not code. */
  const exempt = (module) => module.startsWith('dist/') || module.endsWith('.d.mts') || module.endsWith('.d.ts');
  const undeclared = graph.modules.filter((module) => !declared.has(module) && !exempt(module));
  const unresolved = graph.unresolved;
  const complete = missingFiles.length === 0 && undeclared.length === 0 && unresolved.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I',
    kind: 'closure completeness verification',
    declaredCount: declared.size,
    reachableCount: graph.moduleCount,
    missingFiles: Object.freeze(missingFiles),
    undeclaredModules: Object.freeze(undeclared),
    unresolved: Object.freeze(unresolved),
    exemptedModules: Object.freeze(graph.modules.filter(exempt)),
    packagesEncountered: graph.packages,
    /** Gate 4: a closure that omits a reachable module, or names a file that does not exist, is REJECTED. */
    CLOSURE_COMPLETENESS: complete ? 'COMPLETE' : 'INCOMPLETE',
    law: 'reject missing or unverified closure inputs rather than hashing a placeholder',
  });
}

export { NL };
