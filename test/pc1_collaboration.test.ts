/**
 * PC1 S05 — handoff/receipt contracts, independence, mechanism honesty and async lifecycle.
 *
 * These are deterministic contract tests. They do NOT claim a real independent agent ran; that
 * remains a live-model question (BLOCKED without a spend authorization).
 */
import { describe, expect, it } from "vitest";

import {
  HandoffLifecycle,
  LifecycleError,
  assessIndependence,
  makeHandoff,
  makeReceipt,
  selectMechanism,
  type CollaborationReceipt,
  type Handoff,
} from "../src/project_handoff/index.js";

function handoff(): Handoff {
  return makeHandoff({
    task: "Check whether the bulletin changes Site B",
    intent: "Decide whether the intake should be authorized",
    constraints: ["do not mutate canonical sources", "read the inbox only"],
    projectBasis: { projectRevision: 3, projectDigest: "a".repeat(64), headCommit: "b".repeat(40) },
    sources: [
      { ref: "inbox/2026-02-10/vendor-capabilities.csv", standing: "CANDIDATE", digest: "c".repeat(64) },
      { ref: "sources/sites.md", standing: "ACCEPTED_FOR_PURPOSE", digest: "d".repeat(64) },
    ],
    allowedResources: ["inbox:read", "sources:read"],
    expectedArtifact: "reports/site-b-check.md",
    knownGaps: ["the certificate is not on file"],
    stopConditions: ["the bulletin digest changes", "a stop condition is reached"],
    budget: { maxSteps: 8, maxWallSeconds: 300, maxTokens: 20_000 },
    decisionsNeeded: ["operator: accept the bulletin?"],
    createdAt: "2026-11-02T00:00:00.000Z",
  });
}

function receipt(h: Handoff, executor: "NATIVE_SUBAGENT" | "REASONING_BRANCH", sourceRoot: string, claim: string, hypothesis = false): CollaborationReceipt {
  return makeReceipt({
    handoff: h,
    executor,
    executorIdentity: `executor:${sourceRoot}`,
    findings: [
      {
        claim,
        sources: [{ ref: `doc:${sourceRoot}`, rootId: sourceRoot, digest: null }],
        hypothesis,
        counterEvidence: [],
        uncertainty: hypothesis ? "high" : "low",
      },
    ],
    artifacts: ["reports/site-b-check.md"],
    readFootprint: [`${sourceRoot}#section-1`],
    status: "COMPLETE",
    createdAt: "2026-11-02T00:01:00.000Z",
  });
}

describe("PC1 S05: handoffs and receipts are lossless contracts", () => {
  it("a handoff carries the task, basis, sources, scope, stop conditions and budget", () => {
    const h = handoff();
    expect(h.handoffId).toMatch(/^handoff-[0-9a-f]{24}$/u);
    expect(h.projectBasis.projectRevision).toBe(3);
    expect(h.sources).toHaveLength(2);
    expect(h.stopConditions.length).toBeGreaterThan(0);
    expect(h.decisionsNeeded).toContain("operator: accept the bulletin?");
    expect(() => makeHandoff({ ...h, allowedResources: [] } as never)).toThrow(/allowed resource/u);
  });

  it("a receipt keeps the long-form findings, artifacts, footprint and limitations", () => {
    const r = receipt(handoff(), "NATIVE_SUBAGENT", "inbox/2026-02-10/vendor-capabilities.csv", "V3 is 0 C under the bulletin");
    expect(r.receiptId).toMatch(/^receipt-[0-9a-f]{24}$/u);
    expect(r.findings[0]?.claim).toContain("0 C");
    expect(r.readFootprint).toHaveLength(1);
    expect(r.status).toBe("COMPLETE");
  });
});

describe("PC1 S05: independence is source-rooted, not prose-rooted", () => {
  it("two receipts on the same root source are not independent verification", () => {
    const h = handoff();
    const same = [
      receipt(h, "NATIVE_SUBAGENT", "inbox/2026-02-10/vendor-capabilities.csv", "V3 is 0 C"),
      receipt(h, "REASONING_BRANCH", "inbox/2026-02-10/vendor-capabilities.csv", "V3 is 0 C"),
    ];
    const assessment = assessIndependence(same);
    expect(assessment.independentVerification).toBe(false);
    expect(assessment.duplicatedSources.length).toBeGreaterThan(0);
    expect(assessment.sharedClaimRoots.length).toBe(1);
  });

  it("two different root sources can support an independent claim", () => {
    const h = handoff();
    const different = [
      receipt(h, "NATIVE_SUBAGENT", "inbox/2026-02-10/vendor-capabilities.csv", "V3 is 0 C"),
      receipt(h, "REASONING_BRANCH", "sources/sites.md", "V3 is 0 C"),
    ];
    const assessment = assessIndependence(different);
    expect(assessment.independentVerification).toBe(true);
    expect(assessment.independentClaims).toContain("V3 is 0 C");
  });

  it("a contradiction is preserved, and a hypothesis does not win by majority", () => {
    const h = handoff();
    const contradiction = [
      receipt(h, "NATIVE_SUBAGENT", "inbox/2026-02-10/vendor-capabilities.csv", "V3 is 0 C"),
      receipt(h, "REASONING_BRANCH", "sources/sites.md", "V3 is 0 C", true),
    ];
    const assessment = assessIndependence(contradiction);
    expect(assessment.conflicts.length).toBe(1);
    expect(assessment.conflicts[0]?.receipts.length).toBe(2);
  });
});

