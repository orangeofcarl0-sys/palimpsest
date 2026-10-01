// palimpsest-host-deployment/runtime — WINDOWS MANDATORY-INTEGRITY LABELS, READ AND WRITTEN CORRECTLY.
//
// WHY THIS MODULE EXISTS SEPARATELY. R1-H applied a MEDIUM + NO_READ_UP label and proved the read boundary
// works. That proof trusted two things this module no longer trusts:
//
//   1. It imported `koffi` from an absolute path inside the DSH installation, and reached the ACL calls
//      through a BUNDLED CHUNK whose `win32` resolver is aliased to the single letter `c` and is absent from
//      the package's `exports` map. That is an undocumented deep internal: a DSH update could move it and
//      the fence would fail at runtime. R1-HR binds the same calls through the DOCUMENTED seam instead —
//      `extendWin32ProcessBindings`, whose own declaration calls `advapi32` and `bind` "the shared stdcall
//      binder used by process extensions". No deep path, no letter alias, no `koffi` import of our own.
//
//   2. It trusted the WRITE's return code. Two write paths on this host were measured to report success
//      while changing nothing (a PowerShell ACL write that dropped its ACE, and an SDDL label that
//      vanished), so "the call returned 0" is not evidence that an object is protected. Every mutation here
//      is followed by a RE-READ and a full parse of the resulting mandatory ACE.
//
// THE LABEL ITSELF. A mandatory integrity label is one `SYSTEM_MANDATORY_LABEL_ACE` (type 17) in an
// object's SACL. Its access mask is not a permission set — it is a POLICY MASK:
//
//     1 = NO_WRITE_UP      2 = NO_READ_UP      4 = NO_EXECUTE_UP
//
// and the ACE's SID names the object's integrity level (S-1-16-<rid>: 4096 Low, 8192 Medium, 12288 High,
// 16384 System). Windows permits a subject to READ an object at a HIGHER level than itself (read-up is
// allowed by default), which is why the read boundary needs NO_READ_UP on the OBJECT rather than any change
// to the subject.
//
// THE PRESERVATION RULE (R1-HR §4). A fence that REPLACED an existing label would be a security regression:
// an object already carrying NO_WRITE_UP or NO_EXECUTE_UP would lose that protection the moment we added
// NO_READ_UP. So the effective policy is always `existingPolicy | NO_READ_UP`, and the integrity level is
// never lowered. Where no explicit label exists, the Windows baseline for a user-created object (Medium) is
// what gets written, with NO_READ_UP added — which weakens nothing, because a Low worker cannot write up to
// Medium in any case.
//
// PLAIN JAVASCRIPT. `host/**` is scanned by the architecture checker as JavaScript.

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * @typedef {{ readonly present: boolean, readonly integrityRid?: number, readonly integrityName?: string,
 *   readonly policyMask?: number, readonly aceFlags?: number, readonly aceType?: number,
 *   readonly policies?: readonly string[], readonly readable?: boolean }} MandatoryLabel
 * @typedef {{ readonly ok: boolean, readonly detail: string, readonly label?: MandatoryLabel }} LabelRead
 */

/* ------------------------------------------------------------------ the constants, named */

/** `SE_FILE_OBJECT` — the object type for a filesystem path. */
const SE_FILE_OBJECT = 1;
/** `LABEL_SECURITY_INFORMATION` — select the SACL (which is where a mandatory label lives). */
const LABEL_SECURITY_INFORMATION = 16;
/** `SYSTEM_MANDATORY_LABEL_ACE_TYPE`. */
const SYSTEM_MANDATORY_LABEL_ACE_TYPE = 17;
/** `OBJECT_INHERIT_ACE | CONTAINER_INHERIT_ACE` — so later children carry the same label. */
const ACE_FLAGS_INHERIT = 3;
/** The mandatory POLICY bits, by name, so a mask is never read as a bare number. */
export const MANDATORY_POLICIES = Object.freeze({ NO_WRITE_UP: 1, NO_READ_UP: 2, NO_EXECUTE_UP: 4 });
/** The integrity levels, by well-known SID type and RID. */
export const INTEGRITY_LEVELS = Object.freeze({ Low: 4096, Medium: 8192, High: 12288, System: 16384 });
/** `ACL_REVISION`. */
const ACL_REVISION = 2;
const ACL_HEADER_BYTES = 8;
/** `LMEM_FIXED | LMEM_ZEROINIT`. */
const LMEM_FIXED_ZEROINIT = 64;
/** The SID buffer the well-known-SID call fills (a 12-byte integrity SID fits with room to spare). */
const SID_BUFFER_BYTES = 68;
/** `SECURITY_MANDATORY_LABEL_AUTHORITY` — the S-1-16 identifier authority. */
const MANDATORY_LABEL_AUTHORITY = 16;

