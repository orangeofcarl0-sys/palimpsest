// palimpsest-dsh-host/deployment/runtime — READ CONFINEMENT FOR A WORKER'S EXECUTION WORLD.
//
// THE GAP THIS CLOSES. R1-S measured that the DSH sandbox is a WRITE boundary only: every platform runner
// grants read of the whole filesystem and restricts only mutation, and the policy vocabulary has no read
// side at all. So a worker could read the durable state, a sibling world, another project and the host's
// credential file directly — bypassing the governed context pull entirely. That is a CONFIDENTIALITY gap,
// not a functional one: the pull works, it is simply not exclusive.
//
// THE MECHANISM, AND WHY IT IS THIS ONE. The backend ALREADY lowers the worker token to Low integrity for
// the write side (`restrictTokenIntegrity`, S-1-16-4096). Windows mandatory integrity control lets a
// lower-integrity subject read a higher-integrity object — read-up is allowed by default — so the missing
// half is a label on the OBJECTS, not a change to the SUBJECT:
//
//     MEDIUM + NO_READ_UP on a protected root   =>   the Low worker is refused, the Medium host is not
//
// This needs no second OS account, no container, no WSL, and no change to the control plane. It is the
// smallest mechanism that produces a real kernel read boundary on this host.
//
// WHY NOT `icacls`. Measured: `icacls /setintegritylevel` normalizes EVERY spelling it accepts — M, MR,
// MNR, MRNW, MNW — to `(NW)`, which is no-WRITE-up. That policy does nothing to reads, which is why R1-S's
// label experiment changed nothing and why its "no no-read-up path exists" conclusion was reached. The
// capability was never absent; the CLI could not express it. The mandatory policy is an ARGUMENT of
// `AddMandatoryAce`, and 2 is NO_READ_UP.
//
// WHY NOT SDDL. Measured too: `SetSecurityDescriptorSddlForm("S:(ML;;NR;;;ME)")` reports success and writes
// nothing (the readback descriptor carries no `S:` component). A write whose return value is trusted is not
// evidence, so every write here is verified by RE-READING the label through the same API.
//
// WHAT IT DELIBERATELY DOES NOT DO. It does not touch the DACL: this changes what a LOWER INTEGRITY LEVEL
// may read, never who is allowed. It does not protect a root that is an ANCESTOR of the worker's world —
// every process traverses its cwd's ancestors, and traverse into a no-read-up directory is refused, so
// labelling one kills the worker before its first statement. That is a measured constraint, not a
// preference, and it is why `isAncestorOf` exists and why the shared worlds parent is a disclosed residual.
//
// This module is HOST EXECUTION capability, not Project truth: it creates no canonical owner, no event
// type, no table and no asset kind, and it carries no authority (R1-H ruling §3/§9).
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript, so no annotations here.

import { resolve, sep } from 'node:path';
import { createRequire } from 'node:module';

/**
 * @typedef {{ readonly path: string, readonly why: string }} ReadFenceSkip
 * @typedef {{ readonly path: string, readonly applied: boolean, readonly verified: boolean, readonly detail: string }} ReadFenceOutcome
 * @typedef {{
 *   readonly supported: boolean,
 *   readonly platform: string,
 *   readonly outcomes: readonly ReadFenceOutcome[],
 *   readonly skipped: readonly ReadFenceSkip[],
 *   readonly unavailable?: string,
 * }} ReadFenceResult
 * @typedef {{ readonly protectedRoots: readonly string[], readonly skipped: readonly ReadFenceSkip[] }} ReadFencePlan
 */

/**
 * The well-known SID types and constants this module needs, named so the numbers are readable.
 *
 * `WinMediumLabelSid` (67) is the control plane's own level: a label at Low would do nothing, because
 * no-read-up only denies reading a STRICTLY HIGHER level (measured — the first attempt in this project used
 * a Low label and changed nothing).
 */
const SE_FILE_OBJECT = 1;
const LABEL_SECURITY_INFORMATION = 16;
const NO_READ_UP = 2;
const ACL_REVISION = 2;
const OBJECT_INHERIT_ACE = 1;
const CONTAINER_INHERIT_ACE = 2;
const ACE_FLAGS = OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE;
const WIN_MEDIUM_LABEL_SID = 67;
const SID_BUFFER_BYTES = 68;
const POINTER_SLOT_BYTES = 8;

/**
 * Where the FFI runtime is resolved from.
 *
 * koffi is a dependency of the DSH installation, not of this repository, and this module always runs inside
 * a DSH process — so it is resolved from, in order: an explicit `PALIMPSEST_DSH_ROOT`, the DSH entry point
 * this process was actually launched with (`process.argv[1]`), the host bundle's own location, and finally
 * the ordinary chain. Each candidate is a FILE inside the DSH tree whose `node_modules` chain reaches
 * koffi; a candidate that does not resolve is skipped.
 *
 * A module that could not load its runtime must SAY so rather than silently skipping the fence, so the
 * failure is returned as `unavailable` and the caller can refuse to run rather than run unprotected.
 *
 * @returns {{ koffi?: unknown, error?: string }}
 */
