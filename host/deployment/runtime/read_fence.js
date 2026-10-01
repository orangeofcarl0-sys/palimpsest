// palimpsest-host-deployment/runtime — THE READ FENCE: STANDING, VERIFIED, FAIL-CLOSED.
//
// R1-H proved the mechanism: a MEDIUM + NO_READ_UP mandatory label on a protected root refuses the
// Low-integrity token the DSH backend already creates for a worker, while leaving the Medium control plane
// untouched. This module turns that proof into a host contract. What changed, and why each change is
// load-bearing rather than cosmetic:
//
//   · It no longer builds its own Win32 table. All descriptor work goes through `win32_label.js`, which binds
//     the ACL calls through the DOCUMENTED DSH seam and pins the contract it depends on.
//
//   · It READS the existing label before writing. A fence that overwrote a label would silently drop an
//     existing NO_WRITE_UP or NO_EXECUTE_UP, which is a security REGRESSION dressed as a fix. The effective
//     policy is always `existing | NO_READ_UP`, and the integrity level is never lowered.
//
//   · It VERIFIES by re-reading and parsing the object's mandatory ACE after every mutation. A return code
//     is not evidence on this host: two write paths were measured to report success while changing nothing.
//
//   · It verifies the WHOLE TREE, not just the root. A label is inherited by existing and future children,
//     but a child can carry inheritance-blocking flags, and "the root is protected" is not the claim that
//     matters — "the CONTENT is protected" is.
//
//   · It is STANDING (§3). Labels are host security state that survives worker and session exit, so a
//     worker's own crash cannot leave the deployment unprotected, and a new host can verify what is already
//     there and repair only what drifted.
//
// This is HOST EXECUTION capability. It owns no canonical semantics: no owner, no event type, no table, no
// asset kind, no authority (§3/§9 of the R1-H ruling, §1 of R1-HR).
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { readdirSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';

import {
  MANDATORY_POLICIES,
  dshCompatibilityReport,
  readMandatoryLabel,
  restoreLabel,
  win32LabelApi,
  writeAndVerifyLabel,
} from './win32_label.js';

/**
 * @typedef {{ readonly path: string, readonly why: string }} ReadFenceSkip
 * @typedef {{ readonly path: string, readonly applied: boolean, readonly verified: boolean,
 *   readonly detail: string, readonly alreadyProtected?: boolean }} ReadFenceOutcome
 * @typedef {{ readonly supported: boolean, readonly platform: string, readonly outcomes: readonly ReadFenceOutcome[],
 *   readonly skipped: readonly ReadFenceSkip[], readonly unavailable?: string, readonly drifted?: boolean,
 *   readonly contract?: unknown }} ReadFenceResult
 * @typedef {{ readonly protectedRoots: readonly string[], readonly skipped: readonly ReadFenceSkip[] }} ReadFencePlan
 * @typedef {{ readonly path: string, readonly present: boolean, readonly verified: boolean, readonly detail: string }} DescendantOutcome
 * @typedef {{ readonly root: string, readonly checked: number, readonly unlabelled: readonly string[],
 *   readonly unreadable: readonly string[], readonly verified: boolean }} TreeOutcome
 */

/** How deep a tree walk goes. A world is shallow; an unbounded walk over a huge tree is a hang, not a fence. */
const MAX_TREE_DEPTH = 12;
/** A cap on entries examined per root, so a pathological tree cannot turn `ensure` into a hang. */
const MAX_TREE_ENTRIES = 20_000;

/**
 * True when `candidate` is `root` or sits underneath it, compared on resolved absolute paths.
 *
 * Case is folded on win32: this is a confidentiality check, and a fence that a capitalization change could
 * walk around would be worse than no fence, because it would be trusted.
 *
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
export function isAncestorOf(root, candidate) {
  const fold = (/** @type {string} */ value) => (process.platform === 'win32' ? value.toLowerCase() : value);
  const a = fold(resolve(root).replace(/[\\/]+$/u, ''));
  const b = fold(resolve(candidate).replace(/[\\/]+$/u, ''));
  if (a === b) return true;
  return b.startsWith(a.endsWith(sep) ? a : `${a}${sep}`);
}

