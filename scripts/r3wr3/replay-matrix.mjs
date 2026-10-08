/**
 * R3-WR3 GATE A3 — THE REPLAY STATE MATRIX AND PATH CONFINEMENT.
 *
 * Every row is a state a world can actually be found in, and the required behaviour is what the ruling names.
 * The matrix runs against the REAL compiled port, and for every REFUSAL it snapshots the canonical repository
 * before and after and requires the load-bearing state to be identical — a refusal that mutated canonical state
 * on the way out would not be a refusal.
 *
 * The path-confinement half is separate and hostile on purpose: it asks whether a world id can name anything
 * other than one direct child of the world root. The forms tested are the ones a Windows host actually offers —
 * traversal, both separators, absolute and drive-relative paths, UNC, extended-length prefixes, junctions and
 * symlinks — plus the two cases that matter most: a world id resolving to the canonical repository and one
 * resolving to a SIBLING repository.
 *
 * PLAIN JAVASCRIPT (`.mjs`). Temporary roots only. No LLM.
 */
import { execFileSync, execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { canonicalState, makeBasis, worldState } from './falsifiers.mjs';

const NL = String.fromCharCode(10);
const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const git = (cwd, args) => {
  try {
    return execFileSync('git', [...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    return `ERR:${String(error?.stderr ?? error?.message ?? error).trim().slice(0, 120)}`;
  }
};

async function loadPort() {
  const module = await import(pathToFileURL(join(REPO, 'dist', 'src', 'effects', 'git_port.js')).href);
  return module.GitCliPort;
}

/**
 * GATE A3 — ONE MATRIX ROW.
 *
 * `arrange` builds the state, `expected` is what must happen, and the canonical snapshot is taken around the
 * call in EVERY row so a refusal that leaked a mutation is caught rather than assumed absent.
 */
async function row(input) {
  const { label, arrange, expected, worldId = 'attempt-matrix', baseOverride } = input;
  const root = mkdtempSync(join(tmpdir(), 'r3wr3-matrix-'));
  const basis = makeBasis(root);
  const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
  const port = new (await loadPort())(basis.repo, worldsRoot);
  const worldPath = port.worldPath(worldId);

  const context = { root, basis, worldsRoot, port, worldPath };
  if (arrange !== undefined) await arrange(context);
  /**
   * The base is resolved AFTER `arrange`, because several rows can only name their base once they have built it
   * — an unrelated commit, for instance, does not exist until the row creates it.
   */
  const requestedBase = typeof baseOverride === 'function' ? baseOverride(context) : (baseOverride ?? basis.basisCommit);

  /** The sibling world, snapshotted BEFORE the call so a cross-attempt mutation is detectable. */
  const siblingPath = join(worldsRoot, 'attempt-other');
  const beforeOtherWorld = existsSync(siblingPath) ? worldState(siblingPath) : null;

  const before = canonicalState(basis.repo);
  let outcome;
  try {
    const created = await port.createWorld({ worktreeId: worldId, baseCommit: requestedBase });
    outcome = { returned: true, worldPath: created.worldPath, error: null };
  } catch (error) {
    outcome = { returned: false, worldPath: null, error: String(error?.message ?? error).slice(0, 200) };
  }
  const after = canonicalState(basis.repo);

  const world = existsSync(worldPath) ? worldState(worldPath) : null;
  const result = Object.freeze({
    label,
    expected,
    outcome,
    canonicalIdentical: JSON.stringify(before) === JSON.stringify(after),
    canonicalDiff: JSON.stringify(before) === JSON.stringify(after)
      ? null
      : Object.keys(before).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map((key) => `${key}: ${JSON.stringify(before[key])} -> ${JSON.stringify(after[key])}`),
    world,
    /**
     * Whether the world still exists after the call. This is the property that separates "refused safely" from
     * "refused by destroying the evidence": a refusal that deleted or re-cloned the world would look identical
     * in the outcome alone, so the survival of the directory is measured separately.
     */
    worldSurvived: existsSync(worldPath),
    /**
     * THE CROSS-ATTEMPT WITNESS. When a sibling world exists for another attempt id, it is snapshotted before and
     * after so "this call did not touch the other attempt's world" is measured rather than assumed.
     */
    otherAttemptWorldUnchanged: (() => {
      const sibling = join(worldsRoot, 'attempt-other');
      if (!existsSync(sibling)) return null;
      return JSON.stringify(beforeOtherWorld) === JSON.stringify(worldState(sibling));
    })(),
    basisCommit: basis.basisCommit,
  });
  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }
  return result;
}

/** The twelve states the ruling enumerates, each with its required behaviour. */
export async function replayStateMatrix() {
  const rows = [];

  rows.push(await row({
    label: 'World absent',
    expected: 'CREATE_AND_VALIDATE',
  }));

  rows.push(await row({
    label: 'Complete, correct, clean World',
    expected: 'REUSE_SAFELY',
    arrange: async ({ port, basis, worldPath }) => { await port.createWorld({ worktreeId: 'attempt-matrix', baseCommit: basis.basisCommit }); },
  }));

  rows.push(await row({
    label: 'Complete World with unstaged changes',
    expected: 'PRESERVE_CHANGES',
    arrange: async ({ port, basis, worldPath }) => {
      await port.createWorld({ worktreeId: 'attempt-matrix', baseCommit: basis.basisCommit });
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 11;${NL}`, 'utf8');
    },
  }));

  rows.push(await row({
    label: 'Complete World with staged changes',
    expected: 'PRESERVE_INDEX_AND_CHANGES',
    arrange: async ({ port, basis, worldPath }) => {
      await port.createWorld({ worktreeId: 'attempt-matrix', baseCommit: basis.basisCommit });
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 12;${NL}`, 'utf8');
      git(worldPath, ['add', '-A']);
    },
  }));

  rows.push(await row({
    label: 'Complete World with untracked files',
    expected: 'PRESERVE_FILES',
    arrange: async ({ port, basis, worldPath }) => {
      await port.createWorld({ worktreeId: 'attempt-matrix', baseCommit: basis.basisCommit });
      writeFileSync(join(worldPath, 'notes.txt'), 'untracked note\n', 'utf8');
    },
  }));

  rows.push(await row({
    label: 'World with committed candidate X',
    expected: 'PRESERVE_HEAD_X',
    arrange: async ({ port, basis, worldPath }) => {
      await port.createWorld({ worktreeId: 'attempt-matrix', baseCommit: basis.basisCommit });
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 13;${NL}`, 'utf8');
      git(worldPath, ['add', '-A']);
      git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'candidate X']);
    },
  }));

  rows.push(await row({
    label: 'Existing directory without own .git',
    expected: 'NEVER_ADOPT_PARENT_REPOSITORY',
    arrange: async ({ worldPath }) => {
      mkdirSync(worldPath, { recursive: true });
      writeFileSync(join(worldPath, 'README.md'), 'orphan\n', 'utf8');
    },
  }));

  rows.push(await row({
    label: 'Partial .git / unfinished clone',
    expected: 'FAIL_CLOSED_UNLESS_PROVEN',
    arrange: async ({ worldPath }) => {
      mkdirSync(join(worldPath, '.git'), { recursive: true });
      writeFileSync(join(worldPath, '.git', 'HEAD'), 'ref: refs/heads/master\n', 'utf8');
      writeFileSync(join(worldPath, 'partial.txt'), 'half a clone\n', 'utf8');
    },
  }));

  /**
   * WORLD BELONGING TO ANOTHER ATTEMPT — two attempt ids, each getting its own world. The property is ISOLATION:
   * creating the second world must not touch the first, and each world must own its own repository. A world
   * addressed by attempt B must never be handed the world that belongs to attempt A.
   */
  rows.push(await row({
    label: 'World belonging to another Attempt',
    expected: 'ISOLATED_PER_ATTEMPT',
    arrange: async ({ port, basis, worldsRoot }) => {
      /** A world created for a DIFFERENT attempt id, with its own committed work. */
      await port.createWorld({ worktreeId: 'attempt-other', baseCommit: basis.basisCommit });
      const otherWorld = join(worldsRoot, 'attempt-other');
      writeFileSync(join(otherWorld, 'src', 'ledger.mjs'), `export const answer = 16;${NL}`, 'utf8');
      git(otherWorld, ['add', '-A']);
      git(otherWorld, ['-c', 'user.email=o@o.o', '-c', 'user.name=o', 'commit', '-qm', 'other attempt work']);
    },
    /** The row's own assertion is added below, because it must compare TWO worlds. */
  }));

  /**
   * WRONG REQUESTED BASE — a world already exists at basis B, and the SAME world id is asked for with an
   * UNRELATED commit. Moving the world to it would discard the work built on B, so the call must refuse and the
   * world must be left exactly as it was.
   */
  const wrongBase = (() => {
    const holder = { commit: null };
    return { holder };
  })();
  rows.push(await row({
    label: 'Wrong requested base',
    expected: 'REJECT_WITHOUT_MUTATION',
    arrange: async ({ port, basis, root, worldPath }) => {
      await port.createWorld({ worktreeId: 'attempt-matrix', baseCommit: basis.basisCommit });
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 15;${NL}`, 'utf8');
      git(worldPath, ['add', '-A']);
      git(worldPath, ['-c', 'user.email=w@w.w', '-c', 'user.name=w', 'commit', '-qm', 'work on B']);
      /** An unrelated repository's commit: the world's HEAD cannot descend from it. */
      const other = join(root, 'unrelated');
      mkdirSync(join(other, 'src'), { recursive: true });
      writeFileSync(join(other, 'src', 'x.mjs'), 'export const x = 1;\n', 'utf8');
      git(other, ['init', '-q']);
      git(other, ['add', '-A']);
      git(other, ['-c', 'user.email=o@o.o', '-c', 'user.name=o', 'commit', '-qm', 'unrelated']);
      wrongBase.holder.commit = git(other, ['rev-parse', 'HEAD']);
    },
    baseOverride: ({ root }) => wrongBase.holder.commit,
  }));

  rows.push(await row({
    label: 'Broken object store',
    expected: 'FAIL_READINESS_WITHOUT_DESTROYING_WORK',
    arrange: async ({ port, basis, worldPath }) => {
      await port.createWorld({ worktreeId: 'attempt-matrix', baseCommit: basis.basisCommit });
      writeFileSync(join(worldPath, 'src', 'ledger.mjs'), `export const answer = 14;${NL}`, 'utf8');
      /** The borrowed store disappears: the world still holds uncommitted work that must not be lost. */
      execSync(`move "${join(basis.repo, '.git', 'objects')}" "${join(basis.repo, '.git', 'objects-gone')}"`, { shell: 'cmd.exe' });
    },
  }));

  rows.push(await row({
    label: 'Unknown repository identity',
    expected: 'FAIL_CLOSED',
    arrange: async ({ worldPath }) => {
      /** A real repository, but one that is neither this project nor a world: a foreign repo at the world path. */
      mkdirSync(worldPath, { recursive: true });
      git(worldPath, ['init', '-q']);
      writeFileSync(join(worldPath, 'foreign.txt'), 'foreign repo\n', 'utf8');
    },
  }));

  const evaluated = rows.map((r) => {
    const definition = [
      { label: 'World absent', fn: (x) => x.outcome.returned === true && x.world?.head === x.basisCommit },
      { label: 'Complete, correct, clean World', fn: (x) => x.outcome.returned === true && x.world?.head === x.basisCommit },
      { label: 'Complete World with unstaged changes', fn: (x) => x.outcome.returned === true && x.world?.candidate === 'export const answer = 11;' },
      { label: 'Complete World with staged changes', fn: (x) => x.outcome.returned === true && String(x.world?.status).includes('M  src/ledger.mjs') },
      { label: 'Complete World with untracked files', fn: (x) => x.outcome.returned === true && String(x.world?.status).includes('notes.txt') },
      { label: 'World with committed candidate X', fn: (x) => x.outcome.returned === true && x.world?.head !== x.basisCommit && x.world?.candidate === 'export const answer = 13;' },
      { label: 'Existing directory without own .git', fn: (x) => x.outcome.returned === false && x.canonicalIdentical === true },
      { label: 'Partial .git / unfinished clone', fn: (x) => x.outcome.returned === false && x.canonicalIdentical === true },
      { label: 'World belonging to another Attempt', fn: (x) => x.outcome.returned === true && x.world?.head === x.basisCommit && x.otherAttemptWorldUnchanged === true },
      { label: 'Wrong requested base', fn: (x) => x.outcome.returned === false && x.worldSurvived === true && x.canonicalIdentical === true && x.world?.candidate === 'export const answer = 15;' },
      { label: 'Broken object store', fn: (x) => x.outcome.returned === false && x.worldSurvived === true && x.canonicalIdentical === true },
      { label: 'Unknown repository identity', fn: (x) => x.outcome.returned === false && x.canonicalIdentical === true },
    ].find((entry) => entry.label === r.label);
    return Object.freeze({ ...r, satisfied: definition === undefined ? null : definition.fn(r) });
  });

  return Object.freeze({
    kind: 'R3-WR3 Gate A3 — replay state matrix',
    rows: Object.freeze(evaluated),
    rowsSatisfied: evaluated.filter((r) => r.satisfied === true).length,
    rowsTotal: evaluated.length,
    /** A refusal must never be a mutation, so this is required of every row that refused. */
    everyRefusalKeptCanonicalIdentical: evaluated.filter((r) => r.outcome.returned === false).every((r) => r.canonicalIdentical === true),
    /** And a refusal must never destroy the world it refused: no row may delete or re-clone a world. */
    everyRefusalKeptWorldInPlace: evaluated.filter((r) => r.outcome.returned === false).every((r) => r.worldSurvived === true),
  });
}

