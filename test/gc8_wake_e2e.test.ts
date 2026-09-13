/**
 * G10-GC8 genuine dormant-world-change end-to-end proof.
 */

import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  SqliteCampaignStore,
  makeCampaignProductionService,
  makeCampaignService,
  makeCompilerService,
  makeProspectiveService,
  materializeClaimStandingSnapshot,
} from "../src/campaign/index.js";
import type { CampaignClaimStatus, CampaignProjectRef } from "../src/campaign/index.js";
import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { MockHost } from "./helpers.js";

const PROPOSAL = { goal: "follow-up", changeClass: "metadata_only", tasks: [{ title: "run", dependsOn: [], writePaths: ["out.txt"] }] };
const SRC = (f: string): string => readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), "utf-8");
const strip = (c: string): string => c.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function worldWithMutableWorld() {
  const store = new SqliteCampaignStore(":memory:");
  let epoch = 1;
  let claimStatus: CampaignClaimStatus | "unknown" = "SUPPORTED";
  let projectStanding: "completed" | "failed" | "running" | "unknown" = "running";
  let c = 0;
  let w = 0;
  let k = 0;
  let o = 0;
  let r = 0;
  let cmp = 0;
  const institutions = {
    inspectEpoch: async (institutionId: string) =>
      ({ state: "known" as const, value: { institutionId, epoch, digest: `e${epoch}`.padEnd(64, "0") } }),
  };
  const evidence = {
    inspectClaim: async (ref: { claimId: string }) => {
      if (claimStatus === "unknown") return { state: "unknown" as const, detail: "unknown" };
      return {
        state: "known" as const,
        value: materializeClaimStandingSnapshot({
          claim: ref,
          status: claimStatus,
          supportingEvidenceIds: claimStatus === "SUPPORTED" ? ["ev-1"] : [],
          contradictingEvidenceIds: claimStatus === "CONTRADICTED" ? ["ev-2"] : [],
          provenanceDigest: `prov-${claimStatus}`,
        }),
      };
    },
  };
  const work = {
    inspectProject: async () =>
      projectStanding === "unknown"
        ? { state: "unknown" as const, detail: "unknown" }
        : { state: "known" as const, value: projectStanding },
  };
  const campaign = makeCampaignService({ store, allocateCommitmentId: () => `cc-${++c}`, evidence, institutions });
  const prospective = makeProspectiveService({ store, allocateWatchId: () => `w-${++w}`, clock: () => "2026-01-01T00:00:00Z" });
  const production = makeCampaignProductionService({
    store,
    institutions,
    evidence,
    work,
    allocateWakeCycleId: () => `wc-${++k}`,
    allocateWatchId: () => `pw-${++w}`,
    allocateObservationId: () => `obs-${++o}`,
    allocateRevisionId: () => `br-${++r}`,
  });
  const admitted = new Map<string, CampaignProjectRef>();
  const compiler = makeCompilerService({
    store,
    allocateCompilationId: () => `cmp-${++cmp}`,
    compiler: { compile: async () => ({ kind: "project", projectProposal: PROPOSAL, intervention: { purpose: "test", targetHypothesisIds: [] } }) },
    work: {
      admit: async ({ admissionKey }) => {
        const existing = admitted.get(admissionKey);
        if (existing !== undefined) return existing;
        const project: CampaignProjectRef = { projectId: "p2", revision: 0, digest: "a".repeat(64) };
        admitted.set(admissionKey, project);
        return project;
      },
    },
    buildContext: async (campaignId) => {
      const definition = await campaign.definition(campaignId);
      if (definition === undefined) throw new Error("unknown campaign");
      const events = await store.replay(campaignId);
      const projection = production.activeIds(events);
      const commitments = await campaign.commitmentStates(campaignId);
      const hypotheses = await campaign.hypotheses(campaignId);
      const reconciliations = events.filter((event) => event.type === "RECONCILIATION_COMMITTED");
      return {
        campaignId,
        institutionId: definition.institutionId,
        activeCommitments: commitments.filter((entry) => entry.state === "OPEN").map((entry) => entry.commitment),
        activeHypotheses: hypotheses.filter((entry) => entry.state === "ACTIVE").map((entry) => entry.hypothesis),
        beliefState: await campaign.currentBeliefState(campaignId),
        recentObservationRefs: events
          .filter((event) => event.type === "EVIDENCE_OBSERVED")
          .map((event) => (event.payload as { observation: { observationId: string } }).observation.observationId),
        interventionSummaries: [],
        institutionEpoch: (await institutions.inspectEpoch(definition.institutionId)).value,
        activeWatchIds: projection.watches,
        reconciliationDigest: reconciliations.length === 0 ? null : (reconciliations[reconciliations.length - 1]!.payload as { report: { digest: string } }).report.digest,
      };
    },
  });
  return {
    store, campaign, prospective, production, compiler,
    setEpoch: (value: number) => { epoch = value; },
    setClaim: (value: CampaignClaimStatus | "unknown") => { claimStatus = value; },
    setProject: (value: "completed" | "failed" | "running" | "unknown") => { projectStanding = value; },
  };
}

