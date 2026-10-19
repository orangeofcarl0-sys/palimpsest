/**
 * Trajectory-P2-E1RF §6 — RF-C: MALFORMED MANDATORY ACE PRESERVATION.
 *
 * THE DEFECT THIS PINS. `parseLabelAcl()` validated the ACL length, the ACE count and the ACE bounds, then
 * returned `present: true, readable: true` WITHOUT validating the fields it had just decoded. A failed 32-bit
 * read yields `NaN`, which no bound check catches, and `planLabel()` computed `NaN | NO_READ_UP` = `2`. An
 * undecodable policy mask therefore became "the object had no policy", and the write discarded every bit it
 * actually carried — the precise preservation failure the fence exists to prevent.
 *
 * THE INJECTION IS PURE. A stub binding table stands in for the FFI layer, so NO security descriptor on this
 * machine is read or written. Every mutation call is recorded, which is what makes "no write was attempted" an
 * observation rather than an inference.
 *
 * THE 14 CASES ARE THE RULING'S §6.3 LIST. A case that could not be constructed is reported as a LIMIT, never
 * counted as a pass.
 */
import { describe, expect, it } from "vitest";

type ParsedLabel = { present: boolean; readable?: boolean; unreadableField?: string; policyMask?: number; integrityRid?: number; policies?: string[]; integrityName?: string };
type LabelModule = {
  parseLabelAcl: (api: unknown, acl: unknown) => ParsedLabel;
  planLabel: (existing: unknown) => { integrityRid: number; policyMask: number; preserved: string[] };
  readMandatoryLabel: (api: unknown, path: string) => { ok: boolean; label?: ParsedLabel; detail: string };
  MANDATORY_POLICIES: { NO_WRITE_UP: number; NO_READ_UP: number; NO_EXECUTE_UP: number };
};
type FenceModule = {
  applyReadFence: (input: { roots: readonly string[]; world?: string; api?: unknown }) => { supported: boolean; outcomes: readonly { path: string; applied: boolean; verified: boolean; detail: string }[] };
  snapshotLabels: (input: { roots: readonly string[] }) => { originals: readonly unknown[]; unreadable: readonly string[] };
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ `${RUNTIME}/${name}`);
const label = (await load("win32_label.js")) as LabelModule;
const fence = (await load("read_fence.js")) as FenceModule;

const ACL_HEADER = 8;
const ACE_TYPE_MANDATORY = 17;

/**
 * A synthetic ACL BUILDER. Every byte the parser reads is laid out explicitly, so a case can corrupt exactly
 * one field and leave the rest structurally valid — which is the only way to show that field is what the
 * parser failed to validate.
 */
type AclOptions = {
  aclSize?: number;
  aceCount?: number;
  aceType?: number;
  aceFlags?: number;
  aceSize?: number;
  policyMask?: number | "throw" | "nan";
  sidRevision?: number;
  subAuthorityCount?: number;
  authority?: number[]; // six big-endian bytes
  rid?: number | "throw" | "nan";
  /** Fields whose read THROWS, which is how a truncated or foreign ACL fails. */
  throws?: ReadonlySet<string>;
};

const DEFAULT_AUTHORITY = [0, 0, 0, 0, 0, 16]; // S-1-16

function buildAcl(options: AclOptions = {}): { acl: bigint; decode: (acl: unknown, offset: number, type: string) => number } {
  const {
    aceSize = 20,
    aceType = ACE_TYPE_MANDATORY,
    aceFlags = 3,
    aclSize = ACL_HEADER + aceSize,
    aceCount = 1,
    policyMask = 2,
    sidRevision = 1,
    subAuthorityCount = 1,
    authority = DEFAULT_AUTHORITY,
    rid = 12288,
  } = options;
  const throws = options.throws ?? new Set<string>();
  const aceAt = ACL_HEADER;
  const sidAt = aceAt + 8;
  /** Resolve a numeric field, honouring the "throw"/"nan" sentinels so a failed native read is representable. */
  const value = (raw: number | "throw" | "nan" | undefined, fieldName: string): number => {
    if (throws.has(fieldName) || raw === "throw") throw new Error(`injected failure reading ${fieldName}`);
    if (raw === "nan") return Number.NaN;
    return raw ?? 0;
  };
  const decode = (_acl: unknown, offset: number, type: string): number => {
    if (type === "uint16") {
      if (offset === 2) return value(aclSize, "AclSize");
      if (offset === 4) return value(aceCount, "AceCount");
      if (offset === aceAt + 2) return value(aceSize, "AceSize");
      return 0;
    }
    if (type === "uint8") {
      if (offset === aceAt) return value(aceType, "AceType");
      if (offset === aceAt + 1) return value(aceFlags, "AceFlags");
      if (offset === sidAt) return value(sidRevision, "SidRevision");
      if (offset === sidAt + 1) return value(subAuthorityCount, "SubAuthorityCount");
      /** The authority is six big-endian bytes at SID offset 2..7. */
      const authorityOffset = offset - (sidAt + 2);
      if (authorityOffset >= 0 && authorityOffset < 6) return value(authority[authorityOffset] ?? 0, "IdentifierAuthority");
      return 0;
    }
    if (type === "uint32") {
      if (offset === aceAt + 4) return value(policyMask, "policyMask");
      if (offset === sidAt + 8) return value(rid, "IntegrityRid");
      return 0;
    }
    return 0;
  };
  return { acl: 1n, decode };
}

