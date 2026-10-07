/**
 * R3-L0B §10/§12/§13 — THE EXPERIMENTAL HARNESS CONTAINMENT.
 *
 * §10 requires the research infrastructure to be repaired so host-private experimental artifacts are not
 * reachable from the worker information surface, and fixes the ORDER OF PREFERENCE:
 *
 *   1. physically place oracle/control/evidence/sibling artifacts OUTSIDE every worker-readable ancestor;
 *   2. protect host-private experiment roots with the EXISTING supported worker-confidentiality mechanism;
 *   3. use host IPC/in-memory control paths rather than readable files where appropriate.
 *
 * §10 also forbids two shortcuts that would look like repairs and are not:
 *
 *   · "Do not solve this by changing the worker prompt to say do not read these files. Prompt prohibition is
 *     not containment."
 *   · "Do not modify canonical product semantics unless an existing product runtime contract is actually
 *     violated." §9's analysis found no violated promise, so this stage changes NO product or runtime code.
 *
 * THE REPAIR IS THEREFORE PURELY A LAYOUT CHANGE, and it is a LAYOUT CHANGE IN TWO PARTS:
 *
 *   SEPARATION  a unit's world tree and its host-private control artifacts get DISJOINT parents, so no
 *               host-private file is an ancestor or a sibling of any world. This is preference 1, and it is
 *               what makes the shared-parent and the world-ancestor defects structurally impossible.
 *
 *   DECLARATION whatever genuinely cannot be separated — because a shared, machine-global resource must be
 *               reachable — is DECLARED to the shipped fence. This is preference 2. In this harness the
 *               remaining candidate is the sibling-unit ROOT itself, which is separated by construction and
 *               additionally declared so that a future layout mistake fails closed rather than silently.
 *
 * THE SHIPPED MECHANISM IS REUSED, NOT REIMPLEMENTED. `host/deployment/runtime/worker_fence.js` already derives
 * its roots from the worker's position and honours `PALIMPSEST_WORKER_PROTECTED_ROOTS` for everything else. The
 * repair is to give it a layout it can protect, and to declare the roots it cannot derive.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';

import { EXPERIMENT_CONTAINMENT_ENVELOPE, VISIBILITY, hostPrivateIds } from './contract.mjs';

const NL = String.fromCharCode(10);
const BS = String.fromCharCode(92);

/** Fold Windows separators to POSIX. */
function fold(text) {
  return String(text).split(BS + BS).join('/').split(BS).join('/');
}

/**
 * §10: THE ISOLATED EXPERIMENT LAYOUT.
 *
 * THE SHAPE, and why each part of it is a requirement rather than a preference:
 *
 *   <root>/units/<unitId>/world/      the worker's world tree and the repository it lives in
 *   <root>/units/<unitId>/state/      that unit's durable stores
 *   <root>/units/<unitId>/home/       that unit's DSH home and session space
 *   <root>/private/oracle/            the outcome instrument
 *   <root>/private/control/           the harness control plane: specs, payloads, transcripts, progress
 *   <root>/private/reference/         a solved form of the task
 *   <root>/private/evidence/          the primary evidence records and the schedule
 *   <root>/private/units/<unitId>/    sibling worlds and sibling promoted source, held OUTSIDE every unit tree
 *
 * WHY `private/units/<unitId>` RATHER THAN KEEPING SIBLINGS BESIDE EACH OTHER. The R3-L0 layout put every
 * trajectory under one shared parent, so `../b0-H/repo` was reachable from `b0-C/repo`. Holding the sibling
 * worlds under `private/` means a unit's own tree contains exactly ONE world — its own — and the sibling copies
 * are in a directory that is both disjoint from every world and declared to the fence.
 *
 * WHY THE WORLD IS `units/<unitId>/world` AND NOT `units/<unitId>/repo`. The name is not cosmetic: it makes the
 * separation legible, so a reader can see that the unit's control directory (`units/<unitId>`) is the only
 * ancestor of the world, and it holds nothing the worker must not read.
 */
