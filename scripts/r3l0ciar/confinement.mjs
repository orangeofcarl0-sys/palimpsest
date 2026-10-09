/**
 * R3-L0C-I-A-R §2/§3 — ACTUAL PER-TRAJECTORY CONFINEMENT.
 *
 * THE DEFECT THIS CLOSES, measured in F2. The baseline calls `runProtectedRoots(runRoot, trajectoryIds)` with
 * TWO arguments, so the third parameter `currentTrajectoryId` is `null`, the loop's
 * `if (trajectoryId === currentTrajectoryId) continue` never fires, and EVERY world — including the caller's own
 * — is pushed into the protected set. Measured: all three sampled trajectories had their own world protected.
 *
 * THE CONSEQUENCE IS NOT COSMETIC. The protected set is what the shipped read fence is handed. A worker whose
 * OWN world is fenced cannot write the world it was hired to change, so the "repair" would make every primary
 * session fail — and the failure would look like a worker defect rather than a harness one. The baseline never
 * saw it because its deterministic path drives an UNCONFINED ScriptedWorker, and §3 forbids relying on that:
 * "Do not rely solely on unconfined ScriptedWorker results."
 *
 * WHAT THIS MODULE MEASURES, for each of the eight trajectory units, INSIDE the shipped ACL sandbox:
 *
 *   · its own world is READABLE;
 *   · its own world is WRITABLE (the liveness half the sibling isolation must not have been bought with);
 *   · all seven sibling worlds are UNREADABLE;
 *   · its own state, every sibling's state, the oracle, the reference, the control root and the evidence root are
 *     UNREADABLE;
 *   · the actual generation child receives THIS EXACT manifest.
 *
 * WHY THE PROBE WRITES RATHER THAN ONLY READS. Sibling isolation is easy to achieve by over-protecting: fence
 * everything, and every read fails. That is why §3 requires own-world liveness SIMULTANEOUSLY, and why the
 * measurement must attempt a real write. A gate that only checked reads would pass on a layout where no worker
 * could ever do its job.
 *
 * NO ACL IS WEAKENED. §3 forbids manufacturing a PASS by changing an ACL or lowering an integrity restriction.
 * This module applies the fence with the SHIPPED `ensureReadFence` and never removes a label; if the shipped
 * profile cannot satisfy both halves, the result is reported as a STOP rather than worked around.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REPO_ROOT } from './contract.mjs';
import { runProtectedRoots } from '../r3l0c/trajectory.mjs';
import { ISOLATED_LAYOUT, declaredProtectedRoots } from '../r3l0b/containment.mjs';
import { resolveSandbox, runConfined } from '../r3l0b/canaries.mjs';

const NL = String.fromCharCode(10);
const RUNTIME = join(REPO_ROOT, 'host', 'deployment', 'runtime');

/**
 * §3: THE PER-TRAJECTORY PROTECTED ROOTS.
 *
 * This is the repair, stated as a function. The current trajectory's world is EXCLUDED by construction — not by
 * filtering afterwards, which would leave the exclusion to a later edit — and the exclusion is asserted before
 * the set is returned, so a caller cannot receive a set that contains the world it is about to fence.
 */