/* ------------------------------------------------------------------ the documented binding seam */

/**
 * The DSH contract this module depends on, pinned.
 *
 * The fence binds Win32 through `extendWin32ProcessBindings`, a PUBLIC export of
 * `@deepseek-ai/dsh-win32-process` whose declaration documents `advapi32` and `bind` as the seam for process
 * extensions. Two facts about that contract matter and are checked at startup rather than assumed:
 *   · the exported function must exist and return a merged table containing the generic bindings;
 *   · the injected context must carry a loaded `advapi32` and a `bind` function.
 *
 * A DSH whose seam differs fails closed here, with a named reason, instead of silently continuing to run a
 * worker without a boundary.
 */
export const DSH_CONTRACT = Object.freeze({
  package: '@deepseek-ai/dsh-win32-process',
  /** The exact version the fence was qualified against. */
  qualifiedVersion: '0.2.0-rc.2',
  /** The exported seam, and the two context members it must provide. */
  seam: 'extendWin32ProcessBindings',
  contextMembers: Object.freeze(['advapi32', 'bind']),
  /** The helper exports this module uses for pointer slots and decoding. */
  helpers: Object.freeze(['allocPtrSlot', 'allocUint32', 'decodePtr', 'decodeUint32', 'isNullPtr']),
});

/**
 * The FFI runtime, resolved as a DECLARED dependency of the seam package rather than from the global npm
 * root. `koffi` is listed in `@deepseek-ai/dsh-win32-process`'s own `dependencies`, so resolving it from
 * that package's entry point follows the declared graph — the same guarantee a normal `import` gets, and
 * not an accident of what happens to be installed globally.
 */
const FFI_RUNTIME = 'koffi';
/** The `koffi` version the seam package declares. A mismatch is drift, and drift fails closed. */
const FFI_RUNTIME_QUALIFIED = '3.1.1';

/** Where the contract is resolved from, in order. The DSH entry point is the reliable anchor. */
function resolutionBases() {
  /** @type {string[]} */
  const bases = [import.meta.url];
  const asUrl = (/** @type {string} */ p) => `file:///${p.replace(/\\/gu, '/')}`;
  const dshRoot = process.env.PALIMPSEST_DSH_ROOT?.trim();
  if (dshRoot !== undefined && dshRoot !== '') bases.unshift(asUrl(`${dshRoot}/node_modules/@deepseek-ai/dsh-win32-process/lib/index.js`));
  const entry = process.argv[1];
  if (typeof entry === 'string' && entry.length > 0) bases.unshift(asUrl(entry));
  return bases;
}

/** @type {{ api?: any, error?: string, contractVersion?: string, ffiVersion?: string } | undefined} */
let cached;

/**
 * Resolve the documented seam and the FFI runtime, then build the ACL binding table over it.
 *
 * @returns {{ api?: any, error?: string, contractVersion?: string, ffiVersion?: string }}
 */
