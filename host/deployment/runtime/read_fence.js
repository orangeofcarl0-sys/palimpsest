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

import { lstatSync, readdirSync, statSync } from 'node:fs';
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
 * E1RG RG-0-F7 / RG-B §5.5: A SKIPPED ROOT IS NOT AN UNPROTECTED ROOT — BUT ONLY IF ITS CONTENT IS LABELLED.
 *
 * The skip reason is about the root ITSELF. It says nothing about the root's CHILDREN, and in the production
 * layout most of them are ordinary durable state that must be protected:
 *
 *     <repository>/.palimpsest/            <- skipped: it is an ancestor of the world
 *     <repository>/.palimpsest/worlds/     <- must ALSO be skipped: it contains the world
 *     <repository>/.palimpsest/durable-state/   <- contains no world, so it CAN and MUST be labelled
 *
 * MEASURED, NOT ASSUMED. `scripts/trajectory_p2e1rg/ancestor-root-probe.mjs` runs a probe under the real DSH
 * Low token in a production-shaped fixture. With no label on `durable-state` the synthetic canary is READABLE
 * (the sandbox write-grant ACL does not protect it); with the label applied the read is EPERM. So the
 * protection for a skipped ancestor's content is the Kernel label on that content, and nothing else.
 *
 * The derivation is deliberately ONE LEVEL and BOUNDED. Descending further would be a crawler (§5.1 forbids a
 * new generic filesystem crawler), and one level is sufficient because a label is INHERITABLE: labelling
 * `durable-state` covers everything beneath it, including future children.
 *
 * If the skipped root cannot be enumerated, that is NOT silently treated as "nothing to protect". The
 * enumeration failure is recorded in `unresolved`, and `applyReadFence` reports coverage as incomplete — which
 * the admission gate refuses (§5.6).
 *
 * @param {{ roots: readonly string[], world: string }} input
 * @returns {ReadFencePlan}
 */
export function planReadFence(input) {
  /** @type {string[]} */
  const protectedRoots = [];
  /** @type {{ path: string, derivedFrom: string }[]} */
  const derivedRoots = [];
  /** @type {(ReadFenceSkip & { derivedRoots?: readonly string[], enumerationFailed?: boolean })[]} */
  const skipped = [];
  /** @type {string[]} */
  const unresolved = [];
  for (const root of input.roots) {
    if (!isAncestorOf(root, input.world)) {
      protectedRoots.push(root);
      continue;
    }
    /**
     * THE ROOT CONTAINS THE WORLD. Skip the root, then derive the coverage its content still needs.
     */
    const derived = [];
    let enumerationFailed = false;
    let entries;
    try {
      entries = readdirSync(resolve(root), { withFileTypes: true });
    } catch {
      enumerationFailed = true;
      entries = [];
      unresolved.push(root);
    }
    for (const entry of entries) {
      /** Only DIRECTORIES can carry an inheritable label meaningfully for a subtree; a loose file is labelled below. */
      if (entry.isDirectory() !== true) {
        derived.push(resolve(root, entry.name));
        continue;
      }
      const child = resolve(root, entry.name);
      /**
       * A child that ALSO contains the world cannot be labelled for the same measured reason as its parent: the
       * worker's own startup traverses it. That is the worlds directory, and it is the disclosed residual.
       */
      if (isAncestorOf(child, input.world)) continue;
      derived.push(child);
    }
    for (const path of derived) derivedRoots.push({ path, derivedFrom: root });
    skipped.push({
      path: root,
      why: 'contains the execution world: labelling an ancestor of the world refuses the traverse every process needs to start',
      derivedRoots: derived,
      enumerationFailed,
    });
  }
  return { protectedRoots, derivedRoots, skipped, unresolved };
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
  /**
   * E1RE RE-C §5.4: `input.api` is a FAULT-INJECTION SEAM, not a production parameter.
   *
   * The unreadable-descriptor defect cannot be exercised against a real security descriptor without risking
   * user state, so the conformance test supplies a stub table that returns a chosen failure code and records
   * every call. Production callers omit it and the real binding table is resolved exactly as before.
   */
  const resolved = input.api !== undefined ? { api: input.api } : win32LabelApi();
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
  /**
   * RG-B §5.5: THE CONTENT OF A SKIPPED ANCESTOR IS LABELLED THROUGH ITS CHILDREN.
   *
   * The root itself cannot carry the label (it is an ancestor of the world), but its non-world children can,
   * and the probe in `ancestor-root-probe.mjs` shows that is what actually protects them: without it the Low
   * token reads durable state, with it the read is EPERM.
   */
  for (const derived of plan.derivedRoots) outcomes.push({ ...ensureRoot(api, derived.path), derivedFrom: derived.derivedFrom });
  const coverage = coverageOf(plan, outcomes);
  return { supported: true, platform: process.platform, outcomes, skipped: plan.skipped, coverage, drifted: compatibility.drifted, contract: compatibility };
}