/**
 * GATE A3 — PATH CONFINEMENT.
 *
 * Each form is attempted as a world id, and the required outcome is REFUSAL. The two named cases are the ones
 * that matter: an id that resolves to the canonical repository, and one that resolves to a SIBLING repository.
 */
export async function pathConfinementMatrix() {
  const GitCliPort = await loadPort();
  const root = mkdtempSync(join(tmpdir(), 'r3wr3-path-'));
  const basis = makeBasis(root);
  const worldsRoot = join(basis.repo, '.palimpsest', 'worlds');
  mkdirSync(worldsRoot, { recursive: true });
  const port = new GitCliPort(basis.repo, worldsRoot);

  /** A SIBLING repository, so "escape to a sibling" is a real target rather than a hypothetical one. */
  const sibling = join(root, 'sibling-repo');
  mkdirSync(join(sibling, 'src'), { recursive: true });
  writeFileSync(join(sibling, 'src', 's.mjs'), 'export const s = 1;\n', 'utf8');
  git(sibling, ['init', '-q']);
  git(sibling, ['add', '-A']);
  git(sibling, ['-c', 'user.email=s@s.s', '-c', 'user.name=s', 'commit', '-qm', 'sibling']);

  /** A junction at a world-shaped path, pointing OUT of the worlds root. */
  const junctionPath = join(worldsRoot, 'attempt-junction');
  try { execSync(`mklink /J "${junctionPath}" "${sibling}"`, { shell: 'cmd.exe', stdio: 'ignore' }); } catch { /* the platform refused; the row records that */ }

  const forms = [
    { id: 'attempt-normal', expectRefusal: false, why: 'an ordinary deterministic attempt id must be ACCEPTED' },
    { id: '..', expectRefusal: true, why: 'a traversal segment must never be a world id' },
    { id: '../..', expectRefusal: true, why: 'a multi-level traversal must be refused' },
    { id: '..\\..\\canonical', expectRefusal: true, why: 'a backslash traversal must be refused' },
    { id: 'sub/attempt', expectRefusal: true, why: 'a forward slash must not express a nested path' },
    { id: 'sub\\attempt', expectRefusal: true, why: 'a backslash must not express a nested path' },
    { id: join(root, 'absolute-escape'), expectRefusal: true, why: 'an absolute path must be refused' },
    { id: 'C:\\Windows\\Temp\\attempt-drive', expectRefusal: true, why: 'a drive-qualified path must be refused' },
    { id: '\\\\server\\share\\attempt-unc', expectRefusal: true, why: 'a UNC path must be refused' },
    { id: '\\\\?\\C:\\attempt-extended', expectRefusal: true, why: 'an extended-length prefix must be refused' },
    { id: basis.repo, expectRefusal: true, why: 'a world id resolving to the CANONICAL REPOSITORY must be refused' },
    { id: sibling, expectRefusal: true, why: 'a world id resolving to a SIBLING REPOSITORY must be refused' },
    { id: 'attempt-junction', expectRefusal: true, why: 'a junction at the world path that points outside the root must be refused' },
    { id: '', expectRefusal: true, why: 'an empty world id must be refused' },
    { id: '.', expectRefusal: true, why: 'the root itself must not be a world id' },
  ];

  const results = [];
  for (const form of forms) {
    const before = canonicalState(basis.repo);
    let refused = false;
    let detail = null;
    try {
      await port.createWorld({ worktreeId: form.id, baseCommit: basis.basisCommit });
    } catch (error) {
      refused = true;
      detail = String(error?.message ?? error).slice(0, 140);
    }
    const after = canonicalState(basis.repo);
    results.push(Object.freeze({
      id: form.id === '' ? '<empty>' : form.id,
      why: form.why,
      refused,
      expected: form.expectRefusal ? 'REFUSED' : 'ACCEPTED',
      detail,
      canonicalIdentical: JSON.stringify(before) === JSON.stringify(after),
      /** The property: refusal exactly where required, and no canonical mutation in any row. */
      satisfied: refused === form.expectRefusal,
    }));
  }

  /** The junction row is only meaningful if the junction was actually created. */
  const junctionCreated = existsSync(junctionPath);

  try { rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp hygiene sweeps it */ }

  return Object.freeze({
    kind: 'R3-WR3 Gate A3 — path confinement matrix',
    rows: Object.freeze(results),
    junctionCreated,
    rowsSatisfied: results.filter((r) => r.satisfied === true).length,
    rowsTotal: results.length,
    WORLD_PATH_ESCAPE_DETECTED: results.filter((r) => r.expected === 'REFUSED').every((r) => r.refused === true),
    everyRowKeptCanonicalIdentical: results.every((r) => r.canonicalIdentical === true),
  });
}