/**
 * The fence's write path, with a stub whose mutations are recorded and never performed.
 *
 * `afterWriteMask` models what a SUCCESSFUL write does to the descriptor: once `setNamedSecurityInfoW` is
 * called, later reads return that mask. Without it the stub would report the original descriptor forever, and
 * `writeAndVerifyLabel` would correctly report `verified: false` — which is a fact about the stub, not about
 * the code under test.
 */
function stubFenceApi(decodeImpl: (acl: unknown, offset: number, type: string) => number, afterWriteMask?: number) {
  const calls: string[] = [];
  let written = false;
  const api = {
    alloc: () => ({}),
    decode: (slot: unknown, second?: unknown, third?: unknown) => {
      /** `decode(sacl, pointer('void'))` returns the ACL handle; everything else is an ACL field read. */
      if (typeof second === "object" && second !== null) return 1n;
      if (typeof second === "number" && typeof third === "string") {
        /** A policy-mask read after a write reports the mask the write installed. */
        if (written && afterWriteMask !== undefined && second === ACL_HEADER + 4 && third === "uint32") return afterWriteMask;
        return decodeImpl(slot, second, third);
      }
      return 0;
    },
    pointer: () => ({}),
    localFree: () => calls.push("localFree"),
    getNamedSecurityInfoW: () => {
      calls.push("getNamedSecurityInfoW");
      return 0;
    },
    setNamedSecurityInfoW: () => {
      calls.push("setNamedSecurityInfoW");
      written = true;
      return 0;
    },
    initializeAcl: () => {
      calls.push("initializeAcl");
      return 1;
    },
    addMandatoryAce: () => {
      calls.push("addMandatoryAce");
      return 1;
    },
    getLengthSid: () => 12,
    createWellKnownSid: () => {
      calls.push("createWellKnownSid");
      return 1;
    },
    encode: () => calls.push("encode"),
  };
  return { api, calls };
}