/**
 * THE ROOT COVERAGE RESULT (§5.4/§5.6).
 *
 * `rootsVerified` alone is not the claim that matters. What a caller must be able to read is: which roots were
 * PLANNED, which were deliberately SKIPPED and why, which actually received a verified label, whether the
 * skipped roots' content was covered through derived children, and whether anything remains UNRESOLVED.
 *
 * `complete` is the single field an admission gate should require. It is false when a skipped root could not be
 * enumerated, when any outcome failed verification, or when a skipped root produced no derived roots at all —
 * because "the ancestor was skipped and nothing beneath it was labelled" is exactly the state the probe showed
 * to be unprotected.
 *
 * @param {{ protectedRoots: readonly string[], derivedRoots: readonly { path: string, derivedFrom: string }[], skipped: readonly { path: string, why: string, derivedRoots?: readonly string[], enumerationFailed?: boolean }[], unresolved: readonly string[] }} plan
 * @param {readonly ReadFenceOutcome[]} outcomes
 * @returns {{
 *   planned: readonly string[],
 *   skipped: readonly { path: string, why: string, derivedRoots: readonly string[], enumerationFailed: boolean }[],
 *   labelled: readonly string[],
 *   verified: readonly string[],
 *   unverified: readonly string[],
 *   unresolved: readonly string[],
 *   skippedWithoutDerivedCoverage: readonly string[],
 *   complete: boolean,
 * }}
 */