export function win32LabelApi() {
  if (cached !== undefined) return cached;
  if (process.platform !== 'win32') {
    cached = { error: 'mandatory integrity labels are a Windows mechanism' };
    return cached;
  }
  /** @type {any} */
  let seamModule;
  let seamEntry;
  for (const base of resolutionBases()) {
    try {
      const require_ = createRequire(base);
      seamEntry = require_.resolve(DSH_CONTRACT.package);
      seamModule = require_(DSH_CONTRACT.package);
      break;
    } catch {
      /* try the next base */
    }
  }
  if (seamModule === undefined || seamEntry === undefined) {
    cached = { error: `the DSH binding seam (${DSH_CONTRACT.package}) could not be resolved; the read fence cannot install and the worker must not start unprotected` };
    return cached;
  }
  if (typeof seamModule[DSH_CONTRACT.seam] !== 'function') {
    cached = { error: `${DSH_CONTRACT.package} no longer exports ${DSH_CONTRACT.seam}(); the pinned DSH contract has drifted` };
    return cached;
  }
  for (const helper of DSH_CONTRACT.helpers) {
    if (typeof seamModule[helper] !== 'function') {
      cached = { error: `${DSH_CONTRACT.package} no longer exports the helper ${helper}(); the pinned DSH contract has drifted` };
      return cached;
    }
  }
  /**
   * The FFI runtime, resolved FROM THE SEAM PACKAGE — i.e. through its declared dependency graph. This is
   * the difference between "the platform happens to provide koffi" and "the platform guarantees koffi", and
   * §8 requires the second.
   */
  /** @type {any} */
  let koffi;
  let ffiVersion = 'unknown';
  try {
    const seamRequire = createRequire(seamEntry);
    koffi = seamRequire(FFI_RUNTIME);
    /**
     * The version, read from the resolved manifest FILE rather than through `require("<pkg>/package.json")`:
     * koffi's `exports` map does not expose its manifest, so the subpath form fails with
     * ERR_PACKAGE_PATH_NOT_EXPORTED while the file is plainly there. `resolve` gives the package's entry
     * point, and the manifest sits one directory up.
     */
    try {
      const entryPath = seamRequire.resolve(FFI_RUNTIME);
      const manifest = `${entryPath.slice(0, entryPath.lastIndexOf(FFI_RUNTIME) + FFI_RUNTIME.length)}/package.json`;
      ffiVersion = String(JSON.parse(readFileSync(manifest, 'utf8')).version);
    } catch {
      /* reported as unknown */
    }
  } catch {
    cached = { error: `${DSH_CONTRACT.package} declares ${FFI_RUNTIME} but it does not resolve from that package; the Win32 ABI seam is not usable` };
    return cached;
  }
  for (const member of ['alloc', 'decode', 'encode', 'pointer']) {
    if (typeof koffi?.[member] !== 'function') {
      cached = { error: `the FFI runtime is missing ${member}(); the Win32 ABI seam has drifted` };
      return cached;
    }
  }
  let contractVersion = 'unknown';
  try {
    contractVersion = String(createRequire(seamEntry)(`${DSH_CONTRACT.package}/package.json`).version);
  } catch {
    /* reported as unknown */
  }
  /** @type {any} */
  let api;
  try {
    api = seamModule[DSH_CONTRACT.seam]((/** @type {any} */ context) => {
      // A seam whose context lacks these cannot express an ACL call, and silently returning a partial table
      // would produce a fence that does nothing. Fail closed, by name.
      for (const member of DSH_CONTRACT.contextMembers) {
        if (context?.[member] === undefined) throw new Error(`the DSH binding seam did not provide "${member}"`);
      }
      const { advapi32, kernel32, bind } = context;
      return {
        // `str16` is load-bearing: the wide entry points take UTF-16, and a plain `str` is ANSI, which makes
        // every call fail with ERROR_FILE_NOT_FOUND (2) on a path that demonstrably exists.
        createWellKnownSid: bind(advapi32, 'CreateWellKnownSid', 'int', ['int', 'void*', 'void*', 'void*']),
        getLengthSid: bind(advapi32, 'GetLengthSid', 'uint32', ['void*']),
        initializeAcl: bind(advapi32, 'InitializeAcl', 'int', ['void*', 'uint32', 'uint32']),
        addMandatoryAce: bind(advapi32, 'AddMandatoryAce', 'int', ['void*', 'uint32', 'uint32', 'uint32', 'void*']),
        setNamedSecurityInfoW: bind(advapi32, 'SetNamedSecurityInfoW', 'uint32', ['str16', 'int', 'uint32', 'void*', 'void*', 'void*', 'void*']),
        getNamedSecurityInfoW: bind(advapi32, 'GetNamedSecurityInfoW', 'uint32', ['str16', 'int', 'uint32', 'void*', 'void*', 'void*', 'void*', 'void*']),
        // `LocalFree` lives in kernel32; a context that omits kernel32 leaves descriptors to be released by
        // the process, which is untidy but not unsafe, so it is optional rather than a drift failure.
        ...(kernel32 === undefined ? {} : { localFree: bind(kernel32, 'LocalFree', 'void*', ['void*']) }),
      };
    });
  } catch (error) {
    cached = { error: `the DSH binding seam refused to build the ACL table: ${error instanceof Error ? error.message : String(error)}` };
    return cached;
  }
  for (const required of ['createWellKnownSid', 'getLengthSid', 'initializeAcl', 'addMandatoryAce', 'setNamedSecurityInfoW', 'getNamedSecurityInfoW']) {
    if (typeof api?.[required] !== 'function') {
      cached = { error: `the ACL binding table is missing ${required}; the DSH Win32 ABI seam has drifted` };
      return cached;
    }
  }
  /**
   * One table for the callers below: the Win32 calls from the seam, plus the pointer/decode helpers from the
   * FFI runtime. Merging them here keeps every consumer on a single surface, so a caller cannot accidentally
   * reach for a raw koffi function and bypass the drift checks above.
   *
   * `decode` keeps koffi's own arity rather than normalizing it: the two call shapes it accepts —
   * `decode(pointer, type)` and `decode(pointer, offset, type)` — are distinguished by the runtime, and a
   * wrapper that guessed wrong reads a field at the wrong offset, which in native memory is a crash rather
   * than a wrong answer.
   */
  cached = {
    api: {
      ...api,
      alloc: (/** @type {string} */ type, /** @type {number} */ count) => koffi.alloc(type, count),
      decode: (/** @type {unknown} */ ...decodeArgs) => koffi.decode(...decodeArgs),
      encode: (/** @type {unknown} */ ...encodeArgs) => koffi.encode(...encodeArgs),
      pointer: (/** @type {string} */ type) => koffi.pointer(type),
      isNullPtr: (/** @type {unknown} */ value) => value === null || value === undefined || value === 0n,
    },
    contractVersion,
    ffiVersion,
  };
  return cached;
}

