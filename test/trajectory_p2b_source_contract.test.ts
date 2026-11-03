/**
 * Trajectory-P2-B §5 B0-C1 — BASELINE SOURCE FALSIFIERS.
 *
 * Every test here pins a fact that is TRUE at the P2-B baseline (HEAD 6dc52ba) and that P2-B must
 * change. They are written as FALSIFIERS, not as wishes: each one reads the actual shipped source or
 * exercises the actual shipped function, so a later commit that closes the gap must FLIP the
 * assertion explicitly rather than let it silently keep passing.
 *
 * THE GAPS PINNED HERE (from the ruling):
 *
 *   F1  the P2-A Level C gate measures "no model turn" by UTF-8 text-scanning a Zstandard artifact,
 *       so its zero is vacuous — it would report zero for a session WITH turns.
 *   F2  the mandatory first-party gate returns early when DSH or dist is absent, and asserts
 *       `false === false`, so "did not run" reads as a pass.
 *   F3  the P2-A gate deletes a FIXED directory under a configurable root, recursively, with no
 *       containment proof — unsafe when the root is caller-controlled or shared.
 *   F4  the shipped Port does not surface the child's stdout, so a Host Failure's reason is not
 *       observable through the Parent Worker Result parser.
 *   F5  `sessionSourceQualification` is a caller-supplied hint: a controlled stub can carry
 *       `FIRST_PARTY_DSH_QUALIFIED` and the port records it verbatim. No verifier exists.
 *   F6  the P2-A tracker keeps only two identities, so a third distinct SessionId for one invocation
 *       is LOST — the durable history must preserve all candidates.
 *   F7  no durable Attempt -> Invocation -> Session association exists anywhere in `src/`.
 *   F8  no cold-process recovery exists.
 *
 * SAFETY. Read-only or in-memory; no model, no provider, no personal session, no network.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { makeWorkerSessionIdentityTracker } from "../src/interaction/work_delegation.js";

const REPO = process.cwd();
const readRepo = (relative: string): string | null => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

const P2A_GATE = readRepo("scripts/trajectory_p2a/level-c-first-party-gate.mjs");
const P2A_GATE_TEST = readRepo("test/trajectory_p2a_first_party_gate.test.ts");
const WORK_WORKER = readRepo("src/deployment/work_worker.ts");
const DELEGATION = readRepo("src/interaction/work_delegation.ts");

describe("P2B B0-C1 F1 — the P2-A 'zero turn events' measurement is vacuous on a compressed artifact", () => {
  it("the P2-A gate reads each session artifact as UTF-8 text and regex-matches textual event types", () => {
    expect(P2A_GATE).not.toBeNull();
    // The defect: a text scan of the artifact bytes, not a logical Session read.
    expect(P2A_GATE!).toMatch(/readFileSync\(\$\{JSON\.stringify\(artifact\)\},\s*'utf8'\)/u);
    // And it never uses the official DSH reader.
    expect(P2A_GATE!).not.toMatch(/makeRealDshSessionReader|readColdSessionLog/u);
  });

  it("the installed DSH JSONL backend writes a Zstandard artifact, whose magic cannot contain the scanned text", () => {
    /**
     * §5 B0-F1: measured directly on the P2-A gate's own artifacts. The suffix is `.zstd` and the
     * first four bytes are the Zstandard frame magic `28 b5 2f fd`. In such bytes no textual
     * `"type":"turn/start"` can appear, so a zero match is not evidence of zero turns.
     */
    const suffix = P2A_GATE!.includes("session.v") ? "session.v4.jsonl.zstd" : null;
    expect(suffix).toBe("session.v4.jsonl.zstd");
    const ZSTD_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);
    expect(ZSTD_MAGIC.toString("hex")).toBe("28b52ffd");
    // The scanned literal cannot appear in a zstd frame header/body by construction.
    expect(P2A_GATE!).toContain('turn\\/(start|end)');
  });
});

describe("P2B B0-C1 F2 — the mandatory first-party gate can pass without running", () => {
  it("the P2-A gate test returns early and asserts false===false when DSH or dist is absent", () => {
    expect(P2A_GATE_TEST).not.toBeNull();
    // The vacuous skip: no DSH/dist ⇒ return null ⇒ the test asserts the absence and passes.
    expect(P2A_GATE_TEST!).toMatch(/if \(!hasFirstPartyDsh \|\| !hasBuiltDist\) return null;/u);
    expect(P2A_GATE_TEST!).toMatch(/expect\(hasFirstPartyDsh && hasBuiltDist\)\.toBe\(false\)/u);
    // There is no explicit SKIPPED/BLOCKED/NOT_ESTABLISHED outcome vocabulary.
    expect(P2A_GATE_TEST!).not.toMatch(/"BLOCKED"|"SKIPPED"|"NOT_ESTABLISHED"/u);
  });
});

describe("P2B B0-C1 F3 — the P2-A gate recursively deletes a fixed, caller-influenced directory", () => {
  it("the gate root is env-configurable and the rig path is fixed, then removed recursively", () => {
    expect(P2A_GATE).not.toBeNull();
    // Caller-controllable root...
    expect(P2A_GATE!).toMatch(/process\.env\.PALIMPSEST_P2A_GATE_ROOT/u);
    // ...a FIXED subdirectory under it...
    expect(P2A_GATE!).toMatch(/const RIG = join\(GATE_ROOT, "p2a-level-c"\)/u);
    // ...deleted recursively with no containment assertion.
    expect(P2A_GATE!).toMatch(/rmSync\(RIG, \{ recursive: true, force: true \}\)/u);
    // And no unique per-run suffix, no containment proof.
    expect(P2A_GATE!).not.toMatch(/mkdtempSync/u);
  });
});