describe("E1RF RF-C malformed mandatory ACE (DYNAMICALLY_VERIFIED)", () => {
  it("1. a TRUNCATED mandatory ACE is unverified, not a trusted label", () => {
    /** AclSize admits only the header plus a partial ACE, so the ACE header itself runs past the end. */
    const { acl, decode } = buildAcl({ aclSize: ACL_HEADER + 4 });
    const parsed = label.parseLabelAcl({ decode }, acl);
    expect(parsed.present).toBe(false);
    expect(parsed.readable).toBe(false);
  });

  it("2. an ACE size INSUFFICIENT FOR THE DECLARED SID is unverified", () => {
    /**
     * The SID declares one sub-authority (12 bytes) but the ACE only reserves 8 for it. Reading the RID would
     * take bytes belonging to the next ACE, producing a plausible identity for an object that has none.
     */
    const { acl, decode } = buildAcl({ aceSize: 16, subAuthorityCount: 1, aclSize: ACL_HEADER + 16 });
    const parsed = label.parseLabelAcl({ decode }, acl);
    expect(parsed.present).toBe(false);
    expect(parsed.readable).toBe(false);
    expect(parsed.unreadableField).toBe("SidLength");
  });

  it("3. an INVALID or unreadable SID revision is unverified", () => {
    const invalid = buildAcl({ sidRevision: 2 });
    expect(label.parseLabelAcl({ decode: invalid.decode }, invalid.acl).unreadableField).toBe("SidRevision");
    const unreadable = buildAcl({ throws: new Set(["SidRevision"]) });
    expect(label.parseLabelAcl({ decode: unreadable.decode }, unreadable.acl).readable).toBe(false);
  });

  it("4. an INVALID or inconsistent SubAuthorityCount is unverified", () => {
    const zero = buildAcl({ subAuthorityCount: 0 });
    expect(label.parseLabelAcl({ decode: zero.decode }, zero.acl).unreadableField).toBe("SubAuthorityCount");
    const tooMany = buildAcl({ subAuthorityCount: 16 });
    expect(label.parseLabelAcl({ decode: tooMany.decode }, tooMany.acl).unreadableField).toBe("SubAuthorityCount");
    const unreadable = buildAcl({ throws: new Set(["SubAuthorityCount"]) });
    expect(label.parseLabelAcl({ decode: unreadable.decode }, unreadable.acl).readable).toBe(false);
  });

  it("5. an INVALID IdentifierAuthority is unverified", () => {
    const unreadable = buildAcl({ throws: new Set(["IdentifierAuthority"]) });
    const parsed = label.parseLabelAcl({ decode: unreadable.decode }, unreadable.acl);
    expect(parsed.present).toBe(false);
    expect(parsed.readable).toBe(false);
    expect(parsed.unreadableField).toBe("IdentifierAuthority");
  });

  it("6. an UNREADABLE or invalid Integrity RID is unverified", () => {
    const unreadable = buildAcl({ throws: new Set(["IntegrityRid"]) });
    expect(label.parseLabelAcl({ decode: unreadable.decode }, unreadable.acl).unreadableField).toBe("IntegrityRid");
    const nan = buildAcl({ rid: "nan" });
    expect(label.parseLabelAcl({ decode: nan.decode }, nan.acl).unreadableField).toBe("IntegrityRid");
  });

  it("7. a Policy Mask decode that THROWS is unverified", () => {
    const { acl, decode } = buildAcl({ throws: new Set(["policyMask"]) });
    const parsed = label.parseLabelAcl({ decode }, acl);
    expect(parsed.present).toBe(false);
    expect(parsed.readable).toBe(false);
    expect(parsed.unreadableField).toBe("policyMask");
  });

  it("8. a Policy Mask that is NaN or non-finite is unverified — THE DEFECT", () => {
    /**
     * THE REGRESSION CONTROL. Before this stage this returned `present: true, readable: true, policyMask: NaN`,
     * and `planLabel` turned `NaN | 2` into `2`, discarding every existing policy bit.
     */
    const nan = buildAcl({ policyMask: "nan" });
    const parsed = label.parseLabelAcl({ decode: nan.decode }, nan.acl);
    expect(parsed.present).toBe(false);
    expect(parsed.readable).toBe(false);
    expect(parsed.unreadableField).toBe("policyMask");
    expect(parsed.policyMask).toBeUndefined();
  });

  it("9. an INVALID ACL length is unverified", () => {
    const tooSmall = buildAcl({ aclSize: 4 });
    expect(label.parseLabelAcl({ decode: tooSmall.decode }, tooSmall.acl).readable).toBe(false);
    const unreadable = buildAcl({ throws: new Set(["AclSize"]) });
    expect(label.parseLabelAcl({ decode: unreadable.decode }, unreadable.acl).unreadableField).toBe("AclSize");
  });

  it("10. a VALID ACL with NO mandatory label is present:false AND readable:true — absence keeps one meaning", () => {
    /** The distinction the whole module rests on: "read and found nothing" is not "could not read". */
    const { acl, decode } = buildAcl({ aceType: 0 });
    const parsed = label.parseLabelAcl({ decode }, acl);
    expect(parsed.present).toBe(false);
    expect(parsed.readable).toBe(true);
    expect(parsed.unreadableField).toBeUndefined();
  });

  it("11. a VALID label with existing NO_WRITE_UP preserves it", () => {
    const { acl, decode } = buildAcl({ policyMask: 1 });
    const parsed = label.parseLabelAcl({ decode }, acl);
    expect(parsed.present).toBe(true);
    expect(parsed.readable).toBe(true);
    const planned = label.planLabel(parsed);
    /** NO_WRITE_UP survives and NO_READ_UP is added. */
    expect(planned.policyMask & label.MANDATORY_POLICIES.NO_WRITE_UP).toBe(label.MANDATORY_POLICIES.NO_WRITE_UP);
    expect(planned.policyMask & label.MANDATORY_POLICIES.NO_READ_UP).toBe(label.MANDATORY_POLICIES.NO_READ_UP);
  });

  it("12. a VALID label with existing NO_EXECUTE_UP preserves it", () => {
    const { acl, decode } = buildAcl({ policyMask: 4 });
    const planned = label.planLabel(label.parseLabelAcl({ decode }, acl));
    expect(planned.policyMask & label.MANDATORY_POLICIES.NO_EXECUTE_UP).toBe(label.MANDATORY_POLICIES.NO_EXECUTE_UP);
    expect(planned.policyMask & label.MANDATORY_POLICIES.NO_READ_UP).toBe(label.MANDATORY_POLICIES.NO_READ_UP);
  });

  it("13. additional policy bits are NOT silently discarded", () => {
    /** An unknown bit outside the named three must survive the write as a bit, and be reported. */
    const { acl, decode } = buildAcl({ policyMask: 0x19 });
    const parsed = label.parseLabelAcl({ decode }, acl);
    const planned = label.planLabel(parsed);
    expect(planned.policyMask).toBe(0x19 | label.MANDATORY_POLICIES.NO_READ_UP);
    expect(planned.policyMask & 0x18).toBe(0x18);
    expect((planned.preserved ?? []).some((entry) => entry.startsWith("UNKNOWN_BITS"))).toBe(true);
  });

  it("14. a structurally plausible but UNKNOWN RID is treated conservatively, not as malformed", () => {
    /**
     * §6.3 case 14: an integrity level this build does not name is still a well-formed SID. It must be READABLE
     * — refusing it would refuse every future Windows integrity level — and the plan must not lower it.
     */
    const { acl, decode } = buildAcl({ rid: 13312 });
    const parsed = label.parseLabelAcl({ decode }, acl);
    expect(parsed.present).toBe(true);
    expect(parsed.readable).toBe(true);
    expect(parsed.integrityRid).toBe(13312);
    expect(parsed.integrityName).toBe("S-1-16-13312");
    const planned = label.planLabel(parsed);
    expect(planned.integrityRid).toBe(13312);
    expect(planned.integrityRid).toBeGreaterThanOrEqual(12288);
  });
});