/* ------------------------------------------------------------------ reading a label */

/**
 * Read and PARSE the mandatory label on one path.
 *
 * `readable: false` means the descriptor could not be read at all — a different fact from "no label exists",
 * and the two are never collapsed: a caller that treated an unreadable descriptor as "no label" would
 * rewrite a label it never saw, which is the preservation bug §4 exists to prevent.
 *
 * @param {any} api
 * @param {string} path
 * @returns {LabelRead}
 */
export function readMandatoryLabel(api, path) {
  const buffers = allocDescriptorSlots(api);
  if (buffers === undefined) return { ok: false, detail: 'the ACL binding table cannot allocate descriptor slots' };
  const { owner, group, dacl, sacl, descriptor, free } = buffers;
  const rc = api.getNamedSecurityInfoW(path, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, owner, group, dacl, sacl, descriptor);
  if (rc !== 0) {
    free();
    return { ok: true, label: { present: false, readable: false }, detail: `GetNamedSecurityInfoW returned ${String(rc)}` };
  }
  const labelAcl = api.decode(sacl, api.pointer('void'));
  const parsed = parseLabelAcl(api, labelAcl);
  free();
  return { ok: true, label: parsed, detail: parsed.present ? describeLabel(parsed) : 'no mandatory label on this object' };
}

/**
 * Allocate the five out-parameter slots plus a disposer, or `undefined` when the table cannot.
 *
 * THE DISPOSER FREES THE DESCRIPTOR, NOT ITS PARTS. `GetNamedSecurityInfoW` returns a SELF-RELATIVE
 * security descriptor whose owner/group/DACL/SACL pointers are INTERIOR addresses into it. `LocalFree`
 * accepts only the base address it originally returned, so freeing an interior pointer corrupts the heap —
 * measured here as a silent native crash that ended the process with no exception. One free, of the
 * descriptor.
 */
function allocDescriptorSlots(api) {
  if (typeof api.alloc !== 'function' || typeof api.decode !== 'function' || typeof api.pointer !== 'function') return undefined;
  const pointerType = api.pointer('void');
  const buffers = [0, 1, 2, 3, 4].map(() => api.alloc('uint8', 8));
  const [owner, group, dacl, sacl, descriptor] = buffers;
  return {
    owner,
    group,
    dacl,
    sacl,
    descriptor,
    free: () => {
      if (typeof api.localFree !== 'function') return;
      const base = api.decode(descriptor, pointerType);
      if (base === null || base === undefined || base === 0n) return;
      try {
        api.localFree(base);
      } catch {
        /* the descriptor may already be released */
      }
    },
  };
}