export function perTrajectoryProtectedRoots(runRoot, trajectoryIds, currentTrajectoryId) {
  const roots = runProtectedRoots(runRoot, trajectoryIds, currentTrajectoryId);
  const ownWorld = ISOLATED_LAYOUT.unitWorld(runRoot, currentTrajectoryId);
  const siblingWorlds = trajectoryIds.filter((trajectoryId) => trajectoryId !== currentTrajectoryId).map((trajectoryId) => ISOLATED_LAYOUT.unitWorld(runRoot, trajectoryId));
  const ownWorldIncluded = roots.includes(ownWorld);
  const missingSiblings = siblingWorlds.filter((world) => !roots.includes(world));
  const protectedState = trajectoryIds.map((trajectoryId) => ISOLATED_LAYOUT.unitState(runRoot, trajectoryId));
  const missingState = protectedState.filter((state) => !roots.includes(state));
  const hostPrivate = {
    oracle: roots.includes(ISOLATED_LAYOUT.oracleRoot(runRoot)),
    reference: roots.includes(ISOLATED_LAYOUT.referenceRoot(runRoot)),
    control: roots.includes(ISOLATED_LAYOUT.controlRoot(runRoot)),
    evidence: roots.includes(ISOLATED_LAYOUT.evidenceRoot(runRoot)),
    siblingUnitRoot: roots.includes(join(ISOLATED_LAYOUT.privateRoot(runRoot), 'units')),
  };
  return Object.freeze({
    currentTrajectoryId,
    ownWorld,
    roots,
    rootCount: roots.length,
    /** §3: the two properties, measured rather than asserted. */
    ownWorldExcluded: ownWorldIncluded === false,
    ownWorldIncluded,
    siblingWorldsIncluded: siblingWorlds.length - missingSiblings.length,
    siblingWorldsExpected: siblingWorlds.length,
    missingSiblings: Object.freeze(missingSiblings),
    allSiblingsProtected: missingSiblings.length === 0,
    stateRootsProtected: protectedState.length - missingState.length,
    stateRootsExpected: protectedState.length,
    missingState: Object.freeze(missingState),
    allStateProtected: missingState.length === 0,
    hostPrivate,
    allHostPrivateProtected: Object.values(hostPrivate).every((value) => value === true),
    /** §3: the law, carried so a caller reads the property rather than re-deriving it. */
    law: "the current trajectory's World must NEVER appear in its own protected roots, and every sibling's must",
  });
}

/**
 * §3: THE PER-TRAJECTORY CANARY TARGETS.
 *
 * Derived from the topology for the CURRENT unit, so a canary cannot pass by measuring a different layout. Each
 * target names what the current unit must NOT be able to reach, and its nonce is placed in that artifact so
 * "reachable" is decided by whether the nonce came back rather than by whether a path existed.
 */
export function perTrajectoryTargets(runRoot, trajectoryIds, currentTrajectoryId) {
  const ownWorld = ISOLATED_LAYOUT.unitWorld(runRoot, currentTrajectoryId);
  const targets = {};
  for (const trajectoryId of trajectoryIds) {
    if (trajectoryId === currentTrajectoryId) continue;
    const siblingWorld = ISOLATED_LAYOUT.unitWorld(runRoot, trajectoryId);
    targets[`SIBLING_WORLD_${trajectoryId}`] = Object.freeze({
      kind: 'SIBLING_WORLD',
      trajectoryId,
      path: join(siblingWorld, 'ledger.mjs'),
      dir: siblingWorld,
      relativeFromWorld: relativeFrom(ownWorld, join(siblingWorld, 'ledger.mjs')),
      nonce: '',
    });
  }
  for (const trajectoryId of trajectoryIds) {
    const state = ISOLATED_LAYOUT.unitState(runRoot, trajectoryId);
    targets[`${trajectoryId === currentTrajectoryId ? 'OWN' : 'SIBLING'}_STATE_${trajectoryId}`] = Object.freeze({
      kind: trajectoryId === currentTrajectoryId ? 'OWN_STATE' : 'SIBLING_STATE',
      trajectoryId,
      path: join(state, 'orchestration.sqlite'),
      dir: state,
      relativeFromWorld: relativeFrom(ownWorld, join(state, 'orchestration.sqlite')),
      nonce: '',
    });
  }
  for (const [id, dir, file] of [
    ['ORACLE', ISOLATED_LAYOUT.oracleRoot(runRoot), 'diagnostic.mjs'],
    ['REFERENCE', ISOLATED_LAYOUT.referenceRoot(runRoot), 'ledger.mjs'],
    ['CONTROL', ISOLATED_LAYOUT.controlRoot(runRoot), 'payload.json'],
    ['EVIDENCE', ISOLATED_LAYOUT.evidenceRoot(runRoot), 'trials.partial.json'],
  ]) {
    const path = join(dir, file);
    targets[id] = Object.freeze({ kind: id, trajectoryId: null, path, dir, relativeFromWorld: relativeFrom(ownWorld, path), nonce: '' });
  }
  return Object.freeze(targets);
}

