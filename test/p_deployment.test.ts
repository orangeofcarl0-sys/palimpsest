/**
 * G10-P deployment profile + full-stack launch (closes CF-O-02).
 *
 *   Deployment config ≠ semantic authority (unknown fields fail closed)
 *   `palimpsest serve --profile` exposes the advanced application routes
 *   Work-only installation stays backward-compatible (P-A26)
 */

import { describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { DeploymentProfileError, launchDeployment, loadDeploymentProfile, parseDeploymentProfile } from "../src/deployment/index.js";
import type { ProjectAgentDeploymentProfile } from "../src/deployment/index.js";
import { installPalimpsest } from "../src/install.js";
import type { DshPluginContext, DshToolDefinition, DshToolRegistry } from "../src/tools/index.js";

const CLI = fileURLToPath(new URL("../dist/src/cli.js", import.meta.url));
const CHILD_PIDS: ChildProcess[] = [];

function profileObject(root: string): Record<string, unknown> {
  const dir = join(root, "peer");
  return {
    schemaVersion: 1,
    profileId: "deploy-cli",
    projectId: "palimpsest",
    localPeer: "peer-palimpsest",
    persistentPoint: "pp-palimpsest",
    transport: { namespace: "dogfood", databasePath: join(root, "transport.sqlite") },
    databases: {
      orchestration: join(dir, "palimpsest.sqlite"),
      ordarium: join(dir, "ops.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
      boundaryMemory: join(dir, "boundary.sqlite"),
      runtimeScope: join(dir, "runtime.sqlite"),
      attentionMarks: join(dir, "attention.sqlite"),
    },
    directory: [{ peerId: "peer-ordarium", competenceTags: ["state-change-feed"] }],
    attention: { policyId: "cli-attention-v1", cooldownMs: 0, activation: "none" },
    serve: { host: "127.0.0.1" },
  };
}

function nullContext(): DshPluginContext {
  const tools: DshToolRegistry = { register: (_definition: DshToolDefinition) => () => {} };
  return { tools };
}

async function waitForUrl(child: ChildProcess): Promise<{ url: string; token: string }> {
  return await new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => reject(new Error(`CLI did not start; output so far:\n${buffer}`)), 20_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const line = buffer.split("\n").find((entry) => entry.trim().startsWith("{"));
      if (line !== undefined) {
        try {
          const parsed = JSON.parse(line) as { url?: string; token?: string };
          if (parsed.url !== undefined && parsed.token !== undefined) {
            clearTimeout(timer);
            resolve({ url: parsed.url, token: parsed.token });
          }
        } catch {
          // Not the JSON line yet.
        }
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`CLI exited with ${code} before serving; output:\n${buffer}`));
    });
  });
}

describe("G10-P deployment profile", () => {
  it("rejects any attempt to smuggle semantic authority into deployment config", () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-p-deploy-"));
    try {
      const valid = profileObject(root);
      expect(() => parseDeploymentProfile(valid)).not.toThrow();
      expect(() => parseDeploymentProfile({ ...valid, authority: "peer-palimpsest" })).toThrow(DeploymentProfileError);
      expect(() => parseDeploymentProfile({ ...valid, schemaVersion: 2 })).toThrow(DeploymentProfileError);
      expect(() =>
        parseDeploymentProfile({ ...valid, attention: { policyId: "p", cooldownMs: 0, activation: "dsh" } }),
      ).toThrow(DeploymentProfileError); // activation without sessionId
      expect(() => parseDeploymentProfile({ ...valid, localPeer: "has space" })).toThrow(DeploymentProfileError);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("launches a full stack from a profile (surfaces present, no semantic authority in the profile)", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-p-deploy-"));
    const path = join(root, "profile.json");
    writeFileSync(path, JSON.stringify(profileObject(root)), "utf8");
    const profile: ProjectAgentDeploymentProfile = loadDeploymentProfile(path);
    const deployment = launchDeployment(profile, { context: nullContext() });
    try {
      expect(deployment.installed.application.federation).toBeDefined();
      expect(deployment.installed.application.boundary).toBeDefined();
      expect(deployment.installed.application.attention).toBeDefined();
      expect(deployment.installed.application.projections).toBeDefined();
      // Tools were registered through the install (advanced tools present).
      expect(deployment.installed.tools.length).toBeGreaterThan(9);
      const surfaces = Object.keys(deployment.installed.application);
      expect(surfaces).toContain("federation");
      expect(surfaces).toContain("boundary");
      expect(surfaces).toContain("attention");
    } finally {
      await deployment.close();
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows may hold the SQLite handle briefly.
      }
    }
  }, 120_000);

  it("keeps a bare Work-only install unchanged (nine Work tools, no advanced routes)", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-p-deploy-"));
    try {
      const installed = installPalimpsest(nullContext(), {
        projectId: "work-only",
        databasePath: join(root, "palimpsest.sqlite"),
        ordariumDatabasePath: join(root, "ops.sqlite"),
      });
      expect(installed.tools).toHaveLength(9);
      expect(installed.application.federation).toBeUndefined();
      expect(installed.application.projections).toBeUndefined();
      await installed.dispose();
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 100));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows may hold the SQLite handle briefly.
      }
    }
  }, 120_000);

  it("`palimpsest serve --profile` exposes the advanced application over HTTP (CF-O-02)", async () => {
    const root = mkdtempSync(join(tmpdir(), "palimpsest-p-deploy-"));
    const path = join(root, "profile.json");
    writeFileSync(path, JSON.stringify(profileObject(root)), "utf8");
    const child = spawn(process.execPath, [CLI, "serve", "--profile", path, "--port", "0"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    CHILD_PIDS.push(child);
    try {
      const { url, token } = await waitForUrl(child);
      const headers = { authorization: `Bearer ${token}` };
      const surfaces = await fetch(`${url}/api/application/surfaces`, { headers });
      expect(surfaces.status).toBe(200);
      const surfaceBody = (await surfaces.json()) as Record<string, boolean>;
      expect(surfaceBody.federation).toBe(true);
      expect(surfaceBody.boundary).toBe(true);
      expect(surfaceBody.attention).toBe(true);

      const commitments = await fetch(`${url}/api/federation/commitments`, { headers });
      expect(commitments.status).toBe(200);
      expect(await commitments.json()).toEqual([]);

      const attention = await fetch(`${url}/api/attention`, { headers });
      expect(attention.status).toBe(200);
      const attentionBody = (await attention.json()) as { policyId: string; pending: readonly unknown[] };
      expect(attentionBody.policyId).toBe("cli-attention-v1");

      // A legacy Work route is still served alongside the application routes.
      const health = await fetch(`${url}/api/health`, { headers });
      expect(health.status).toBe(200);
    } finally {
      child.kill();
      await new Promise((resolve) => setTimeout(resolve, 150));
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // Windows may hold the SQLite handle briefly.
      }
    }
  }, 120_000);
});

process.on("exit", () => {
  for (const child of CHILD_PIDS) child.kill();
});