/**
 * Parse the FIRST `SYSTEM_MANDATORY_LABEL_ACE` out of a label ACL.
 *
 * The layout is read from the shipped parser this project already depends on behaviourally: the ACL header
 * carries `AclSize` at offset 2 and `AceCount` at offset 4, the first ACE begins at offset 8, and each ACE
 * carries `AceType`@0, `AceFlags`@1, `AceSize`@2, `AccessMask`@4, `SidStart`@8.
 *
 * Every bound is checked before it is used. A malformed ACL returns `present: false` with `readable: true`
 * rather than throwing, because the caller's next step is to WRITE a correct label — and a parser that threw
 * on a strange descriptor would leave the object unfenced.
 *
 * @param {any} api
 * @param {unknown} labelAcl
 * @returns {MandatoryLabel}
 */
export function parseLabelAcl(api, labelAcl) {
  if (labelAcl === null || labelAcl === undefined || labelAcl === 0n) return { present: false, readable: true };
  if (typeof api.decode !== 'function') return { present: false, readable: false };
  /**
   * koffi's `decode(pointer, offset, type)` reads a field out of native memory. The reads are wrapped because
   * a truncated or foreign ACL could make one throw, and the caller's next step is to WRITE a correct label —
   * a parser that threw would leave the object unfenced, which is the opposite of failing closed.
   */
  const field = (/** @type {number} */ offset, /** @type {string} */ type) => {
    try {
      return Number(api.decode(labelAcl, offset, type));
    } catch {
      return Number.NaN;
    }
  };
  const read8 = (/** @type {number} */ offset) => field(offset, 'uint8');
  const read16 = (/** @type {number} */ offset) => field(offset, 'uint16');
  const read32 = (/** @type {number} */ offset) => field(offset, 'uint32');
  const aclSize = read16(2);
  const aceCount = read16(4);
  if (!Number.isFinite(aclSize) || aclSize < ACL_HEADER_BYTES || aclSize > 1_048_576) return { present: false, readable: false };
  if (!Number.isFinite(aceCount) || aceCount < 1 || aceCount > 4096) return { present: false, readable: true };
  let offset = ACL_HEADER_BYTES;
  for (let index = 0; index < aceCount; index += 1) {
    if (offset + 8 > aclSize) return { present: false, readable: false };
    const aceType = read8(offset);
    const aceFlags = read8(offset + 1);
    const aceSize = read16(offset + 2);
    if (!Number.isFinite(aceSize) || aceSize < 8 || offset + aceSize > aclSize) return { present: false, readable: false };
    if (aceType === SYSTEM_MANDATORY_LABEL_ACE_TYPE) {
      const policyMask = read32(offset + 4);
      /**
       * The ACE's SID begins at offset+8. A SID is: Revision@0 (1 byte), SubAuthorityCount@1 (1 byte),
       * IdentifierAuthority@2 (SIX bytes, big-endian), then SubAuthority[]@8 (4 bytes each).
       *
       * The authority is read byte-wise because it is a 6-byte BIG-ENDIAN integer and there is no 48-bit
       * scalar to decode it into; reading it as a uint32 at offset 2 would take the high four bytes and
       * report 0 for the integrity authority (16 = 0x10, which lives in the LAST byte).
       */
      const sidAt = offset + 8;
      let authority = 0;
      for (let byte = 0; byte < 6; byte += 1) authority = authority * 256 + read8(sidAt + 2 + byte);
      const subAuthorityCount = read8(sidAt + 1);
      const rid = subAuthorityCount >= 1 ? read32(sidAt + 8) : undefined;
      const named = authority === MANDATORY_LABEL_AUTHORITY ? Object.entries(INTEGRITY_LEVELS).find(([, value]) => value === rid) : undefined;
      return {
        present: true,
        readable: true,
        aceType,
        aceFlags,
        policyMask,
        integrityRid: rid,
        integrityName: named === undefined ? `S-1-${String(authority)}-${String(rid)}` : named[0],
        policies: policiesOf(policyMask),
      };
    }
    offset += aceSize;
  }
  return { present: false, readable: true };
}

/** Name the policy bits in a mask, so evidence reads as policy rather than as an integer. */
export function policiesOf(/** @type {number} */ mask) {
  /** @type {string[]} */
  const names = [];
  for (const [name, bit] of Object.entries(MANDATORY_POLICIES)) if ((mask & bit) !== 0) names.push(name);
  const known = Object.values(MANDATORY_POLICIES).reduce((accumulator, bit) => accumulator | bit, 0);
  if ((mask & ~known) !== 0) names.push(`UNKNOWN_BITS(0x${(mask & ~known).toString(16)})`);
  return names;
}

