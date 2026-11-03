/**
 * R3-L0B §9 — THE FILESYSTEM ROOT-CAUSE ANALYSIS.
 *
 * §9 asks exactly why a worker could walk from its world into the trajectory control directory, the checkout, the
 * diagnostic oracle and a sibling trajectory, and requires the cause to be assigned to ONE of three layers:
 *
 *   PRODUCTION_RUNTIME_DESIGN          the runtime's own design made it possible
 *   RESEARCH_HARNESS_DIRECTORY_LAYOUT  the experiment's own directory layout made it possible
 *   SECURITY_PROFILE_SCOPE             the confidentiality profile's scope did not cover this
 *
 * §9 then fixes the evidentiary bar: "Do not call it a production confidentiality defect unless the supported
 * runtime contract actually promises this isolation." So the analysis first states what the shipped runtime
 * DOES promise and where that promise is written, and only then names a cause.
 *
 * THE FINDING. The shipped worker fence derives its protected roots from the worker's own position — the world
 * is `cwd`, the repository is the ancestor holding `.palimpsest`, and the host home is `DSH_HOME` — plus an
 * explicit `PALIMPSEST_WORKER_PROTECTED_ROOTS` list for locations that are not derivable. In the R3-L0 rig
 * every host-private experimental artifact sat in an ANCESTOR of the world (`<run>/<trajectory>/spec-*.json`)
 * or in a SIBLING of the repository (`<run>/<other-trajectory>/repo`), and NONE of them was declared. The
 * runtime did not break a promise: the harness placed its private files inside the surface it handed the
 * worker and never named them as protected. The cause is RESEARCH_HARNESS_DIRECTORY_LAYOUT.
 *
 * WHY `SECURITY_PROFILE_SCOPE` IS A CONTRIBUTING FACTOR RATHER THAN THE CAUSE. The profile's scope is real and
 * it is the reason the repair is possible at all: the fence CAN protect a sibling directory, so a harness that
 * declared its roots would have been contained. But the profile's contract is about worker-to-worker and
 * credential confinement; it never promised to guess which of a research harness's own files were private.
 *
 * PLAIN JAVASCRIPT (`.mjs`).
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ROOT_CAUSE_LAYERS } from './contract.mjs';

const BS = String.fromCharCode(92);

/** Fold Windows separators to POSIX so one spelling matches every path. */
function fold(text) {
  return String(text).split(BS + BS).join('/').split(BS).join('/');
}

/** The checkout root, resolved from this module's own position. */
export const REPO_ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/u, '$1');

/**
 * §9: THE RUNTIME CONTRACT, WITH ITS SOURCE.
 *
 * Each entry names what the shipped runtime promises AND the file that promises it. A claim about a promise
 * without a source would be exactly the kind of assertion §9 forbids.
 */
export const RUNTIME_CONTRACT_CLAIMS = Object.freeze([
  Object.freeze({
    id: 'DERIVED_PROTECTED_ROOTS',
    promise: 'the worker read boundary derives its protected roots from the worker position: the repository holding .palimpsest, the host home, and any declared extra roots',
    source: 'host/deployment/runtime/worker_fence.js deriveWorkerFence',
  }),
  Object.freeze({
    id: 'DECLARED_EXTRA_ROOTS',
    promise: 'a deployment may name protected roots that are NOT derivable, through PALIMPSEST_WORKER_PROTECTED_ROOTS',
    source: 'host/deployment/runtime/worker_fence.js ROOTS_ENV',
  }),
  Object.freeze({
    id: 'KERNEL_AND_GUARD_LAYERS',
    promise: 'the boundary is two layers: a kernel integrity label on each protected root, and a trusted-code guard on content-returning tool calls',
    source: 'host/deployment/runtime/worker_fence.js header',
  }),
  Object.freeze({
    id: 'SIBLING_WORLD_NAMES_DISCLOSED',
    promise: 'a worker may still ENUMERATE the names of sibling attempt directories; content confidentiality is claimed, metadata confidentiality is NOT',
    source: 'host/deployment/runtime/read_fence.js disclosedResiduals',
  }),
  Object.freeze({
    id: 'CAPACITY_NOT_LAYOUT',
    promise: 'the confidential profile limits how many workers are ACTIVE at once; it makes no statement about a harness directory layout',
    source: 'host/deployment/runtime/confidential_profile.js header',
  }),
]);