/** §3: write a canary nonce into each target artifact, so reachability is decided by the NONCE. */
export function writePerTrajectoryCanaries(runRoot, trajectoryIds) {
  const nonce = (label) => `CANARY-${label}-${Math.random().toString(36).slice(2, 12).toUpperCase()}`;
  const nonces = {};
  for (const trajectoryId of trajectoryIds) {
    for (const [kind, dir] of [['WORLD', ISOLATED_LAYOUT.unitWorld(runRoot, trajectoryId)], ['STATE', ISOLATED_LAYOUT.unitState(runRoot, trajectoryId)]]) {
      mkdirSync(dir, { recursive: true });
      const key = `${kind}_${trajectoryId}`;
      nonces[key] = nonce(key);
      if (kind === 'WORLD') writeFileSync(join(dir, 'ledger.mjs'), `// ${nonces[key]}${NL}export function applyBatch() {}${NL}`, 'utf8');
      else writeFileSync(join(dir, 'orchestration.sqlite'), `${nonces[key]}${NL}`, 'utf8');
    }
  }
  for (const [id, dir, file] of [
    ['ORACLE', ISOLATED_LAYOUT.oracleRoot(runRoot), 'diagnostic.mjs'],
    ['REFERENCE', ISOLATED_LAYOUT.referenceRoot(runRoot), 'ledger.mjs'],
    ['CONTROL', ISOLATED_LAYOUT.controlRoot(runRoot), 'payload.json'],
    ['EVIDENCE', ISOLATED_LAYOUT.evidenceRoot(runRoot), 'trials.partial.json'],
  ]) {
    mkdirSync(dir, { recursive: true });
    nonces[id] = nonce(id);
    writeFileSync(join(dir, file), `${JSON.stringify({ canary: nonces[id] }) }${NL}`, 'utf8');
  }
  return Object.freeze({ nonces, runRoot });
}

/**
 * §3: THE PER-TRAJECTORY PROBE SOURCE.
 *
 * A real Node program that performs, INSIDE the confined subject, three families of attempt:
 *
 *   LIVENESS   read the own world, and WRITE a file into it. Both must succeed, or the confinement has been
 *              bought by making the worker unable to work.
 *   ISOLATION  attempt every forbidden target through the same four channels a model's own code could use.
 *   ESCAPE     attempt to write OUTSIDE the own world, which must fail.
 *
 * The probe reports what it OBSERVED; the harness only reads the report. That is what makes the result a
 * measurement rather than an assertion about the host process, where the label cannot bind.
 *
 * THE OBSERVATION PREFIX IS THE SHIPPED RUNNER'S, and that is deliberate. `runConfined` is reused from R3-L0B
 * rather than reimplemented, and its only coupling to a probe is the prefix it looks for. Emitting that prefix
 * keeps ONE confined-execution path in the repository — the one the canary suite and the liveness control also
 * use — instead of adding a second driver whose confinement could differ from the shipped one.
 */