/** One-line description of a parsed label. */
function describeLabel(/** @type {MandatoryLabel} */ label) {
  return `integrity=${String(label.integrityName ?? label.integrityRid)} policies=[${(label.policies ?? []).join('|')}] flags=${String(label.aceFlags)} mask=0x${(label.policyMask ?? 0).toString(16)}`;
}

/**
 * Report the pinned contract and what was actually resolved, so evidence names the DSH it ran against and a
 * reviewer can see the difference between the qualified version and the installed one.
 *
 * `drifted` is a first-class field rather than a warning: a caller that requires a boundary must be able to
 * refuse to run on a host whose Win32 ABI seam is not the one this fence was qualified against.
 */
export function dshCompatibilityReport() {
  const resolved = win32LabelApi();
  const resolvedVersion = resolved.contractVersion ?? 'unresolved';
  const ffiResolved = resolved.ffiVersion ?? 'unresolved';
  const versionMatches = resolvedVersion === DSH_CONTRACT.qualifiedVersion;
  const ffiMatches = ffiResolved === FFI_RUNTIME_QUALIFIED;
  return {
    package: DSH_CONTRACT.package,
    qualifiedVersion: DSH_CONTRACT.qualifiedVersion,
    resolvedVersion,
    seam: DSH_CONTRACT.seam,
    ffi: { package: FFI_RUNTIME, qualifiedVersion: FFI_RUNTIME_QUALIFIED, resolvedVersion: ffiResolved },
    usable: resolved.error === undefined,
    drifted: resolved.error === undefined && !(versionMatches && ffiMatches),
    versionMatches,
    ffiMatches,
    ...(resolved.error === undefined ? {} : { error: resolved.error }),
  };
}

/* ------------------------------------------------------------------ writing a label */

/**
 * Compute the label to write, given what is already there.
 *
 * THIS IS THE PRESERVATION RULE, expressed as a function so it can be unit-tested without touching a
 * filesystem:
 *   · the integrity level is never LOWERED — an existing level at or above Medium is kept, and a missing or
 *     lower one becomes Medium (the Windows baseline for a user-created object);
 *   · the policy mask is `existing | NO_READ_UP`, so NO_WRITE_UP and NO_EXECUTE_UP already present survive.
 *
 * @param {MandatoryLabel | undefined} existing
 * @returns {{ integrityRid: number, integrityName: string, policyMask: number, raisedIntegrity: boolean, preserved: readonly string[] }}
 */
export function planLabel(existing) {
  const currentRid = existing?.present === true && typeof existing.integrityRid === 'number' ? existing.integrityRid : 0;
  const keep = currentRid >= INTEGRITY_LEVELS.Medium ? currentRid : INTEGRITY_LEVELS.Medium;
  const name = Object.entries(INTEGRITY_LEVELS).find(([, value]) => value === keep)?.[0] ?? `S-1-16-${String(keep)}`;
  const existingMask = existing?.present === true && typeof existing.policyMask === 'number' ? existing.policyMask : 0;
  return {
    integrityRid: keep,
    integrityName: name,
    policyMask: existingMask | MANDATORY_POLICIES.NO_READ_UP,
    raisedIntegrity: currentRid !== 0 && currentRid < INTEGRITY_LEVELS.Medium,
    preserved: policiesOf(existingMask),
  };
}

/**
 * Write the planned label and then VERIFY it by re-reading and parsing the object's descriptor.
 *
 * A `SetNamedSecurityInfoW` that returns 0 has been measured, on this host, to leave a descriptor unchanged
 * (the SDDL route) or to drop an ACE (the PowerShell route). So the return code is recorded and then
 * DISCARDED as evidence: what decides `verified` is the parsed label the kernel reports afterwards.
 *
 * @param {any} api
 * @param {string} path
 * @param {MandatoryLabel | undefined} existing
 * @returns {{ applied: boolean, verified: boolean, detail: string, label?: MandatoryLabel, planned?: ReturnType<typeof planLabel> }}
 */
