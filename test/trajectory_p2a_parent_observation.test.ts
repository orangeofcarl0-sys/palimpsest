/**
 * Trajectory-P2A §7 (C3) + §9 Level A — THE PARENT IPC PARSER AND INVOCATION CORRELATION.
 *
 * These tests drive the REAL Parent worker port (`dshSubprocessWorkWorkerPort`) with CONTROLLED local
 * Node child processes. That establishes `IPC_OBSERVATION_DEMONSTRATED`: the Parent's own parser and
 * invocation correlation, over real ChildProcess IPC channels.
 *
 * IT DOES NOT ESTABLISH A REAL DSH SESSION. The children here are stubs; no DSH binary, no provider and
 * no model is involved. The first-party integration claim belongs to the Level C evidence.
 *
 * §9 Level A's required cases are covered: exact valid message, wrong channel, wrong kind, extra fields,
 * missing SessionId, invalid/oversized SessionId, Context Pull never treated as identity, stdout/stderr
 * imitation ignored, cross-child non-attribution, idempotent repeats, explicit conflict, NOT_OBSERVED,
 * spawn failure, sink exception, and timeout.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  WORK_WORKER_SESSION_IDENTITY_CHANNEL,
  WORK_WORKER_SESSION_IDENTITY_KIND,
  dshSubprocessWorkWorkerPort,
  parseWorkerSessionIdentityEnvelope,
  workerSessionIdWellFormed,
} from "../src/deployment/work_worker.js";
import type { WorkerSessionIdentityObservation } from "../src/interaction/work_delegation.js";

const SESSION_A = "worker-aaaa1111-2222-3333-4444-555566667777";
const SESSION_B = "worker-bbbb1111-2222-3333-4444-555566667777";

const CONTEXT = {
  work: {
    projectGoal: "g", requirements: [], decisions: [], objective: "o", writeScope: [], requiredArtifacts: [],
    baseCommit: "c".repeat(40), completionChecks: [], independentVerificationRequired: false,
  },
  compiled: { manifestId: "m", boot: [], handles: [] },
} as never;

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "palimpsest-p2a-"));
}

/** Write a controlled worker child. It sends the given IPC payloads, then prints a valid result line. */
function scriptedChild(body: string): { readonly port: ReturnType<typeof dshSubprocessWorkWorkerPort>; readonly cleanup: () => void } {
  const root = tempDir();
  const scriptPath = join(root, "child.mjs");
  writeFileSync(
    scriptPath,
    [
      'const RESULT = "PALIMPSEST_WORK_RESULT ";',
      body,
      // A worker that reports its outcome is a normal worker; the identity report is a sibling fact.
      'process.stdout.write(RESULT + JSON.stringify({ kind: "READY_FOR_SETTLEMENT", summary: "done" }) + "\\n");',
      "process.exit(0);",
      "",
    ].join("\n"),
    "utf8",
  );
  return {
    port: dshSubprocessWorkWorkerPort({ dshBin: scriptPath, profile: "p2a-stub", timeoutMs: 20_000 }),
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

function sendIdentity(sessionId: string): string {
  return `process.send({ channel: ${JSON.stringify(WORK_WORKER_SESSION_IDENTITY_CHANNEL)}, kind: ${JSON.stringify(WORK_WORKER_SESSION_IDENTITY_KIND)}, sessionId: ${JSON.stringify(sessionId)} });`;
}

/* ================================================================== §7.1 the strict parser */

describe("P2A C3 §7.1 — the identity parser is strict and closed", () => {
  it("accepts EXACTLY the valid shape", () => {
    expect(parseWorkerSessionIdentityEnvelope({ channel: WORK_WORKER_SESSION_IDENTITY_CHANNEL, kind: WORK_WORKER_SESSION_IDENTITY_KIND, sessionId: SESSION_A })).toEqual({ sessionId: SESSION_A });
  });

  it("refuses a wrong channel, a wrong kind, extra fields, and a missing SessionId", () => {
    const base = { channel: WORK_WORKER_SESSION_IDENTITY_CHANNEL, kind: WORK_WORKER_SESSION_IDENTITY_KIND, sessionId: SESSION_A };
    expect(parseWorkerSessionIdentityEnvelope({ ...base, channel: "palimpsest-worker-context-v1" })).toBeUndefined();
    expect(parseWorkerSessionIdentityEnvelope({ ...base, kind: "pull" })).toBeUndefined();
    expect(parseWorkerSessionIdentityEnvelope({ ...base, extra: 1 })).toBeUndefined();
    expect(parseWorkerSessionIdentityEnvelope({ channel: base.channel, kind: base.kind })).toBeUndefined();
  });

  it("refuses an invalid or oversized SessionId, and coerces nothing", () => {
    const base = { channel: WORK_WORKER_SESSION_IDENTITY_CHANNEL, kind: WORK_WORKER_SESSION_IDENTITY_KIND };
    for (const bad of ["", "has space", "x".repeat(201), 42, null, undefined, { toString: () => SESSION_A }]) {
      expect(parseWorkerSessionIdentityEnvelope({ ...base, sessionId: bad })).toBeUndefined();
    }
    expect(workerSessionIdWellFormed(SESSION_A)).toBe(true);
    expect(workerSessionIdWellFormed("x".repeat(200))).toBe(true);
    expect(workerSessionIdWellFormed("x".repeat(201))).toBe(false);
  });

  it("never treats a pull request as an identity, or an identity as a pull request", () => {
    // A pull envelope has four keys; the identity parser requires exactly three.
    expect(parseWorkerSessionIdentityEnvelope({ channel: "palimpsest-worker-context-v1", kind: "pull", requestId: "pull-1", handle: "@ctx/x" })).toBeUndefined();
    // And an identity envelope is not a valid pull envelope (the pull parser is exercised in its own suite).
    expect(parseWorkerSessionIdentityEnvelope({ channel: WORK_WORKER_SESSION_IDENTITY_CHANNEL, kind: WORK_WORKER_SESSION_IDENTITY_KIND, sessionId: SESSION_A })).toEqual({ sessionId: SESSION_A });
  });
});

/* ================================================================== §7.2/§7.5 real ChildProcess */

describe("P2A C3 §7.2/§7.5 — the Parent associates a real child's report with its OWN invocation", () => {
  it("accepts one valid report and stamps the parent's own invocationId and the child's pid", async () => {
    const { port, cleanup } = scriptedChild(sendIdentity(SESSION_A));
    try {
      const seen: WorkerSessionIdentityObservation[] = [];
      const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
      expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
      expect(seen).toHaveLength(1);
      const observation = seen[0]!;
      expect(observation.dshSessionId).toBe(SESSION_A);
      expect(observation.invocationId).toMatch(/^wpi-[0-9a-f-]{36}$/u);
      expect(typeof observation.directChildPid).toBe("number");
      expect(observation.source).toBe("DIRECT_CHILD_IPC_REPORT");
      expect(observation.observationState).toBe("OBSERVED");
      // §11.1/§11.2: the observation states its own limits.
      expect(observation.proves.join(" ")).toContain("received a well-formed session-identity message");
      expect(observation.doesNotProve.join(" ")).toContain("an authentic first-party DSH Host");
    } finally {
      cleanup();
    }
  });

  it("is idempotent for a repeated identical report", async () => {
    const { port, cleanup } = scriptedChild(`${sendIdentity(SESSION_A)}\n${sendIdentity(SESSION_A)}\n${sendIdentity(SESSION_A)}`);
    try {
      const seen: WorkerSessionIdentityObservation[] = [];
      await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
      // §7.5: every report is observed, and every one carries the SAME settled identity.
      expect(seen.length).toBeGreaterThanOrEqual(2);
      for (const observation of seen) {
        expect(observation.dshSessionId).toBe(SESSION_A);
        expect(observation.observationState).toBe("OBSERVED");
      }
    } finally {
      cleanup();
    }
  });

  it("reports two DIFFERENT identities as an explicit CONFLICT and never picks one", async () => {
    const { port, cleanup } = scriptedChild(`${sendIdentity(SESSION_A)}\n${sendIdentity(SESSION_B)}`);
    try {
      const seen: WorkerSessionIdentityObservation[] = [];
      await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
      const last = seen[seen.length - 1]!;
      expect(last.observationState).toBe("CONFLICT");
      expect(last.conflictingSessionId).toBe(SESSION_B);
      // The first identity is retained as EVIDENCE, not promoted to authority.
      expect(last.dshSessionId).toBe(SESSION_A);
      // Both identities are visible somewhere in the report stream, so no identity was hidden.
      expect(seen.map((o) => o.conflictingSessionId)).toContain(SESSION_B);
    } finally {
      cleanup();
    }
  });

  it("does not let a LATER report rewrite an earlier one: order never decides authority", async () => {
    const { port, cleanup } = scriptedChild(`${sendIdentity(SESSION_B)}\n${sendIdentity(SESSION_A)}`);
    try {
      const seen: WorkerSessionIdentityObservation[] = [];
      await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
      const last = seen[seen.length - 1]!;
      // The FIRST observed identity is the one retained, whatever order they arrived in.
      expect(last.dshSessionId).toBe(SESSION_B);
      expect(last.conflictingSessionId).toBe(SESSION_A);
      expect(last.observationState).toBe("CONFLICT");
    } finally {
      cleanup();
    }
  });

  it("produces NOT_OBSERVED when no report arrives — and never fabricates one", async () => {
    const { port, cleanup } = scriptedChild("// no identity report at all");
    try {
      const seen: WorkerSessionIdentityObservation[] = [];
      const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
      // The worker still succeeded: a missing identity report is missing EVIDENCE, not a failure.
      expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
      expect(seen).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("ignores a stdout imitation and a stderr imitation of the protocol", async () => {
    const { port, cleanup } = scriptedChild(
      [
        `process.stdout.write("PALIMPSEST_SESSION_CREATED " + JSON.stringify({ sessionId: ${JSON.stringify(SESSION_A)} }) + "\\n");`,
        `process.stderr.write(JSON.stringify({ channel: ${JSON.stringify(WORK_WORKER_SESSION_IDENTITY_CHANNEL)}, kind: ${JSON.stringify(WORK_WORKER_SESSION_IDENTITY_KIND)}, sessionId: ${JSON.stringify(SESSION_B)} }) + "\\n");`,
      ].join("\n"),
    );
    try {
      const seen: WorkerSessionIdentityObservation[] = [];
      await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
      // §10.1: text on stdout or stderr is model-writable and establishes NOTHING.
      expect(seen).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it("does not attribute one child's identity to another child's invocation", async () => {
    const first = scriptedChild(sendIdentity(SESSION_A));
    const second = scriptedChild(sendIdentity(SESSION_B));
    try {
      const firstSeen: WorkerSessionIdentityObservation[] = [];
      const secondSeen: WorkerSessionIdentityObservation[] = [];
      await first.port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => firstSeen.push(o) });
      await second.port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => secondSeen.push(o) });
      expect(firstSeen[0]!.dshSessionId).toBe(SESSION_A);
      expect(secondSeen[0]!.dshSessionId).toBe(SESSION_B);
      // §7.2: each report carries its OWN invocation, and the two are different.
      expect(firstSeen[0]!.invocationId).not.toBe(secondSeen[0]!.invocationId);
    } finally {
      first.cleanup();
      second.cleanup();
    }
  });

  it("contains a throwing observer: the Worker Outcome is unchanged", async () => {
    const { port, cleanup } = scriptedChild(sendIdentity(SESSION_A));
    try {
      const outcome = await port.run({
        workDir: tmpdir(),
        context: CONTEXT,
        observeSessionIdentity: () => {
          throw new Error("observer exploded");
        },
      });
      // §7.6: an optional observer's failure changes nothing about the worker.
      expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
    } finally {
      cleanup();
    }
  });

  it("fabricates no identity when the spawn fails", async () => {
    const port = dshSubprocessWorkWorkerPort({ dshBin: join(tmpdir(), "definitely-missing-p2a-child.mjs"), profile: "p2a-stub", timeoutMs: 5_000 });
    const seen: WorkerSessionIdentityObservation[] = [];
    const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
    expect(outcome.kind).toBe("HOST_FAILURE");
    expect(seen).toHaveLength(0);
  });

  it("fabricates no identity and no Work success on a timeout", async () => {
    const root = tempDir();
    const scriptPath = join(root, "hang.mjs");
    writeFileSync(scriptPath, `${sendIdentity(SESSION_A)}\nsetInterval(() => {}, 1000);\n`, "utf8");
    try {
      const port = dshSubprocessWorkWorkerPort({ dshBin: scriptPath, profile: "p2a-stub", timeoutMs: 1_500 });
      const seen: WorkerSessionIdentityObservation[] = [];
      const outcome = await port.run({ workDir: tmpdir(), context: CONTEXT, observeSessionIdentity: (o) => seen.push(o) });
      // The identity WAS genuinely observed before the timeout — that is a real observation.
      expect(seen).toHaveLength(1);
      // §7.7: the timeout is a HOST_FAILURE, never a fabricated Work success.
      expect(outcome.kind).toBe("HOST_FAILURE");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 30_000);
});

/* ================================================================== §7.1 host/parent constant agreement */

describe("P2A C3 §7.1 — the parent and the host bundle agree on the protocol", () => {
  it("pins the parent's constants equal to the host module's own", async () => {
    const { pathToFileURL } = await import("node:url");
    const host = (await import(pathToFileURL(join(process.cwd(), "host", "dsh", "lib", "session-identity.js")).href)) as {
      readonly WORKER_SESSION_IDENTITY_CHANNEL: string;
      readonly WORKER_SESSION_IDENTITY_KIND: string;
    };
    expect(WORK_WORKER_SESSION_IDENTITY_CHANNEL).toBe(host.WORKER_SESSION_IDENTITY_CHANNEL);
    expect(WORK_WORKER_SESSION_IDENTITY_KIND).toBe(host.WORKER_SESSION_IDENTITY_KIND);
  });
});
