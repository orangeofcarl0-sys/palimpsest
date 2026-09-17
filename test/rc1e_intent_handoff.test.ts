/**
 * RC-1E §37 — deterministic proof for the remote collaboration intent handoff.
 *
 *   RC1E-N01  inbound attention says treat the pending task as a normal project request
 *   RC1E-N02  the attention text still carries no message body and no store access
 *   RC1E-N03  simple-request guidance permits a direct answer
 *   RC1E-N04  explicit-parallel guidance points at local collaboration, conditionally
 *   RC1E-N05  the cross-project tool description exposes respond.compose as a first-class form
 *   RC1E-N06  answer.compose accepts the CollaborationIntent vocabulary and refuses anything else
 *
 * No live model, no host process. The product surfaces under test ARE the shipped ones: the
 * attention formatter is the module the runner composes, and the tool definitions come from
 * `defineApplicationTools` over a deployment launched from a normal two-project profile.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import type { AttentionSignal } from "../src/attention/index.js";
import { materializePeerRef } from "../src/federation/index.js";
import {
  CROSS_PROJECT_HOST_TEXTS,
  CROSS_PROJECT_INBOUND_ANSWER_TEXT,
  CROSS_PROJECT_INBOUND_REQUEST_TEXT,
  crossProjectAttentionText,
} from "../src/interaction/cross_project_host_adapter.js";
import { COLLABORATION_INTENTS } from "../src/interaction/intent.js";
import { CrossProjectError } from "../src/interaction/cross_project.js";
import { defineApplicationTools } from "../src/tools/application_tools.js";
import { launchDeployment, parseDeploymentProfile } from "../src/deployment/index.js";

const ROOT = mkdtempSync(join(tmpdir(), "palimpsest-rc1e-"));
afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* Windows may hold a handle briefly */
  }
});

const SIGNAL: AttentionSignal = {
  schemaVersion: 1,
  signalId: "sig-rc1e-1",
  kind: "inbound_peer_message",
  peer: materializePeerRef({ peerId: "peer-optics" }),
  threadId: "thr-cpq-rc1e",
  subjects: [{ kind: "peer_message", id: "msg-rc1e-1" }],
  reason: "inbound message from \"peer-optics\" awaits local attention",
  requiresUserAttention: false,
  createdAt: "2026-09-18T00:00:00Z",
};

function crossProjectTool() {
  const profile = parseDeploymentProfile({
    schemaVersion: 1,
    profileId: "rc1e",
    projectId: "optics",
    localPeer: "optics-peer",
    persistentPoint: "pp-rc1e",
    transport: { namespace: "rc1e", databasePath: join(ROOT, "transport.sqlite") },
    databases: {
      orchestration: join(ROOT, "orchestration.sqlite"),
      ordarium: join(ROOT, "ordarium.sqlite"),
      coordination: join(ROOT, "coordination.sqlite"),
      transportCursors: join(ROOT, "cursors.sqlite"),
      attentionMarks: join(ROOT, "attention.sqlite"),
    },
    directory: [
      { peerId: "optics-peer", competenceTags: ["optics"] },
      { peerId: "detector-peer", competenceTags: ["detector"] },
    ],
    projectDirectory: [
      { projectId: "optics", displayName: "the optics project", aliases: ["optics"], peerId: "optics-peer", competenceTags: ["optics"] },
      { projectId: "detector", displayName: "the detector project", aliases: ["detector"], peerId: "detector-peer", competenceTags: ["detector"] },
    ],
    reasoning: {},
    attention: { policyId: "rc1e-attention", cooldownMs: 0, activation: "none" },
  });
  const deployment = launchDeployment(profile);
  const tools = defineApplicationTools(deployment.installed.application);
  const tool = tools.find((entry) => entry.name === "palimpsest_cross_project");
  if (tool === undefined) throw new Error("the shipped catalogue no longer exposes palimpsest_cross_project");
  return { deployment, tool };
}

const propertiesOf = (tool: { readonly parameters: unknown }): Record<string, { readonly description?: string }> =>
  (tool.parameters as { readonly properties: Record<string, { readonly description?: string }> }).properties;

/* ================================================================== *
 * RC1E-N01 / N03 / N04 — the inbound instruction
 * ================================================================== */

