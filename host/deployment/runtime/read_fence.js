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

import { lstatSync, readdirSync, readlinkSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

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
 * HOST-S1 §6: ONE LEVEL WAS NOT ENOUGH. THE WALK FOLLOWS THE ACTIVE-WORLD SPINE.
 *
 * The E1RG derivation examined the skipped root's children and stopped. In the production layout that leaves the
 * WORLDS directory uncovered: `worlds/` contains the world, so it is skipped in turn, and nothing beneath it was
 * ever considered. Every INACTIVE SIBLING WORLD under `worlds/` therefore carried no label at all while coverage
 * reported itself complete — measured on the parent commit as `baseline-and-falsifiers.json` F1
 * (`coverageComplete: true`, `siblingDerived: false`).
 *
 * The corrected derivation descends along the KNOWN PATH from the protected ancestor to the active world, and at
 * every level on that path:
 *
 *   1. identifies the child that continues the spine toward the world;
 *   2. records that child as the spine continuation (it is NOT labelled — it is an ancestor of the world);
 *   3. classifies every OTHER child as content that needs confidentiality;
 *   4. derives a protected root for each such child;
 *   5. records anything it could not enumerate or could not classify.
 *
 * This is BOUNDED BY CONSTRUCTION. It never enumerates more than one directory per spine level, and the spine is
 * the finite list of ancestors between the root and the world — it is not a crawler (§6.1). The descent also
 * stops at `MAX_SPINE_DEPTH` and records the truncation as unresolved, so a pathological path cannot make the
 * plan unbounded.
 *
 * AN EMPTY DERIVED SET IS NOT AUTOMATICALLY SAFE (§6.3). It is only legitimate when the enumeration that
 * produced it was COMPLETE and the ancestor genuinely contains nothing but the spine. `planComplete` records
 * that, and `coverageOf` refuses to call an incomplete plan covered.
 *
 * @param {{ roots: readonly string[], world: string }} input
 * @returns {ReadFencePlan}
 */
export function planReadFence(input) {
  /** @type {string[]} */
  const protectedRoots = [];
  /** @type {{ path: string, derivedFrom: string, depth: number, spineParent: string }[]} */
  const derivedRoots = [];
  /** @type {(ReadFenceSkip & { derivedRoots?: readonly string[], enumerationFailed?: boolean, spine?: readonly string[] })[]} */
  const skipped = [];
  /** @type {string[]} */
  const unresolved = [];
  for (const root of input.roots) {
    if (!isAncestorOf(root, input.world)) {
      protectedRoots.push(root);
      continue;
    }
    /**
     * THE ROOT CONTAINS THE WORLD. Walk the spine from this root toward the world, deriving coverage for every
     * non-spine child at each level.
     */
    const walk = deriveAlongSpine(resolve(root), resolve(input.world));
    for (const path of walk.derived) derivedRoots.push({ path, derivedFrom: root, depth: walk.depthOf.get(path) ?? 1, spineParent: root });
    for (const path of walk.unresolved) unresolved.push(path);
    skipped.push({
      path: root,
      why: 'contains the execution world: labelling an ancestor of the world refuses the traverse every process needs to start',
      derivedRoots: walk.derived,
      enumerationFailed: walk.enumerationFailed,
      spine: walk.spine,
      /** §6.3: whether the walk that produced this skip examined every level it needed to. */
      planComplete: walk.complete,
      ...(walk.truncated ? { truncatedAt: walk.truncatedAt } : {}),
    });
  }
  return { protectedRoots, derivedRoots, skipped, unresolved };
}

/** How many levels below a skipped ancestor the spine walk may descend before it refuses to guess. */
const MAX_SPINE_DEPTH = 12;

/**
 * Walk from a skipped protected ancestor along the ACTIVE-WORLD SPINE, deriving the coverage its content needs.
 *
 * The spine is the sequence of ancestors between the protected root and the world, exclusive of the world
 * itself. Each spine node is an ancestor of the world and therefore cannot be labelled. Everything ELSE at each
 * level is content that must be protected, and gets a derived root.
 *
 * Returns the derived paths, the spine, and — crucially — whether the walk was COMPLETE. An incomplete walk is
 * reported rather than silently producing a shorter list, because "we found nothing to protect" and "we could
 * not look" are the two states §6.3 insists must stay distinguishable.
 *
 * @param {string} root
 * @param {string} world
 * @returns {{ derived: string[], spine: string[], unresolved: string[], complete: boolean,
 *   enumerationFailed: boolean, truncated: boolean, truncatedAt?: string, depthOf: Map<string, number> }}
 */
function deriveAlongSpine(root, world) {
  /** @type {string[]} */
  const derived = [];
  /** @type {string[]} */
  const spine = [];
  /** @type {string[]} */
  const unresolved = [];
  /** @type {Map<string, number>} */
  const depthOf = new Map();
  let enumerationFailed = false;
  let truncated = false;
  /** @type {string | undefined} */
  let truncatedAt;

  /** The relative path from `root` to `world`, split into components. Empty when they are the same object. */
  const relativePath = relative(root, world);
  if (relativePath === '') {
    /** The world IS the root. Nothing can be derived and nothing needs to be: the root is the world. */
    return { derived, spine, unresolved, complete: true, enumerationFailed: false, truncated: false, depthOf };
  }
  const components = relativePath.split(/[\\/]/u).filter((entry) => entry !== '' && entry !== '.');
  if (components.length > MAX_SPINE_DEPTH) {
    return {
      derived,
      spine,
      unresolved: [root],
      complete: false,
      enumerationFailed: false,
      truncated: true,
      truncatedAt: `${String(components.length)} levels exceeds the ${String(MAX_SPINE_DEPTH)}-level spine bound`,
      depthOf,
    };
  }
  /** A relative path that ESCAPES the root is not a spine — it is a world outside the protected ancestor. */
  if (components.length === 0 || components[0] === '..') {
    return { derived, spine, unresolved: [root], complete: false, enumerationFailed: true, truncated: false, depthOf };
  }

  let current = root;
  let depth = 0;
  /**
   * AT EACH LEVEL: find the child that continues toward the world, then derive every other child.
   *
   * The loop walks `components.length` times, so it examines exactly one directory per spine level. The final
   * component is the world itself; its parent is the last directory enumerated.
   */
  for (let index = 0; index < components.length; index += 1) {
    const continuationName = components[index];
    depth += 1;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      /** §6.1(6): an ancestor that cannot be enumerated cannot be shown to be covered. */
      enumerationFailed = true;
      unresolved.push(current);
      break;
    }
    const fold = (value) => (process.platform === 'win32' ? value.toLowerCase() : value);
    const continuationNameFolded = fold(continuationName);
    let continuationFound = false;
    for (const entry of entries) {
      const child = resolve(current, entry.name);
      if (fold(entry.name) === continuationNameFolded) {
        /**
         * THE SPINE CONTINUATION. It is an ancestor of the world (or the world itself at the final level), so it
         * is NOT labelled. It is recorded so a reader can see the path the decision followed.
         */
        continuationFound = true;
        spine.push(child);
        continue;
      }
      /**
       * §6.4: A REPARSE POINT IS NEVER DERIVED. Labelling through a link writes a security descriptor onto an
       * object outside the intended protection domain — and the measurement in
       * `scripts/host_s1/junction-label-probe.mjs` shows the reverse is also true: a label on the LINK does not
       * protect the TARGET, because a Low-integrity process still read the canary through the labelled junction.
       * So an aliased child is recorded as unresolved and the plan is incomplete.
       */
      let link;
      try {
        link = lstatSync(child);
      } catch {
        link = undefined;
      }
      if (link === undefined) {
        enumerationFailed = true;
        unresolved.push(child);
        continue;
      }
      if (link.isSymbolicLink()) {
        unresolved.push(child);
        continue;
      }
      /**
       * EVERY OTHER CHILD NEEDS CONFIDENTIALITY. A directory carries an inheritable label for its subtree; a
       * loose file is labelled directly. Both are derived.
       */
      derived.push(child);
      depthOf.set(child, depth);
    }
    if (!continuationFound) {
      /**
       * THE SPINE NAMES A CHILD THAT IS NOT THERE. The world cannot be reached from this root by the path that
       * was spelled, so no claim about coverage is possible.
       */
      enumerationFailed = true;
      unresolved.push(resolve(current, continuationName));
      break;
    }
    current = resolve(current, continuationName);
  }

  return {
    derived,
    spine,
    unresolved,
    complete: !enumerationFailed && !truncated && unresolved.length === 0,
    enumerationFailed,
    truncated,
    ...(truncatedAt === undefined ? {} : { truncatedAt }),
    depthOf,
  };
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
 * THE ROOT COVERAGE RESULT (§5.4/§5.6, extended by Host-S1 §6.2).
 *
 * `rootsVerified` alone is not the claim that matters. What a caller must be able to read is: which roots were
 * PLANNED, which were deliberately SKIPPED and why, which actually received a verified label, whether the
 * skipped roots' content was covered through derived children, and whether anything remains UNRESOLVED.
 *
 * HOST-S1 §6.2 — THE LEDGER NAMES THE RELATIONSHIPS, NOT JUST THE COUNTS. Each skipped ancestor now reports:
 *
 *   requestedRoot   — the protected root that was asked for
 *   spine           — the chain of ancestors from that root down toward the active world (never labelled)
 *   derivedRoots    — the content beside the spine that received a protection requirement
 *   planComplete    — whether the derivation examined every level it needed to
 *   enumerationFailed — whether a level could not be read
 *
 * `complete` is the single field an admission gate should require. It is false when a skipped root could not be
 * enumerated, when the spine walk was truncated or could not reach the world, when any outcome failed
 * verification, or when a skipped root produced no derived roots at all — because "the ancestor was skipped and
 * nothing beneath it was labelled" is exactly the state the Low-token probe showed to be unprotected.
 *
 * §6.3: AN EMPTY DERIVED SET IS NOT AUTOMATICALLY UNSAFE — it is unsafe only when the enumeration that produced
 * it was incomplete, OR when the ancestor has content beside the spine. `skippedWithoutDerivedCoverage` is
 * therefore computed from the walk's own verdict (`planComplete` plus the presence of non-spine children), not
 * from the list being empty. An ancestor containing only the current world is legitimate; an ancestor that
 * could not be read is not.
 *
 * @param {{ protectedRoots: readonly string[], derivedRoots: readonly { path: string, derivedFrom: string }[], skipped: readonly { path: string, why: string, derivedRoots?: readonly string[], enumerationFailed?: boolean, spine?: readonly string[], planComplete?: boolean, truncatedAt?: string }[], unresolved: readonly string[] }} plan
 * @param {readonly ReadFenceOutcome[]} outcomes
 * @returns {{
 *   planned: readonly string[],
 *   skipped: readonly { path: string, why: string, derivedRoots: readonly string[], enumerationFailed: boolean, spine: readonly string[], planComplete: boolean, truncatedAt?: string }[],
 *   labelled: readonly string[],
 *   verified: readonly string[],
 *   unverified: readonly string[],
 *   unresolved: readonly string[],
 *   skippedWithoutDerivedCoverage: readonly string[],
 *   incompletePlans: readonly string[],
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
    spine: entry.spine ?? [],
    planComplete: entry.planComplete !== false,
    ...(entry.truncatedAt === undefined ? {} : { truncatedAt: entry.truncatedAt }),
  }));
  /**
   * A SKIPPED ROOT WITH NO COVERAGE BASIS IS THE DANGEROUS CASE. It means the ancestor could not be labelled AND
   * no content beneath it was labelled either, which is precisely the configuration the Low-token probe read
   * through. An ancestor whose walk FAILED is the same hazard even when the derived list happens to be non-empty,
   * because an unexamined sibling is indistinguishable from an absent one.
   */
  const skippedWithoutDerivedCoverage = skipped
    .filter((entry) => entry.derivedRoots.length === 0 || entry.enumerationFailed === true)
    .map((entry) => entry.path);
  const enumerationFailed = skipped.filter((entry) => entry.enumerationFailed).map((entry) => entry.path);
  /** §6.3: a spine walk that could not complete is a plan gap even when nothing else looks wrong. */
  const incompletePlans = skipped.filter((entry) => entry.planComplete !== true).map((entry) => entry.path);
  const complete =
    unverified.length === 0 &&
    (plan.unresolved ?? []).length === 0 &&
    enumerationFailed.length === 0 &&
    skippedWithoutDerivedCoverage.length === 0 &&
    incompletePlans.length === 0;
  return {
    planned: plan.protectedRoots,
    skipped,
    labelled: outcomes.filter((entry) => entry.applied === true).map((entry) => entry.path),
    verified,
    unverified,
    unresolved: [...(plan.unresolved ?? [])],
    skippedWithoutDerivedCoverage,
    incompletePlans,
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
 * HOST-S1 §7.1 — A REPARSE POINT IS NOT AUTOMATICALLY UNVERIFIED, BUT IT IS NEVER ASSUMED PROTECTED.
 *
 * The E1RG version recorded every reparse point as `undetermined` and made `complete` false. That is the safe
 * default, but it cannot be the FINAL rule: a real DSH home contains 98 junction entries in
 * `profiles/node_modules` (the shipped installer links packages), so "no reparse points" would refuse every
 * worker in every real deployment — an outage dressed as a boundary.
 *
 * What replaced the blanket rule is a MEASUREMENT. `scripts/host_s1/junction-label-probe.mjs` runs a real
 * Low-integrity token against a labelled junction whose target is outside the protected root:
 *
 *   · listing the junction is refused (EPERM) — the label DOES reach the link object;
 *   · reading a file THROUGH the junction SUCCEEDS and returns the canary.
 *
 * So a labelled junction is NOT a protection basis for its target. The link object is protected; the content it
 * exposes is not. A reparse point therefore remains `undetermined` — it can never be counted as verified — and
 * the caller is given the facts it needs to decide, rather than a boolean that hides them:
 *
 *   reparsePoints        — every link encountered (never followed, never counted as verified)
 *   reparseWithinRoot    — links whose target is INSIDE the root being verified (the target is covered by the
 *                          same root label, so the link exposes nothing the root does not already own)
 *   reparseOutsideRoot   — links whose target is OUTSIDE the root: the target is NOT covered by this root's
 *                          label, and the probe shows the label on the link does not protect it
 *   reparseUnresolvable  — links whose target could not be established
 *
 * `complete` stays false whenever ANY link was found, because "every required entry was examined" cannot be
 * claimed while a subtree behind a link was deliberately not examined. What changes is that the classification
 * is now NAMED, and a separate `admissionEligible` field states whether the root's PROTECTED CONTENT is still
 * fully accounted for despite the links:
 *
 *   within root              — the target is part of this root, so this walk already examines it by real path;
 *   into another protected root — that root's own verification covers it, and a read through the link meets
 *                              that root's label;
 *   outside the protection domain — the target is not a protected object, so the link exposes nothing this
 *                              fence claims to protect. DISCLOSED, not silently accepted;
 *   unresolvable             — unknown is not safe, and admission refuses.
 *
 * The distinction is load-bearing rather than convenient. `scripts/host_s1/verify-cost-probe.mjs` measured a real
 * DSH home at 20 000+ entries with 98 out-of-root junctions; a blanket "no reparse points" rule would refuse
 * every worker in every real deployment while protecting nothing extra, and §7.3 forbids trading confidentiality
 * for that. What the fence refuses on is now the thing that actually matters: an object that must be confidential
 * and was not shown to be.
 *
 * @param {{ root: string, maxDepth?: number, maxEntries?: number, protectedRoots?: readonly string[] }} input
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
      reparseWithinRoot: [],
      reparseIntoProtectedRoot: [],
      reparseOutsideProtectionDomain: [],
      reparseUnresolvable: [],
      reparseBasis: 'NO_REPARSE_POINTS',
      admissionEligible: false,
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
      reparseWithinRoot: [],
      reparseIntoProtectedRoot: [],
      reparseOutsideProtectionDomain: [],
      reparseUnresolvable: [],
      reparseBasis: 'NO_REPARSE_POINTS',
      admissionEligible: false,
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
  /** §7.1: links whose target is inside this root — the root's own label covers the target too. */
  /** @type {string[]} */
  const reparseWithinRoot = [];
  /** §7.1: links whose target is inside ANOTHER protected root, which is verified independently. */
  /** @type {string[]} */
  const reparseIntoProtectedRoot = [];
  /** §7.1: links whose target is outside every protected root — not an object this fence claims. */
  /** @type {string[]} */
  const reparseOutsideProtectionDomain = [];
  /** @type {string[]} */
  const reparseUnresolvable = [];
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
      /**
       * §7.1: CLASSIFY THE LINK BY WHERE IT LEADS. Every link is recorded and none is counted as verified, but a
       * link whose target this fence does not claim to protect is a different fact from one that reaches a
       * required protected object.
       */
      const target = resolveLinkTarget(path);
      if (target === undefined) {
        reparseUnresolvable.push(path);
      } else if (isAncestorOf(resolve(input.root), target)) {
        /** The target is part of this root, so this walk reaches it by its real path as well. */
        reparseWithinRoot.push(path);
      } else if ((input.protectedRoots ?? []).some((root) => isAncestorOf(resolve(root), target))) {
        /** Another protected root owns the target, and that root is verified on its own. */
        reparseIntoProtectedRoot.push(path);
      } else {
        /** The target is outside every protected root: it is not an object this fence claims. */
        reparseOutsideProtectionDomain.push(path);
      }
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
    reparseWithinRoot,
    reparseIntoProtectedRoot,
    reparseOutsideProtectionDomain,
    reparseUnresolvable,
    /**
     * §7.1: THE ADMISSION-RELEVANT SUMMARY, stated as a basis rather than a mood.
     *
     *   NO_REPARSE_POINTS               nothing to account for;
     *   REPARSE_TARGETS_ACCOUNTED_FOR   every link leads to content this fence already covers (this root, or
     *                                   another protected root) — the tree's protected content is accounted for,
     *                                   so `admissionEligible` is true even though `complete` is false;
     *   REPARSE_LEAVES_PROTECTION_DOMAIN at least one link leads outside every protected root, OR could not be
     *                                   resolved. The target is not covered and is NOT claimed; admission still
     *                                   proceeds only because the object is outside the domain — but the fact is
     *                                   named so a reviewer can see it, and `unresolvable` refuses outright.
     */
    reparseBasis:
      reparsePoints.length === 0
        ? 'NO_REPARSE_POINTS'
        : reparseUnresolvable.length > 0
          ? 'REPARSE_UNRESOLVABLE'
          : reparseOutsideProtectionDomain.length > 0
            ? 'REPARSE_LEAVES_PROTECTION_DOMAIN'
            : 'REPARSE_TARGETS_ACCOUNTED_FOR',
    /**
     * §7.1/§7.2: THE FIELD ADMISSION CONSUMES.
     *
     * True when every object that CAN be examined is protected AND every link either leads to content this
     * fence already covers or leads outside the protection domain entirely. False when a required object is
     * unprotected, unreadable, unexamined because of a resource limit, or behind a link that could not be
     * resolved.
     */
    admissionEligible:
      noUnprotectedEntryFound &&
      enumerationFailures.length === 0 &&
      stopReason === 'COMPLETE' &&
      reparseUnresolvable.length === 0,
  };
}