export function coverageOf(plan, outcomes) {
  const verified = outcomes.filter((entry) => entry.verified === true).map((entry) => entry.path);
  const unverified = outcomes.filter((entry) => entry.verified !== true).map((entry) => entry.path);
  const skipped = plan.skipped.map((entry) => ({
    path: entry.path,
    why: entry.why,
    derivedRoots: entry.derivedRoots ?? [],
    enumerationFailed: entry.enumerationFailed === true,
  }));
  /**
   * A SKIPPED ROOT WITH NOTHING DERIVED IS THE DANGEROUS CASE. It means the ancestor could not be labelled AND
   * none of its content was labelled either, which is precisely the configuration the Low-token probe read
   * through. It is reported as a coverage gap rather than as an empty skip.
   */
  const skippedWithoutDerivedCoverage = skipped.filter((entry) => entry.derivedRoots.length === 0).map((entry) => entry.path);
  const enumerationFailed = skipped.filter((entry) => entry.enumerationFailed).map((entry) => entry.path);
  const complete = unverified.length === 0 && (plan.unresolved ?? []).length === 0 && enumerationFailed.length === 0 && skippedWithoutDerivedCoverage.length === 0;
  return {
    planned: plan.protectedRoots,
    skipped,
    labelled: outcomes.filter((entry) => entry.applied === true).map((entry) => entry.path),
    verified,
    unverified,
    unresolved: [...(plan.unresolved ?? [])],
    skippedWithoutDerivedCoverage,
    complete,
  };
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
  /**
   * E1RE RE-C §5.4: AN UNPARSEABLE DESCRIPTOR IS ALSO UNKNOWN.
   *
   * `parseLabelAcl` reports `readable: false` when the descriptor was read but its ACL could not be parsed. That
   * is NOT "no label exists": writing over it would compute the new policy mask from zero and discard whatever
   * bits the object carried. The fence refuses instead, exactly as it does for an unreadable descriptor.
   */
  if (label?.readable === false) {
    return { path: root, applied: false, verified: false, detail: 'the existing descriptor was read but its label ACL could not be parsed, so the prior state is UNKNOWN and the fence refuses to write over it' };
  }
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
  const maxDepth = input.maxDepth ?? MAX_TREE_DEPTH;
  const maxEntries = input.maxEntries ?? MAX_TREE_ENTRIES;
  /**
   * E1RG RG-0-F5 / RG-B §5.1: RESOURCE LIMITS MUST NOT PRODUCE A VACUOUS PASS.
   *
   * The previous version stopped recursion at `maxEntries`/`maxDepth` and then computed `verified` from the two
   * result arrays alone — so a walk that examined the root and nothing else reported `verified: true` while
   * every descendant remained unexamined. "No unprotected entry was FOUND" is not "every required entry WAS
   * verified", and a caller could not tell the two apart.
   *
   * The bounded walk is KEPT (§5.2): refusing a huge tree is the safe answer. What changes is that the walk now
   * REPORTS how it ended, and `verified` requires COMPLETION. `noUnprotectedEntryFound` carries the weaker fact
   * separately, so a reader can see exactly what was and was not established.
   */
  const invalidLimits = [];
  if (!Number.isFinite(maxDepth) || maxDepth < 0) invalidLimits.push('maxDepth');
  if (!Number.isFinite(maxEntries) || maxEntries < 1) invalidLimits.push('maxEntries');
  if (invalidLimits.length > 0) {
    /** An unusable limit cannot bound a traversal, so no claim about coverage is possible. */
    return {
      root: input.root,
      checked: 0,
      unlabelled: [],
      unreadable: [],
      verified: false,
      complete: false,
      noUnprotectedEntryFound: false,
      stopReason: 'INVALID_LIMIT',
      undetermined: [input.root],
      invalidLimits,
      truncated: false,
      enumerationFailures: [],
      reparsePoints: [],
    };
  }
  if (resolved.error !== undefined || resolved.api === undefined) {
    return {
      root: input.root,
      checked: 0,
      unlabelled: [],
      unreadable: [input.root],
      verified: false,
      complete: false,
      noUnprotectedEntryFound: false,
      stopReason: 'UNSUPPORTED',
      undetermined: [input.root],
      invalidLimits: [],
      truncated: false,
      enumerationFailures: [],
      reparsePoints: [],
    };
  }
  const api = resolved.api;
  /** @type {string[]} */
  const unlabelled = [];
  /** @type {string[]} */
  const unreadable = [];
  /**
   * OBJECTS THE WALK COULD NOT DECIDE ABOUT. Each is a required descendant that was NOT verified, and each
   * keeps its own reason: an unexamined subtree, a directory that could not be enumerated, or a reparse point
   * whose target was never established.
   */
  /** @type {string[]} */
  const undetermined = [];
  /** @type {string[]} */
  const enumerationFailures = [];
  /** @type {string[]} */
  const reparsePoints = [];
  let checked = 0;
  /** Why the walk stopped early, when it did. `COMPLETE` is the only value that permits `verified`. */
  let stopReason = 'COMPLETE';

  /** @param {string} path @param {number} depth */
  const visit = (path, depth) => {
    if (stopReason !== 'COMPLETE') return;
    if (checked >= maxEntries) {
      stopReason = 'ENTRY_LIMIT';
      undetermined.push(path);
      return;
    }
    if (depth > maxDepth) {
      stopReason = 'DEPTH_LIMIT';
      undetermined.push(path);
      return;
    }
    checked += 1;
    const read = readMandatoryLabel(api, path);
    if (!read.ok || read.label?.readable === false) {
      /**
       * E1RE RE-C §5.4: an UNPARSEABLE descriptor is UNVERIFIED, not "unlabelled". Both make the tree fail
       * closed, but they are recorded separately because they call for different repairs: one is a read
       * failure, the other a label that does not carry NO_READ_UP.
       */
      unreadable.push(path);
    } else if (read.label?.present !== true || ((read.label.policyMask ?? 0) & MANDATORY_POLICIES.NO_READ_UP) === 0) {
      unlabelled.push(path);
    }
    let stats;
    try {
      stats = statSync(path);
    } catch {
      /**
       * THE OBJECT DISAPPEARED OR BECAME UNREADABLE DURING THE WALK. Its label state is unknown, so its subtree
       * is unknown — recorded as an enumeration failure rather than silently skipped.
       */
      enumerationFailures.push(path);
      undetermined.push(path);
      return;
    }
    if (!stats.isDirectory()) return;
    /**
     * A REPARSE POINT IS NOT WALKED. Following it would verify a tree the root does not own, and a link that is
     * re-pointed after the walk would make the verification describe a different set of objects.
     */
    /** `lstat` distinguishes a link from the directory it points at; `stat` above already followed it. */
    let linkStats;
    try {
      linkStats = lstatSync(path);
    } catch {
      linkStats = undefined;
    }
    if (linkStats !== undefined && linkStats.isSymbolicLink()) {
      reparsePoints.push(path);
      undetermined.push(path);
      return;
    }
    let entries;
    try {
      entries = readdirSync(path);
    } catch {
      enumerationFailures.push(path);
      undetermined.push(path);
      return;
    }
    for (const entry of entries) visit(resolve(path, entry), depth + 1);
  };

  visit(resolve(input.root), 0);
  /**
   * THE TWO FACTS, COMPUTED SEPARATELY.
   *
   *   noUnprotectedEntryFound — nothing EXAMINED was unprotected. True even for a truncated walk, and that is
   *                             exactly why it cannot be the admission claim.
   *   verified               — every required entry was examined and nothing examined was unprotected.
   */
  const noUnprotectedEntryFound = unlabelled.length === 0 && unreadable.length === 0;
  const complete = stopReason === 'COMPLETE' && enumerationFailures.length === 0 && reparsePoints.length === 0 && undetermined.length === 0;
  return {
    root: input.root,
    checked,
    unlabelled,
    unreadable,
    verified: complete && noUnprotectedEntryFound,
    complete,
    noUnprotectedEntryFound,
    stopReason,
    undetermined,
    invalidLimits: [],
    truncated: stopReason === 'ENTRY_LIMIT' || stopReason === 'DEPTH_LIMIT',
    enumerationFailures,
    reparsePoints,
  };
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
    if (!read.ok || read.label?.readable === false) {
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