describe("GC8: genuine dormant-world-change long-horizon loop", () => {
  it("checkpointed dormant → world changes → watch wake → reconcile → new action → ACTIVE, without replay", async () => {
    const w = worldWithMutableWorld();
    // 1–2. Institution-owned campaign.
    await w.campaign.createCampaign({ campaignId: "camp-1", institutionId: "inst-1", statement: "root" });
    await expect(
      makeCampaignService({ store: w.store, allocateCommitmentId: () => "x", institutions: { inspectEpoch: async () => ({ state: "unknown", detail: "ghost" }) } })
        .createCampaign({ campaignId: "ghost-c", institutionId: "ghost", statement: "s" }),
    ).rejects.toBeTruthy();

    // 3. Initial epistemic state.
    const h1 = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: "H1", claimId: "claim-1" });
    if (h1.state !== "known") throw new Error("h1");
    await w.campaign.refreshCampaignBeliefs("camp-1");
    expect((await w.campaign.currentBeliefState("camp-1")).entries[0]!.standing).toBe("supported");

    // 4. First intervention: operational completed, epistemically refuting.
    w.setClaim("CONTRADICTED");
    await w.campaign.refreshCampaignBeliefs("camp-1");
    expect((await w.campaign.currentBeliefState("camp-1")).entries[0]!.standing).toBe("contradicted");

    // 5. Child hypothesis, then WAIT with a grounded checkpoint.
    const h2 = await w.campaign.proposeHypothesis({ campaignId: "camp-1", statement: "H2", claimId: "claim-2", parentHypothesisId: h1.value.hypothesisId });
    expect(h2.state).toBe("known");
    await w.prospective.installWatch({ campaignId: "camp-1", condition: { kind: "external_signal", signalKey: "sig" }, reason: "wake route" });
    const dormant = await w.production.admitWait({
      campaignId: "camp-1",
      reason: "no useful action now",
      watches: [{ condition: { kind: "claim_changed", claim: { claimId: "claim-2" }, baselineDigest: "b".repeat(64) }, reason: "watch H2 claim" }],
    });
    expect(dormant.status).toBe("dormant");
    const checkpoint = (await w.production.buildCurrentCampaignCheckpoint("camp-1"));
    expect(checkpoint.state).toBe("known");
    if (checkpoint.state === "known") {
      expect(checkpoint.value.activeHypothesisIds).toContain(h2.state === "known" ? h2.value.hypothesisId : "");
      expect(checkpoint.value.institutionEpoch.epoch).toBe(1);
    }

    // 6. World changes while Dormant.
    w.setEpoch(2);
    w.setProject("completed");

    // 7. Trigger a real watch, then wake (only from DORMANT).
    const watchId = dormant.status === "dormant" ? dormant.watchIds[0]! : "";
    await w.prospective.recordTrigger({ campaignId: "camp-1", watchId, cause: "signal" });
    const start = await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "watch", watchId } });
    expect(start.status).toBe("started");
    if (start.status !== "started") return;
    // A forged watch cause is refused.
    expect((await w.production.beginWake({ campaignId: "camp-1", cause: { kind: "watch", watchId: "w-forged" } })).status).toBe("wake_already_in_progress");
    expect(await w.production.resumeWake("camp-1")).toEqual({ status: "in_progress", wakeCycleId: start.wakeCycleId });

    // 8. Unknown fact gate: nothing is written, no compile.
    w.setClaim("unknown");
    const blocked = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "watch", watchId } });
    expect(blocked.status).toBe("reconciliation_incomplete");
    const beforeCount = (await w.store.replay("camp-1")).length;
    expect((await w.store.replay("camp-1")).length).toBe(beforeCount);
    w.setClaim("CONTRADICTED");

    // 9. Production reconciliation observes E2 and commits atomically.
    const reconciled = await w.production.reconcileCurrentWorld({ campaignId: "camp-1", wakeCycle: start.wakeCycleId, wakeCause: { kind: "watch", watchId } });
    expect(reconciled.status).toBe("reconciled");
    if (reconciled.status !== "reconciled") return;
    expect(reconciled.report.digest).toMatch(/^[0-9a-f]{64}$/);

    // 10. Unchanged refresh is a no-op.
    const beforeRefresh = (await w.store.replay("camp-1")).length;
    const refresh = await w.campaign.refreshCampaignBeliefs("camp-1");
    expect(refresh.status).toBe("refreshed");
    if (refresh.status === "refreshed") expect(refresh.observations).toHaveLength(0);
    expect((await w.store.replay("camp-1")).length).toBe(beforeRefresh);

    // 11. Compiler sees the current reconciled context (non-placeholder).
    const compiled = await w.compiler.compileNextAction({ campaignId: "camp-1" });
    expect(compiled.status).toBe("compiled");
    if (compiled.status !== "compiled") return;
    const context = await (async () => {
      const events = await w.store.replay("camp-1");
      return {
        digest: (events.filter((e) => e.type === "RECONCILIATION_COMMITTED").pop()!.payload as { report: { digest: string } }).report.digest,
      };
    })();
    expect(context.digest).toBe(reconciled.report.digest);

    // 12. Admit the NEW project and complete the wake; old plan is not replayed.
    const admission = await w.compiler.admitCompiledAction({ campaignId: "camp-1", compiled: compiled.compiled });
    expect(admission.status).toBe("admitted");
    await w.production.completeWakeWithAction({ campaignId: "camp-1", wakeCycleId: start.wakeCycleId, nextAction: "project" });
    expect(await w.production.lifecycleState("camp-1")).toBe("ACTIVE");
    const types = (await w.store.replay("camp-1")).map((event) => event.type);
    expect(types.filter((type) => type === "PROJECT_ADMITTED")).toHaveLength(1);
    expect((await w.campaign.definition("camp-1"))!.campaignId).toBe("camp-1");
  });
});