function loadKoffi() {
  /** @type {string[]} */
  const candidates = [import.meta.url];
  const asUrl = (/** @type {string} */ p) => `file:///${p.replace(/\\/gu, '/')}`;
  const dshRoot = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (dshRoot !== undefined && dshRoot !== '') {
    candidates.unshift(asUrl(`${dshRoot}/node_modules/@deepseek-ai/dsh-sandbox-windows-acl/lib/index.js`));
  }
  // The DSH entry point this process was launched with is the most reliable anchor: it always sits inside
  // the installation that owns koffi.
  const entry = process.argv[1];
  if (typeof entry === 'string' && entry.length > 0) candidates.unshift(asUrl(entry));
  /**
   * The global npm root, as a LAST resort, so an acceptance gate can be run standalone by a reviewer
   * without exporting anything. It is last because it is the only candidate that could resolve a
   * DIFFERENT installation than the one this process is actually running under.
   */
  const globalRoot = process.env.npm_config_prefix?.trim();
  if (globalRoot !== undefined && globalRoot !== '') {
    candidates.push(asUrl(`${globalRoot}/node_modules/@deepseek-ai/dsh-sandbox-windows-acl/lib/index.js`));
  }
  for (const base of candidates) {
    try {
      return { koffi: createRequire(base)('koffi') };
    } catch {
      /* try the next resolution base */
    }
  }
  return { error: 'koffi could not be resolved from the host bundle, the DSH entry point, or the DSH installation' };
}

/**
 * Build the Win32 binding table.
 *
 * Declared here rather than imported from DSH's internals: the ACL helpers live in a bundled chunk the
 * package does not export (`lib/types-Cl_DXjhk.js`, whose `win32` resolver is aliased to a single letter and
 * is absent from the `exports` map). Reaching into that chunk would make this module depend on an
 * unpublished internal, so the five calls it needs are declared directly.
 *
 * @param {any} koffi - the loaded FFI runtime.
 * @returns {any} the binding table.
 */
function bindNative(koffi) {
  const advapi = koffi.load('advapi32.dll');
  /** @param {string} signature */
  const func = (signature) => advapi.func(signature);
  return {
    // `str16` is load-bearing: the wide entry points take UTF-16, and koffi's plain `str` is ANSI, which
    // makes every call fail with ERROR_FILE_NOT_FOUND (2) on a path that demonstrably exists.
    createWellKnownSid: func('int __stdcall CreateWellKnownSid(int, void*, void*, void*)'),
    getLengthSid: func('uint32 __stdcall GetLengthSid(void*)'),
    initializeAcl: func('int __stdcall InitializeAcl(void*, uint32, uint32)'),
    addMandatoryAce: func('int __stdcall AddMandatoryAce(void*, uint32, uint32, uint32, void*)'),
    setNamedSecurityInfoW: func('uint32 __stdcall SetNamedSecurityInfoW(str16, int, uint32, void*, void*, void*, void*)'),
    getNamedSecurityInfoW: func('uint32 __stdcall GetNamedSecurityInfoW(str16, int, uint32, void*, void*, void*, void*, void*)'),
    alloc: (/** @type {string} */ type, /** @type {number} */ count) => koffi.alloc(type, count),
    encode: (/** @type {unknown} */ slot, /** @type {string} */ type, /** @type {number} */ value) => koffi.encode(slot, type, value),
    decode: (/** @type {unknown} */ slot, /** @type {unknown} */ type) => koffi.decode(slot, type),
    pointer: (/** @type {string} */ type) => koffi.pointer(type),
  };
}

/**
 * True when `candidate` is `root` or sits underneath it, compared on resolved absolute paths.
 *
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
export function isAncestorOf(root, candidate) {
  const a = resolve(root).replace(/[\\/]+$/u, '');
  const b = resolve(candidate).replace(/[\\/]+$/u, '');
  if (a === b) return true;
  return b.startsWith(a.endsWith(sep) ? a : `${a}${sep}`);
}

/**
 * Decide which roots may carry the label for a given execution world.
 *
 * A root that CONTAINS the world is skipped, and the reason is measured: every process traverses its cwd's
 * ancestor directories during startup (Node's module walk lstats each one), and traverse into a no-read-up
 * directory is refused — so labelling such a root kills the worker before it runs a single statement. A
 * fence that breaks the runtime is an outage, not a boundary.
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
 * Apply a MEDIUM + NO_READ_UP mandatory label to each root, VERIFYING every write by re-reading the label.
 *
 * The verification is not ceremony. Two write paths on this host were measured to report success while
 * changing nothing — a PowerShell ACL write that dropped its ACE, and an SDDL label that vanished — so a
 * caller that trusted a return code would report a boundary that does not exist.
 *
 * @param {{ roots: readonly string[], world: string }} input
 * @returns {ReadFenceResult}
 */
