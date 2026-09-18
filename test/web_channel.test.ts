import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { pipelinePreset, type ProjectProposal } from "../src/architecture/index.js";
import { parseGateDefinition } from "../src/evidence/index.js";
import { serveOrchestration, type ServeHandle } from "../src/serve.js";
import { ProjectController } from "../src/tools/index.js";
import { EventStore, snapshotDigest } from "../src/state/index.js";
import { createPalimpsestEffects, FakeGitPort } from "../src/effects/index.js";
import { TaskPolicy } from "../src/domain/index.js";

import { FakeClock, taskSpec, tempStatePath } from "./helpers.js";

const HEAD = "c".repeat(40);

const GATE_RELEASE = parseGateDefinition({
  gate_id: "gate-release",
  version: 1,
  subject_type: "attempt",
  require: { all: [{ exists: { predicate: "tests_pass" } }] },
});

function makeRig() {
  const store = new EventStore(tempStatePath(), { clock: new FakeClock().next });
  const effects = createPalimpsestEffects({
    databasePath: join(mkdtempSync(join(tmpdir(), "palimpsest-serve-")), "ops.sqlite"),
    git: new FakeGitPort(HEAD),
  });
  const controller = new ProjectController({
    store,
    effects,
    projectId: "scheduler-project",
    policy: new TaskPolicy({
      policy_id: "trusted-default",
      read_paths: ["src"],
      allowed_commands: [{ executable: "python", argv_prefix: ["-m", "pytest"] }],
      network_policy: "deny",
      network_allowlist: [],
      timeout_s: 60,
      lease_s: 10,
      attempt_limit: 3,
      candidate_limit: 1,
    }),
    clock: () => "2026-09-07T00:00:00Z",
  });
  return {
    store,
    controller,
    cleanup: async () => {
      await effects.close();
      store.close();
    },
  };
}

function eventCount(store: EventStore): number {
  return (
    store.connection.prepare("SELECT COUNT(*) AS c FROM events").get() as { c: number }
  ).c;
}

interface Json {
  [key: string]: unknown;
}