/**
 * Resolve one reparse point's target, or `undefined` when it cannot be established.
 *
 * `readlinkSync` on Windows returns the SUBSTITUTE NAME for a junction (`\\?\C:\target`), which is already an
 * absolute path; for a relative symlink it is relative to the link's own directory. `resolve(path, '..', raw)`
 * handles both, because an absolute second argument discards the prefix.
 *
 * @param {string} path
 * @returns {string | undefined}
 */
function resolveLinkTarget(path) {
  try {
    return resolve(path, '..', readlinkSync(path));
  } catch {
    return undefined;
  }
}

/**
 * Ensure the fence is in force AND reaches the content, then report both facts separately.
 *
 * The two are not the same claim, and collapsing them is how a security report lies: `rootsVerified` is about
 * the roots, `treesVerified` is about every descendant examined. A caller that requires a boundary must
 * require BOTH.
 *
 * HOST-S1 §7.2 — THE DESCENDANT RESULT IS NOW A SEPARATE, CONSUMABLE QUALIFICATION.
 *
 * E1RG computed `treesVerified` here but nothing in the production path read it, so a worker was admitted on
 * the ROOT outcome alone (`baseline-and-falsifiers.json` F3). Three facts are now returned so the admission gate
 * can require the right one:
 *
 *   rootsVerified      — every planned root carries a verified label;
 *   treesVerified      — every examined descendant is labelled AND no walk was truncated (the strict claim);
 *   descendantsQualified — every required root's protected content is accounted for: no unlabelled or
 *                        unreadable descendant, no truncated walk, no unresolvable link. A link that leads
 *                        outside the protection domain is DISCLOSED and named rather than silently counted,
 *                        because §7.1's measurement shows the label on a link does not protect its target.
 *
 * `descendantsQualified` is what admission requires. It is strictly stronger than `rootsVerified` and does not
 * pretend that a deliberately-unfollowed link was examined.
 *
 * @param {{ roots: readonly string[], world: string, verifyTrees?: boolean }} input
 * @returns {{ result: ReadFenceResult, trees: readonly TreeOutcome[], rootsVerified: boolean, treesVerified: boolean, descendantsQualified: boolean }}
 */