/**
 * Decide which roots may carry the label for a given execution world.
 *
 * A root that CONTAINS the world is skipped, and the reason is measured rather than chosen: every process
 * traverses its cwd's ancestors during startup (Node's module walk `lstat`s each one), and traverse into a
 * no-read-up directory is refused — so labelling such a root kills the worker before it runs a statement. A
 * fence that breaks the runtime is an outage, not a boundary. The trusted-code guard in `read_guard.js` can
 * still deny paths inside such a root, because it works on names rather than on the kernel.
 *
 * @param {{ roots: readonly string[], world: string }} input
 * @returns {ReadFencePlan}
 */
export function planReadFence(input) {
  /** @type {string[]} */
  const protectedRoots = [];
  /** @type {ReadFenceSkip[]} */
  const skipped = [];
  for (const root of input.roots) {
    if (isAncestorOf(root, input.world)) {
      skipped.push({
        path: root,
        why: 'contains the execution world: labelling an ancestor of the world refuses the traverse every process needs to start',
      });
      continue;
    }
    protectedRoots.push(root);
  }
  return { protectedRoots, skipped };
}

/**
 * Label every planned root, preserving what is already there and verifying the result.
 *
 * @param {{ roots: readonly string[], world: string }} input
 * @returns {ReadFenceResult}
 */
export function applyReadFence(input) {
  const plan = planReadFence(input);
  const compatibility = dshCompatibilityReport();
  if (process.platform !== 'win32') {
    return {
      supported: false,
      platform: process.platform,
      outcomes: [],
      skipped: plan.skipped,
      unavailable: 'the read fence is a Windows mandatory-integrity mechanism',
      contract: compatibility,
    };
  }
  const resolved = win32LabelApi();
  if (resolved.error !== undefined || resolved.api === undefined) {
    return {
      supported: false,
      platform: process.platform,
      outcomes: [],
      skipped: plan.skipped,
      unavailable: resolved.error ?? 'the Win32 label binding table is unavailable',
      contract: compatibility,
    };
  }
  const api = resolved.api;
  /** @type {ReadFenceOutcome[]} */
  const outcomes = [];
  for (const root of plan.protectedRoots) outcomes.push(ensureRoot(api, root));
  return { supported: true, platform: process.platform, outcomes, skipped: plan.skipped, drifted: compatibility.drifted, contract: compatibility };
}

/**
 * Ensure ONE root carries the label, without disturbing anything already there.
 *
 * The idempotence rule (§17) lives here: when the root already carries a label whose policy ALREADY includes
 * NO_READ_UP and whose integrity level is at least Medium, nothing is written at all. Re-writing an identical
 * ACE would re-propagate the descriptor across the whole tree on every worker start, which is both slow and
 * a needless mutation of host security state.
 *
 * @param {any} api
 * @param {string} root
 * @returns {ReadFenceOutcome}
 */
function ensureRoot(api, root) {
  const existing = readMandatoryLabel(api, root);
  if (!existing.ok) {
    return { path: root, applied: false, verified: false, detail: `the existing label could not be read, so the fence refuses to write over it: ${existing.detail}` };
  }
  const label = existing.label;
  const alreadyProtected =
    label?.present === true &&
    ((label.policyMask ?? 0) & MANDATORY_POLICIES.NO_READ_UP) !== 0 &&
    typeof label.integrityRid === 'number' &&
    label.integrityRid >= 8192;
  if (alreadyProtected) {
    return { path: root, applied: false, verified: true, alreadyProtected: true, detail: `already protected, unchanged: ${describe(label)}` };
  }
  const written = writeAndVerifyLabel(api, root, label);
  return { path: root, applied: written.applied, verified: written.verified, detail: written.detail };
}

