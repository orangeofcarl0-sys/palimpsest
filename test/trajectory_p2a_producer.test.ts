/**
 * Trajectory-P2A §6 (C2) — THE FIRST-PARTY WORKER SESSION IDENTITY PRODUCER.
 *
 * These tests exercise the SHIPPED producer module (`host/dsh/lib/session-identity.js`) directly and
 * the runner's integration point, without a model, without a provider and without a personal session.
 *
 * Evidence classes:
 *   CONTROLLED_FIXTURE  the producer's own contract, exercised over controlled `send` channels
 *   SOURCE_DEMONSTRATED the runner integration point, read from the shipped source
 *
 * The §6 contract has three separable obligations, and each is tested on its own:
 *   1. the identity reported is the CREATED handle's, and only a well-formed one is reported;
 *   2. the report carries EXACTLY the session-creation fact and no other identity or authority;
 *   3. absence or failure of the IPC capability is contained and never fails the worker.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The host bundle is JavaScript outside the TypeScript program, so it is imported through a URL —
 * the same technique `host_cmdline.test.ts` uses. The module under test deliberately imports
 * nothing, so it is loadable directly from the source tree.
 */
const REPO = join(fileURLToPath(new URL("..", import.meta.url)));
const modulePath = pathToFileURL(join(REPO, "host", "dsh", "lib", "session-identity.js")).href;
const {
  WORKER_SESSION_IDENTITY_CHANNEL,
  WORKER_SESSION_IDENTITY_FIELDS,
  WORKER_SESSION_IDENTITY_KIND,
  isWellFormedSessionId,
  reportWorkerSessionIdentity,
} = (await import(modulePath)) as {
  readonly WORKER_SESSION_IDENTITY_CHANNEL: string;
  readonly WORKER_SESSION_IDENTITY_FIELDS: readonly string[];
  readonly WORKER_SESSION_IDENTITY_KIND: string;
  readonly isWellFormedSessionId: (value: unknown) => boolean;
  readonly reportWorkerSessionIdentity: (input: { readonly sessionId: unknown; readonly send?: unknown }) => {
    readonly reported: boolean;
    readonly outcome: string;
    readonly detail: string | null;
  };
};

const WORKER_SESSION = "worker-1f0c4a2e-7b3d-4a51-9c6e-2d8b5a7f0e13";

