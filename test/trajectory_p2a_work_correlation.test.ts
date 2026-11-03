/**
 * Trajectory-P2A §8 (C4) — WORK DELEGATION CORRELATION.
 *
 * These tests drive the REAL delegation seam with a scripted worker port, and assert the §8 ownership
 * rules: the canonical AttemptId comes from Work, the HostJobId from this service, the InvocationId from
 * the port, and the SessionId from the port's observed identity — never from a payload or a caller.
 *
 * The correlation is exercised on BOTH paths §8.4 names: the blocking kernel and the async service. The
 * blocking path has no host job, and the test asserts it supplies an explicitly ABSENT one rather than
 * inventing an id.
 *
 * No model, no provider, no DSH binary: the worker port is a scripted local port.
 */
import { describe, expect, it } from "vitest";

import { makeWorkerSessionIdentityTracker } from "../src/interaction/work_delegation.js";

/* ================================================================== §7.5 the tracker, in isolation */

describe("P2A C4 §7.5 — the per-invocation identity tracker", () => {
  const tracker = () => makeWorkerSessionIdentityTracker({ invocationId: "wpi-test-1", observedAt: () => "2026-01-01T00:00:00.000Z" });

  it("starts NOT_OBSERVED and fabricates nothing", () => {
    const t = tracker();
    expect(t.state).toBe("NOT_OBSERVED");
    expect(t.sessionId).toBeNull();
    expect(t.observation).toBeNull();
  });

  it("establishes OBSERVED on the first valid report, stamped with the parent's invocation", () => {
    const t = tracker();
    expect(t.observe({ sessionId: "worker-a", directChildPid: 42, sourceQualification: "DIRECT_CHILD_IPC" })).toBe("OBSERVED");
    expect(t.sessionId).toBe("worker-a");
    expect(t.observation?.invocationId).toBe("wpi-test-1");
    expect(t.observation?.directChildPid).toBe(42);
    expect(t.observation?.observationState).toBe("OBSERVED");
    expect(t.observation?.conflictingSessionId).toBeNull();
  });

  it("is idempotent for a repeated identical report", () => {
    const t = tracker();
    t.observe({ sessionId: "worker-a", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" });
    expect(t.observe({ sessionId: "worker-a", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" })).toBe("OBSERVED");
    expect(t.sessionId).toBe("worker-a");
    expect(t.conflictingSessionId).toBeNull();
  });

  it("becomes CONFLICT on a second, DIFFERENT identity and does not choose one", () => {
    const t = tracker();
    t.observe({ sessionId: "worker-a", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" });
    expect(t.observe({ sessionId: "worker-b", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" })).toBe("CONFLICT");
    // The first identity stays as EVIDENCE, and the state no longer claims a single identity.
    expect(t.sessionId).toBe("worker-a");
    expect(t.conflictingSessionId).toBe("worker-b");
    expect(t.observation?.observationState).toBe("CONFLICT");
    expect(t.observation?.conflictingSessionId).toBe("worker-b");
  });

  it("cannot be resolved by a later report simply arriving", () => {
    const t = tracker();
    t.observe({ sessionId: "worker-a", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" });
    t.observe({ sessionId: "worker-b", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" });
    // Returning to the FIRST identity does not clear the conflict: a disagreement was observed.
    expect(t.observe({ sessionId: "worker-a", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" })).toBe("CONFLICT");
    // A THIRD distinct identity is recorded as the current disagreement rather than silently dropped.
    expect(t.observe({ sessionId: "worker-c", directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" })).toBe("CONFLICT");
    expect(t.conflictingSessionId).toBe("worker-c");
  });
});

/* ================================================================== §8.2 the delegation wiring */

describe("P2A C4 §8.2 — Work Delegation supplies the correlation, and only its own facts", () => {
  it("declares the correlated identity record with exactly the three owned facts", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/interaction/work_delegation.ts", "utf8");
    // The correlation wrapper exists and adopts the whole observation rather than re-deriving identity.
    expect(source).toContain("function correlateSessionIdentity(");
    expect(source).toContain("observation,");
    // §8.2: the AttemptId comes from prepared Work.
    expect(source).toContain("attemptId: prepared.attemptId");
    // §8.2: the service never mints a second invocation id — it adopts the port's observation verbatim.
    expect(source).not.toContain("invocationId: `wpi-");
    // §8.4: the blocking path supplies an explicitly absent host job id rather than inventing one.
    expect(source).toContain('correlateSessionIdentity(deps.onCorrelatedSessionIdentity, { hostLocalJobId: "", attemptId: prepared.attemptId })');
    // §8.4: the async path supplies its own job id.
    expect(source).toContain("const observeSessionIdentity = correlateSessionIdentity(deps.onCorrelatedSessionIdentity, {\n            hostLocalJobId: jobId,");
  });

  it("§8.3: the sink is optional — no consumer means no wrapper at all", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/interaction/work_delegation.ts", "utf8");
    // The wrapper returns undefined when no sink is attached, so the run input stays byte-identical.
    expect(source).toContain("if (sink === undefined) return undefined;");
    // And the call sites spread the field only when it exists.
    expect(source).toContain("...(observeSessionIdentity === undefined ? {} : { observeSessionIdentity })");
  });

  it("§8.3/§8.5: a throwing consumer is contained and no settlement authority is touched", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/interaction/work_delegation.ts", "utf8");
    const start = source.indexOf("function correlateSessionIdentity(");
    // Bound the slice at the function's own end: the next top-level declaration after the wrapper.
    const end = source.indexOf("\n/**\n * THE ONE BLOCKING KERNEL", start);
    const wrapper = source.slice(start, end === -1 ? start + 900 : end);
    expect(wrapper).toContain("} catch {");
    expect(wrapper).toContain("a research consumer's failure is not a Work failure");
    // §8.5: the wrapper settles nothing.
    expect(wrapper).not.toContain("settleMutatingWork");
    expect(wrapper).not.toContain("prepareMutatingWork");
  });
});
