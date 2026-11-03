/**
 * Trajectory-H1 §8 (C4) — THE BINDING AUTHORITY CONTRACT.
 *
 * The counterexamples B1–B8 from §8.7, plus the structural proof that the ordinary Preview can no
 * longer elevate a caller-selected SessionId.
 *
 * The producer-side evidence used here is a CONTROLLED FIXTURE. It models the consumer state a real
 * P2-A/P2-B producer WOULD produce. It does NOT claim that:
 *
 *   - a real DSH IPC identity report exists;
 *   - a Parent truly owns a durable binding;
 *   - cold recovery works;
 *   - a real worker Session has been bound to Work;
 *   - PRIMARY has been exercised.
 *
 * Those remain explicitly deferred to P2.
 *
 * No model is invoked, no provider is contacted and no personal session is touched.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ASSOCIATION_OBSERVATION_STATES,
  ASSOCIATION_VERIFICATION_STATES,
  BINDING_RESOLUTION_REFUSAL_CODES,
  classifySessionBinding,
  resolveVerifiedSessionBinding,
  type AttemptSessionAssociation,
} from "../src/trajectory/index.js";

const PROJECT = "h1b";
const ATTEMPT_A = `attempt-${"a".repeat(32)}`;
const ATTEMPT_B = `attempt-${"b".repeat(32)}`;

/** §8.7: a producer-observed, durably bound association. The fixture a real producer would supply. */
function association(overrides: Partial<AttemptSessionAssociation> = {}): AttemptSessionAssociation {
  return Object.freeze({
    schemaVersion: 1 as const,
    projectId: PROJECT,
    attemptId: ATTEMPT_A,
    invocationId: "inv-1",
    dshSessionId: "session-Y",
    producerEvidence: { source: "HOST_PORT_OBSERVATION" as const, reference: "ipc-msg-1" },
    observationState: "PRODUCER_OBSERVED" as const,
    durableBindingRef: "binding-1",
    verification: "VERIFIED" as const,
    conflictDetail: null,
    ...overrides,
  });
}

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

describe("Trajectory-H1 §8 — the binding authority vocabulary", () => {
  it("the vocabularies are the ruled sets", () => {
    expect([...ASSOCIATION_OBSERVATION_STATES]).toEqual(["PRODUCER_OBSERVED", "CALLER_DECLARED"]);
    expect([...ASSOCIATION_VERIFICATION_STATES]).toEqual(["VERIFIED", "UNVERIFIED", "CONFLICTING"]);
    for (const code of BINDING_RESOLUTION_REFUSAL_CODES) expect(code).toMatch(/^[A-Z_]+$/);
  });

  it("the claim classifier cannot reach a verified state — proven over its whole reachable domain", () => {
    /**
     * §8.5: the structural property, not a sample. Every reachable combination of the classifier's
     * remaining inputs is enumerated and `BOUND_VERIFIED` never appears.
     */
    const reached = new Set<string>();
    for (const claimedSessionId of [null, "session-X"]) {
      for (const candidateCount of [0, 1, 2, 7]) {
        for (const readAttempted of [undefined, false, true]) {
          for (const sourceReadable of [true, false]) {
            for (const conflictDetail of [null, "a conflict"]) {
              const result = classifySessionBinding({ claimedSessionId, candidateCount, readAttempted, sourceReadable, conflictDetail });
              reached.add(result.state);
              expect(result.state).not.toBe("BOUND_VERIFIED");
            }
          }
        }
      }
    }
    expect(reached.has("BOUND_VERIFIED")).toBe(false);
    // The reachable set is exactly the claim-justifiable states.
    expect([...reached].sort()).toEqual(["AMBIGUOUS", "CONFLICT", "SESSION_CLAIMED_UNVERIFIED", "SESSION_UNBOUND", "SOURCE_UNAVAILABLE"]);
  });

  it("B8: the ordinary Preview's composition cannot derive a session id from a classification", () => {
    /**
     * SOURCE_DEMONSTRATED. The H0 line
     *   `dshSessionId: classification.state === "BOUND_VERIFIED" ? claimedSessionId : null`
     * is gone, the boolean input is gone, and the established id comes from the resolution.
     */
    const composition = source("src/composition/trajectory_v0.ts");
    expect(composition).not.toContain('classification.state === "BOUND_VERIFIED" ? claimedSessionId : null');
    expect(composition).not.toContain("canonicalBindingPresent");
    expect(composition).toContain("dshSessionId: verifiedSessionId");
    expect(composition).toContain("const verifiedSessionId = sessionBinding.verifiedSessionId;");
    // And no producer is composed, so the seam resolves to NO_ASSOCIATION_EVIDENCE.
    expect(composition).toContain("input.sessionAssociations ?? Object.freeze([])");
  });
});

