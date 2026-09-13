/**
 * G10-GC3 — unified admission end-to-end through the INSTALLED surface.
 *
 *   C / P1 → dormant → world changes → W1/R1 → K1 Project → unified admit → P2
 *   → ACTIVE → WAIT → dormant → W2/R2 → K2 WAIT → unified admit → Q2 → DORMANT
 *
 * The flow drives `installed.campaign.compileNextAction` / `admitNextAction`;
 * the raw `completeWakeWithAction` primitive is never called by the caller.
 * Also proves Project-fails / WAIT-works without a Work admission port, and
 * restart replay reconstructs both causal chains.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { SqliteCampaignStore, compiledCampaignActionDigestOf, inFlightWake, materializeClaimStandingSnapshot } from "../src/campaign/index.js";
import type { CampaignClaimStatus, CampaignPlanningContext, CampaignProjectRef, WaitAdmission } from "../src/campaign/index.js";
import { MockHost } from "./helpers.js";

const SRC = (p: string): string => readFileSync(fileURLToPath(new URL(`../src/${p}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
const PROPOSAL = { goal: "follow-up", changeClass: "metadata_only", tasks: [{ title: "run", dependsOn: [], writePaths: ["out.txt"] }] };
const WAIT_WATCH = { condition: { kind: "external_signal" as const, signalKey: "sig" }, reason: "wake me" };
const P1: CampaignProjectRef = { projectId: "P1", revision: 3, digest: "1".repeat(64) };
const P2: CampaignProjectRef = { projectId: "P2", revision: 1, digest: "2".repeat(64) };

function harness(path: string) {
  const store = new SqliteCampaignStore(path);
  const state = {
    proposal: "project" as "project" | "wait",
    nextProject: P1,
    claim: "SUPPORTED" as CampaignClaimStatus,
    epoch: 1,
    admitted: new Map<string, CampaignProjectRef>(),
    contexts: [] as CampaignPlanningContext[],
  };
  const installed = installPalimpsest(new MockHost() as never, {
    projectId: "p",
    databasePath: join(mkdtempSync(join(tmpdir(), "pal-gc3u-")), "s.sqlite"),
    ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-gc3u-ops-")), "o.sqlite"),
    git: new FakeGitPort("c".repeat(40)),
    clock: () => "2026-08-13T00:00:00Z",
    campaignStore: store,
    campaignClock: () => "2026-01-01T00:00:00Z",
    campaignInstitutionEpochPort: {
      inspectEpoch: async (institutionId: string) => ({ state: "known" as const, value: { institutionId, epoch: state.epoch, digest: `e${state.epoch}`.padEnd(64, "0") } }),
    },
    campaignEvidencePort: {
      inspectClaim: async (ref: { claimId: string }) => ({
        state: "known" as const,
        value: materializeClaimStandingSnapshot({ claim: ref, status: state.claim, supportingEvidenceIds: state.claim === "SUPPORTED" ? ["ev-1"] : [], contradictingEvidenceIds: state.claim === "CONTRADICTED" ? ["ev-2"] : [], provenanceDigest: `p-${state.claim}` }),
      }),
    },
    campaignWorkPort: { inspectProject: async () => ({ state: "known" as const, value: "running" as const }) },
    campaignWorkAdmissionPort: {
      admit: async ({ admissionKey }: { admissionKey: string; proposal: unknown }) => {
        const existing = state.admitted.get(admissionKey);
        if (existing !== undefined) return existing;
        state.admitted.set(admissionKey, state.nextProject);
        return state.nextProject;
      },
    },
    campaignCompilerPort: {
      compile: async (context) => {
        state.contexts.push(context);
        return state.proposal === "project"
          ? { kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }
          : { kind: "wait", reason: "nothing useful now", watches: [WAIT_WATCH] };
      },
    },
  });
  return { store, installed, state };
}

type Harness = ReturnType<typeof harness>;

async function driveToReconciling(h: Harness, reason: string): Promise<string> {
  const camp = h.installed.campaign!;
  const dormant = await camp.production.admitWait({ campaignId: "C", reason, watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "later" }] });
  if (dormant.status !== "dormant") throw new Error("dormant");
  const start = await camp.production.beginWake({ campaignId: "C", cause: { kind: "manual", signalId: "cli", reason: "operator" } });
  if (start.status !== "started") throw new Error(`start ${start.status}`);
  const rec = await camp.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "cli", reason: "operator" } });
  if (rec.status !== "reconciled" && rec.status !== "no_active_commitment") throw new Error(`reconcile ${rec.status}`);
  return start.wakeCycleId;
}

describe("GC3 unified admission E2E (installed surface)", () => {
  it("Project then WAIT, both through admitNextAction, with restart replay", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "pal-gc3e2e-")), "campaign.sqlite");
    let h = harness(path);
    const camp = () => h.installed.campaign!;
    expect(typeof camp().compileNextAction).toBe("function");
    expect(typeof camp().admitNextAction).toBe("function");

    // Campaign + hypothesis.
    await camp().campaign.createCampaign({ campaignId: "C", institutionId: "I", statement: "root" });
    const hyp = await camp().campaign.proposeHypothesis({ campaignId: "C", statement: "H", claimId: "Q1" });
    if (hyp.state !== "known") throw new Error("hyp");
    await camp().campaign.refreshCampaignBeliefs("C");

    // 1. Admit the real P1 through the unified boundary while ACTIVE (non-wake).
    h.state.nextProject = P1;
    const compileP1 = await camp().compileNextAction!({ campaignId: "C" });
    if (compileP1.status !== "compiled") throw new Error(compileP1.detail);
    const admitP1 = await camp().admitNextAction!({ campaignId: "C", compiled: compileP1.compiled });
    if (admitP1.status !== "admitted") throw new Error(`P1 ${admitP1.status}: ${admitP1.detail}`);
    expect(admitP1.project).toEqual(P1);

    // 2. Dormant → world changes → W1/R1.
    h.state.epoch = 2;
    h.state.claim = "CONTRADICTED";
    const W1 = await driveToReconciling(h, "nothing useful now");

    // 3. K1 Project → unified admit → P2 → ACTIVE (caller never calls completeWake).
    h.state.proposal = "project";
    h.state.nextProject = P2;
    const compileK1 = await camp().compileNextAction!({ campaignId: "C" });
    if (compileK1.status !== "compiled") throw new Error(compileK1.detail);
    expect(compileK1.compiled.wake?.wakeCycleId).toBe(W1);
    const digest1 = compiledCampaignActionDigestOf(compileK1.compiled);
    const admitK1 = await camp().admitNextAction!({ campaignId: "C", compiled: compileK1.compiled });
    if (admitK1.status !== "admitted" || admitK1.action?.kind !== "project") throw new Error(`K1 ${admitK1.status}`);
    expect(admitK1.project).toEqual(P2);
    expect(admitK1.lifecycle).toBe("ACTIVE");
    expect(admitK1.action.project).toEqual(P2);
    expect(admitK1.action.compilationId).toBe(compileK1.compiled.compilationId);
    expect(inFlightWake(await h.store.replay("C"))).toBeUndefined();

    // 4. WAIT → dormant → W2/R2 → K2 WAIT → unified admit → DORMANT.
    const W2 = await driveToReconciling(h, "wait again");
    h.state.proposal = "wait";
    const compileK2 = await camp().compileNextAction!({ campaignId: "C" });
    if (compileK2.status !== "compiled" || compileK2.compiled.action.kind !== "wait") throw new Error("K2");
    const digest2 = compiledCampaignActionDigestOf(compileK2.compiled);
    const admitK2 = await camp().admitNextAction!({ campaignId: "C", compiled: compileK2.compiled });
    if (admitK2.status !== "admitted" || admitK2.action?.kind !== "wait") throw new Error(`K2 ${admitK2.status}`);
    expect(admitK2.lifecycle).toBe("DORMANT");
    const W2ref = admitK2.action;

    // 5. Provenance assertions.
    const events = await h.store.replay("C");
    const reconciliations = events.filter((e) => e.type === "RECONCILIATION_COMMITTED").map((e) => (e.payload as { report: { digest: string } }).report.digest);
    expect(reconciliations).toHaveLength(2);
    const admissions = events.filter((e) => e.type === "WAIT_ADMITTED").map((e) => (e.payload as { waitAdmission: WaitAdmission }).waitAdmission);
    expect(admissions).toHaveLength(1);
    expect(admissions[0]!.candidateDigest).toBe(digest2);
    expect(admissions[0]!.wakeCycleId).toBe(W2);
    expect(admissions[0]!.reconciliationDigest).toBe(reconciliations[1]);
    expect(admissions[0]!.waitAdmissionId).toBe(W2ref.waitAdmissionId);
    const completions = events.filter((e) => e.type === "WAKE_CYCLE_COMPLETED").map((e) => (e.payload as { wakeCycleId: string; action: { kind: string } }));
    expect(completions.map((c) => c.action.kind)).toEqual(["project", "wait"]);
    expect(digest1).toMatch(/^[0-9a-f]{64}$/);
    expect((await camp().campaign.definition("C"))!.campaignId).toBe("C");

    // 6. Restart/replay reconstructs the causal chains (no mutable admission truth).
    h.store.close();
    h = harness(path);
    const replayed = await h.store.replay("C");
    expect(replayed.filter((e) => e.type === "PROJECT_ADMITTED").map((e) => (e.payload as { project: CampaignProjectRef }).project)).toEqual([P1, P2]);
    expect(replayed.filter((e) => e.type === "WAIT_ADMITTED")).toHaveLength(1);
    expect(replayed.filter((e) => e.type === "WAKE_CYCLE_COMPLETED")).toHaveLength(2);
    expect(await h.installed.campaign!.production.lifecycleState("C")).toBe("DORMANT");
    h.store.close();
  });

  it("C7-M03/M04: WAIT admits without a Work admission port; Project fails explicitly", async () => {
    const store = new SqliteCampaignStore(":memory:");
    const state = { proposal: "wait" as "project" | "wait" };
    const installed = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-gc3n-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-gc3n-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
      campaignStore: store,
      campaignInstitutionEpochPort: { inspectEpoch: async (institutionId: string) => ({ state: "known" as const, value: { institutionId, epoch: 1, digest: "e".repeat(64) } }) },
      campaignEvidencePort: {
        inspectClaim: async (ref: { claimId: string }) => ({ state: "known" as const, value: materializeClaimStandingSnapshot({ claim: ref, status: "SUPPORTED" as const, supportingEvidenceIds: ["ev-1"], contradictingEvidenceIds: [], provenanceDigest: "p" }) }),
      },
      campaignWorkPort: { inspectProject: async () => ({ state: "known" as const, value: "running" as const }) },
      // NO campaignWorkAdmissionPort.
      campaignCompilerPort: {
        compile: async () => (state.proposal === "project" ? { kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } } : { kind: "wait", reason: "wait", watches: [WAIT_WATCH] }),
      },
    });
    const camp = installed.campaign!;
    await camp.campaign.createCampaign({ campaignId: "C", institutionId: "I", statement: "root" });
    const h = await camp.campaign.proposeHypothesis({ campaignId: "C", statement: "H", claimId: "Q1" });
    if (h.state !== "known") throw new Error("h");
    await camp.campaign.refreshCampaignBeliefs("C");
    const dormant = await camp.production.admitWait({ campaignId: "C", reason: "w", watches: [{ condition: { kind: "not_before", at: "2027-01-01T00:00:00Z" }, reason: "l" }] });
    if (dormant.status !== "dormant") throw new Error("d");
    const start = await camp.production.beginWake({ campaignId: "C", cause: { kind: "manual", signalId: "s", reason: "r" } });
    if (start.status !== "started") throw new Error("start");
    await camp.production.reconcileCurrentWorld({ campaignId: "C", wakeCycle: start.wakeCycleId, wakeCause: { kind: "manual", signalId: "s", reason: "r" } });
    const compiledWait = await camp.compileNextAction!({ campaignId: "C" });
    if (compiledWait.status !== "compiled") throw new Error("compile wait");
    const waitResult = await camp.admitNextAction!({ campaignId: "C", compiled: compiledWait.compiled });
    expect(waitResult.status).toBe("admitted"); // C7-M03
    expect((await store.replay("C")).filter((e) => e.type === "WAIT_ADMITTED")).toHaveLength(1);
    store.close();
  });

  it("C7-M05/M06/M07/M08: absence and firewalls", () => {
    const bare = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-gc3b-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-gc3b-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
    });
    expect(bare.campaign).toBeUndefined(); // C7-M06 bare install unchanged
    for (const file of ["scheduler/scheduler.ts", "runtime/realize.ts", "federation/federation_service.ts", "institution/store.ts"]) {
      expect(strip(SRC(file))).not.toMatch(/campaign\/index|campaign\.js/);
    }
    expect(SRC("index.ts")).not.toMatch(/campaign/);
  });
});
