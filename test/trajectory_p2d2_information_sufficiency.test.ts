/**
 * Trajectory-P2-D2 §11/§13 Group G — INFORMATION SUFFICIENCY AUDIT (C7).
 *
 * Proves the honest limits of what the current Capsule content CAN establish, so no future benchmark claims
 * an effect the delivered history cannot support:
 *
 *   53. startup/configuration history is NOT labeled failure-recovery evidence;
 *   54. a structural `tool/result` is NOT mislabeled success;
 *   55. a candidate treatment-relevant failure has NO Capsule-visible support under the current sanitizer;
 *   56. missing content is recorded honestly;
 *   57. the event window's selection policy is a prefix and its sufficiency is NOT assumed;
 *   58. sanitization does not expose raw sensitive content.
 *
 * SAFETY. Pure module assertions; no DSH, no model, no network, no personal data.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sanitizeDshEvent, RECOGNIZED_DSH_EVENT_TYPES } from "../src/trajectory/index.js";

const REPO = process.cwd();
const readRepo = (relative: string): string | null => {
  const path = join(REPO, relative);
  return existsSync(path) ? readFileSync(path, "utf8") : null;
};

describe("P2D2 §11 — information sufficiency of the delivered Capsule content", () => {
  it("54. a structural tool/result is NOT read as success, and no tool body is retained", () => {
    const event = sanitizeDshEvent({
      sessionId: "s",
      seq: 0,
      type: "tool/result",
      time: 0,
      data: { step: 1, message: { role: "tool", toolCallId: "c1", isError: true, content: [{ type: "text", text: "SECRET OUTPUT: command failed with exit 1" }] } },
      inherited: false,
      surface: null,
    });
    // The status is `recorded` — the PRESENCE of a message, explicitly NOT success.
    expect(event.observedStatus).toBe("recorded");
    // The body — including the error flag and the raw output — is NOT retained.
    expect(JSON.stringify(event)).not.toContain("SECRET OUTPUT");
    expect(event.summary).toBe("tool result at step 1");
  });

  it("58. the sanitizer never retains raw content fields", () => {
    const event = sanitizeDshEvent({
      sessionId: "s",
      seq: 1,
      type: "assistant/message",
      time: 1,
      data: { turn: 1, step: 1, message: { role: "assistant", content: [{ type: "text", text: "private chain of thought" }] } },
      inherited: false,
      surface: null,
    });
    expect(event.summary).toBe("assistant message at turn 1 step 1");
    expect(JSON.stringify(event)).not.toContain("private chain of thought");
    // A tool CALL keeps only the NAME, never the arguments.
    const call = sanitizeDshEvent({ sessionId: "s", seq: 2, type: "tool/call", time: 2, data: { step: 1, name: "bash", arguments: "rm -rf /" }, inherited: false, surface: null });
    expect(call.summary).toBe("tool call bash at step 1");
    expect(JSON.stringify(call)).not.toContain("rm -rf");
  });

  it("55. the sanitizer cannot establish a failure CAUSE (Target B is not supported)", () => {
    const execution = readRepo("src/trajectory/execution.ts")!;
    // `user/message` is not even a recognized event type, and no content field is read.
    expect(execution).toMatch(/RECOGNIZED_DSH_EVENT_TYPES = \[/u);
    expect(execution).not.toMatch(/"user\/message"/u);
    // The sanitizer reads only structural fields: turn/step/name/status/reason — never message or arguments.
    expect(execution).toMatch(/Nothing here reads `data\.message`, `data\.arguments` or any other content field/u);
    // DSH DOES expose an official structural failure field (`tool/result.message.isError`) that the product
    // does not read; the audit records that honestly rather than inventing one.
    const reader = readRepo("host/deployment/runtime/session_reader.js")!;
    expect(reader).toMatch(/observedStatus = data\.message === undefined \? 'unknown' : 'recorded';/u);
  });

  it("53. the current real (non-model) Session is a delivery fixture, NOT failure-recovery evidence", () => {
    // The real P2-D1/D2 non-model Session's events are session start / configuration, not a documented
    // engineering failure; the L2 gate's objective is a probe objective, not a failure.
    const l2 = readRepo("scripts/trajectory_p2d2/l2-gate.mjs")!;
    expect(l2).toMatch(/deterministic-llm-plugin/u);
    // The gate reports the evidence level as REAL_DSH_USER_MESSAGE, and explicitly disclaims the stronger
    // claim: the string appears only inside a "never ..." disclaimer, never as an emitted state.
    expect(l2).toMatch(/REAL_DSH_USER_MESSAGE/u);
    expect(l2).toMatch(/never `MODEL_CONSUMED_CAPSULE`/u);
    expect(l2).not.toMatch(/evidenceLevel: "MODEL_CONSUMED_CAPSULE"/u);
  });

  it("57. the event window is a prefix and its sufficiency is NOT assumed", () => {
    const capsule = readRepo("src/trajectory/context_capsule.ts")!;
    expect(capsule).toMatch(/maxEvents: 24,/u);
    // The builder iterates from the start of the page (a prefix), and the uncertainty block reports the
    // unread extent so a consumer sees what was NOT delivered.
    expect(capsule).toMatch(/for \(const event of execution\.events\) \{/u);
    expect(capsule).toMatch(/unreadHistory:/u);
  });

  it("56. missing content is recorded honestly rather than fabricated", () => {
    const capsule = readRepo("src/trajectory/context_capsule.ts")!;
    // The uncertainty block carries the honest unknown/unread/caveat fields.
    expect(capsule).toMatch(/syntheticRecoveryEventCount: input\.attributionProvenance\?\.syntheticRecoveryEventCount \?\? null/u);
    expect(capsule).toMatch(/otherInvocationsUnresolved/u);
    expect(capsule).toMatch(/caveats: Object\.freeze\(\[/u);
    // And the page-level "does not prove" list is preserved on every page.
    const execution = readRepo("src/trajectory/execution.ts")!;
    expect(execution).toMatch(/DSH_PAGE_DOES_NOT_PROVE = Object\.freeze\(\[/u);
  });
});