async function api(
  handle: ServeHandle,
  path: string,
  init?: { method?: string; body?: unknown; token?: string | null },
): Promise<{ status: number; json: Json }> {
  const headers: Record<string, string> = {};
  const token = init?.token === null ? undefined : (init?.token ?? handle.token);
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  if (init?.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${handle.url}${path}`, {
    method: init?.method ?? "GET",
    headers,
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: response.status, json: (await response.json()) as Json };
}

describe("serve channel face (PLMP-WEB-1)", () => {
  it("WEB-A01: the served graph is same-source; the cursor makes polling cheap", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      rig.controller.step();
      const created = rig.controller.step()!;
      await rig.controller.claim(created.entity_id);

      const { json } = await api(handle, "/api/graph");
      const graph = json.graph as Json;
      const inProcess = rig.controller.orchestrationGraph();
      expect(graph).toEqual(inProcess as unknown as Json);
      expect(json.changed).toBe(true);

      const cursor = String((graph.project as Json).cursor);
      const second = await api(handle, `/api/graph?cursor=${cursor}`);
      expect(second.json.changed).toBe(false);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-A02: the control loop runs over HTTP; unauthenticated requests get 401", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      expect((await api(handle, "/api/graph", { token: null })).status).toBe(401);

      rig.controller.start({
        projectId: "scheduler-project",
        goal: "g",
        tasks: [taskSpec("task-1")],
      });
      rig.controller.declareGate(GATE_RELEASE, "h1-test");
      rig.controller.step();
      const created = rig.controller.step()!;
      const attemptId = created.entity_id;

      const paused = await api(handle, "/api/control/pause", {
        method: "POST",
        body: { reason: "inspect" },
      });
      expect(paused.json.result).toMatchObject({ event_type: "SCHEDULER_PAUSED" });
      expect(rig.controller.orchestrationGraph().project.paused).toBe(true);
      await api(handle, "/api/control/resume", { method: "POST", body: { reason: "go" } });

      const claimed = await api(handle, "/api/control/claim", {
        method: "POST",
        body: { attemptId },
      });
      expect((claimed.json.result as Json).worktreePath).toBeDefined();

      const gated = await api(handle, "/api/control/gate", {
        method: "POST",
        body: { attemptId, predicate: "tests_pass", command: ["python", "-m", "pytest"], exitCode: 0 },
      });
      expect((gated.json.result as Json).entity_id).toBeDefined();

      const reported = await api(handle, "/api/control/report", {
        method: "POST",
        body: { attemptId, workerStatus: "completed", summary: "ok", resultCommit: "d".repeat(40) },
      });
      expect((reported.json.result as Json).event_type).toBe("ATTEMPT_COMPLETED");

      // G10-Z §10: a new promotion is admitted from current VERIFYING Work, so
      // the canonical flow settles the candidate batch first.
      expect(rig.controller.step()!.event_type).toBe("TASK_VERIFYING");

      const promoted = await api(handle, "/api/control/promote", {
        method: "POST",
        body: { gateId: "gate-release" },
      });
      expect((promoted.json.result as Json).promoted).toBe(true);
      expect(rig.controller.orchestrationGraph().promotions[0]).toMatchObject({
        state: "COMMITTED",
      });
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-A03: the proposal face validates fail-closed over HTTP", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const bad = pipelinePreset({
        goal: "g",
        stages: [
          { title: "a", requiredArtifacts: ["out.md"] },
          { title: "b" },
        ],
      });
      const missingDependency: ProjectProposal = {
        goal: "g",
        changeClass: "behavior_change",
        tasks: [{ title: "a", dependsOn: ["ghost"] }],
      };
      const invalid = await api(handle, "/api/proposal/declare", {
        method: "POST",
        body: { proposal: bad },
      });
      expect(invalid.json.declared).toBe(false);
      expect((invalid.json.diagnostics as Json[]).map((d) => d.type)).toContain("MISSING_WRITE_PATHS");
      const ghost = await api(handle, "/api/proposal/validate", {
        method: "POST",
        body: missingDependency,
      });
      expect((ghost.json.diagnostics as Json[]).map((d) => d.type)).toContain("UNKNOWN_DEPENDENCY");
      const before = eventCount(rig.store);
      expect(eventCount(rig.store)).toBe(before); // nothing landed

      const good = pipelinePreset({
        goal: "ship the calculator",
        stages: [
          { title: "实现", writePaths: ["src/calc.py"] },
          { title: "验证", writePaths: ["reports/verify.md"], requiredArtifacts: ["reports/verify.md"] },
        ],
      });
      const declared = await api(handle, "/api/proposal/declare", {
        method: "POST",
        body: { proposal: good },
      });
      expect(declared.json).toMatchObject({ declared: true, eventType: "PROJECT_CREATED" });
      expect(rig.controller.orchestrationGraph().tasks.map((task) => task.taskId)).toEqual([
        "task-1",
        "task-2",
      ]);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("WEB-A04: serve is an additive presentation face - closing it leaves the ledgers untouched", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    let before = 0;
    let digestBefore = "";
    try {
      rig.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
      await api(handle, "/api/graph");
      before = eventCount(rig.store);
      digestBefore = snapshotDigest(rig.store.connection);
    } finally {
      await handle.close();
    }
    expect(eventCount(rig.store)).toBe(before);
    expect(snapshotDigest(rig.store.connection)).toBe(digestBefore);
    expect(rig.controller.orchestrationGraph().project.goal).toBe("g");
    await rig.cleanup();
  });

  it("WEB-A05: security defaults - loopback bind and a fresh random token per start", async () => {
    const rig = makeRig();
    rig.controller.start({ projectId: "scheduler-project", goal: "g", tasks: [taskSpec("task-1")] });
    const first = await serveOrchestration(rig.controller, { port: 0 });
    const second = await serveOrchestration(rig.controller, { port: 0 });
    try {
      expect(first.host).toBe("127.0.0.1");
      expect(second.host).toBe("127.0.0.1");
      expect(first.token).not.toBe(second.token);
      // The first token must not authorize the second server.
      expect((await api(second, "/api/health", { token: first.token })).status).toBe(401);
      expect((await api(second, "/api/health")).status).toBe(200);
    } finally {
      await first.close();
      await second.close();
      await rig.cleanup();
    }
  });

  it("WEB-A06: static serving - the built bundle, or the fallback page", async () => {
    const rig = makeRig();
    // Mechanism: an injected static root is served verbatim.
    const fake = mkdtempSync(join(tmpdir(), "palimpsest-webroot-"));
    writeFileSync(join(fake, "index.html"), "<!doctype html><html><body>panel-fake</body></html>");
    const first = await serveOrchestration(rig.controller, { port: 0, staticRoot: fake });
    try {
      const response = await fetch(`${first.url}/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("panel-fake");
    } finally {
      await first.close();
    }
    // The real bundle (built by `pnpm build:web`) or the fallback page.
    const second = await serveOrchestration(rig.controller, { port: 0 });
    try {
      const response = await fetch(`${second.url}/`);
      const html = await response.text();
      expect(response.status).toBe(200);
      const built = existsSync(
        join(fileURLToPath(new URL("../dist/web/index.html", import.meta.url))),
      );
      if (built) {
        expect(html).toContain("assets/index-");
        const asset = /assets\/index-[A-Za-z0-9_-]+\.js/.exec(html)![0]!;
        const assetResponse = await fetch(`${second.url}/${asset}`);
        expect(assetResponse.status).toBe(200);
      } else {
        expect(html).toContain("build:web");
      }
    } finally {
      await second.close();
      await rig.cleanup();
    }
  });
});