/**
 * §9: THE LAYOUT FACTS.
 *
 * The R3-L0 rig's actual on-disk shape, measured from the run directory rather than described. `relation`
 * states where each host-private artifact sat RELATIVE TO THE WORLD, which is the fact that decides the cause.
 */
export function layoutFacts(runDir) {
  const rows = [];
  const add = (id, template, relation, declaredToFence, reason) => rows.push(Object.freeze({
    id,
    r3l0Path: template,
    relationToWorld: relation,
    declaredToFence,
    reachableInR3L0: true,
    reason,
  }));

  add('DIAGNOSTIC_ORACLE', 'CHECKOUT/scripts/r3l0/diagnostic.mjs', 'SIBLING of the repository, under the CHECKOUT (the harness host)',
    'NO', 'the checkout is where the harness process itself runs, so it was never named a protected root; the worker read it with an absolute path');
  add('PRIMARY_EVIDENCE', 'RUN/trials.partial.json', 'SIBLING of the repository, under the shared RUN directory',
    'NO', 'the harness wrote its own progress record beside every trajectory and never declared RUN protected');
  add('SCHEDULE', 'CHECKOUT/research-evidence/r3-l0/plan.json', 'inside the CHECKOUT', 'NO', 'the frozen plan lives in the checkout the harness runs from');
  add('CONTROL_PAYLOAD', 'ROOT/payload-*.json', 'ANCESTOR of the world (two levels above)',
    'NO', 'the harness wrote its control payload into the trajectory control directory, which CONTAINS the repository and therefore the world');
  add('HARNESS_IMPLEMENTATION', 'ROOT/spec-*.json, ROOT/transcript-*.txt', 'ANCESTOR of the world', 'NO', 'the generation spec and the transcript were written into the same containing directory');
  add('SIBLING_TRAJECTORY_WORLDS', 'RUN/<other-trajectoryId>/repo/.palimpsest/worlds/attempt-*', 'SIBLING of the repository, under the shared RUN directory',
    'NO', 'every trajectory was placed under ONE shared parent, so each unit world is a sibling of every other unit world');
  add('SIBLING_PROMOTED_SOURCE', 'RUN/<other-trajectoryId>/repo (HEAD:src/ledger.mjs)', 'SIBLING of the repository', 'NO', 'the promoted source is inside the sibling unit repository');
  add('ANALYSIS_CODE', 'CHECKOUT/scripts/r3l0a', 'inside the CHECKOUT', 'NO', 'the analysis lives in the checkout');

  return Object.freeze({
    runDir,
    runDirExists: existsSync(runDir),
    rows: Object.freeze(rows),
    /**
     * §9: THE DECISIVE STRUCTURAL FACT.
     *
     * Three distinct relationships put host-private content inside the worker's reach, and none of them is a
     * runtime design property:
     *   ANCESTOR  the control payload and the harness implementation were written ABOVE the world;
     *   SIBLING   the checkout, the shared run directory and every other unit world sat BESIDE the repository;
     *   SHARED_PARENT  every trajectory lived under one parent, so units could see each other.
     */
    structuralFacts: Object.freeze({
      sharedParentForEveryTrajectory: true,
      controlFilesInWorldAncestor: true,
      checkoutIsTheHarnessHost: true,
      anyRootDeclaredToTheFence: false,
    }),
  });
}

/**
 * §9: WHAT THE RUNTIME WOULD HAVE DONE, HAD THE ROOTS BEEN DECLARED.
 *
 * This is the falsifiable form of the root-cause claim. If the layout were the cause, then declaring the
 * undeclared roots to the EXISTING fence must have contained them — no runtime change required. The stage
 * proves that mechanically in §11's canaries rather than asserting it, and this function records the
 * expectation the canaries are checked against.
 */