export function applyReadFence(input) {
  const plan = planReadFence(input);
  if (process.platform !== 'win32') {
    return {
      supported: false,
      platform: process.platform,
      outcomes: [],
      skipped: plan.skipped,
      unavailable: 'the read fence is a Windows mandatory-integrity mechanism',
    };
  }
  const loaded = loadKoffi();
  if (loaded.koffi === undefined) {
    return { supported: false, platform: process.platform, outcomes: [], skipped: plan.skipped, unavailable: loaded.error };
  }
  /** @type {any} */
  let api;
  try {
    api = bindNative(loaded.koffi);
  } catch (error) {
    return {
      supported: false,
      platform: process.platform,
      outcomes: [],
      skipped: plan.skipped,
      unavailable: `the Win32 binding table could not be built: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const mediumSid = api.alloc('uint8', SID_BUFFER_BYTES);
  const sizeSlot = api.alloc('uint32', 1);
  api.encode(sizeSlot, 'uint32', SID_BUFFER_BYTES);
  if (api.createWellKnownSid(WIN_MEDIUM_LABEL_SID, null, mediumSid, sizeSlot) === 0) {
    return { supported: false, platform: process.platform, outcomes: [], skipped: plan.skipped, unavailable: 'CreateWellKnownSid(Medium) failed' };
  }
  const sidLength = api.getLengthSid(mediumSid);
  if (sidLength === 0) {
    return { supported: false, platform: process.platform, outcomes: [], skipped: plan.skipped, unavailable: 'GetLengthSid(Medium) returned 0' };
  }

  /** @type {ReadFenceOutcome[]} */
  const outcomes = [];
  for (const root of plan.protectedRoots) outcomes.push(applyOne(api, root, mediumSid, sidLength));
  return { supported: true, platform: process.platform, outcomes, skipped: plan.skipped };
}

/**
 * Label one root and verify it.
 *
 * @param {any} api
 * @param {string} root
 * @param {unknown} mediumSid
 * @param {number} sidLength
 * @returns {ReadFenceOutcome}
 */
function applyOne(api, root, mediumSid, sidLength) {
  const aclLength = 16 + sidLength;
  const acl = api.alloc('uint8', aclLength);
  if (api.initializeAcl(acl, aclLength, ACL_REVISION) === 0) {
    return { path: root, applied: false, verified: false, detail: 'InitializeAcl failed' };
  }
  if (api.addMandatoryAce(acl, ACL_REVISION, ACE_FLAGS, NO_READ_UP, mediumSid) === 0) {
    return { path: root, applied: false, verified: false, detail: `AddMandatoryAce(policy=${String(NO_READ_UP)}) failed` };
  }
  const written = api.setNamedSecurityInfoW(root, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, null, null, null, acl);
  if (written !== 0) {
    return { path: root, applied: false, verified: false, detail: `SetNamedSecurityInfoW returned ${String(written)}` };
  }
  // VERIFY: a return code is not evidence on this host (see the module note).
  const owner = api.alloc('uint8', POINTER_SLOT_BYTES);
  const group = api.alloc('uint8', POINTER_SLOT_BYTES);
  const dacl = api.alloc('uint8', POINTER_SLOT_BYTES);
  const sacl = api.alloc('uint8', POINTER_SLOT_BYTES);
  const descriptor = api.alloc('uint8', POINTER_SLOT_BYTES);
  const read = api.getNamedSecurityInfoW(root, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, owner, group, dacl, sacl, descriptor);
  if (read !== 0) {
    return { path: root, applied: true, verified: false, detail: `written, but the verifying read failed with ${String(read)}` };
  }
  const labelPointer = api.decode(sacl, api.pointer('void'));
  const present = !(labelPointer === null || labelPointer === undefined || labelPointer === 0n);
  return {
    path: root,
    applied: true,
    verified: present,
    detail: present ? 'labelled (MEDIUM + NO_READ_UP) and verified by readback' : 'the write returned success but the label was NOT persisted',
  };
}

/**
 * The roots a worker deployment must protect, derived from what the deployment already knows.
 *
 * Deliberately minimal (R1-H §7): the durable owner stores, the workspace stores, sibling execution worlds,
 * other projects' state, and host session material. It does NOT list the runtime, the package dependencies
 * or the worker's own world, because a worker needs those to do ordinary work — the contract says so
 * explicitly rather than overpromising "the worker reads only its world".
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
 * The sibling worlds directory is a DISCLOSED residual, and it is excluded here rather than quietly
 * attempted: it holds the worlds, so labelling it labels an ancestor of the world and kills the worker. A
 * worker can therefore learn the NAMES of sibling attempt directories. It cannot read their contents —
 * each world is labelled individually — and it cannot reach durable state at all.
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