describe("Trajectory-H1 §8.7 — binding counterexamples", () => {
  it("B1: caller claim and producer evidence disagree — the claim is NOT verified and stays visible", () => {
    const claimed = classifySessionBinding({ claimedSessionId: "session-X", candidateCount: 1, sourceReadable: true, conflictDetail: null });
    expect(claimed.state).toBe("SESSION_CLAIMED_UNVERIFIED");

    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association({ dshSessionId: "session-Y" })],
    });
    // Session-Y is the only producer-supported candidate; the caller's Session-X is not it.
    expect(resolved.outcome).toBe("RESOLVED_VERIFIED");
    expect(resolved.verifiedSessionId).toBe("session-Y");
    expect(resolved.verifiedSessionId).not.toBe("session-X");
    // The disagreement is visible: the claim and the verified identity are separate values.
    expect(claimed.state).not.toBe("BOUND_VERIFIED");
  });

  it("B2: an association for a DIFFERENT attempt is refused", () => {
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association({ attemptId: ATTEMPT_B })],
    });
    expect(resolved.outcome).toBe("UNRESOLVED");
    expect(resolved.refusal).toBe("ATTEMPT_MISMATCH");
    expect(resolved.verifiedSessionId).toBeNull();
  });

  it("B3: an association bound to a DIFFERENT invocation is refused", () => {
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-parent-owned",
      associations: [association({ invocationId: "inv-other" })],
    });
    expect(resolved.outcome).toBe("UNRESOLVED");
    expect(resolved.refusal).toBe("INVOCATION_MISMATCH");
    expect(resolved.verifiedSessionId).toBeNull();
    // With no parent-owned invocation supplied, the same evidence IS considered.
    const unscoped = resolveVerifiedSessionBinding({ projectId: PROJECT, attemptId: ATTEMPT_A, associations: [association()] });
    expect(unscoped.outcome).toBe("RESOLVED_VERIFIED");
  });

  it("B4: duplicate IDENTICAL evidence is idempotent, not two bindings", () => {
    const evidence = association();
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [evidence, evidence, { ...evidence }, { ...evidence, producerEvidence: { source: "HOST_PORT_OBSERVATION", reference: "ipc-msg-1-retry" } }],
    });
    expect(resolved.outcome).toBe("RESOLVED_VERIFIED");
    expect(resolved.verifiedSessionId).toBe("session-Y");
    // One session identity, one invocation — duplicates did not create additional bindings.
    expect(new Set(resolved.considered.map((entry) => entry.dshSessionId)).size).toBe(1);
    expect(new Set(resolved.considered.map((entry) => entry.invocationId)).size).toBe(1);
  });

  it("B5: contradictory Session identities for one invocation are a CONFLICT, not first-wins or last-wins", () => {
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association({ dshSessionId: "session-Y" }), association({ dshSessionId: "session-Z" })],
    });
    expect(resolved.outcome).toBe("UNRESOLVED");
    expect(resolved.refusal).toBe("CONFLICTING_SESSION_IDENTITY");
    expect(resolved.verifiedSessionId).toBeNull();
    // Order does not change the verdict: reversing the input gives the same refusal.
    const reversed = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association({ dshSessionId: "session-Z" }), association({ dshSessionId: "session-Y" })],
    });
    expect(reversed.refusal).toBe("CONFLICTING_SESSION_IDENTITY");
    expect(reversed.verifiedSessionId).toBeNull();
  });

  it("B6: a real-looking producer observation with NO durable association does not produce verification", () => {
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association({ durableBindingRef: null, verification: "UNVERIFIED" })],
    });
    expect(resolved.outcome).toBe("UNRESOLVED");
    expect(resolved.refusal).toBe("DURABLE_BINDING_MISSING");
    expect(resolved.verifiedSessionId).toBeNull();
    // The observation is still REPRESENTED, so a reviewer sees what was observed.
    expect(resolved.considered.length).toBe(1);
    expect(resolved.considered[0]!.observationState).toBe("PRODUCER_OBSERVED");
  });

  it("B7: Session readability alone does not restore ownership after a restart", () => {
    /**
     * §8.7 B7: a readable session is not an input to the resolver at all. Readability is a fact about
     * the SOURCE; ownership is a fact about a DURABLE ASSOCIATION. With no association evidence, a
     * perfectly readable session establishes nothing.
     */
    const resolved = resolveVerifiedSessionBinding({ projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1", associations: [] });
    expect(resolved.outcome).toBe("UNRESOLVED");
    expect(resolved.refusal).toBe("NO_ASSOCIATION_EVIDENCE");
    // The resolver's signature has no session-readability parameter — the property is structural.
    const bindingCode = source("src/trajectory/binding.ts");
    expect(bindingCode).not.toContain("readable");
    expect(bindingCode).not.toContain("readState");
  });

  it("B8: a caller-declared association is refused — receiving a message is not a producer observation", () => {
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association({ observationState: "CALLER_DECLARED", producerEvidence: { source: "CALLER_DECLARATION", reference: "caller-said-so" } })],
    });
    expect(resolved.outcome).toBe("UNRESOLVED");
    expect(resolved.refusal).toBe("NOT_PRODUCER_OBSERVED");
    expect(resolved.verifiedSessionId).toBeNull();
  });

  it("a marked-conflicting association is refused before any other resolution", () => {
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association({ verification: "CONFLICTING", conflictDetail: "two reports disagree" })],
    });
    expect(resolved.outcome).toBe("UNRESOLVED");
    expect(resolved.refusal).toBe("MARKED_CONFLICTING");
    expect(resolved.verifiedSessionId).toBeNull();
  });

  it("the resolver requires the exact project and attempt scope", () => {
    const wrongProject = resolveVerifiedSessionBinding({
      projectId: "other-project", attemptId: ATTEMPT_A, associations: [association()],
    });
    expect(wrongProject.refusal).toBe("ATTEMPT_MISMATCH");
  });

  it("a verified resolution reports the evidence it actually considered", () => {
    const resolved = resolveVerifiedSessionBinding({
      projectId: PROJECT, attemptId: ATTEMPT_A, invocationId: "inv-1",
      associations: [association(), association({ attemptId: ATTEMPT_B }), association({ invocationId: "inv-2" })],
    });
    expect(resolved.outcome).toBe("RESOLVED_VERIFIED");
    // Only the matching evidence is reported, so a reviewer re-checks the right rows.
    expect(resolved.considered.length).toBe(1);
    expect(resolved.considered[0]).toMatchObject({ invocationId: "inv-1", dshSessionId: "session-Y", durableBindingRef: "binding-1" });
  });
});