export const ISOLATED_LAYOUT = Object.freeze({
  unitWorld: (root, unitId) => join(root, 'units', unitId, 'world'),
  unitState: (root, unitId) => join(root, 'units', unitId, 'state'),
  unitHome: (root, unitId) => join(root, 'units', unitId, 'home'),
  privateRoot: (root) => join(root, 'private'),
  oracleRoot: (root) => join(root, 'private', 'oracle'),
  controlRoot: (root) => join(root, 'private', 'control'),
  referenceRoot: (root) => join(root, 'private', 'reference'),
  evidenceRoot: (root) => join(root, 'private', 'evidence'),
  siblingUnitRoot: (root, unitId) => join(root, 'private', 'units', unitId),
});

/**
 * §10 preference 1: THE HOST-PRIVATE ROOTS THAT MUST BE OUTSIDE EVERY WORKER-READABLE ANCESTOR.
 *
 * Each maps an envelope id to the isolated layout's location for it. This mapping is what the §12 mutation
 * deliberately breaks, so the two are kept adjacent: the mutation's job is to restore the R3-L0 shape for
 * exactly these ids.
 */
export function isolatedRoots(root) {
  return Object.freeze([
    Object.freeze({ id: 'DIAGNOSTIC_ORACLE', path: ISOLATED_LAYOUT.oracleRoot(root) }),
    Object.freeze({ id: 'HIDDEN_ACCEPTANCE', path: ISOLATED_LAYOUT.oracleRoot(root) }),
    Object.freeze({ id: 'REFERENCE_SOLUTION', path: ISOLATED_LAYOUT.referenceRoot(root) }),
    Object.freeze({ id: 'HARNESS_IMPLEMENTATION', path: ISOLATED_LAYOUT.controlRoot(root) }),
    Object.freeze({ id: 'SCHEDULE', path: ISOLATED_LAYOUT.evidenceRoot(root) }),
    Object.freeze({ id: 'PRIMARY_EVIDENCE', path: ISOLATED_LAYOUT.evidenceRoot(root) }),
    Object.freeze({ id: 'CONTROL_PAYLOAD', path: ISOLATED_LAYOUT.controlRoot(root) }),
    Object.freeze({ id: 'ANALYSIS_CODE', path: ISOLATED_LAYOUT.controlRoot(root) }),
    Object.freeze({ id: 'SIBLING_TRAJECTORY_WORLDS', path: join(ISOLATED_LAYOUT.privateRoot(root), 'units') }),
    Object.freeze({ id: 'SIBLING_PROMOTED_SOURCE', path: join(ISOLATED_LAYOUT.privateRoot(root), 'units') }),
  ]);
}

/**
 * §10: THE LAYOUT SHAPE, as data, so a checker can assert it rather than re-derive it.
 *
 * `hostPrivateIsAncestorOfAnyWorld` and `hostPrivateIsSiblingOfAnyWorld` are the two properties the R3-L0
 * layout violated and this one must hold.
 */
export function layoutShape(root, unitIds) {
  const worlds = unitIds.map((unitId) => resolve(ISOLATED_LAYOUT.unitWorld(root, unitId)));
  const privates = [...new Set(isolatedRoots(root).map((entry) => resolve(entry.path)))];
  const relation = (candidate, target) => {
    const a = fold(resolve(candidate));
    const b = fold(resolve(target));
    if (a === b) return 'SAME';
    if (b.startsWith(`${a}/`)) return 'ANCESTOR';
    if (a.startsWith(`${b}/`)) return 'DESCENDANT';
    return 'DISJOINT';
  };
  const pairs = [];
  for (const priv of privates) for (const world of worlds) pairs.push(Object.freeze({ privateRoot: priv, world, relation: relation(priv, world) }));

  return Object.freeze({
    root,
    unitIds: Object.freeze([...unitIds]),
    worlds: Object.freeze(worlds),
    privateRoots: Object.freeze(privates),
    /** §10 preference 1: the property that must hold for every host-private root against every world. */
    hostPrivateIsAncestorOfAnyWorld: pairs.some((pair) => pair.relation === 'ANCESTOR' || pair.relation === 'SAME'),
    hostPrivateIsSiblingOfAnyWorld: pairs.some((pair) => pair.relation === 'DISJOINT' && fold(pair.privateRoot).split('/').slice(0, -1).join('/') === fold(pair.world).split('/').slice(0, -1).join('/')),
    /** A host-private root may be a DESCENDANT of nothing and must never contain a world. */
    relations: Object.freeze(pairs),
  });
}