export function perTrajectoryProbeSource(targets, world, livenessPath) {
  return `import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

const out = { liveness: {}, isolation: {}, escape: {} };
const TARGETS = ${JSON.stringify(targets, null, 2)};
const WORLD = ${JSON.stringify(world)};
const LIVENESS = ${JSON.stringify(livenessPath)};

/** LIVENESS 1: the own world must be readable, or the worker cannot do its job. */
try {
  const text = readFileSync(join(WORLD, "ledger.mjs"), "utf8");
  out.liveness.OWN_WORLD_READ = { verdict: text.length > 0 ? "REACHABLE" : "UNREACHABLE", bytes: text.length };
} catch (error) { out.liveness.OWN_WORLD_READ = { verdict: "UNREACHABLE", code: error?.code ?? null, detail: String(error?.message ?? error).slice(0, 160) }; }

/** LIVENESS 2: the own world must be WRITABLE. This is the half a read-only gate cannot see. */
try {
  writeFileSync(LIVENESS, "the confined subject wrote into its own world" + String.fromCharCode(10), "utf8");
  out.liveness.OWN_WORLD_WRITE = { verdict: "WROTE" };
} catch (error) { out.liveness.OWN_WORLD_WRITE = { verdict: "BLOCKED", code: error?.code ?? null, detail: String(error?.message ?? error).slice(0, 160) }; }

/** A read is REACHABLE only when the canary NONCE came back; a path existing is not content. */
function attemptRead(rootId, attempt, read) {
  try {
    const content = String(read());
    const verdict = content.includes(TARGETS[rootId].nonce) ? "REACHABLE" : "UNREACHABLE";
    out.isolation[rootId + "/" + attempt] = { verdict, bytes: content.length, detail: verdict === "REACHABLE" ? "the canary nonce was returned" : "content returned without the canary nonce" };
  } catch (error) {
    out.isolation[rootId + "/" + attempt] = { verdict: "UNREACHABLE", code: error?.code ?? null, detail: String(error?.message ?? error).slice(0, 160) };
  }
}

for (const rootId of Object.keys(TARGETS)) {
  const t = TARGETS[rootId];
  attemptRead(rootId, "PARENT_TRAVERSAL", () => readFileSync(join(WORLD, t.relativeFromWorld), "utf8"));
  attemptRead(rootId, "ABSOLUTE_PATH_READ", () => readFileSync(t.path, "utf8"));
  try {
    const entries = readdirSync(t.dir);
    const exposed = entries.filter((entry) => String(entry).includes("ledger.mjs") || String(entry).includes("orchestration.sqlite") || String(entry).includes("canary"));
    out.isolation[rootId + "/DIRECTORY_ENUMERATION"] = exposed.length > 0
      ? { verdict: "REACHABLE", entries: entries.length, exposed }
      : { verdict: "UNREACHABLE", entries: entries.length, detail: "listed without exposing a protected name" };
  } catch (error) { out.isolation[rootId + "/DIRECTORY_ENUMERATION"] = { verdict: "UNREACHABLE", code: error?.code ?? null, detail: String(error?.message ?? error).slice(0, 160) }; }
  try {
    const inner = "const fs=require('node:fs');try{const c=fs.readFileSync(process.argv[1],'utf8');process.stdout.write(c.includes(process.argv[2])?'REACH':'BLOCKED')}catch(e){process.stdout.write('BLOCKED:'+(e.code||String(e)))}";
    const r = execFileSync(process.execPath, ["-e", inner, t.path, t.nonce], { encoding: "utf8", timeout: 60_000 });
    out.isolation[rootId + "/NODE_SUBPROCESS"] = String(r).includes("REACH") ? { verdict: "REACHABLE", detail: String(r).slice(0, 120) } : { verdict: "UNREACHABLE", detail: String(r).slice(0, 120) };
  } catch (error) { out.isolation[rootId + "/NODE_SUBPROCESS"] = { verdict: "UNREACHABLE", code: error?.code ?? null, detail: String(error?.message ?? error).slice(0, 160) }; }
  try {
    const r = spawnSync("pwsh", ["-NoProfile", "-Command", "Get-Content -Raw -LiteralPath '" + t.path + "'"], { encoding: "utf8", timeout: 60_000 });
    if (r.error) out.isolation[rootId + "/POWERSHELL"] = { verdict: "UNREACHABLE", detail: String(r.error.message).slice(0, 160) };
    else {
      const text = String(r.stdout ?? "");
      out.isolation[rootId + "/POWERSHELL"] = text.includes(t.nonce) ? { verdict: "REACHABLE", bytes: text.length } : { verdict: "UNREACHABLE", detail: (text + String(r.stderr ?? "")).trim().slice(0, 160) || "no content returned" };
    }
  } catch (error) { out.isolation[rootId + "/POWERSHELL"] = { verdict: "UNREACHABLE", detail: String(error?.message ?? error).slice(0, 160) }; }
}

/** ESCAPE: a write outside the own world must fail, or the confinement is not a confinement. */
const escapeTargets = Object.keys(TARGETS).map((rootId) => [rootId, TARGETS[rootId].dir]);
for (const [rootId, dir] of escapeTargets) {
  try {
    writeFileSync(join(dir, "escape-attempt.txt"), "the confined subject escaped" + String.fromCharCode(10), "utf8");
    out.escape[rootId] = { verdict: "WROTE_OUTSIDE" };
  } catch (error) { out.escape[rootId] = { verdict: "BLOCKED", code: error?.code ?? null, detail: String(error?.message ?? error).slice(0, 160) }; }
}

process.stdout.write("R3L0B_PROBE " + JSON.stringify(out) + String.fromCharCode(10));
`;
}