/** One-line description of a label, for evidence. */
function describe(/** @type {any} */ label) {
  return `integrity=${String(label?.integrityName)} policies=[${(label?.policies ?? []).join('|')}]`;
}

/**
 * Walk a protected root and verify that the label actually reaches its CONTENT.
 *
 * This is the difference between "the root is labelled" and "the bytes are protected". Windows propagates an
 * inheritable label to existing children at write time and to new children at creation, but a child can
 * carry flags that block inheritance, and a fence that trusted the root alone would report a boundary it does
 * not have.
 *
 * FAIL CLOSED: a descendant that is present but unlabelled makes the whole tree UNVERIFIED, and the caller
 * is expected to treat that as a refusal to run — not as a warning.
 *
 * @param {{ root: string, maxDepth?: number, maxEntries?: number }} input
 * @returns {TreeOutcome}
 */
export function verifyTree(input) {
  const resolved = win32LabelApi();
  if (resolved.error !== undefined || resolved.api === undefined) {
    return { root: input.root, checked: 0, unlabelled: [], unreadable: [input.root], verified: false };
  }
  const api = resolved.api;
  const maxDepth = input.maxDepth ?? MAX_TREE_DEPTH;
  const maxEntries = input.maxEntries ?? MAX_TREE_ENTRIES;
  /** @type {string[]} */
  const unlabelled = [];
  /** @type {string[]} */
  const unreadable = [];
  let checked = 0;

  /** @param {string} path @param {number} depth */
  const visit = (path, depth) => {
    if (checked >= maxEntries || depth > maxDepth) return;
    checked += 1;
    const read = readMandatoryLabel(api, path);
    if (!read.ok) {
      unreadable.push(path);
    } else if (read.label?.present !== true || ((read.label.policyMask ?? 0) & MANDATORY_POLICIES.NO_READ_UP) === 0) {
      unlabelled.push(path);
    }
    let entries;
    try {
      if (!statSync(path).isDirectory()) return;
      entries = readdirSync(path);
    } catch {
      return;
    }
    for (const entry of entries) visit(resolve(path, entry), depth + 1);
  };

  visit(resolve(input.root), 0);
  return { root: input.root, checked, unlabelled, unreadable, verified: unlabelled.length === 0 && unreadable.length === 0 };
}

/**
 * Ensure the fence is in force AND reaches the content, then report both facts separately.
 *
 * The two are not the same claim, and collapsing them is how a security report lies: `rootsVerified` is about
 * the roots, `treesVerified` is about every descendant examined. A caller that requires a boundary must
 * require BOTH.
 *
 * @param {{ roots: readonly string[], world: string, verifyTrees?: boolean }} input
 * @returns {{ result: ReadFenceResult, trees: readonly TreeOutcome[], rootsVerified: boolean, treesVerified: boolean }}
 */
export function ensureReadFence(input) {
  const result = applyReadFence({ roots: input.roots, world: input.world });
  const outcomes = result.outcomes ?? [];
  const rootsVerified = result.supported && outcomes.length > 0 && outcomes.every((entry) => entry.verified);
  const trees = input.verifyTrees === false ? [] : outcomes.filter((entry) => entry.verified).map((entry) => verifyTree({ root: entry.path }));
  const treesVerified = trees.length > 0 && trees.every((entry) => entry.verified);
  return { result, trees, rootsVerified, treesVerified };
}

/**
 * Remove ONLY the read fence, restoring each root's policy mask to what it was before.
 *
 * `originals` is the pre-fence state a caller captured with {@link snapshotLabels}. It is required rather
 * than inferred: a repair path that guessed the original would either widen access on an object somebody else
 * labelled, or leave a fence nobody asked for.
 *
 * @param {{ roots: readonly string[], originals: readonly { path: string, integrityRid: number, policyMask: number }[] }} input
 * @returns {{ restored: readonly { path: string, restored: boolean, detail: string }[] }}
 */