/**
 * §10: BUILD THE ISOLATED EXPERIMENT ROOT.
 *
 * This creates the directory shape and nothing else. It is deliberately a separate, callable, side-effecting
 * function so the §12 mutation can build the SHARED-PARENT shape with the same signature and the gate can be
 * run against both without any other difference.
 */
export function buildIsolatedLayout(root, unitIds) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const unitId of unitIds) {
    for (const dir of [ISOLATED_LAYOUT.unitWorld(root, unitId), ISOLATED_LAYOUT.unitState(root, unitId), ISOLATED_LAYOUT.unitHome(root, unitId), ISOLATED_LAYOUT.siblingUnitRoot(root, unitId)]) {
      mkdirSync(dir, { recursive: true });
    }
  }
  for (const dir of [ISOLATED_LAYOUT.oracleRoot(root), ISOLATED_LAYOUT.controlRoot(root), ISOLATED_LAYOUT.referenceRoot(root), ISOLATED_LAYOUT.evidenceRoot(root)]) {
    mkdirSync(dir, { recursive: true });
  }
  return Object.freeze({ root, unitIds: Object.freeze([...unitIds]), shape: layoutShape(root, unitIds) });
}

/**
 * §10/§12: BUILD THE R3-L0-STYLE SHARED-PARENT LAYOUT.
 *
 * This reproduces the DEFECT deliberately, for the mutation test only. It is the R3-L0 shape exactly: one
 * directory per unit under a shared parent, each holding the unit's repository AND its host-private control
 * files side by side, with the harness's own progress record at the shared parent level.
 */
export function buildSharedParentLayout(root, unitIds) {
  rmSync(root, { recursive: true, force: true });
  mkdirSync(root, { recursive: true });
  for (const unitId of unitIds) {
    mkdirSync(join(root, unitId, 'repo'), { recursive: true });
    mkdirSync(join(root, unitId, 'home'), { recursive: true });
    mkdirSync(join(root, unitId, 'diagnostic'), { recursive: true });
  }
  /** The harness's own progress record, which in R3-L0 carried EVERY unit's diagnostics. */
  writeFileSync(join(root, 'trials.partial.json'), `${JSON.stringify({ stage: 'R3-L0', trajectories: unitIds.map((unitId) => ({ trajectoryId: unitId })) }, null, 2)}${NL}`, 'utf8');
  return Object.freeze({ root, unitIds: Object.freeze([...unitIds]) });
}

/**
 * §10 preference 2: THE ROOTS DECLARED TO THE SHIPPED FENCE.
 *
 * The sibling-unit root cannot be hidden from a worker by position alone if a future layout ever put it back
 * beside a world, and a machine-global resource must remain reachable to the harness. So it is DECLARED, which
 * is what `PALIMPSEST_WORKER_PROTECTED_ROOTS` exists for. The isolated layout separates it as well, so the two
 * preferences are layered rather than substituted for each other.
 */
export function declaredProtectedRoots(root) {
  return Object.freeze([
    join(ISOLATED_LAYOUT.privateRoot(root), 'units'),
  ]);
}

/** §10: the environment a generation child must run under, so the fence protects the declared roots. */
export function containmentEnvironment(root, base = process.env) {
  const separator = process.platform === 'win32' ? ';' : ':';
  return Object.freeze({ PALIMPSEST_WORKER_PROTECTED_ROOTS: declaredProtectedRoots(root).join(separator), ...base });
}