describe("RC1E-N01 inbound attention treats the pending task as a normal project request", () => {
  it("N01 says to inspect the pending request and handle its task as this project's own work", () => {
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toContain("Inspect the pending request first");
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toContain("Treat the pending task like a normal request to this project");
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toContain("Return the answer through palimpsest_cross_project");
  });

  it("N03 permits a direct answer when one principal is sufficient", () => {
    // §6/§15/§22: no universal fan-out. The guidance must not read as "always explore".
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toContain("answer directly when one principal is sufficient");
  });

  it("N04 names local collaboration for an explicit multiple-independent-approaches request, conditionally", () => {
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toContain("parallel exploration");
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toContain("multiple independent approaches");
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toContain("use this project's normal collaboration capability before responding");
    // Conditional, not unconditional: the cue hangs off what the pending task explicitly asks.
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).toMatch(/when it explicitly asks/u);
    // And it is not a semantic decision: the text names no branch count, no intent, no status.
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).not.toMatch(/PARALLEL_AND_CHECK|branchCountHint|intent\s*[:=]/u);
  });

  it("the answer-side instruction is unchanged and both directions are still formatted", () => {
    expect(CROSS_PROJECT_INBOUND_ANSWER_TEXT).toBe(
      "A project you asked has replied. Receive the result and surface it to the user.",
    );
    expect(CROSS_PROJECT_HOST_TEXTS.request).toBe(CROSS_PROJECT_INBOUND_REQUEST_TEXT);
    expect(CROSS_PROJECT_HOST_TEXTS.answer).toBe(CROSS_PROJECT_INBOUND_ANSWER_TEXT);
    const either = crossProjectAttentionText(SIGNAL);
    expect(either).toContain(CROSS_PROJECT_INBOUND_REQUEST_TEXT);
    expect(either).toContain(CROSS_PROJECT_INBOUND_ANSWER_TEXT);
    // The formatter still ends with the routing line and the tool hint (§61).
    expect(either).toContain('Signalled by "peer-optics"');
    expect(either).toContain('Use the palimpsest_cross_project tool: action "pending"');
  });
});

/* ================================================================== *
 * RC1E-N02 — no message content, no store access
 * ================================================================== */

describe("RC1E-N02 the attention text carries no message body and reads no store", () => {
  it("ignores anything body-shaped on the signal and depends only on routing metadata", () => {
    const withCanary = {
      ...SIGNAL,
      // A body-shaped field the type does not declare. If the formatter ever read it, the
      // canary would appear in the host text.
      body: "RAW_PEER_MESSAGE_BODY_CANARY",
      reason: "a different reason",
      requiresUserAttention: true,
    } as unknown as AttentionSignal;
    const text = crossProjectAttentionText(withCanary, "request");
    expect(text).not.toContain("RAW_PEER_MESSAGE_BODY_CANARY");
    expect(Object.keys(SIGNAL)).not.toContain("body");
    // The output is a function of routing metadata only: same peer/thread/subjects, same text.
    expect(text).toBe(crossProjectAttentionText(SIGNAL, "request"));
    // The request-side text itself embeds no task text and no protocol identifier.
    expect(CROSS_PROJECT_INBOUND_REQUEST_TEXT).not.toMatch(/cpq-|thr-|msg-/u);
  });
});

/* ================================================================== *
 * RC1E-N05 / N06 — the cross-project tool exposes respond.compose
 * ================================================================== */

describe("RC1E-N05/N06 respond.compose is a first-class documented path", () => {
  it("N05 the description states both answer forms and when compose is the right one", async () => {
    const { deployment, tool } = crossProjectTool();
    try {
      const properties = propertiesOf(tool);
      const answer = properties.answer?.description ?? "";
      const main = (tool as unknown as { readonly description: string }).description;
      // Both shapes are stated explicitly...
      expect(answer).toContain("author it");
      expect(answer).toContain("compose");
      expect(main).toContain("compose");
      // ...the conditional preference is stated...
      expect(answer).toMatch(/explicitly asks for\s+parallel|parallel exploration/u);
      expect(answer).toContain("PARALLEL");
      // ...and the exploratory firewall is restated on the composed path.
      expect(answer).toContain("EXPLORATORY");
      expect(answer).toMatch(/never present a single authored answer/iu);
      // Every collaboration intent is discoverable from THIS tool, not only from
      // palimpsest_collaborate (§13): the vocabulary is interpolated, not paraphrased.
      for (const intent of COLLABORATION_INTENTS) expect(answer).toContain(intent);
    } finally {
      await deployment.close();
    }
  });

  it("N06 a composed answer accepts the CollaborationIntent vocabulary and refuses anything else", async () => {
    const { deployment, tool } = crossProjectTool();
    try {
      const crossProject = deployment.installed.application.crossProject!;
      // There is no pending request in this rig, so a WELL-FORMED draft fails later, at
      // `unknown_request` — which proves the draft itself parsed, including the intent.
      for (const intent of COLLABORATION_INTENTS) {
        await expect(crossProject.respond("cpq-rc1e-absent", { compose: { task: "compare two caches", intent } })).rejects.toMatchObject({
          reason: "unknown_request",
        });
      }
      // An intent outside the vocabulary is refused at the boundary, as invalid input.
      await expect(
        crossProject.respond("cpq-rc1e-absent", { compose: { task: "compare two caches", intent: "REMOTE_EXPLORE" as never } }),
      ).rejects.toMatchObject({ reason: "invalid_request" });
      // §16: compose derives the status and the text, so supplying them together is refused.
      await expect(
        crossProject.respond("cpq-rc1e-absent", { compose: { intent: "PARALLEL" }, answer: "authored too" } as never),
      ).rejects.toMatchObject({ reason: "invalid_request" });
      // §33: no new protocol species was invented for this stage.
      expect(() => new CrossProjectError("invalid_request", "x")).not.toThrow();
    } finally {
      await deployment.close();
    }
  });
});