function source(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

/* ================================================================== §6.1 identity source */

describe("P2A C2 §6.1 — the identity comes from the CREATED handle", () => {
  it("reports the session id it was given and nothing else", () => {
    const sent: unknown[] = [];
    const result = reportWorkerSessionIdentity({ sessionId: WORKER_SESSION, send: (m: unknown) => sent.push(m) });
    expect(result.reported).toBe(true);
    expect(result.outcome).toBe("REPORT_ATTEMPTED");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toEqual({
      channel: WORKER_SESSION_IDENTITY_CHANNEL,
      kind: WORKER_SESSION_IDENTITY_KIND,
      sessionId: WORKER_SESSION,
    });
  });

  it("refuses to report a malformed identity rather than sending it for a lenient reader to coerce", () => {
    for (const bad of [undefined, null, "", 42, {}, [], "has space", "has\nnewline", "x".repeat(201)]) {
      const sent: unknown[] = [];
      const result = reportWorkerSessionIdentity({ sessionId: bad, send: (m: unknown) => sent.push(m) });
      expect(result.reported).toBe(false);
      expect(result.outcome).toBe("IDENTITY_NOT_WELL_FORMED");
      expect(sent).toHaveLength(0);
    }
  });

  it("accepts the shapes a real DSH session identity actually takes", () => {
    for (const good of [WORKER_SESSION, "session-7439041a-d269-4434-a6f2-491a21e36502", "probe-session-1", "a"]) {
      expect(isWellFormedSessionId(good)).toBe(true);
    }
    // Bounded: a pathological value cannot enter durable evidence.
    expect(isWellFormedSessionId("x".repeat(200))).toBe(true);
    expect(isWellFormedSessionId("x".repeat(201))).toBe(false);
  });
});

/* ================================================================== §6.2 message shape */

describe("P2A C2 §6.2 — the message carries ONLY the session-creation fact", () => {
  it("emits exactly the closed field set, and no extra field", () => {
    const sent: Record<string, unknown>[] = [];
    reportWorkerSessionIdentity({ sessionId: WORKER_SESSION, send: (m: Record<string, unknown>) => sent.push(m) });
    expect(Object.keys(sent[0]!).sort()).toEqual([...WORKER_SESSION_IDENTITY_FIELDS].sort());
  });

  it("carries no Attempt, Project, Job, Invocation, binding or authority claim", () => {
    const sent: unknown[] = [];
    reportWorkerSessionIdentity({ sessionId: WORKER_SESSION, send: (m: unknown) => sent.push(m) });
    const serialized = JSON.stringify(sent[0]);
    for (const forbidden of [
      "attemptId",
      "projectId",
      "hostLocalJobId",
      "invocationId",
      "durableBinding",
      "verified",
      "promotion",
      "settled",
      "outcome",
      "hostFailure",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("is a DIFFERENT protocol from the context pull, in channel and in kind", () => {
    expect(WORKER_SESSION_IDENTITY_CHANNEL).not.toBe("palimpsest-worker-context-v1");
    expect(WORKER_SESSION_IDENTITY_KIND).not.toBe("pull");
    expect(WORKER_SESSION_IDENTITY_KIND).not.toBe("pull-result");
  });
});

/* ================================================================== §6.4 no-IPC behaviour */

describe("P2A C2 §6.4 — an absent or failing IPC channel never fails the worker", () => {
  it("reports NO_IPC_CHANNEL when process.send is absent, and throws nothing", () => {
    const result = reportWorkerSessionIdentity({ sessionId: WORKER_SESSION, send: undefined });
    expect(result.reported).toBe(false);
    expect(result.outcome).toBe("NO_IPC_CHANNEL");
  });

  it("contains a SYNCHRONOUS send failure", () => {
    const result = reportWorkerSessionIdentity({
      sessionId: WORKER_SESSION,
      send: () => {
        throw new Error("channel closed");
      },
    });
    expect(result.reported).toBe(false);
    expect(result.outcome).toBe("IPC_SEND_FAILED");
    expect(result.detail).toContain("channel closed");
  });

  it("contains an ASYNCHRONOUS send failure reported through the send callback", () => {
    // Node's send callback receives the error; the producer must not turn it into a throw.
    let callbackInvoked = false;
    const result = reportWorkerSessionIdentity({
      sessionId: WORKER_SESSION,
      send: (_message: unknown, callback?: (error: Error | null) => void) => {
        callbackInvoked = true;
        callback?.(new Error("asynchronous channel failure"));
      },
    });
    expect(callbackInvoked).toBe(true);
    // The send itself was attempted; the failure is delivered asynchronously and is not a throw.
    expect(result.reported).toBe(true);
    expect(result.outcome).toBe("REPORT_ATTEMPTED");
  });

  it("reports an attempt as an ATTEMPT — it never claims the parent received the message", () => {
    const sent: unknown[] = [];
    const result = reportWorkerSessionIdentity({ sessionId: WORKER_SESSION, send: (m: unknown) => sent.push(m) });
    // The contract's own vocabulary must not contain a delivery or receipt claim.
    expect(JSON.stringify(result)).not.toContain("delivered");
    expect(JSON.stringify(result)).not.toContain("received");
    expect(JSON.stringify(result)).not.toContain("observed");
    expect(result.outcome).toBe("REPORT_ATTEMPTED");
  });
});

/* ================================================================== §6.3 runner integration */

describe("P2A C2 §6.3 — the runner emits after creation and before the first model turn", () => {
  it("places the report between agents.create and the capability refusal, well before the first followup", () => {
    const text = source("host/dsh/lib/runner.js");
    const start = text.indexOf("async function runWorker");
    const end = text.indexOf("async function runBranch");
    const block = text.slice(start, end);
    const createIndex = block.indexOf("const handle = await agents.create({");
    const reportIndex = block.indexOf("sessionIdentityReport = reportWorkerSessionIdentity({");
    const refusalIndex = block.indexOf("if (capabilityRefusal !== null)");
    /**
     * The FIRST model turn is the real CALL, not the mention inside the report's own comment, so the
     * anchor is the call site together with its argument expression (matched across either line
     * ending, since the shipped bundle is CRLF).
     */
    const followupMatch = /agent\.followup\(\s*\r?\n\s*userMessage\(/u.exec(block);
    const followupIndex = followupMatch === null ? -1 : followupMatch.index;
    expect(createIndex).toBeGreaterThan(-1);
    expect(reportIndex).toBeGreaterThan(createIndex);
    expect(followupIndex).toBeGreaterThan(-1);
    // §6.5: the report precedes the refusal, so a refused worker still reported its created session.
    expect(refusalIndex).toBeGreaterThan(reportIndex);
    // §6.3: and it is far before the first model turn.
    expect(followupIndex).toBeGreaterThan(refusalIndex);
  });

  it("reads the identity from the CREATED handle, never from the candidate minted for create", () => {
    const text = source("host/dsh/lib/runner.js");
    // The report reads handle.agent.session.id.
    expect(text).toContain("sessionId: handle?.agent?.session?.id,");
    // It passes process.send as the channel — the ONE IPC capability, never stdout.
    expect(text).toContain("send: process.send,");
    // And the report is NOT built from the candidate string.
    const reportIndex = text.indexOf("sessionIdentityReport = reportWorkerSessionIdentity({");
    const reportCall = text.slice(reportIndex, reportIndex + 300);
    expect(reportCall).not.toContain("randomUUID");
  });

  it("contains a throwing identity read so the worker outcome cannot change", () => {
    const text = source("host/dsh/lib/runner.js");
    expect(text).toContain("sessionIdentityReport = { reported: false, outcome: 'REPORT_THREW'");
    /**
     * §6.6: the producer is imported for its report only. The assertion is on EXECUTABLE surface, not
     * on prose — the module's own comment legitimately says it "settles nothing", so a substring test
     * over the whole file would be measuring the docstring rather than the code.
     */
    const producer = source("host/dsh/lib/session-identity.js");
    // Strip comments, then check the remaining code carries no authority verb and no tool registration.
    const code = producer.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/^\s*\/\/.*$/gmu, "");
    for (const verb of ["settle", "promote", "verify", "grant", "resume", "dispose"]) {
      expect(code).not.toContain(verb);
    }
    expect(code).not.toContain("tools.register");
    expect(code).not.toContain("tools.restrict");
  });

  it("reports its own ATTEMPT on the noncanonical telemetry line, defaulting to NOT_ATTEMPTED", () => {
    const text = source("host/dsh/lib/runner.js");
    expect(text).toContain("PALIMPSEST_WORKER_SESSION_IDENTITY");
    expect(text).toContain("sessionIdentityReport ?? { reported: false, outcome: 'NOT_ATTEMPTED' }");
  });

  it("does not write the identity into stdout, stderr or the worker result", () => {
    const producer = source("host/dsh/lib/session-identity.js");
    /**
     * §6.3/§10.1: the identity must NOT travel as model-visible or model-writable telemetry. The only
     * stdout the producer could reach is a delivery-failure diagnostic, and it never prints the id.
     */
    const stderrWrites = producer.match(/process\.stderr\.write\([^)]*\)/gu) ?? [];
    for (const write of stderrWrites) expect(write).not.toContain("sessionId");
    expect(producer).not.toContain("PALIMPSEST_SESSION_CREATED");
    expect(producer).not.toContain("console.log");
  });
});