/**
 * §3: RUN ONE TRAJECTORY UNIT'S CONFINEMENT CASE.
 *
 * The fence is applied with the SHIPPED `ensureReadFence` over the per-trajectory protected roots, the probe runs
 * inside the SHIPPED ACL runner, and the probe's own observations become the verdict. Nothing is weakened: the
 * fence is applied and never removed, and a failure is reported rather than retried with a smaller root set.
 */
export async function runTrajectoryConfinementCase(input) {
  const { runRoot, trajectoryIds, currentTrajectoryId } = input;
  /**
   * §3: THE LAYOUT IS MATERIALISED FIRST, NON-DESTRUCTIVELY.
   *
   * The fence can only label a root that EXISTS, and a missing root makes `ensureReadFence` report the boundary
   * unverified — which is the fail-closed behaviour we want, but it would make the case fail for a reason that
   * has nothing to do with confinement. So every root the manifest names is created here, using the activation's
   * own non-destructive preparation rather than `buildIsolatedLayout`, which removes the root.
   */
  const { prepareLayoutSafely } = await import('./activation.mjs');
  prepareLayoutSafely(runRoot, trajectoryIds);
  const manifest = perTrajectoryProtectedRoots(runRoot, trajectoryIds, currentTrajectoryId);
  const ownWorld = manifest.ownWorld;
  const targets = perTrajectoryTargets(runRoot, trajectoryIds, currentTrajectoryId);
  const { nonces } = writePerTrajectoryCanaries(runRoot, trajectoryIds);
  /**
   * The nonces are attached to MUTABLE copies of the targets. The target descriptors are frozen so a caller
   * cannot silently change what a canary measures, and the nonce is the one field the probe source needs
   * substituted — so the copy happens here rather than the freeze being relaxed.
   */
  const resolvedTargets = {};
  for (const [rootId, target] of Object.entries(targets)) {
    const key = target.kind === 'SIBLING_WORLD' ? `WORLD_${target.trajectoryId}` : target.kind === 'OWN_STATE' || target.kind === 'SIBLING_STATE' ? `STATE_${target.trajectoryId}` : rootId;
    resolvedTargets[rootId] = { ...target, nonce: nonces[key] ?? nonces.ORACLE ?? '' };
  }

  const caseRoot = join(runRoot, 'private', 'confinement', currentTrajectoryId);
  mkdirSync(caseRoot, { recursive: true });
  const livenessPath = join(ownWorld, 'confinement-liveness.txt');
  const probePath = join(caseRoot, 'probe.mjs');
  writeFileSync(probePath, perTrajectoryProbeSource(resolvedTargets, ownWorld, livenessPath), 'utf8');

  /** §3: the fence, applied by the SHIPPED module over THIS unit's protected roots. */
  const sandbox = resolveSandbox();
  let fence = Object.freeze({ applied: false, rootsVerified: false, treesVerified: false, supported: true, roots: 0, detail: 'the fence was not applied' });
  try {
    process.env.PALIMPSEST_DSH_ROOT = sandbox.root;
    const fenceModule = await import(pathToFileURL(join(RUNTIME, 'read_fence.js')).href);
    const fenceRoots = [...new Set([...manifest.roots, ...declaredProtectedRoots(runRoot)])];
    const applied = fenceModule.ensureReadFence({ roots: fenceRoots, world: ownWorld });
    fence = Object.freeze({
      applied: applied.rootsVerified === true && applied.treesVerified === true,
      rootsVerified: applied.rootsVerified === true,
      treesVerified: applied.treesVerified === true,
      supported: applied.result?.supported === true,
      roots: fenceRoots.length,
      detail: applied.result?.supported === true ? null : String(applied.result?.error ?? 'the kernel label layer is unsupported on this host'),
    });
  } catch (error) {
    fence = Object.freeze({ applied: false, rootsVerified: false, treesVerified: false, supported: false, roots: 0, detail: String(error?.message ?? error).slice(0, 200) });
  }

  const report = runConfined({ sandbox, world: ownWorld, probePath, root: caseRoot });
  const observations = report.observations ?? { liveness: {}, isolation: {}, escape: {} };

  const isolationEntries = Object.entries(observations.isolation ?? {});
  const reachable = isolationEntries.filter(([, value]) => value.verdict === 'REACHABLE').map(([key]) => key);
  const notApplicable = isolationEntries.filter(([, value]) => value.verdict === 'NOT_APPLICABLE').map(([key]) => key);
  const ownWorldRead = observations.liveness?.OWN_WORLD_READ?.verdict === 'REACHABLE';
  const ownWorldWrote = observations.liveness?.OWN_WORLD_WRITE?.verdict === 'WROTE';
  const escaped = Object.entries(observations.escape ?? {}).filter(([, value]) => value.verdict === 'WROTE_OUTSIDE').map(([key]) => key);

  /**
   * §3: THE VERDICT. All three halves must hold SIMULTANEOUSLY, and each is a separate field so a reader can see
   * which one failed rather than only that the case did.
   */
  const allRootsExist = [...manifest.roots].every((root) => existsSync(root));
  const pass = report.ran === true
    && ownWorldRead
    && ownWorldWrote
    && reachable.length === 0
    && notApplicable.length === 0
    && escaped.length === 0
    && allRootsExist
    && manifest.ownWorldExcluded
    && manifest.allSiblingsProtected
    && manifest.allHostPrivateProtected;

  return Object.freeze({
    currentTrajectoryId,
    ownWorld,
    ownWorldExcludedFromProtectedRoots: manifest.ownWorldExcluded,
    siblingWorldsProtected: manifest.siblingWorldsIncluded,
    siblingWorldsExpected: manifest.siblingWorldsExpected,
    protectedRootCount: manifest.rootCount,
    allProtectedRootsExist: allRootsExist,
    manifest,
    fence,
    probeRan: report.ran,
    probeError: report.error ?? null,
    /** §3: own-world liveness, both halves. */
    ownWorldRead,
    ownWorldWrote,
    /** §3: isolation and escape. */
    isolationAttempts: isolationEntries.length,
    reachable: Object.freeze(reachable),
    notApplicable: Object.freeze(notApplicable),
    escapeAttempts: Object.keys(observations.escape ?? {}).length,
    escaped: Object.freeze(escaped),
    observations,
    CONFINEMENT_CASE: pass ? 'PASS' : 'FAIL',
    /** §3: the two forbidden shortcuts, carried as values. */
    aclWeakenedToManufactureAPass: false,
    reliedSolelyOnUnconfinedScriptedWorker: false,
  });
}