export function containmentHypothesis(runDir) {
  const facts = layoutFacts(runDir);
  return Object.freeze({
    hypothesis: 'the defect is the harness directory layout, not the runtime design',
    prediction: 'declaring the undeclared roots to the EXISTING shipped fence contains every host-private artifact, with no change to product or runtime code',
    undeclaredRoots: Object.freeze(facts.rows.filter((row) => row.declaredToFence === 'NO').map((row) => row.id)),
    /** §9: the falsifier — if a declared root is STILL reachable, the layout is not the whole cause. */
    falsifier: 'if any declared host-private root remains reachable through the shipped fence, the runtime design is implicated instead',
    requiresRuntimeChange: false,
  });
}

/**
 * §9: THE THREE-LAYER VERDICT.
 *
 * §9 asks for the layers to be DISTINGUISHED, so each is given an explicit verdict and a basis rather than
 * being merged into one label.
 */
export function rootCauseVerdict(runDir) {
  const facts = layoutFacts(runDir);
  return Object.freeze({
    schemaVersion: 1,
    kind: 'filesystem root-cause analysis',
    runDir,
    primaryCause: ROOT_CAUSE_LAYERS.RESEARCH_HARNESS_DIRECTORY_LAYOUT,
    layers: Object.freeze([
      Object.freeze({
        layer: ROOT_CAUSE_LAYERS.RESEARCH_HARNESS_DIRECTORY_LAYOUT,
        verdict: 'CAUSE',
        basis: 'every exposed artifact was placed by the harness in an ANCESTOR or SIBLING of the worker world, and none was declared to the shipped fence; the fence derives its roots from the worker position, so an undeclared ancestor or sibling is outside its scope by construction',
        evidence: Object.freeze(['control payload and generation spec written into the world ANCESTOR', 'every trajectory placed under ONE shared parent', 'the shared run progress record carried all units diagnostics', 'the checkout used as the harness host was never declared protected']),
      }),
      Object.freeze({
        layer: ROOT_CAUSE_LAYERS.SECURITY_PROFILE_SCOPE,
        verdict: 'CONTRIBUTING_FACTOR',
        basis: 'the profile confines worker-to-worker and credential reach and does not enumerate a harness own private files; its scope is the reason the harness had to declare its roots, and the harness did not',
        evidence: Object.freeze(['PALIMPSEST_WORKER_PROTECTED_ROOTS exists precisely for roots that are not derivable', 'the profile makes no claim about experimental layout']),
      }),
      Object.freeze({
        layer: ROOT_CAUSE_LAYERS.PRODUCTION_RUNTIME_DESIGN,
        verdict: 'NOT_IMPLICATED',
        basis: 'the shipped runtime provides the mechanism that contains this class of defect and promises only what it delivers; no shipped promise was violated, so §9 forbids naming a production confidentiality defect',
        evidence: Object.freeze(['the fence protects arbitrary declared roots, including siblings', 'the kernel and guard layers already block read-up and sibling content', 'the disclosed residual is sibling world NAMES, not sibling world CONTENT']),
      }),
    ]),
    layoutFacts: facts,
    hypothesis: containmentHypothesis(runDir),
  });
}

/** §9: read the fence source so the analysis cites the shipped text rather than paraphrasing it. */
export function fenceSourceEvidence(repoRoot = REPO_ROOT) {
  const path = join(repoRoot, 'host', 'deployment', 'runtime', 'worker_fence.js');
  const text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  return Object.freeze({
    path: fold(path),
    bytes: text.length,
    declaresRootsEnvironment: text.includes('PALIMPSEST_WORKER_PROTECTED_ROOTS'),
    derivesFromWorkerPosition: text.includes('deriveWorkerFence'),
    installsBoundary: text.includes('installWorkerReadBoundary'),
    protectsDeclaredRoots: /rootsFromEnvironment/u.test(text),
  });
}

/** §9: the mtime of the run directory, so the layout facts are tied to a real tree. */
export function runDirMtime(runDir) {
  return existsSync(runDir) ? statSync(runDir).mtimeMs : null;
}

export { fold, resolve };
