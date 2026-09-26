#!/usr/bin/env node
/**
 * SR-1 §7/§10/§27 — the architecture audit CLI.
 *
 *   node scripts/audit/module-architecture.mjs --write              regenerate the module
 *                                                                   baseline JSON + doc
 *   node scripts/audit/module-architecture.mjs --check              CI gate: no NEW forbidden
 *                                                                   layer edge, no NEW cycle,
 *                                                                   no unresolved import
 *   node scripts/audit/module-architecture.mjs --write-public-api   capture the export surface
 *                                                                   of both package entries
 *   node scripts/audit/module-architecture.mjs --check-public-api   SR1-A14 parity gate
 *   node scripts/audit/module-architecture.mjs --json               dump the model
 *
 * The analysis lives in `tools/architecture/` (typed, unit-tested by `test/architecture/`);
 * this file is argument handling and file IO only, so there is one implementation of every
 * rule and no drift between the checker and its self-tests.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = join(import.meta.dirname, '..', '..');
const BASELINE_JSON = join(REPO, 'architecture', 'module-architecture.json');
const BASELINE_DOC = join(REPO, 'docs', 'engineering', 'architecture', 'MODULE-ARCHITECTURE-BASELINE.md');
const PUBLIC_API_JSON = join(REPO, 'architecture', 'public-api-baseline.json');
const PUBLIC_ENTRIES = ['dist/src/index.d.ts', 'dist/src/advanced.d.ts'];
const NL = String.fromCharCode(10);

const arch = await import(pathToFileURL(join(REPO, 'dist', 'tools', 'architecture', 'index.js')).href);

const argv = process.argv.slice(2);
const mode = argv.includes('--write')
  ? 'write'
  : argv.includes('--write-public-api')
    ? 'write-public-api'
    : argv.includes('--check-public-api')
      ? 'check-public-api'
      : argv.includes('--check')
        ? 'check'
        : argv.includes('--json')
          ? 'json'
          : 'report';

/**
 * SR-2 §七 — the captured identity, asked of GIT rather than guessed from `.git/`.
 *
 * The previous version read `.git/HEAD` directly. In a LINKED WORKTREE `.git` is a FILE
 * containing `gitdir: <path>`, not a directory, so every worktree-based capture silently
 * recorded `unknown` — and this repository does most of its work in worktrees.
 *
 *     git rev-parse HEAD            the commit (a squash rewrites it)
 *     git rev-parse HEAD^{tree}     the source TREE (a squash does not)
 *
 * The tree is the checkable half: it answers "is this baseline still about this code?"
 * even after the commit identity changes.
 */
const gitIdentity = (rev) => {
  try {
    return execFileSync('git', ['-C', REPO, 'rev-parse', rev], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'unknown';
  }
};
const capturedFrom = gitIdentity('HEAD');
const capturedTree = gitIdentity('HEAD^{tree}');

const architecture = arch.analyseModuleArchitecture(REPO);

if (mode === 'json') {
  process.stdout.write(JSON.stringify(architecture, null, 2) + NL);
  process.exit(0);
}

if (mode === 'write') {
  const baseline = arch.baselineFrom(architecture, {
    capturedFrom,
    capturedTree,
    edgeReasons: arch.BASELINE_EDGE_REASONS,
    cycleReasons: arch.BASELINE_CYCLE_REASONS,
  });
  mkdirSync(join(REPO, 'architecture'), { recursive: true });
  mkdirSync(join(REPO, 'docs', 'engineering', 'architecture'), { recursive: true });
  writeFileSync(BASELINE_JSON, arch.toJson(architecture, baseline));
  writeFileSync(
    BASELINE_DOC,
    arch.renderBaselineDocument(architecture, baseline, {
      generatedAt: new Date().toISOString(),
      stage: 'SR-1 (architecture baseline; regenerated whenever the structure changes)',
    }),
  );
  process.stdout.write(
    [
      'architecture baseline written',
      '  ' + BASELINE_JSON,
      '  ' + BASELINE_DOC,
      '  modules=' + String(architecture.totals.files) + ' loc=' + String(architecture.totals.loc) + ' edges=' + String(architecture.totals.edges),
      '  forbidden layer edges=' + String(architecture.forbiddenEdges.length) + ' cycles=' + String(architecture.stronglyConnectedComponents.length),
    ].join(NL) + NL,
  );
  process.exit(0);
}

if (mode === 'write-public-api') {
  const entries = {};
  for (const entry of PUBLIC_ENTRIES) {
    if (!existsSync(join(REPO, entry))) {
      process.stderr.write('missing built declaration ' + entry + ' (run pnpm build first)' + NL);
      process.exit(2);
    }
    entries[entry] = arch.collectPublicApi(REPO, entry).names;
  }
  mkdirSync(join(REPO, 'architecture'), { recursive: true });
  writeFileSync(PUBLIC_API_JSON, JSON.stringify({ capturedFrom, entries }, null, 2) + NL);
  const counts = Object.entries(entries).map(([entry, names]) => '  ' + entry + ': ' + String(names.length) + ' names');
  process.stdout.write(['public API baseline written', '  ' + PUBLIC_API_JSON, ...counts].join(NL) + NL);
  process.exit(0);
}

if (mode === 'check-public-api') {
  if (!existsSync(PUBLIC_API_JSON)) {
    process.stderr.write('missing public API baseline: ' + PUBLIC_API_JSON + NL);
    process.exit(2);
  }
  const baseline = JSON.parse(readFileSync(PUBLIC_API_JSON, 'utf8'));
  const current = {};
  for (const entry of PUBLIC_ENTRIES) current[entry] = arch.collectPublicApi(REPO, entry);
  const result = arch.checkPublicApiParity(baseline, current);
  const lines = [
    'public-api:check ' + (result.ok ? 'PASS' : 'FAIL'),
    '  missing: ' + String(result.missing.length),
    '  changed kind: ' + String(result.changedKind.length),
    '  added: ' + String(result.added.length),
  ];
  for (const item of result.missing) lines.push('  MISSING ' + item.entry + '::' + item.name + ' (' + item.kind + ')');
  for (const item of result.changedKind) {
    lines.push('  KIND CHANGED ' + item.entry + '::' + item.name + ' ' + item.was + ' -> ' + item.now);
  }
  for (const item of result.added.slice(0, 20)) lines.push('  ADDED ' + item.entry + '::' + item.name);
  process.stdout.write(lines.join(NL) + NL);
  process.exit(result.ok ? 0 : 1);
}

if (!existsSync(BASELINE_JSON)) {
  process.stderr.write('missing baseline: ' + BASELINE_JSON + ' (run --write first)' + NL);
  process.exit(2);
}
const baseline = JSON.parse(readFileSync(BASELINE_JSON, 'utf8')).baseline;
const result = arch.checkArchitecture(architecture, baseline);
process.stdout.write(arch.renderCheckSummary(result) + NL);
process.exit(result.ok ? 0 : 1);