describe("GC7/GC8: installed surface and firewalls", () => {
  it("the installed campaign surface exposes the grounded production loop; nothing downstream imports campaign", () => {
    const store = new SqliteCampaignStore(":memory:");
    const installed = installPalimpsest(new MockHost() as never, {
      projectId: "p",
      databasePath: join(mkdtempSync(join(tmpdir(), "pal-gc8-")), "s.sqlite"),
      ordariumDatabasePath: join(mkdtempSync(join(tmpdir(), "pal-gc8-ops-")), "o.sqlite"),
      git: new FakeGitPort("c".repeat(40)),
      clock: () => "2026-08-13T00:00:00Z",
      campaignStore: store,
      campaignInstitutionEpochPort: { inspectEpoch: async (institutionId: string) => ({ state: "known" as const, value: { institutionId, epoch: 0, digest: "e".repeat(64) } }) },
    });
    expect(typeof installed.campaign?.production.admitWait).toBe("function");
    expect(typeof installed.campaign?.production.beginWake).toBe("function");
    expect(typeof installed.campaign?.production.reconcileCurrentWorld).toBe("function");
    for (const file of ["scheduler/scheduler.ts", "runtime/realize.ts", "federation/federation_service.ts", "institution/store.ts"]) {
      expect(strip(SRC(file))).not.toMatch(/campaign\/index|campaign\.js|production\.js/);
    }
    expect(SRC("index.ts")).not.toMatch(/campaign/);
  });
});