export function writeAndVerifyLabel(api, path, existing) {
  const planned = planLabel(existing);
  const sid = wellKnownIntegritySid(api, planned.integrityRid);
  if (sid === undefined) return { applied: false, verified: false, detail: `CreateWellKnownSid could not produce an integrity SID for RID ${String(planned.integrityRid)}` };
  const sidLength = api.getLengthSid(sid);
  if (!Number.isFinite(sidLength) || sidLength <= 0) return { applied: false, verified: false, detail: 'GetLengthSid returned no length' };
  const aclLength = 16 + sidLength;
  const acl = api.alloc('uint8', aclLength);
  if (api.initializeAcl(acl, aclLength, ACL_REVISION) === 0) return { applied: false, verified: false, detail: 'InitializeAcl failed' };
  if (api.addMandatoryAce(acl, ACL_REVISION, ACE_FLAGS_INHERIT, planned.policyMask, sid) === 0) {
    return { applied: false, verified: false, detail: `AddMandatoryAce(policy=0x${planned.policyMask.toString(16)}) failed` };
  }
  const written = api.setNamedSecurityInfoW(path, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, null, null, null, acl);
  const after = readMandatoryLabel(api, path);
  if (!after.ok) return { applied: written === 0, verified: false, detail: `written, but the verifying read failed: ${after.detail}`, planned };
  const label = after.label;
  const verified = label?.present === true && label.integrityRid === planned.integrityRid && label.policyMask === planned.policyMask;
  return {
    applied: written === 0,
    verified,
    label,
    planned,
    detail: verified
      ? `verified by readback: ${describeLabel(label)}`
      : `the write returned ${String(written)} but the effective label is ${label?.present === true ? describeLabel(label) : 'absent'} — expected integrity=${planned.integrityName} mask=0x${planned.policyMask.toString(16)}`,
  };
}

/** Create one well-known integrity SID by RID. */
function wellKnownIntegritySid(api, rid) {
  // `CreateWellKnownSid` takes a WELL_KNOWN_SID_TYPE, not a RID; the four integrity types are 66..69.
  const type = { 4096: 66, 8192: 67, 12288: 68, 16384: 69 }[rid];
  if (type === undefined) return undefined;
  const buffer = api.alloc('uint8', SID_BUFFER_BYTES);
  const sizeSlot = api.alloc('uint32', 1);
  api.encode(sizeSlot, 'uint32', SID_BUFFER_BYTES);
  if (api.createWellKnownSid(type, null, buffer, sizeSlot) === 0) return undefined;
  return buffer;
}

/**
 * Remove ONLY the read fence this module installed, restoring the policy mask to what it was before.
 *
 * Used by the uninstall/repair path (§3). It is deliberately conservative: it rewrites the label with the
 * original policy bits, and when the original mask was empty and no explicit label existed, it writes the
 * baseline Medium label rather than deleting the SACL entry — because an absent label is not the same as a
 * Medium/no-policy label, and silently deleting one could widen access on an object someone else labelled.
 *
 * @param {any} api
 * @param {string} path
 * @param {{ integrityRid: number, policyMask: number }} original
 * @returns {{ restored: boolean, detail: string }}
 */
export function restoreLabel(api, path, original) {
  const sid = wellKnownIntegritySid(api, original.integrityRid);
  if (sid === undefined) return { restored: false, detail: 'the original integrity level is not a well-known SID' };
  const sidLength = api.getLengthSid(sid);
  const aclLength = 16 + sidLength;
  const acl = api.alloc('uint8', aclLength);
  if (api.initializeAcl(acl, aclLength, ACL_REVISION) === 0) return { restored: false, detail: 'InitializeAcl failed' };
  if (api.addMandatoryAce(acl, ACL_REVISION, ACE_FLAGS_INHERIT, original.policyMask, sid) === 0) return { restored: false, detail: 'AddMandatoryAce failed' };
  const written = api.setNamedSecurityInfoW(path, SE_FILE_OBJECT, LABEL_SECURITY_INFORMATION, null, null, null, acl);
  const after = readMandatoryLabel(api, path);
  const restored = written === 0 && after.ok && after.label?.present === true && after.label.policyMask === original.policyMask && after.label.integrityRid === original.integrityRid;
  return { restored, detail: restored ? `restored: ${describeLabel(after.label)}` : `restore returned ${String(written)} but readback disagrees: ${after.detail}` };
}

/** Exposed so a caller can build an ACE without re-deriving the layout, and so tests can pin it. */
export const LABEL_LAYOUT = Object.freeze({
  aceType: SYSTEM_MANDATORY_LABEL_ACE_TYPE,
  aceFlagsInherit: ACE_FLAGS_INHERIT,
  aclHeaderBytes: ACL_HEADER_BYTES,
  aclRevision: ACL_REVISION,
  labelSecurityInformation: LABEL_SECURITY_INFORMATION,
  seFileObject: SE_FILE_OBJECT,
});