/* ================================================================ §11 the canaries */

/**
 * §11: WRITE THE CANARIES.
 *
 * Each canary is a unique nonce placed in the artifact it protects, so "reachable" is decided by whether the
 * NONCE came back rather than by whether a path existed. The four roots §11 names are created under the
 * isolated layout, and a reference solution and a sibling promoted source are included because §11 names them.
 */
export function writeCanaries(root, unitIds) {
  const canary = (label) => `CANARY-${label}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  const nonces = {
    DIAGNOSTIC_ORACLE: canary('ORACLE'),
    CONTROL_PLANE: canary('CONTROL'),
    REFERENCE_SOLUTION: canary('REFERENCE'),
    SIBLING_TRAJECTORY: canary('SIBLING'),
    PRIMARY_EVIDENCE: canary('EVIDENCE'),
  };
  mkdirSync(ISOLATED_LAYOUT.oracleRoot(root), { recursive: true });
  mkdirSync(ISOLATED_LAYOUT.controlRoot(root), { recursive: true });
  mkdirSync(ISOLATED_LAYOUT.referenceRoot(root), { recursive: true });
  mkdirSync(ISOLATED_LAYOUT.evidenceRoot(root), { recursive: true });
  writeFileSync(join(ISOLATED_LAYOUT.oracleRoot(root), 'diagnostic.mjs'), `// ${nonces.DIAGNOSTIC_ORACLE}${NL}export function diagnosticVector() { return { classPass: {} }; }${NL}`, 'utf8');
  writeFileSync(join(ISOLATED_LAYOUT.controlRoot(root), 'payload.json'), `${JSON.stringify({ compiledHandleCount: 0, canary: nonces.CONTROL_PLANE })}${NL}`, 'utf8');
  writeFileSync(join(ISOLATED_LAYOUT.referenceRoot(root), 'ledger.mjs'), `// ${nonces.REFERENCE_SOLUTION}${NL}export function applyBatch() {}${NL}`, 'utf8');
  writeFileSync(join(ISOLATED_LAYOUT.evidenceRoot(root), 'trials.partial.json'), `${JSON.stringify({ canary: nonces.PRIMARY_EVIDENCE, trajectories: unitIds })}${NL}`, 'utf8');
  for (const unitId of unitIds) {
    const sibling = ISOLATED_LAYOUT.siblingUnitRoot(root, unitId);
    mkdirSync(join(sibling, 'world'), { recursive: true });
    writeFileSync(join(sibling, 'world', 'ledger.mjs'), `// ${nonces.SIBLING_TRAJECTORY} unit=${unitId}${NL}export function applyBatch() {}${NL}`, 'utf8');
  }
  return Object.freeze({ nonces, root });
}

/* ================================================================ §10/§12 the containment gate */

/**
 * §10/§12: THE CONTAINMENT GATE.
 *
 * It decides containment from the LAYOUT and from the canary probes §11 supplies, never from a prompt or from
 * the harness's intent. A host-private root that is an ancestor of a world, or that a probe reached, fails the
 * gate — which is what makes the §12 mutation detectable rather than merely described.
 */
export function runContainmentGate(input) {
  const { root, unitIds, probes } = input;
  const shape = layoutShape(root, unitIds);
  const reachable = (probes ?? []).filter((probe) => probe.verdict === 'REACHABLE');
  const ancestorViolation = shape.hostPrivateIsAncestorOfAnyWorld;
  const pass = !ancestorViolation && reachable.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'experiment containment gate',
    root,
    worlds: shape.worlds,
    privateRoots: shape.privateRoots,
    hostPrivateIsAncestorOfAnyWorld: ancestorViolation,
    probes: (probes ?? []).length,
    reachable: Object.freeze(reachable.map((probe) => `${probe.rootId}/${probe.attemptId}`)),
    CONTAINMENT: pass ? 'PASS' : 'FAIL',
    basis: pass
      ? 'no host-private root is an ancestor of or identical to any world, and no canary probe returned content'
      : `containment failed: ${ancestorViolation ? 'a host-private root contains a world' : ''}${ancestorViolation && reachable.length > 0 ? ' and ' : ''}${reachable.length > 0 ? `${String(reachable.length)} canary probe(s) returned content` : ''}`,
  });
}