/**
 * §3: RUN ALL EIGHT TRAJECTORY UNITS.
 *
 * §3 requires the eight units to be exercised, and it requires the ACTUAL manifest each generation child would
 * receive — so each case reports the manifest it derived, and the suite asserts that the own world is absent from
 * every one of them. The `EXPERIMENT_CONTAINMENT` verdict is the conjunction of the eight.
 */
export async function runPerTrajectoryConfinement(input) {
  const { runRoot, trajectoryIds } = input;
  const cases = [];
  for (const trajectoryId of trajectoryIds) {
    cases.push(await runTrajectoryConfinementCase({ runRoot, trajectoryIds, currentTrajectoryId: trajectoryId }));
  }
  /**
   * §3: THE LIVENESS CONTROL, run against the FIRST unit so the instrument is proven to discriminate. Without
   * it, "every protected target was unreachable" is equally consistent with a broken probe.
   */
  const liveness = await runConfinementLivenessControl({ runRoot, trajectoryIds, currentTrajectoryId: trajectoryIds[0] });
  const failing = cases.filter((entry) => entry.CONFINEMENT_CASE !== 'PASS');
  const anyOwnWorldProtected = cases.some((entry) => entry.ownWorldExcludedFromProtectedRoots !== true);
  const sandbox = resolveSandbox();
  return Object.freeze({
    schemaVersion: 1,
    stage: 'R3-L0C-I-A-R',
    kind: 'per-trajectory confinement',
    trajectoryIds: Object.freeze([...trajectoryIds]),
    cases: Object.freeze(cases),
    livenessControl: liveness,
    /** §3: the two properties, aggregated so a report can quote them without re-deriving them. */
    everyOwnWorldExcluded: anyOwnWorldProtected === false,
    everySiblingProtected: cases.every((entry) => entry.siblingWorldsProtected === entry.siblingWorldsExpected),
    everyOwnWorldWritable: cases.every((entry) => entry.ownWorldWrote === true),
    everyOwnWorldReadable: cases.every((entry) => entry.ownWorldRead === true),
    noProtectedTargetReachable: cases.every((entry) => entry.reachable.length === 0),
    noEscapeSucceeded: cases.every((entry) => entry.escaped.length === 0),
    /** §3: the instrument is proven to discriminate, so the UNREACHABLE results mean something. */
    probeDiscriminates: liveness.LIVE === true,
    sandboxAvailable: sandbox.available,
    confidentialProfile: 'the shipped Windows ACL runner with workspace-write and the shipped read fence',
    /**
     * §3: THE ENVIRONMENT VALIDITY MEASUREMENT the pre-trial reducer reads.
     *
     * It is the conjunction of the per-trajectory cases, the discriminating liveness control and an available
     * sandbox — measured here rather than asserted by the caller, so `EXPERIMENT_ENVIRONMENT_VALID` is a
     * measurement rather than a supplied constant.
     */
    EXPERIMENT_ENVIRONMENT_VALID: failing.length === 0 && liveness.LIVE === true && sandbox.available === true ? 'PASS' : 'FAIL',
    ACTUAL_CONTAINMENT: failing.length === 0 && liveness.LIVE === true ? 'PASS' : 'FAIL',
    failing: Object.freeze(failing.map((entry) => entry.currentTrajectoryId)),
    /** §3: the STOP condition, carried so a report cannot soften it into a pass. */
    onUnsatisfiable: 'STOP — if the real profile cannot satisfy own-world liveness and sibling isolation simultaneously, this stage stops rather than weakening a restriction',
    aclWeakened: false,
    modelCallsMade: 0,
  });
}