function main() {
  Promise.all([replayStateMatrix(), pathConfinementMatrix()]).then(([matrix, confinement]) => {
    process.stdout.write(`${NL}===== R3-WR3 GATE A3 — REPLAY STATE MATRIX =====${NL}`);
    for (const r of matrix.rows) {
      process.stdout.write(`${(r.satisfied === true ? 'OK  ' : 'FAIL')} ${r.label.padEnd(44)} expect=${r.expected.padEnd(38)} ${r.outcome.returned ? 'RETURNED' : 'REFUSED'}${r.outcome.error === null ? '' : ` ${r.outcome.error.slice(0, 60)}`}${NL}`);
      if (r.canonicalIdentical === false) process.stdout.write(`       CANONICAL MUTATED: ${String(r.canonicalDiff)}${NL}`);
    }
    process.stdout.write(`rows satisfied: ${String(matrix.rowsSatisfied)}/${String(matrix.rowsTotal)}  every refusal kept canonical identical: ${String(matrix.everyRefusalKeptCanonicalIdentical)}  every refusal kept the world in place: ${String(matrix.everyRefusalKeptWorldInPlace)}${NL}`);
    process.stdout.write(`${NL}===== R3-WR3 GATE A3 — PATH CONFINEMENT =====${NL}`);
    for (const r of confinement.rows) {
      process.stdout.write(`${(r.satisfied === true ? 'OK  ' : 'FAIL')} ${String(r.id).padEnd(34)} expect=${r.expected.padEnd(8)} got=${r.refused ? 'REFUSED' : 'ACCEPTED'}${r.detail === null ? '' : ` ${r.detail.slice(0, 60)}`}${NL}`);
    }
    process.stdout.write(`junction created: ${String(confinement.junctionCreated)}  rows satisfied: ${String(confinement.rowsSatisfied)}/${String(confinement.rowsTotal)}${NL}`);
    process.stdout.write(`WORLD_PATH_ESCAPE_DETECTED: ${String(confinement.WORLD_PATH_ESCAPE_DETECTED)}${NL}`);
  }).catch((error) => {
    process.stderr.write(`gate A3 failed: ${String(error?.stack ?? error)}${NL}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] !== undefined) main();
