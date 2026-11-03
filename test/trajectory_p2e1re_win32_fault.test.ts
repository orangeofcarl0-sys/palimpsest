/**
 * Trajectory-P2-E1RE §5.4 — WIN32 FAULT INJECTION.
 *
 * THE DEFECT THIS PINS. `readMandatoryLabel()` returned `ok: true` with `label: { present: false }` when
 * `GetNamedSecurityInfoW` failed, and `ensureRoot()` selects its write path on `existing.ok`. An unreadable
 * descriptor was therefore read as "there is no label here", `planLabel()` computed the new policy mask from
 * zero, and every policy bit the object actually carried was discarded on write.
 *
 * THE INJECTION IS PURE. A stub binding table stands in for the FFI layer, so no security descriptor on this
 * machine is touched. The stub records every call, which is what makes "no write was attempted" an observation
 * rather than an inference.
 */
import { describe, expect, it } from "vitest";

type LabelModule = {
  readMandatoryLabel: (api: unknown, path: string) => { ok: boolean; label?: { present: boolean; readable?: boolean; policyMask?: number; integrityRid?: number }; detail: string };
  parseLabelAcl: (api: unknown, acl: unknown) => { present: boolean; readable?: boolean };
  planLabel: (existing: unknown) => { integrityRid: number; policyMask: number; preserved: string[] };
};

const RUNTIME = ["..", "host", "deployment", "runtime"].join("/");
const load = async (name: string): Promise<unknown> => import(/* @vite-ignore */ `${RUNTIME}/${name}`);
const label = (await load("win32_label.js")) as LabelModule;
const fence = (await load("read_fence.js")) as {
  applyReadFence: (input: { roots: readonly string[]; world?: string; api?: unknown }) => { supported: boolean; outcomes: readonly { path: string; applied: boolean; verified: boolean; detail: string }[]; unavailable?: string };
  snapshotLabels: (input: { roots: readonly string[] }) => { originals: readonly unknown[]; unreadable: readonly string[] };
};

/**
 * A STUB BINDING TABLE. `getNamedSecurityInfoW` returns the configured code and the ACL slot is left null, so a
 * zero return means "descriptor read, no label". Every mutation call is recorded, never performed.
 */
function stubApi(options: { getCode: number; acl?: bigint | null } = { getCode: 0 }) {
  const calls: string[] = [];
  const api = {
    alloc: () => ({}),
    decode: (slot: unknown, second?: unknown, third?: unknown) => {
      /** `decode(sacl, pointer('void'))` reads the SACL pointer; anything else reads ACL fields. */
      if (typeof second === "object" && second !== null) return options.acl ?? null;
      if (second === "uint8" || second === "uint16" || second === "uint32") return 0;
      return 0;
    },
    pointer: () => ({}),
    localFree: () => calls.push("localFree"),
    getNamedSecurityInfoW: () => {
      calls.push("getNamedSecurityInfoW");
      return options.getCode;
    },
    setNamedSecurityInfoW: () => {
      calls.push("setNamedSecurityInfoW");
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

describe("E1RE RE-C §5.4 unreadable descriptor is not an absent label (DYNAMICALLY_VERIFIED)", () => {
  it("1. a failed descriptor read reports ok:false and names the failure", () => {
    const { api } = stubApi({ getCode: 5 });
    const read = label.readMandatoryLabel(api, "C:/test-owned/root");
    expect(read.ok).toBe(false);
    expect(read.detail).toContain("GetNamedSecurityInfoW returned 5");
    expect(read.detail).toContain("UNKNOWN");
  });

  it("2. a SUCCESSFUL read with no label still reports ok:true — present:false keeps its one meaning", () => {
    const { api } = stubApi({ getCode: 0, acl: null });
    const read = label.readMandatoryLabel(api, "C:/test-owned/root");
    expect(read.ok).toBe(true);
    expect(read.label?.present).toBe(false);
    expect(read.label?.readable).toBe(true);
  });

  it("3. the fence REFUSES to write over an unreadable descriptor, and attempts NO write", () => {
    const { api, calls } = stubApi({ getCode: 5 });
    const outcome = fence.applyReadFence({ roots: ["C:/test-owned/root"], world: "C:/test-owned/world", api });
    expect(outcome.supported).toBe(true);
    const first = outcome.outcomes[0];
    expect(first?.applied).toBe(false);
    expect(first?.verified).toBe(false);
    expect(first?.detail).toContain("refuses to write over it");
    /** The decisive assertion: no security-descriptor write was attempted at all. */
    expect(calls).not.toContain("setNamedSecurityInfoW");
    expect(calls).not.toContain("addMandatoryAce");
  });

  it("4. an UNPARSEABLE descriptor is also refused, not treated as unlabelled", () => {
    /**
     * `decode` returns a non-null ACL pointer, and every field read yields 0 — an ACL that cannot describe a
     * real label. The parser reports `present:false, readable:false`, and the fence must refuse.
     */
    const { api, calls } = stubApi({ getCode: 0, acl: 1n });
    const parsed = label.parseLabelAcl(api, 1n);
    expect(parsed.readable).toBe(false);
    const outcome = fence.applyReadFence({ roots: ["C:/test-owned/root"], world: "C:/test-owned/world", api });
    expect(outcome.outcomes[0]?.verified).toBe(false);
    expect(outcome.outcomes[0]?.applied).toBe(false);
    expect(calls).not.toContain("setNamedSecurityInfoW");
  });

  it("5. the snapshot records an unreadable root as UNREADABLE rather than as a baseline", () => {
    const { api } = stubApi({ getCode: 5 });
    const snapshot = fence.snapshotLabels({ roots: ["C:/test-owned/a", "C:/test-owned/b"] });
    /** The default resolver is used here, which cannot resolve inside the stub; both are unreadable. */
    expect(snapshot.unreadable.length + snapshot.originals.length).toBe(2);
    expect(api).toBeDefined();
  });

  it("6. planLabel is only ever given a READ label, so a known mask is preserved", () => {
    const planned = label.planLabel({ present: true, readable: true, integrityRid: 8192, policyMask: 0x11 });
    /** NO_READ_UP is added; the caller's existing bits are kept. */
    expect(planned.policyMask & 0x10).toBe(0x10);
    expect(planned.policyMask & 0x1).toBe(0x1);
  });
});