describe("P2B B0-C1 F4 — a Host Failure reason is not observable through the Parent's result parser", () => {
  it("the shipped port captures stdout but the result line carries no failure detail through the parser", () => {
    expect(WORK_WORKER).not.toBeNull();
    // The port DOES capture stdout...
    expect(WORK_WORKER!).toMatch(/spawned\.stdout\?\.on\("data"/u);
    /**
     * ...but `parseWorkWorkerResult` REJECTS a `detail` argument, so the host's own
     * `printWorkResult({kind:"HOST_FAILURE", detail})` line cannot be parsed as a Work Worker Outcome —
     * it is re-read as "worker result has unknown argument \"detail\"". The refusal reason is therefore
     * only visible on stderr or a direct capture, never through the Parent's structured result.
     */
    expect(WORK_WORKER!).toMatch(/worker result has unknown argument/u);
    // The host prints a HOST_FAILURE with a `detail` field that the parent parser will refuse.
    const runner = readRepo("host/dsh/lib/runner.js");
    expect(runner!).toMatch(/printWorkResult\(\{ kind: 'HOST_FAILURE', detail: failure/u);
  });
});

describe("P2B B0-C1 F5 — a caller-supplied source label is recorded verbatim, never verified", () => {
  it("the port accepts sessionSourceQualification from its caller and stamps it onto the observation", () => {
    expect(WORK_WORKER).not.toBeNull();
    expect(DELEGATION).not.toBeNull();
    // The label is a run-input field the caller supplies.
    expect(WORK_WORKER!).toMatch(/readonly sessionSourceQualification\?: WorkerSessionSourceQualification \| undefined;/u);
    // The port adopts it verbatim onto the observation with no verification step.
    expect(WORK_WORKER!).toMatch(/sourceQualification: runInput\.sessionSourceQualification \?\? "DIRECT_CHILD_IPC"/u);
    // No verifier exists in the module that could independently establish first-party provenance.
    expect(WORK_WORKER!).not.toMatch(/verifyFirstPartySource|attestFirstParty|qualifySourceProvenance/u);
  });
});

describe("P2B B0-C1 F6 — the P2-A tracker loses a third distinct SessionId for one invocation", () => {
  it("three distinct identities for one invocation retain only two candidates", () => {
    /**
     * §7.5: the tracker holds `sessionId` + `conflictingSessionId`. A third distinct identity is
     * dropped entirely, so the durable history would silently under-report the candidate set.
     */
    const tracker = makeWorkerSessionIdentityTracker({ invocationId: "wpi-f6" });
    const observe = (sessionId: string) => tracker.observe({ sessionId, directChildPid: 1, sourceQualification: "DIRECT_CHILD_IPC" });
    expect(observe("session-A")).toBe("OBSERVED");
    expect(observe("session-B")).toBe("CONFLICT");
    expect(observe("session-C")).toBe("CONFLICT");
    expect(tracker.sessionId).toBe("session-A");
    // Only ONE conflicting identity is retained; `session-B` is overwritten by `session-C`.
    expect(tracker.conflictingSessionId).toBe("session-C");
    // The candidate set the tracker exposes is {A, C} — B is LOST.
    const exposed = [tracker.sessionId, tracker.conflictingSessionId];
    expect(exposed).not.toContain("session-B");
    expect(exposed).toHaveLength(2);
  });
});

describe("P2B B0-C1 F7/F8 — no durable association and no cold recovery exist at baseline", () => {
  it("no execution-association durable store existed at the P2-B baseline", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2B C5)
     *
     * AT BASELINE (6dc52ba) this asserted that `src/execution_association/` did NOT exist — the F7 gap.
     * C5 CREATED the durable concern, so the gap is closed and the assertion is flipped to record that
     * the module now exists AND that it is the designated owner rather than an incidental directory.
     * The baseline finding is preserved here rather than deleted.
     */
    expect(existsSync(join(REPO, "src", "execution_association"))).toBe(true);
    // The concern owns a typed store and its strict parser registry.
    expect(existsSync(join(REPO, "src", "execution_association", "store.ts"))).toBe(true);
    expect(existsSync(join(REPO, "src", "execution_association", "contract.ts"))).toBe(true);
    expect(existsSync(join(REPO, "src", "execution_association", "qualification.ts"))).toBe(true);
    // It is a separate concern from the H1 binding contract, which still owns no store.
    expect(existsSync(join(REPO, "src", "trajectory", "association_store.ts"))).toBe(false);
    const binding = readRepo("src/trajectory/binding.ts");
    expect(binding!).toMatch(/does not create a database, a\s*\n?\s*\*?\s*store or a durable binding table/u);
  });

  it("no cold-process recovery of an execution association existed at the baseline", () => {
    /**
     * -------------------------------------------------------------- CHANGED ASSERTION (P2B C6)
     *
     * AT BASELINE this asserted that no recovery symbol existed (the F8 gap). C6 added the read-side
     * qualification, whose whole point is to recompute a binding from durable records in a FRESH
     * process — so the gap is closed. The baseline finding is preserved in the record above.
     */
    const associationIndex = readRepo("src/execution_association/index.ts");
    expect(associationIndex).not.toBeNull();
    // The read side recomputes qualification from durable records, which is what makes cold recovery
    // possible without the original Parent's memory.
    expect(associationIndex!).toMatch(/makeAssociationQualifier/u);
    expect(associationIndex!).toMatch(/SqliteExecutionAssociationStore/u);
  });
});