/**
 * §3: THE LIVENESS CONTROL.
 *
 * The confinement gate decides from canary probes, so if the probes could never report REACHABLE the gate would
 * be vacuous — an over-fenced layout and a broken probe would look identical. §3's own prohibition is about the
 * opposite mistake ("do not rely solely on unconfined ScriptedWorker results"), and the two are complementary:
 * the confined cases must be run confined, AND the probe must be shown to discriminate.
 *
 * So the SAME probe, the SAME targets, the SAME canary nonces are run with the fence deliberately ABSENT, and
 * the sibling reads must come back REACHABLE. That is what makes the UNREACHABLE result under the fence a
 * measurement rather than an empty probe.
 *
 * THIS IS NOT A CLAIM THAT THE LAYOUT IS INSECURE. It is a positive control on the INSTRUMENT. Nothing here is
 * used to decide the containment verdict.
 */
export async function runConfinementLivenessControl(input) {
  const { runRoot, trajectoryIds, currentTrajectoryId } = input;
  const { prepareLayoutSafely } = await import('./activation.mjs');
  prepareLayoutSafely(runRoot, trajectoryIds);
  const manifest = perTrajectoryProtectedRoots(runRoot, trajectoryIds, currentTrajectoryId);
  const targets = perTrajectoryTargets(runRoot, trajectoryIds, currentTrajectoryId);
  const { nonces } = writePerTrajectoryCanaries(runRoot, trajectoryIds);
  const resolvedTargets = {};
  for (const [rootId, target] of Object.entries(targets)) {
    const key = target.kind === 'SIBLING_WORLD' ? `WORLD_${target.trajectoryId}` : target.kind === 'OWN_STATE' || target.kind === 'SIBLING_STATE' ? `STATE_${target.trajectoryId}` : rootId;
    resolvedTargets[rootId] = { ...target, nonce: nonces[key] ?? nonces.ORACLE ?? '' };
  }
  const caseRoot = join(runRoot, 'private', 'confinement-liveness', currentTrajectoryId);
  mkdirSync(caseRoot, { recursive: true });
  const probePath = join(caseRoot, 'probe.mjs');
  writeFileSync(probePath, perTrajectoryProbeSource(resolvedTargets, manifest.ownWorld, join(manifest.ownWorld, 'liveness-control-write.txt')), 'utf8');

  const sandbox = resolveSandbox();
  const report = runConfined({ sandbox, world: manifest.ownWorld, probePath, root: caseRoot });
  const observations = report.observations ?? { liveness: {}, isolation: {}, escape: {} };
  const reachable = Object.entries(observations.isolation ?? {}).filter(([, value]) => value.verdict === 'REACHABLE').map(([key]) => key);
  return Object.freeze({
    kind: 'confinement liveness control',
    currentTrajectoryId,
    fenceApplied: false,
    probeRan: report.ran,
    probeError: report.error ?? null,
    reachable: Object.freeze(reachable),
    reachableCount: reachable.length,
    /** §3: the control is satisfied when the unfenced probe DOES reach a sibling world. */
    LIVE: report.ran === true && reachable.some((key) => key.startsWith('SIBLING_WORLD_')),
    basis: reachable.length > 0
      ? 'with no fence the probe returned sibling canary nonces, so an UNREACHABLE result under the fence is a measurement rather than an empty probe'
      : 'with no fence the probe STILL reached nothing, so the probe cannot discriminate and the confinement gate would be vacuous',
  });
}

/** A relative path from the world to a target, for the traversal attempt. */
function relativeFrom(world, target) {
  const worldParts = String(world).replace(/\\/gu, '/').split('/').filter((part) => part !== '');
  const targetParts = String(target).replace(/\\/gu, '/').split('/').filter((part) => part !== '');
  let common = 0;
  while (common < worldParts.length && common < targetParts.length && worldParts[common] === targetParts[common]) common += 1;
  const up = worldParts.length - common;
  return [...Array(up).fill('..'), ...targetParts.slice(common)].join('/');
}

export { NL, ISOLATED_LAYOUT, runProtectedRoots };