export function ensureReadFence(input) {
  const result = applyReadFence({ roots: input.roots, world: input.world });
  const outcomes = result.outcomes ?? [];
  const rootsVerified = result.supported && outcomes.length > 0 && outcomes.every((entry) => entry.verified);
  const trees = input.verifyTrees === false ? [] : outcomes.filter((entry) => entry.verified).map((entry) => verifyTree({ root: entry.path, protectedRoots: input.roots }));
  const treesVerified = trees.length > 0 && trees.every((entry) => entry.verified);
  /**
   * §7.2: THE QUALIFICATION THE ADMISSION GATE CONSUMES.
   *
   * An empty `trees` array is NOT a vacuous pass: when verification was explicitly disabled the qualification is
   * false, because "nobody looked" is not "everything is protected". When there are no verified outcomes the
   * qualification is likewise false — that is already covered by `rootsVerified`, but the descendant claim must
   * not depend on the caller checking two fields.
   */
  const descendantsQualified =
    trees.length > 0 &&
    trees.every((entry) => entry.admissionEligible === true) &&
    /** A truncated plan means a required root was never fully enumerated, so no content claim is possible. */
    (result.coverage === undefined || result.coverage.complete === true);
  return { result, trees, rootsVerified, treesVerified, descendantsQualified };
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