describe("PC1 S05: mechanism selection names absence instead of faking a run", () => {
  it("a cross-project need without a directory is UNAVAILABLE", () => {
    const selection = selectMechanism({
      independentInformation: false, crossCheck: false, complementaryDomain: false, realParallelGain: false,
      durablePeerNeeded: false, crossProjectNeeded: true,
      capabilities: { nativeSubagent: true, reasoningBranch: true, managedWorkWorker: true, durablePeer: true, crossProject: false },
    });
    expect(selection.executor).toBe("UNAVAILABLE");
    expect(selection.capability).toMatch(/cross-project/u);
  });

  it("a native subagent is selected only for a short independent read", () => {
    const selection = selectMechanism({
      independentInformation: true, crossCheck: false, complementaryDomain: false, realParallelGain: false,
      durablePeerNeeded: false, crossProjectNeeded: false,
      capabilities: { nativeSubagent: true, reasoningBranch: true, managedWorkWorker: true, durablePeer: false, crossProject: false },
    });
    expect(selection.executor).toBe("NATIVE_SUBAGENT");
  });

  it("an ordinary question is PRINCIPAL_ONLY, not a manufactured agent", () => {
    const selection = selectMechanism({
      independentInformation: false, crossCheck: false, complementaryDomain: false, realParallelGain: false,
      durablePeerNeeded: false, crossProjectNeeded: false,
      capabilities: { nativeSubagent: true, reasoningBranch: true, managedWorkWorker: true, durablePeer: false, crossProject: false },
    });
    expect(selection.executor).toBe("PRINCIPAL_ONLY");
  });
});

describe("PC1 S05: async lifecycle separates delivery, consumption, action and cancellation", () => {
  it("duplicate, out-of-order, cancel and restart are all explicit", () => {
    const lifecycle = new HandoffLifecycle(() => "2026-11-02T00:00:00.000Z");
    lifecycle.create("h1");
    lifecycle.queue("h1");
    expect(() => lifecycle.consume("h1", "d1")).toThrow(LifecycleError);
    lifecycle.deliver("h1", "d1", "first");
    const duplicate = lifecycle.deliver("h1", "d1", "first");
    expect(duplicate.deliveries).toHaveLength(1);
    expect(() => lifecycle.deliver("h1", "d1", "different")).toThrow(/different content/u);
    lifecycle.consume("h1", "d1");
    lifecycle.act("h1");
    expect(lifecycle.inspect("h1").state).toBe("ACTED");

    lifecycle.create("h2");
    lifecycle.queue("h2");
    lifecycle.cancel("h2", "operator cancelled");
    expect(() => lifecycle.deliver("h2", "late", "x")).toThrow(/cannot reopen authority/u);
    expect(() => lifecycle.consume("h2", "late")).toThrow(/cannot be consumed/u);

    lifecycle.create("h3");
    lifecycle.queue("h3");
    lifecycle.deliver("h3", "d3", "payload");
    const snapshot = lifecycle.snapshot();
    const restored = HandoffLifecycle.restore(snapshot);
    expect(restored.inspect("h3").state).toBe("DELIVERED");
    expect(() => restored.deliver("h3", "d3", "payload")).not.toThrow();
    restored.consume("h3", "d3");
    expect(restored.inspect("h3").state).toBe("CONSUMED");
  });

  it("an interrupted job is not reported as running", () => {
    const lifecycle = new HandoffLifecycle();
    lifecycle.create("h4");
    lifecycle.queue("h4");
    lifecycle.interrupt("h4", "host process exited");
    expect(lifecycle.inspect("h4").state).toBe("INTERRUPTED");
    expect(() => lifecycle.consume("h4", "d4")).toThrow(/cannot be consumed/u);
  });
});
