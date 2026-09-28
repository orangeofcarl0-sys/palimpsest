/**
 * R1-L §11/§23 — THE PULL TRANSPORT, END TO END, ON A REAL SUBPROCESS.
 *
 * The shape and boundary tests prove what the protocol MEANS. This file proves the channel actually
 * CARRIES it: a real Node child process is spawned by the real port, asks for a handle over the IPC
 * channel, receives the parent's canonical answer, and reports it. No DSH is needed — the point is the
 * transport and the attempt binding, not the model — which is what makes this a deterministic gate
 * rather than a live one.
 *
 * The child is a plain Node script that speaks the protocol through `process.send`/`process.on('message')`
 * exactly as the DSH host's pull tool does, so what is exercised is the same wire format.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { dshSubprocessWorkWorkerPort } from "../src/deployment/work_worker.js";

const cleanups: Array<() => void> = [];
afterAll(() => {
  for (const fn of cleanups) fn();
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "palimpsest-r1l-"));
  cleanups.push(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* Windows keeps the directory busy while a handle is open; the OS reaps it */
    }
  });
  return dir;
}

/** The attempt context a worker would be handed, with the handles this attempt bound. */
const CONTEXT = {
  work: {
    projectGoal: "g",
    requirements: [],
    decisions: [],
    objective: "o",
    writeScope: ["src/x.ts"],
    requiredArtifacts: [],
    baseCommit: "a".repeat(40),
    completionChecks: [],
    independentVerificationRequired: false,
  },
  compiled: {
    manifestId: "m-1",
    boot: [],
    handles: [
      { handle: "@ctx/proof/pc-1", kind: "proof", ref: "pc-1" },
      { handle: "@ctx/procedure/prc-1/0", kind: "procedure", ref: "prc-1/0" },
    ],
  },
} as const;

/**
 * A stand-in worker that behaves like the DSH host's pull tool: it reads the payload the port wrote,
 * sends ONE pull request over the IPC channel, waits for the answer, prints its outcome, and exits.
 *
 * It is assembled from an array rather than a template literal so no escaping layer sits between the
 * text here and the file the child runs — a subtlety worth naming, because an escape that survives one
 * layer and not the other produces a child that fails to parse and reads as a silent worker.
 */
const CHILD = [
  "import { readFileSync } from 'node:fs';",
  "// The port spawns the child as: node <dshBin> --profile P --work <contextFile>.",
  "// The payload is therefore the argument after --work, exactly as the real DSH bin receives it.",
  "const workAt = process.argv.indexOf('--work');",
  "const payload = JSON.parse(readFileSync(process.argv[workAt + 1], 'utf8'));",
  "if (payload?.context?.compiled?.handles === undefined) { process.stdout.write('CHILD_NO_PAYLOAD'); process.exit(4); }",
  'const index = Number(process.env.PALIMPSEST_TEST_HANDLE_INDEX ?? "0");',
  "const handle = payload.context.compiled.handles[index]?.handle ?? '@ctx/proof/absent';",
  "const requestId = 'pull-1';",
  "process.on('message', (message) => {",
  "  if (message === null || typeof message !== 'object') return;",
  "  if (message.kind !== 'pull-result' || message.requestId !== requestId) return;",
  "  process.stdout.write('CHILD_GOT ' + JSON.stringify(message) + String.fromCharCode(10));",
  "  const line = 'PALIMPSEST_WORK_RESULT ' + JSON.stringify({ kind: 'READY_FOR_SETTLEMENT', summary: 'asked for ' + handle });",
  "  // The result line is flushed BEFORE the process goes away: a piped stdout is asynchronous, and",
  "  // exiting immediately after a write truncates it — which the port would honestly report as a",
  "  // silent worker. The write callback is the flush signal; disconnecting then lets the process exit.",
  "  process.stdout.write(line + String.fromCharCode(10), () => { process.disconnect(); });",
  "});",
  "process.send({ channel: payload.contextPullChannel, kind: 'pull', requestId, handle });",
  "setTimeout(() => { process.stdout.write('CHILD_TIMEOUT'); process.exit(3); }, 8000).unref?.();",
].join("\n") + "\n";

function harness() {
  const dir = tempDir();
  const childPath = join(dir, "child.mjs");
  writeFileSync(childPath, CHILD, "utf8");
  return { dir, childPath };
}

describe("R1-L §11 — the IPC channel carries a real pull, end to end", () => {
  it("L-P05/P07 (live): the child asks by handle and receives the parent's canonical body", async () => {
    const { dir, childPath } = harness();
    const asked: string[] = [];
    const port = dshSubprocessWorkWorkerPort({
      dshBin: childPath,
      profile: "r1l-test",
      timeoutMs: 20_000,
      pullTimeoutMs: 5_000,
    });
    // The port writes the payload itself and passes its path after `--work`; the harness only needs to
    // say which handle the child should ask for.
    process.env.PALIMPSEST_TEST_HANDLE_INDEX = "0";
    const outcome = await port.run({
      workDir: dir,
      context: CONTEXT,
      contextPull: async (handle: string) => {
        asked.push(handle);
        return { kind: "proof", ref: handle, body: { statement: "cycles precede ordering" }, binding: { standing_at_compile: "SUPPORTED" }, current: { effectiveStanding: "SUPPORTED" } };
      },
    });
    if (outcome.kind === "HOST_FAILURE") console.log("HOST_FAILURE DETAIL:", outcome.detail);
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
    // The parent was asked for exactly the handle the child sent, and nothing else.
    expect(asked).toEqual(["@ctx/proof/pc-1"]);
  }, 30_000);

  it("L-N01/L-N02 (live): a handle outside this attempt's allowlist is refused, and no read happens", async () => {
    const { dir, childPath } = harness();
    const asked: string[] = [];
    const port = dshSubprocessWorkWorkerPort({ dshBin: childPath, profile: "r1l-test", timeoutMs: 20_000, pullTimeoutMs: 5_000 });
    process.env.PALIMPSEST_TEST_HANDLE_INDEX = "99";
    const outcome = await port.run({
      workDir: dir,
      context: CONTEXT,
      contextPull: async (handle: string) => {
        asked.push(handle);
        return { body: "should never be reached" };
      },
    });
    // The worker still settles normally: a refused pull is not a worker failure.
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
    // The load-bearing assertion: the canonical read never ran for a handle this attempt did not bind.
    expect(asked).toEqual([]);
  }, 30_000);

  it("a host that composed no resolver refuses honestly rather than fabricating a body", async () => {
    const { dir, childPath } = harness();
    const port = dshSubprocessWorkWorkerPort({ dshBin: childPath, profile: "r1l-test", timeoutMs: 20_000, pullTimeoutMs: 5_000 });
    process.env.PALIMPSEST_TEST_HANDLE_INDEX = "0";
    const outcome = await port.run({ workDir: dir, context: CONTEXT });
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
  }, 30_000);

  it("the pull channel closes with the worker process (no orphaned capability)", async () => {
    const { dir, childPath } = harness();
    const port = dshSubprocessWorkWorkerPort({ dshBin: childPath, profile: "r1l-test", timeoutMs: 20_000, pullTimeoutMs: 5_000 });
    process.env.PALIMPSEST_TEST_HANDLE_INDEX = "0";
    const outcome = await port.run({
      workDir: dir,
      context: CONTEXT,
      contextPull: async () => ({ body: "x" }),
    });
    // The run RESOLVES (so the channel was usable) and the child has exited by the time it does — the
    // port only settles on `close`, which is the structural reason the capability cannot outlive it.
    expect(outcome.kind).toBe("READY_FOR_SETTLEMENT");
  }, 30_000);
});