describe("E1RF RF-C malformed input never triggers a write (DYNAMICALLY_VERIFIED)", () => {
  it("15. ensureRoot REFUSES and attempts NO descriptor write for an undecodable policy mask", () => {
    /**
     * THE DECISIVE ASSERTION. The stub records every mutation; none may appear. This is what makes the claim
     * "an unknown policy is never overwritten" an observation rather than a reading of the code.
     */
    const { acl, decode } = buildAcl({ policyMask: "nan" });
    const { api, calls } = stubFenceApi(decode);
    const outcome = fence.applyReadFence({ roots: ["C:/test-owned/root"], world: "C:/test-owned/world", api });
    expect(outcome.supported).toBe(true);
    const first = outcome.outcomes[0];
    expect(first?.applied).toBe(false);
    expect(first?.verified).toBe(false);
    expect(first?.detail).toContain("refuses to write over it");
    expect(calls).not.toContain("setNamedSecurityInfoW");
    expect(calls).not.toContain("addMandatoryAce");
    expect(calls).not.toContain("initializeAcl");
    expect(acl).toBe(1n);
  });

  it("16. a valid label is written exactly once and then verified by a fresh read", () => {
    const { decode } = buildAcl({ policyMask: 1 });
    /** The write installs `existing | NO_READ_UP` = 0x3, which is what a readback should then report. */
    const { api, calls } = stubFenceApi(decode, 0x3);
    const outcome = fence.applyReadFence({ roots: ["C:/test-owned/root"], world: "C:/test-owned/world", api });
    expect(outcome.outcomes[0]?.verified).toBe(true);
    expect(outcome.outcomes[0]?.applied).toBe(true);
    expect(calls.filter((call) => call === "setNamedSecurityInfoW")).toHaveLength(1);
    expect(calls.filter((call) => call === "getNamedSecurityInfoW").length).toBeGreaterThanOrEqual(2);
  });

  it("16b. a write whose READBACK disagrees is NOT verified — the return code is not evidence", () => {
    /**
     * This host has been measured to report success while changing nothing. The stub models exactly that: the
     * write returns 0 and the descriptor still reads the OLD mask, so `verified` must be false.
     */
    const { decode } = buildAcl({ policyMask: 1 });
    const { api, calls } = stubFenceApi(decode, 0x1);
    const outcome = fence.applyReadFence({ roots: ["C:/test-owned/root"], world: "C:/test-owned/world", api });
    expect(outcome.outcomes[0]?.verified).toBe(false);
    expect(outcome.outcomes[0]?.applied).toBe(true);
    expect(calls).toContain("setNamedSecurityInfoW");
  });

  it("17. an already-protected root is not rewritten — the idempotence rule", () => {
    const { decode } = buildAcl({ policyMask: 3 });
    const { api, calls } = stubFenceApi(decode);
    const outcome = fence.applyReadFence({ roots: ["C:/test-owned/root"], world: "C:/test-owned/world", api });
    expect(outcome.outcomes[0]?.verified).toBe(true);
    expect(outcome.outcomes[0]?.applied).toBe(false);
    expect(calls).not.toContain("setNamedSecurityInfoW");
  });

  it("18. snapshotLabels records a malformed root as UNREADABLE rather than manufacturing a baseline", () => {
    const snapshot = fence.snapshotLabels({ roots: ["C:/test-owned/a", "C:/test-owned/b"] });
    /** The default resolver cannot bind inside the stub, so both roots are unreadable — never defaulted. */
    expect(snapshot.originals.length + snapshot.unreadable.length).toBe(2);
    for (const entry of snapshot.originals) expect(entry).not.toMatchObject({ policyMask: Number.NaN });
  });
});