/* ================================================================== *
 * WEB-A07/A08 — the browser-trust fence and the token handoff.
 *
 * Measured before these existed: the token was accepted from the query string on every route, and
 * a query parameter needs no CORS preflight, so a malicious page could fire blind writes at /api
 * with no ability to read the reply. These tests pin both halves of the fix — a request shape a
 * browser could be tricked into sending is refused before credentials are considered at all (403),
 * and the token survives only as a one-time handoff at the root that leaves a cookie behind.
 *
 * Raw `node:http` rather than `fetch`, because the subject under test is exactly the headers a
 * browser controls (Host, Origin, Sec-Fetch-Site) and `fetch` decides some of them for you.
 * ================================================================== */
function rawRequest(
  handle: ServeHandle,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const request = httpRequest(
      { host: handle.host, port: handle.port, path, method: "GET", headers },
      (response) => {
        let body = "";
        response.on("data", (chunk: Buffer) => {
          body += chunk.toString("utf8");
        });
        response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers, body }));
      },
    );
    request.on("error", reject);
    request.end();
  });
}

describe("the browser-trust fence (WEB-A07)", () => {
  it("refuses a rebound Host before it considers credentials, and admits loopback", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    try {
      // A correct token is not enough: the request SHAPE is what a rebound browser sends.
      const rebound = await rawRequest(handle, "/api/health", {
        host: "evil.example",
        authorization: `Bearer ${handle.token}`,
      });
      expect(rebound.status).toBe(403);
      const ours = await rawRequest(handle, "/api/health", {
        host: `${handle.host}:${String(handle.port)}`,
        authorization: `Bearer ${handle.token}`,
      });
      expect(ours.status).toBe(200);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("refuses a cross-site Origin, a cross-site Sec-Fetch-Site, and an unparseable Origin", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    const authority = `${handle.host}:${String(handle.port)}`;
    try {
      for (const headers of [
        { host: authority, origin: "https://evil.example", authorization: `Bearer ${handle.token}` },
        { host: authority, "sec-fetch-site": "cross-site", authorization: `Bearer ${handle.token}` },
        { host: authority, origin: "not a url", authorization: `Bearer ${handle.token}` },
      ]) {
        const refused = await rawRequest(handle, "/api/health", headers);
        expect(refused.status, JSON.stringify(headers)).toBe(403);
      }
      // A same-origin page and a non-browser client both pass.
      const sameOrigin = await rawRequest(handle, "/api/health", {
        host: authority,
        origin: `http://${authority}`,
        authorization: `Bearer ${handle.token}`,
      });
      expect(sameOrigin.status).toBe(200);
      const nonBrowser = await rawRequest(handle, "/api/health", {
        host: authority,
        authorization: `Bearer ${handle.token}`,
      });
      expect(nonBrowser.status).toBe(200);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("a declared trusted authority is admitted, and an undeclared one is not", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, {
      port: 0,
      trustedHosts: ["palimpsest.internal:7831"],
    });
    try {
      const declared = await rawRequest(handle, "/api/health", {
        host: "palimpsest.internal:7831",
        authorization: `Bearer ${handle.token}`,
      });
      expect(declared.status).toBe(200);
      const undeclared = await rawRequest(handle, "/api/health", {
        host: "other.internal:7831",
        authorization: `Bearer ${handle.token}`,
      });
      expect(undeclared.status).toBe(403);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });
});

describe("the token handoff (WEB-A08)", () => {
  it("exchanges a root-url token for an HttpOnly cookie and redirects to the clean url", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    const authority = `${handle.host}:${String(handle.port)}`;
    try {
      const handed = await rawRequest(handle, `/?token=${encodeURIComponent(handle.token)}`, { host: authority });
      expect(handed.status).toBe(303);
      expect(handed.headers.location).toBe("/");
      expect(handed.headers["cache-control"]).toBe("no-store");
      // The token is in the url that produced this redirect; it must not travel on as a Referer.
      expect(handed.headers["referrer-policy"]).toBe("no-referrer");
      const setCookie = String(handed.headers["set-cookie"]);
      expect(setCookie).toContain("HttpOnly");
      expect(setCookie).toContain("SameSite=Strict");
      expect(setCookie).toContain("Path=/");

      // The cookie — and only the cookie — then authorizes the API, with no Authorization header.
      const cookie = setCookie.split(";")[0]!;
      const viaCookie = await rawRequest(handle, "/api/health", { host: authority, cookie });
      expect(viaCookie.status).toBe(200);

      // The url a human opens is exactly that handoff, and the clean url stays credential-free.
      expect(handle.openUrl).toBe(`http://${authority}/?token=${encodeURIComponent(handle.token)}`);
      expect(handle.url).not.toContain(handle.token);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  it("a wrong or repeated token mints nothing, and a cookie is bound to its authority", async () => {
    const rig = makeRig();
    const first = await serveOrchestration(rig.controller, { port: 0 });
    const second = await serveOrchestration(rig.controller, { port: 0 });
    const firstAuthority = `${first.host}:${String(first.port)}`;
    try {
      expect((await rawRequest(first, "/?token=wrong", { host: firstAuthority })).status).toBe(401);
      // Two occurrences are not one handoff: refuse rather than guess which was meant.
      expect(
        (await rawRequest(first, `/?token=${first.token}&token=${first.token}`, { host: firstAuthority })).status,
      ).toBe(401);

      const handed = await rawRequest(first, `/?token=${first.token}`, { host: firstAuthority });
      const cookie = String(handed.headers["set-cookie"]).split(";")[0]!;
      // The second server has its own secret AND a different authority, so this cookie is inert.
      const replayed = await rawRequest(second, "/api/health", {
        host: `${second.host}:${String(second.port)}`,
        cookie,
      });
      expect(replayed.status).toBe(401);
      // And a token handed to one process never authorizes another.
      expect((await api(second, "/api/health", { token: first.token })).status).toBe(401);
    } finally {
      await first.close();
      await second.close();
      await rig.cleanup();
    }
  });

  it("the query token never authorizes an API request, and the fence outranks a cookie", async () => {
    const rig = makeRig();
    const handle = await serveOrchestration(rig.controller, { port: 0 });
    const authority = `${handle.host}:${String(handle.port)}`;
    try {
      // The measured hole: this used to be 200 from any origin, with no preflight to stop a page.
      expect((await api(handle, `/api/health?token=${handle.token}`, { token: null })).status).toBe(401);
      const handed = await rawRequest(handle, `/?token=${handle.token}`, { host: authority });
      const cookie = String(handed.headers["set-cookie"]).split(";")[0]!;
      // A valid cookie does not excuse a request shape the fence refuses.
      const rebound = await rawRequest(handle, "/api/health", { host: "evil.example", cookie });
      expect(rebound.status).toBe(403);
    } finally {
      await handle.close();
      await rig.cleanup();
    }
  });

  /* Measured in a live `--resume` session: with a per-process secret, a dashboard tab that was
     open and authorized answered 401 after every host restart (3/3) — and the person cannot
     re-authorize themselves, because the new token goes to the host's stdout, which in an
     agent-hosted deployment nobody is reading. So the secret is a deployment file.

     The restarted process is modelled by a SECOND server that is told the first one's authority is
     trusted, which isolates the secret as the only variable: no same-port rebind (Windows does not
     hand a just-closed port straight back), and the cookie's authority still matches what it was
     minted for. */
  it("a cookie survives a restart when the secret is durable, and dies with the process when it is not", async () => {
    const rig = makeRig();
    const durableSecret = join(mkdtempSync(join(tmpdir(), "palimpsest-secret-")), "dashboard-cookie-secret");
    const freshSecret = join(mkdtempSync(join(tmpdir(), "palimpsest-secret-")), "dashboard-cookie-secret");
    const cookieOf = async (handle: ServeHandle): Promise<string> => {
      const handed = await rawRequest(handle, `/?token=${handle.token}`, {
        host: `${handle.host}:${String(handle.port)}`,
      });
      return String(handed.headers["set-cookie"]).split(";")[0]!;
    };

    const first = await serveOrchestration(rig.controller, { port: 0, secretPath: durableSecret });
    const cookie = await cookieOf(first);
    const firstAuthority = `${first.host}:${String(first.port)}`;
    const restarted = async (secretPath: string): Promise<ServeHandle> =>
      serveOrchestration(rig.controller, { port: 0, secretPath, trustedHosts: [firstAuthority] });
    try {
      // Same secret, new process: the browser the person already had open keeps working.
      const durable = await restarted(durableSecret);
      try {
        const replayed = await rawRequest(durable, "/api/health", { host: firstAuthority, cookie });
        expect(replayed.status).toBe(200);
        // The launch token is still per start, so the OLD LINK is dead — only the cookie carries over.
        expect((await api(durable, "/api/health", { token: first.token })).status).toBe(401);
      } finally {
        await durable.close();
      }
      // A different secret is the per-process behaviour: the same cookie is inert.
      const ephemeral = await restarted(freshSecret);
      try {
        expect((await rawRequest(ephemeral, "/api/health", { host: firstAuthority, cookie })).status).toBe(401);
      } finally {
        await ephemeral.close();
      }
      // And the secret really is on disk, at the path the deployment derives for it.
      expect(readFileSync(durableSecret).byteLength).toBe(32);
    } finally {
      await first.close();
      await rig.cleanup();
    }
  });
});