export function uninstallReadFence(input) {
  const resolved = win32LabelApi();
  if (resolved.error !== undefined || resolved.api === undefined) {
    return { restored: input.originals.map((entry) => ({ path: entry.path, restored: false, detail: resolved.error ?? 'the Win32 label binding table is unavailable' })) };
  }
  const api = resolved.api;
  return {
    restored: input.originals.map((entry) => ({ path: entry.path, ...restoreLabel(api, entry.path, { integrityRid: entry.integrityRid, policyMask: entry.policyMask }) })),
  };
}

/**
 * Capture the pre-fence label of every root, so a later repair can restore exactly that state.
 *
 * @param {{ roots: readonly string[] }} input
 * @returns {{ originals: readonly { path: string, integrityRid: number, policyMask: number }[], unreadable: readonly string[] }}
 */
export function snapshotLabels(input) {
  const resolved = win32LabelApi();
  if (resolved.error !== undefined || resolved.api === undefined) return { originals: [], unreadable: input.roots.slice() };
  const api = resolved.api;
  /** @type {{ path: string, integrityRid: number, policyMask: number }[]} */
  const originals = [];
  /** @type {string[]} */
  const unreadable = [];
  for (const root of input.roots) {
    const read = readMandatoryLabel(api, root);
    // An ABSENT label is snapshotted as the Windows baseline for a user-created object (Medium, no policy),
    // which is what a restore should write: deleting the SACL entry entirely could widen access on an object
    // whose baseline was never "no label".
    if (!read.ok) {
      unreadable.push(root);
      continue;
    }
    originals.push({
      path: root,
      integrityRid: read.label?.present === true && typeof read.label.integrityRid === 'number' ? read.label.integrityRid : 8192,
      policyMask: read.label?.present === true && typeof read.label.policyMask === 'number' ? read.label.policyMask : 0,
    });
  }
  return { originals, unreadable };
}

/**
 * The roots a worker deployment must protect, derived from what the deployment already knows.
 *
 * Deliberately minimal (R1-H §7): the durable owner stores, sibling execution worlds, other projects' state,
 * and host session material. It does NOT list the runtime, the package dependencies or the worker's own
 * world, because a worker needs those to do ordinary work — the contract says so explicitly rather than
 * overpromising "the worker reads only its world", which no runtime permits.
 *
 * @param {{ repository: string, otherProjects?: readonly string[], hostHome?: string }} input
 * @returns {readonly string[]}
 */
export function protectedRootsFor(input) {
  const roots = [resolve(input.repository, '.palimpsest')];
  for (const other of input.otherProjects ?? []) roots.push(resolve(other));
  if (typeof input.hostHome === 'string' && input.hostHome !== '') roots.push(resolve(input.hostHome));
  return roots;
}

/**
 * The sibling worlds directory is a DISCLOSED residual (§18), excluded rather than quietly attempted: it
 * holds the worlds, so labelling it labels an ancestor of the worker's own world and kills the worker.
 *
 * The consequence is stated precisely: a worker may still ENUMERATE the names of sibling attempt
 * directories. It cannot read their contents — each world is labelled individually — and it cannot reach
 * durable state at all. Metadata confidentiality is NOT claimed; content confidentiality is.
 *
 * @param {{ repository: string, world: string }} input
 * @returns {readonly ReadFenceSkip[]}
 */
export function disclosedResiduals(input) {
  const worlds = resolve(input.repository, '.palimpsest', 'worlds');
  if (!isAncestorOf(worlds, input.world)) return [];
  return [
    {
      path: worlds,
      why: "holds the worlds, so it is an ancestor of the worker's own world; sibling world NAMES stay visible while their contents are labelled",
    },
  ];
}