/**
 * §13: THE OUTCOME-BLINDNESS GATE.
 *
 * Separate from containment because §13 mutates it separately: an oracle placed beneath the worker-readable
 * root must fail THIS gate even when the directory layout is otherwise correct.
 */
export function runOutcomeBlindnessGate(input) {
  const { root, unitIds, probes } = input;
  /** The mutated shape places the oracle elsewhere, so the root under test is an input rather than an assumption. */
  const oracleRoot = resolve(input.oracleRootOverride ?? ISOLATED_LAYOUT.oracleRoot(root));
  const worlds = unitIds.map((unitId) => resolve(ISOLATED_LAYOUT.unitWorld(root, unitId)));
  const oracleInsideAWorld = worlds.some((world) => {
    const a = fold(oracleRoot);
    const b = fold(world);
    return a === b || a.startsWith(`${b}/`);
  });
  const oracleProbes = (probes ?? []).filter((probe) => probe.rootId === 'DIAGNOSTIC_ORACLE' || probe.rootId === 'REFERENCE_SOLUTION');
  const reachable = oracleProbes.filter((probe) => probe.verdict === 'REACHABLE');
  const pass = !oracleInsideAWorld && reachable.length === 0;
  return Object.freeze({
    schemaVersion: 1,
    kind: 'outcome blindness gate',
    root,
    oracleRoot,
    oracleInsideAWorld,
    probes: oracleProbes.length,
    reachable: Object.freeze(reachable.map((probe) => `${probe.rootId}/${probe.attemptId}`)),
    OUTCOME_BLINDNESS: pass ? 'PASS' : 'FAIL',
    basis: pass
      ? 'the outcome instrument is outside every worker-readable ancestor and no oracle probe returned content'
      : `outcome blindness failed: ${oracleInsideAWorld ? 'the oracle root is inside a worker world' : ''}${oracleInsideAWorld && reachable.length > 0 ? ' and ' : ''}${reachable.length > 0 ? `${String(reachable.length)} oracle probe(s) returned content` : ''}`,
  });
}

/**
 * §12/§13: THE MUTATION VERDICTS.
 *
 * Each mutation must make its gate FAIL, and the corrected layout must then make it PASS. Both halves are
 * required: a gate that never fails measures nothing, and a gate that never passes is not a repair.
 */
export function mutationVerdict(input) {
  const { id, gateName, mutatedVerdict, positiveVerdict, recordedVerdict } = input;
  const detected = mutatedVerdict === 'FAIL' && positiveVerdict === 'PASS';
  return Object.freeze({
    id,
    gate: gateName,
    mutatedVerdict,
    positiveVerdict,
    mutationDetected: detected,
    recordedVerdict: detected ? recordedVerdict : 'MUTATION_ESCAPED',
    basis: detected
      ? 'the gate failed with the defect restored and passed with the corrected layout'
      : `the gate did not discriminate: mutated=${mutatedVerdict}, positive=${positiveVerdict}`,
  });
}

/** §10: the envelope, restated for the report, so a reader sees what the layout is protecting. */
export function envelopeForReport() {
  return Object.freeze({
    workerVisible: EXPERIMENT_CONTAINMENT_ENVELOPE.workerVisible.map((entry) => entry.id),
    hostPrivate: hostPrivateIds(),
    hostPrivateCount: hostPrivateIds().length,
    visibilityClasses: VISIBILITY,
  });
}

export { fold, dirname, homedir, existsSync, readFileSync };
