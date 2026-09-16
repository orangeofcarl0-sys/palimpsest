/**
 * UX-B — ONE-REQUEST CROSS-PROJECT COLLABORATION — the adversarial suite
 * (UXB-N01 … UXB-N29).
 *
 * REAL two-project rigs on temporary files wherever the property is about a real
 * deployment: two `launchDeployment` installations with separate orchestration /
 * ordarium / coordination / transport-cursor / boundary / attention stores, ONE
 * shared durable transport ledger, ONE shared physical Project Journal file and ONE
 * shared physical AssetAssociation file, real federation on both sides, real
 * inbound pumps and real Attention services. Nothing in that rig is a mock: if the
 * Ask path changed, stopped being derived from thread+inbox, or started creating
 * commitments, the assertions below fail against the actual runtime.
 *
 * The three seams the product itself declares stay adapters and nothing else: the
 * `ProjectPeerDirectoryPort`, the `CrossProjectFederationPort` and the optional
 * local-collaboration service. Every property that needs a hostile packet the
 * durable pump CANNOT produce is injected through the REAL
 * `FederationService.recordInboundMessage` ingest call, and the test says so
 * (audit SC-5: `inbox.unverified` is unreachable through the durable pump).
 *
 * UXB-N30 (full regressions) is the suite gate — this file does not fake it.
 */

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { launchDeployment, type Deployment } from "../src/deployment/index.js";
import type { ProjectAgentDeploymentProfile } from "../src/deployment/index.js";
import { installPalimpsest } from "../src/install.js";
import { FakeGitPort } from "../src/effects/index.js";
import { SqliteCoordinationStore } from "../src/coordination/index.js";
import { SqliteOrganizationMemoryStore } from "../src/organization_memory/index.js";
import { SqliteProjectAssetAssociationStore, SqliteProjectJournalStore } from "../src/project_workspace/index.js";
import { mailboxNamespace, type DurablePeerEnvelope } from "../src/transport/index.js";
import { handleApplicationRequest } from "../src/application/http.js";
import { defineApplicationTools } from "../src/tools/application_tools.js";
import {
  materializePeerAdvertisement,
  materializePeerMessage,
  materializePeerRef,
  materializeThreadRef,
  type PeerMessage,
  type PeerRef,
} from "../src/federation/index.js";
import {
  CROSS_PROJECT_MAX_BODY_BYTES,
  CROSS_PROJECT_HOST_TEXTS,
  CROSS_PROJECT_INBOUND_ANSWER_TEXT,
  CROSS_PROJECT_INBOUND_REQUEST_TEXT,
  CROSS_PROJECT_PROTOCOL_DIGEST,
  CrossProjectProtocolError,
  INBOUND_ASK_CLASSIFICATIONS,
  allocateCrossProjectRequestId,
  classifyInboundProjectAsk,
  crossProjectAttentionText,
  crossProjectProtocolDigest,
  makeCrossProjectService,
  materializeProjectAnswerEnvelope,
  materializeProjectAskEnvelope,
  materializeProjectPeerDescriptor,
  parseCrossProjectAskRequest,
  parseProjectAnswerEnvelope,
  parseProjectAskEnvelope,
  serializeCrossProjectEnvelope,
  staticProjectPeerDirectory,
  threadIdForRequest,
  unknownProjectPeerDirectory,
  validateProjectPeerDescriptors,
  type CrossProjectFederationPort,
  projectPhrase,
} from "../src/interaction/index.js";

/* ------------------------------------------------------------------ *
 * Shared temp root
 * ------------------------------------------------------------------ */

const ROOT = mkdtempSync(join(tmpdir(), "palimpsest-uxb-"));

afterAll(() => {
  try {
    rmSync(ROOT, { recursive: true, force: true });
  } catch {
    /* windows file handle */
  }
});

interface Closeable {
  close(): Promise<void> | void;
}
const OPEN: Closeable[] = [];
afterEach(async () => {
  for (const rig of OPEN.splice(0)) {
    try {
      await Promise.resolve(rig.close());
    } catch {
      /* already closed */
    }
  }
});

let seq = 0;
function freshDir(label: string): string {
  seq += 1;
  return join(ROOT, `${label}-${seq}`);
}

/* ------------------------------------------------------------------ *
 * Project identities (N01: a project id is NOT a peer id)
 * ------------------------------------------------------------------ */

const PROJECT_OPTICS = "project-optics";
const PROJECT_SENSING = "project-sensing";
const PROJECT_THERMO = "project-thermo";

const PEER_OPTICS: PeerRef = materializePeerRef({ peerId: "peer-optics" });
const PEER_SENSING: PeerRef = materializePeerRef({ peerId: "peer-sensing" });
const PEER_THERMO: PeerRef = materializePeerRef({ peerId: "peer-thermo" });

function binding(
  projectId: string,
  peerId: string,
  displayName: string,
  aliases: readonly string[],
): {
  readonly projectId: string;
  readonly displayName: string;
  readonly aliases: readonly string[];
  readonly peerId: string;
  readonly competenceTags: readonly string[];
} {
  return { projectId, displayName, aliases, peerId, competenceTags: ["project"] };
}

/* ------------------------------------------------------------------ *
 * The real two-project deployment rig
 * ------------------------------------------------------------------ */

interface TwoProjectRig {
  readonly a: Deployment;
  readonly b: Deployment;
  readonly c?: Deployment | undefined;
  readonly namespace: string;
  readonly transportPath: string;
  readonly journalPath: string;
  readonly associationPath: string;
  readonly appA: NonNullable<Deployment["installed"]["application"]["crossProject"]>;
  readonly appB: NonNullable<Deployment["installed"]["application"]["crossProject"]>;
}

function profileFor(input: {
  readonly who: string;
  readonly projectId: string;
  readonly peerId: string;
  readonly transportPath: string;
  readonly namespace: string;
  readonly journalPath: string;
  readonly associationPath: string;
  readonly bindings: readonly ReturnType<typeof binding>[];
}): ProjectAgentDeploymentProfile {
  const dir = freshDir(`deploy-${input.who}`);
  return {
    schemaVersion: 1,
    profileId: `deploy-${input.who}`,
    projectId: input.projectId,
    localPeer: input.peerId,
    transport: { namespace: input.namespace, databasePath: input.transportPath },
    databases: {
      // SEPARATE handles per installation (audit SC-16): the rig never hands one
      // instance to two installs.
      orchestration: join(dir, "orchestration.sqlite"),
      ordarium: join(dir, "ordarium.sqlite"),
      coordination: join(dir, "coordination.sqlite"),
      transportCursors: join(dir, "cursors.sqlite"),
      boundaryMemory: join(dir, "boundary.sqlite"),
      attentionMarks: join(dir, "attention.sqlite"),
      // SHARED PHYSICAL FILES: A's and B's scopes live side by side in one journal
      // and one association history (CF-AE-R-05 §48/§49).
      projectAssociations: input.associationPath,
      projectJournal: input.journalPath,
    },
    directory: input.bindings.map((entry) => ({ peerId: entry.peerId, competenceTags: entry.competenceTags })),
    projectDirectory: input.bindings,
    attention: { policyId: "uxb-attention-v1", cooldownMs: 0, activation: "none" },
  };
}

function twoProjectRig(options: { readonly withThirdPeer?: boolean } = {}): TwoProjectRig {
  const namespace = `uxb-${seq}-${Math.random().toString(36).slice(2, 8)}`;
  const transportPath = join(freshDir("transport"), "transport.sqlite");
  const journalPath = join(freshDir("shared"), "project-journal.sqlite");
  const associationPath = join(freshDir("shared"), "project-associations.sqlite");
  const bindings = [
    binding(PROJECT_OPTICS, PEER_OPTICS.peerId, "optics", ["optics-project"]),
    binding(PROJECT_SENSING, PEER_SENSING.peerId, "sensing", ["sensor-project"]),
    ...(options.withThirdPeer === true
      ? [binding(PROJECT_THERMO, PEER_THERMO.peerId, "thermo", ["thermo-project"])]
      : []),
  ];
  const a = launchDeployment(
    profileFor({
      who: "optics",
      projectId: PROJECT_OPTICS,
      peerId: PEER_OPTICS.peerId,
      transportPath,
      namespace,
      journalPath,
      associationPath,
      bindings,
    }),
  );
  const b = launchDeployment(
    profileFor({
      who: "sensing",
      projectId: PROJECT_SENSING,
      peerId: PEER_SENSING.peerId,
      transportPath,
      namespace,
      journalPath,
      associationPath,
      bindings,
    }),
  );
  const c =
    options.withThirdPeer === true
      ? launchDeployment(
          profileFor({
            who: "thermo",
            projectId: PROJECT_THERMO,
            peerId: PEER_THERMO.peerId,
            transportPath,
            namespace,
            journalPath,
            associationPath,
            bindings,
          }),
        )
      : undefined;
  OPEN.push(a);
  OPEN.push(b);
  if (c !== undefined) OPEN.push(c);
  // Give BOTH projects a real ProjectIR (genesis, zero tasks), so "zero ProjectIR
  // mutation" and "no Task was created by the Ask path" are assertions about an
  // initialized project rather than about a missing record.
  for (const [deployment, projectId, goal] of [
    [a, PROJECT_OPTICS, "understand the detector aperture issue"],
    [b, PROJECT_SENSING, "keep the sensor calibration honest"],
  ] as const) {
    if (!deployment.installed.controller.isProjectInitialized()) {
      deployment.installed.controller.start({
        projectId,
        goal,
        requirements: [{ requirement_id: "req-1", statement: "ask another project", priority: "normal", acceptance_refs: [] }],
        decisions: [],
        tasks: [],
        committedAt: "2026-09-16T00:00:00Z",
      });
    }
  }
  const appA = a.installed.application.crossProject!;
  const appB = b.installed.application.crossProject!;
  expect(appA).toBeDefined();
  expect(appB).toBeDefined();
  return { a, b, ...(c === undefined ? {} : { c }), namespace, transportPath, journalPath, associationPath, appA, appB };
}

/** EVERY raw transport envelope addressed to a peer's mailbox (the §47 proof point). */
async function rawMailbox(rig: TwoProjectRig, toPeer: PeerRef): Promise<readonly DurablePeerEnvelope[]> {
  const observed = await rig.a.transport.observe({ mailbox: mailboxNamespace(rig.namespace, toPeer.peerId) });
  return observed.envelopes;
}

function rawBodies(envelopes: readonly DurablePeerEnvelope[]): readonly string[] {
  const bodies: string[] = [];
  for (const envelope of envelopes) {
    if (envelope.operation.kind === "peer_message") bodies.push(envelope.operation.body);
  }
  return bodies;
}

/** A's own outbound request as the peer really received it. */
async function requestIdOf(rig: TwoProjectRig, result: { readonly details: { readonly requestId: string } }): Promise<string> {
  return result.details.requestId;
}

async function headOf(deployment: Deployment): Promise<{ readonly revision: number; readonly digest: string }> {
  const row = deployment.installed.controller.store.connection
    .prepare("SELECT revision, digest FROM projects WHERE project_id=?")
    .get(deployment.profile.projectId) as { readonly revision: number; readonly digest: string } | undefined;
  return { revision: Number(row?.revision ?? 0), digest: String(row?.digest ?? "") };
}

async function boundaryWorkspaceCount(deployment: Deployment): Promise<number> {
  return (await deployment.installed.boundaryMemory!.store.workspaces()).length;
}

async function commitmentCount(deployment: Deployment): Promise<number> {
  return (await deployment.installed.application.federation!.commitments()).length;
}

/* ------------------------------------------------------------------ *
 * A. Identity, directory and target resolution (N01–N05)
 * ------------------------------------------------------------------ */

describe("UXB-N01 ProjectId != PeerRef (a descriptor BINDS them; neither is derived from the other)", () => {
  it("keeps the two identities independent through resolution and the wire", async () => {
    const rig = twoProjectRig();
    // The binding exists, and the two ids are genuinely different values.
    expect(PROJECT_OPTICS).not.toBe(PEER_OPTICS.peerId);
    expect(PROJECT_SENSING).not.toBe(PEER_SENSING.peerId);

    const view = await rig.appA.projects();
    expect(view.state).toBe("known");
    const optics = view.projects.find((entry) => entry.projectId === PROJECT_OPTICS)!;
    expect(optics.peerId).toBe(PEER_OPTICS.peerId);
    expect(optics.projectId).not.toBe(optics.peerId);

    // On the wire, the PROJECT identity travels in the protocol envelope and the
    // PEER identity travels in the transport routing — two separate fields.
    const asked = await rig.appA.ask({ target: "sensing", task: "does the aperture issue repeat?", requestedBy: "user:test" });
    expect(asked.status).toBe("RESOLVED");
    const envelopes = await rawMailbox(rig, PEER_SENSING);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]!.to.peerId).toBe(PEER_SENSING.peerId);
    const body = parseProjectAskEnvelope(JSON.parse(rawBodies(envelopes)[0]!)) as { readonly targetProjectId: string };
    expect(body.targetProjectId).toBe(PROJECT_SENSING);
    expect(body.targetProjectId).not.toBe(envelopes[0]!.to.peerId);

    // And a descriptor whose two ids coincide is allowed while nothing DEGRADES the
    // pairing: materializing a descriptor never rewrites one id from the other.
    const descriptor = materializeProjectPeerDescriptor({
      projectId: "project-x",
      aliases: [],
      peer: { schemaVersion: 1, peerId: "peer-y" },
      competenceTags: [],
    });
    expect(descriptor.projectId).toBe("project-x");
    expect(descriptor.peer.peerId).toBe("peer-y");
  });
});

describe("UXB-N02 the binding grants no authority and no ownership", () => {
  it("publishes routing metadata only, and resolving it mutates nothing", async () => {
    const rig = twoProjectRig();
    const before = await commitmentCount(rig.a);
    const view = await rig.appA.projects();
    for (const entry of view.projects) {
      // Exact field set: no authority, ownership, permission, role or capability grant.
      expect(Object.keys(entry).sort()).toEqual(["aliases", "competenceTags", "displayName", "peerId", "projectId"]);
      expect(JSON.stringify(entry)).not.toMatch(/authorit|owner|ownership|permission|grant|admin|role/iu);
    }
    await rig.appA.ask({ target: "sensing", task: "any obligation created?", requestedBy: "user:test" });
    expect(await commitmentCount(rig.a)).toBe(before);
    expect(await commitmentCount(rig.b)).toBe(before);
  });
});

describe("UXB-N03 an UNKNOWN directory is never an EMPTY directory", () => {
  it("reports unknown and sends nothing, and never answers an empty pending list", async () => {
    const sent: { readonly to: PeerRef; readonly body: string }[] = [];
    const service = makeCrossProjectService({
      projectId: PROJECT_OPTICS,
      localPeer: PEER_OPTICS,
      clock: () => "2026-09-16T00:00:00Z",
      directory: unknownProjectPeerDirectory("no project directory is configured for this host"),
      federation: fakeFederation({ sent }),
    });
    const view = await service.projects();
    expect(view.state).toBe("unknown");
    expect(view.projects).toHaveLength(0);
    expect(view.detail).toMatch(/unknown/iu);

    const asked = await service.ask({ target: "optics", task: "anyone there?", requestedBy: "user:test" });
    expect(asked.status).toBe("DIRECTORY_UNKNOWN");
    expect(sent).toHaveLength(0);

    // Unknown must not be reported as "no pending requests".
    await expect(service.pending()).rejects.toMatchObject({ reason: "directory_unavailable" });
  });
});

describe("UXB-N04 an ambiguous target sends NOTHING", () => {
  it("shows the candidates instead of picking one", async () => {
    const sent: { readonly to: PeerRef; readonly body: string }[] = [];
    // Two DIFFERENT projects honestly share the human name "optics".
    const directory = staticProjectPeerDirectory([
      { projectId: "optics-eu", displayName: "optics", aliases: [], peer: { schemaVersion: 1, peerId: "peer-1" }, competenceTags: [] },
      { projectId: "optics-us", displayName: "optics", aliases: [], peer: { schemaVersion: 1, peerId: "peer-2" }, competenceTags: [] },
    ]);
    const service = makeCrossProjectService({
      projectId: PROJECT_OPTICS,
      localPeer: PEER_OPTICS,
      clock: () => "2026-09-16T00:00:00Z",
      directory,
      federation: fakeFederation({ sent }),
    });
    const result = await service.ask({ target: "optics", task: "which one?", requestedBy: "user:test" });
    expect(result.status).toBe("TARGET_AMBIGUOUS");
    expect(result.candidates).toEqual(["optics"]);
    expect(sent).toHaveLength(0);
    // An EXACT project id disambiguates deterministically.
    const exact = await service.ask({ target: "optics-us", task: "which one?", requestedBy: "user:test" });
    expect(exact.status).toBe("RESOLVED");
    expect(sent).toHaveLength(1);
  });
});

describe("UXB-N05 a stale project↔peer binding sends NOTHING", () => {
  it("re-checks the binding under a fresh observation immediately before sending", async () => {
    const sent: { readonly to: PeerRef; readonly body: string }[] = [];
    let observations = 0;
    const scripted = {
      observeProjects: async () => {
        observations += 1;
        return {
          state: "known" as const,
          value: [
            {
              projectId: "optics",
              aliases: [],
              peer: { schemaVersion: 1 as const, peerId: observations === 1 ? "peer-old" : "peer-new" },
              competenceTags: [],
            },
          ],
        };
      },
    };
    const service = makeCrossProjectService({
      projectId: PROJECT_SENSING,
      localPeer: PEER_SENSING,
      clock: () => "2026-09-16T00:00:00Z",
      directory: scripted,
      federation: fakeFederation({ sent }),
    });
    const result = await service.ask({ target: "optics", task: "still the same project?", requestedBy: "user:test" });
    expect(result.status).toBe("STALE_TARGET_BINDING");
    expect(observations).toBeGreaterThanOrEqual(2);
    expect(sent).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * B. Ask is not a commitment and mutates nothing (N06–N09)
 * ------------------------------------------------------------------ */

describe("UXB-N06/N07 Ask != Commitment: an Ask creates ZERO commitments", () => {
  it("keeps the commitment count at zero across a full Ask + answer + receive", async () => {
    const rig = twoProjectRig();
    expect(await commitmentCount(rig.a)).toBe(0);
    const asked = await rig.appA.ask({ target: "sensing", task: "did we study the detector aperture?", requestedBy: "user:test" });
    expect(asked.status).toBe("RESOLVED");
    expect(await commitmentCount(rig.a)).toBe(0);
    expect(await commitmentCount(rig.b)).toBe(0);

    await rig.b.pumpAndActivate();
    const requestId = await requestIdOf(rig, asked);
    const pending = await rig.appB.pending();
    expect(pending).toHaveLength(1);
    await rig.appB.respond(requestId, { status: "ANSWERED", answer: "yes, two years ago" });
    expect(await commitmentCount(rig.b)).toBe(0);
    await rig.a.pumpAndActivate();
    const received = await rig.appA.receive(requestId);
    expect(received.status).toBe("ANSWERED");
    expect(await commitmentCount(rig.a)).toBe(0);
    expect(await commitmentCount(rig.b)).toBe(0);
  });
});

describe("UXB-N08/N09 Ask mutates no Boundary and no ProjectIR", () => {
  it("leaves boundary workspaces, ProjectIR head, tasks and journal untouched", async () => {
    const rig = twoProjectRig();
    const beforeA = await headOf(rig.a);
    const beforeB = await headOf(rig.b);
    expect(await boundaryWorkspaceCount(rig.a)).toBe(0);
    expect(await boundaryWorkspaceCount(rig.b)).toBe(0);
    const journalBefore = await rig.a.installed.application.projectWorkspace!.journal();

    const asked = await rig.appA.ask({ target: "sensing", task: "any boundary change?", requestedBy: "user:test" });
    await rig.b.pumpAndActivate();
    await rig.appB.respond(asked.details.requestId, { status: "ANSWERED", answer: "none" });
    await rig.a.pumpAndActivate();
    const received = await rig.appA.receive(asked.details.requestId);
    expect(received.status).toBe("ANSWERED");

    expect(await boundaryWorkspaceCount(rig.a)).toBe(0);
    expect(await boundaryWorkspaceCount(rig.b)).toBe(0);
    expect(await headOf(rig.a)).toEqual(beforeA);
    expect(await headOf(rig.b)).toEqual(beforeB);
    const work = await rig.a.installed.application.projections!.work();
    expect(work.nodes.filter((node) => node.kind === "task")).toHaveLength(0);
    expect(await rig.a.installed.application.projectWorkspace!.journal()).toEqual(journalBefore);
  });
});

/* ------------------------------------------------------------------ *
 * C. The packet: minimal, exact, no hidden workspace data (N10/N11 + §47)
 * ------------------------------------------------------------------ */

describe("UXB-N10/N11 + §47 the request packet carries the task and ONLY explicit contextText", () => {
  it("inspects the RAW outbound transport envelope and finds no workspace sentinel", async () => {
    const rig = twoProjectRig();

    // Seed real, sensitive project state in BOTH projects (Journal + a ProjectIR
    // decision), so the assertion below is about real data, not a plausible one.
    const workspaceA = rig.a.installed.application.projectWorkspace!;
    await workspaceA.recordJournalEntry({
      kind: "REFERENCE_NOTE",
      title: "OA-5188 aperture issue",
      body: "A_ONLY_SECRET: the aperture issue was traced to a shim thickness drift.",
      provenance: "test:uxb",
    });
    await workspaceA.appendDecision({
      statement: "A_DECISION_SENTINEL: keep the shim at 0.4mm",
      rationale: "B_RATIONALE_SENTINEL",
      evidenceIds: [],
    });
    const workspaceB = rig.b.installed.application.projectWorkspace!;
    await workspaceB.recordJournalEntry({
      kind: "REFERENCE_NOTE",
      title: "sensor calibration",
      body: "B_ONLY_SECRET: our calibration table is proprietary.",
      provenance: "test:uxb",
    });

    const TASK = "have we already studied the detector aperture issue?";
    const asked = await rig.appA.ask({ target: "sensing", task: TASK, requestedBy: "user:test" });
    expect(asked.status).toBe("RESOLVED");

    const envelopes = await rawMailbox(rig, PEER_SENSING);
    expect(envelopes).toHaveLength(1);
    const body = rawBodies(envelopes)[0]!;
    // EXACT key set: protocol ids, routing metadata, the task — and nothing else.
    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "kind",
      "protocolDigest",
      "requestId",
      "schemaVersion",
      "sourceProjectId",
      "targetProjectId",
      "task",
    ]);
    expect(parsed.kind).toBe("PROJECT_ASK");
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.protocolDigest).toBe(CROSS_PROJECT_PROTOCOL_DIGEST);
    expect(parsed.sourceProjectId).toBe(PROJECT_OPTICS);
    expect(parsed.targetProjectId).toBe(PROJECT_SENSING);
    expect(parsed.task).toBe(TASK);
    // §47: NONE of the sentinels from either project's Journal/decisions crosses.
    for (const sentinel of [
      "A_ONLY_SECRET",
      "B_ONLY_SECRET",
      "A_DECISION_SENTINEL",
      "B_RATIONALE_SENTINEL",
      "OA-5188",
      "proprietary",
      "0.4mm",
    ]) {
      expect(body).not.toContain(sentinel);
    }

    // §25: contextText appears ONLY when explicitly supplied, and is copied EXACTLY.
    const withContext = await rig.appA.ask({
      target: "sensing",
      task: TASK,
      contextText: "EXPLICIT_CONTEXT_SENTINEL: aperture 12mm, rev C",
      requestedBy: "user:test",
    });
    const all = await rawMailbox(rig, PEER_SENSING);
    const explicit = rawBodies(all)
      .map((entry) => parseProjectAskEnvelope(JSON.parse(entry)))
      .find((entry) => entry.requestId === withContext.details.requestId)!;
    expect(explicit.contextText).toBe("EXPLICIT_CONTEXT_SENTINEL: aperture 12mm, rev C");
    expect(Object.keys(explicit).sort()).toContain("contextText");
    expect(JSON.stringify(explicit)).toContain("EXPLICIT_CONTEXT_SENTINEL");
    expect(JSON.stringify(explicit)).not.toContain("B_ONLY_SECRET");
  });
});

/* ------------------------------------------------------------------ *
 * D. Inbound authenticity and binding (N12–N15, §57)
 * ------------------------------------------------------------------ */

function craftedAskBody(input: {
  readonly requestId: string;
  readonly sourceProjectId: string;
  readonly targetProjectId: string;
  readonly task: string;
}): { readonly body: string; readonly threadId: string } {
  const threadId = threadIdForRequest(input.requestId);
  const envelope = materializeProjectAskEnvelope(input);
  return { body: serializeCrossProjectEnvelope(envelope), threadId };
}

describe("UXB-N12 an inbound request requires the AUTHENTICATED peer", () => {
  it("never acts on an unverified packet, and says how the packet was injected", async () => {
    const rig = twoProjectRig();
    const requestId = allocateCrossProjectRequestId({
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_SENSING,
      task: "unauthenticated ask",
      requestedBy: "user:test",
      nonce: "n12",
    });
    const { body, threadId } = craftedAskBody({
      requestId,
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_SENSING,
      task: "unauthenticated ask",
    });
    // HONEST NOTE (audit SC-5): the durable pump ALWAYS asserts `authenticatedPeer`,
    // so `inbox.unverified` is unreachable through a real two-peer run. This test
    // injects the packet through the REAL ingest call with `authenticatedPeer: null`
    // — the only honest way to produce an unverified record — and then asserts the
    // product refuses to act on it.
    const message = materializePeerMessage({
      messageId: "unverified-ask-1",
      thread: materializeThreadRef({ threadId }),
      from: PEER_OPTICS,
      to: PEER_SENSING,
      body,
    });
    await rig.b.installed.federation!.recordInboundMessage({
      transportMessageId: "unverified-ask-1",
      authenticatedPeer: null,
      message,
    });
    const inbox = (await rig.b.installed.federation!.inbox(PEER_SENSING)) as {
      readonly received: readonly PeerMessage[];
      readonly unverified: readonly PeerMessage[];
    };
    expect(inbox.unverified).toHaveLength(1);
    expect(inbox.received).toHaveLength(0);

    expect(await rig.appB.pending()).toHaveLength(0);
    await expect(rig.appB.respond(requestId, { status: "ANSWERED", answer: "should never happen" })).rejects.toMatchObject({
      reason: "unauthenticated_request",
    });
    expect(rawBodies(await rawMailbox(rig, PEER_OPTICS))).toHaveLength(0);
  });
});

describe("UXB-N13 the claimed source project must match the AUTHENTICATED sender", () => {
  it("refuses SOURCE_BINDING_MISMATCH with no processing", async () => {
    const rig = twoProjectRig({ withThirdPeer: true });
    const requestId = allocateCrossProjectRequestId({
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_SENSING,
      task: "spoofed source",
      requestedBy: "user:test",
      nonce: "n13",
    });
    const { body, threadId } = craftedAskBody({
      requestId,
      // Claims to be the optics project...
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_SENSING,
      task: "spoofed source",
    });
    // ...but the transport asserts the THERMO peer, which the directory binds to
    // the thermo PROJECT. Real ingest call; the pump would assert envelope.from.
    const message = materializePeerMessage({
      messageId: "spoofed-source-1",
      thread: materializeThreadRef({ threadId }),
      from: PEER_THERMO,
      to: PEER_SENSING,
      body,
    });
    await rig.b.installed.federation!.recordInboundMessage({
      transportMessageId: "spoofed-source-1",
      authenticatedPeer: PEER_THERMO,
      message,
    });

    const classification = classifyInboundProjectAsk({
      authenticated: true,
      localProjectId: PROJECT_SENSING,
      envelope: parseProjectAskEnvelope(JSON.parse(body)),
      message,
      descriptors: validateProjectPeerDescriptors([
        { projectId: PROJECT_OPTICS, aliases: [], peer: PEER_OPTICS, competenceTags: [] },
        { projectId: PROJECT_THERMO, aliases: [], peer: PEER_THERMO, competenceTags: [] },
      ]),
      answeredRequestIds: [],
    });
    expect(classification.status).toBe("SOURCE_BINDING_MISMATCH");

    expect(await rig.appB.pending()).toHaveLength(0);
    await expect(rig.appB.respond(requestId, { status: "ANSWERED", answer: "no" })).rejects.toMatchObject({
      reason: "source_binding_mismatch",
    });
  });
});

describe("UXB-N14 the envelope's target must be THIS installation's project", () => {
  it("refuses TARGET_BINDING_MISMATCH and runs no local collaboration", async () => {
    const rig = twoProjectRig({ withThirdPeer: true });
    const requestId = allocateCrossProjectRequestId({
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_THERMO,
      task: "misaddressed",
      requestedBy: "user:test",
      nonce: "n14",
    });
    const { body, threadId } = craftedAskBody({
      requestId,
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_THERMO,
      task: "misaddressed",
    });
    const message = materializePeerMessage({
      messageId: "misaddressed-1",
      thread: materializeThreadRef({ threadId }),
      from: PEER_OPTICS,
      to: PEER_SENSING,
      body,
    });
    // An authenticated packet from the right peer, addressed to ANOTHER project,
    // landing in THIS project's inbox (a real ingest call, not a transport replay).
    await rig.b.installed.federation!.recordInboundMessage({
      transportMessageId: "misaddressed-1",
      authenticatedPeer: PEER_OPTICS,
      message,
    });
    const classification = classifyInboundProjectAsk({
      authenticated: true,
      localProjectId: PROJECT_SENSING,
      envelope: parseProjectAskEnvelope(JSON.parse(body)),
      message,
      descriptors: validateProjectPeerDescriptors([
        { projectId: PROJECT_OPTICS, aliases: [], peer: PEER_OPTICS, competenceTags: [] },
      ]),
      answeredRequestIds: [],
    });
    expect(classification.status).toBe("TARGET_BINDING_MISMATCH");

    expect(await rig.appB.pending()).toHaveLength(0);
    await expect(
      rig.appB.respond(requestId, { compose: { task: "run my own collaboration for this", intent: "AUTO" } }),
    ).rejects.toMatchObject({ reason: "target_binding_mismatch" });
  });
});

describe("UXB-N15 a remote request cannot address the SOURCE project's workspace", () => {
  it("keeps every local read bound to THIS project even when the packet names another", async () => {
    const rig = twoProjectRig();
    const workspaceA = rig.a.installed.application.projectWorkspace!;
    await workspaceA.recordJournalEntry({
      kind: "REFERENCE_NOTE",
      title: "aperture",
      body: "A_ONLY_SECRET: shim drift root cause",
      provenance: "test:uxb",
    });
    await workspaceA.recordJournalEntry({
      kind: "REFERENCE_NOTE",
      title: "separate entry",
      body: "A_SECOND_SECRET: another private note",
      provenance: "test:uxb",
    });
    await rig.b.installed.application.projectWorkspace!.recordJournalEntry({
      kind: "REFERENCE_NOTE",
      title: "calibration",
      body: "B_ONLY_SECRET: private calibration",
      provenance: "test:uxb",
    });

    const asked = await rig.appA.ask({ target: "sensing", task: "what do you know?", requestedBy: "user:test" });
    await rig.b.pumpAndActivate();
    const pending = await rig.appB.pending();
    expect(pending).toHaveLength(1);
    // The hostile field is present and is metadata only.
    expect(pending[0]!.sourceProjectId).toBe(PROJECT_OPTICS);

    // B cannot read A's scope through the product workspace facade.
    await expect(rig.b.installed.application.projectWorkspace!.journal(PROJECT_OPTICS)).rejects.toBeDefined();
    // B's OWN reads stay B-scoped and never surface A's sentinel.
    const ownB = await rig.b.installed.application.projectWorkspace!.view();
    expect(JSON.stringify(ownB)).not.toContain("A_ONLY_SECRET");
    expect(JSON.stringify(ownB)).not.toContain("A_SECOND_SECRET");
    const journalB = await rig.b.installed.application.projectWorkspace!.journal();
    expect(JSON.stringify(journalB)).toContain("B_ONLY_SECRET");
    expect(JSON.stringify(journalB)).not.toContain("A_ONLY_SECRET");

    await rig.appB.respond(pending[0]!.requestId, { status: "ANSWERED", answer: "we do not have that" });
    await rig.a.pumpAndActivate();
    await rig.appA.receive(pending[0]!.requestId);
    // No packet in either direction ever carried A's scope content.
    for (const peer of [PEER_OPTICS, PEER_SENSING]) {
      for (const body of rawBodies(await rawMailbox(rig, peer))) {
        expect(body).not.toContain("A_ONLY_SECRET");
        expect(body).not.toContain("A_SECOND_SECRET");
        expect(body).not.toContain("B_ONLY_SECRET");
      }
    }
    // A cannot read B's scope either.
    await expect(rig.a.installed.application.projectWorkspace!.journal(PROJECT_SENSING)).rejects.toBeDefined();
  });
});

/* ------------------------------------------------------------------ *
 * E. Response semantics (N16–N18)
 * ------------------------------------------------------------------ */

describe("UXB-N16 the response target is DERIVED from the authenticated request", () => {
  it("leaves the caller no way to choose `to` or spoof the responder project", async () => {
    const rig = twoProjectRig();
    const asked = await rig.appA.ask({ target: "sensing", task: "who answers?", requestedBy: "user:test" });
    await rig.b.pumpAndActivate();
    const pending = await rig.appB.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.sourcePeerId).toBe(PEER_OPTICS.peerId);

    await rig.appB.respond(pending[0]!.requestId, { status: "ANSWERED", answer: "derived target" });
    const envelopes = await rawMailbox(rig, PEER_OPTICS);
    expect(envelopes).toHaveLength(1);
    expect(envelopes[0]!.from.peerId).toBe(PEER_SENSING.peerId);
    expect(envelopes[0]!.to.peerId).toBe(PEER_OPTICS.peerId);
    const answer = parseProjectAnswerEnvelope(JSON.parse(rawBodies(envelopes)[0]!));
    // The responder project is this project, and the addressee is the authentic source.
    expect(answer.responderProjectId).toBe(PROJECT_SENSING);
    expect(answer.sourceProjectId).toBe(PROJECT_OPTICS);

    // A caller cannot smuggle a `to` or a responder identity past the draft parser.
    await expect(
      rig.appB.respond(pending[0]!.requestId, { status: "ANSWERED", answer: "x", to: "peer-someone-else" }),
    ).rejects.toMatchObject({ reason: "invalid_request" });
    await expect(
      rig.appB.respond(pending[0]!.requestId, { status: "ANSWERED", answer: "x", responderProjectId: PROJECT_OPTICS }),
    ).rejects.toMatchObject({ reason: "invalid_request" });
    expect(await rawMailbox(rig, PEER_OPTICS)).toHaveLength(1);
    expect(asked.details.requestId).toBe(pending[0]!.requestId);
  });
});

describe("UXB-N17 the response uses the SAME request and thread", () => {
  it("derives the thread from the requestId on both sides", async () => {
    const rig = twoProjectRig();
    const asked = await rig.appA.ask({ target: "sensing", task: "same thread?", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    expect(asked.details.threadId).toBe(threadIdForRequest(requestId));

    await rig.b.pumpAndActivate();
    await rig.appB.respond(requestId, { status: "ANSWERED", answer: "same thread" });

    const envelopes = await rawMailbox(rig, PEER_OPTICS);
    expect(envelopes[0]!.operation.kind).toBe("peer_message");
    const operation = envelopes[0]!.operation as { readonly threadId: string; readonly body: string };
    expect(operation.threadId).toBe(threadIdForRequest(requestId));
    const answer = parseProjectAnswerEnvelope(JSON.parse(operation.body));
    expect(answer.requestId).toBe(requestId);
    expect(answer.protocolDigest).toBe(CROSS_PROJECT_PROTOCOL_DIGEST);

    await rig.a.pumpAndActivate();
    expect((await rig.appA.status(requestId)).status).toBe("ANSWERED");
  });
});

describe("UXB-N18 the request is acknowledged ONLY after the response send resolved", () => {
  it("does not acknowledge when the answer cannot be sent", async () => {
    const acks: string[] = [];
    let sends = 0;
    const failure = new Error("the durable transport is unavailable");
    const federation: CrossProjectFederationPort = {
      sendMessage: async () => {
        sends += 1;
        throw failure;
      },
      thread: async (threadId) => ({ messages: [], deliveredMessageIds: [], ackedMessageIds: [] }),
      inbox: async () => ({
        received: [craftedInboundAsk()],
        unverified: [],
        acks: [],
      }),
      acknowledge: async (input) => {
        acks.push(input.message.messageId);
        return {};
      },
    };
    const service = makeCrossProjectService({
      projectId: PROJECT_SENSING,
      localPeer: PEER_SENSING,
      clock: () => "2026-09-16T00:00:00Z",
      directory: staticProjectPeerDirectory([
        { projectId: PROJECT_OPTICS, aliases: [], peer: PEER_OPTICS, competenceTags: [] },
      ]),
      federation,
    });
    const pending = await service.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.requestId).toBe("cpq-n18-ask");
    await expect(service.respond("cpq-n18-ask", { status: "ANSWERED", answer: "hello" })).rejects.toThrow(
      "the durable transport is unavailable",
    );
    expect(sends).toBe(1);
    // THE property: a failed response send must not acknowledge first.
    expect(acks).toHaveLength(0);

    // And with a working send the ack DOES happen, after the send.
    const order: string[] = [];
    const working = makeCrossProjectService({
      projectId: PROJECT_SENSING,
      localPeer: PEER_SENSING,
      clock: () => "2026-09-16T00:00:00Z",
      directory: staticProjectPeerDirectory([
        { projectId: PROJECT_OPTICS, aliases: [], peer: PEER_OPTICS, competenceTags: [] },
      ]),
      federation: {
        sendMessage: async (input) => {
          order.push("send");
          return {
            message: materializePeerMessage({
              messageId: "msg-n18-answer",
              thread: materializeThreadRef({ threadId: input.threadId }),
              from: PEER_SENSING,
              to: input.to,
              body: input.body,
            }),
            delivered: true,
          };
        },
        thread: async () => ({ messages: [], deliveredMessageIds: [], ackedMessageIds: [] }),
        inbox: async () => ({ received: [craftedInboundAsk()], unverified: [], acks: [] }),
        acknowledge: async () => {
          order.push("ack");
          return {};
        },
      },
    });
    await working.respond("cpq-n18-ask", { status: "ANSWERED", answer: "hello" });
    expect(order).toEqual(["send", "ack"]);
  });
});

/* ------------------------------------------------------------------ *
 * F. Status is derived, read-only and honest (N19–N23)
 * ------------------------------------------------------------------ */

describe("UXB-N19 status() is READ-ONLY and no response means WAITING", () => {
  it("never sends, never acknowledges and reports WAITING rather than failure", async () => {
    const rig = twoProjectRig();
    const asked = await rig.appA.ask({ target: "sensing", task: "are you there?", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    const acksBefore = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly acks: readonly unknown[] };

    const first = await rig.appA.status(requestId);
    const second = await rig.appA.status(requestId);
    expect(first.status).toBe("WAITING");
    expect(second.status).toBe(first.status);
    expect(second.details.messageRefs).toEqual(first.details.messageRefs);

    const acksAfter = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly acks: readonly unknown[] };
    expect(acksAfter.acks).toHaveLength(acksBefore.acks.length);
    // Exactly the ONE ask was ever sent; status() sent nothing.
    expect(await rawMailbox(rig, PEER_SENSING)).toHaveLength(1);

    // §19: a request that was never sent derives PREPARED, not an error.
    const never = await rig.appA.status("cpq-never-sent");
    expect(never.status).toBe("PREPARED");
  });
});

describe("UXB-N20 receive()'s ACK is not agreement (and not an import)", () => {
  it("marks the answer processed without creating a Journal entry, Decision or Evidence", async () => {
    const rig = twoProjectRig();
    const journalBefore = await rig.a.installed.application.projectWorkspace!.journal();
    const headBefore = await headOf(rig.a);
    const asked = await rig.appA.ask({ target: "sensing", task: "did we study this?", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    await rig.b.pumpAndActivate();
    await rig.appB.respond(requestId, { status: "ANSWERED", answer: "yes, and the root cause was shim drift" });
    await rig.a.pumpAndActivate();

    const received = await rig.appA.receive(requestId);
    expect(received.status).toBe("ANSWERED");
    expect(received.answer).toBe("yes, and the root cause was shim drift");
    expect(received.responder).toBe("sensing");

    const inbox = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as {
      readonly acks: readonly { readonly messageId: string; readonly by: { readonly peerId: string } }[];
    };
    expect(inbox.acks.length).toBe(1);
    expect(inbox.acks[0]!.by.peerId).toBe(PEER_OPTICS.peerId);
    // ACK means processed: nothing about the project changed, and the answer was NOT
    // imported (no Journal entry, no Decision, no Evidence, no Task).
    expect(await rig.a.installed.application.projectWorkspace!.journal()).toEqual(journalBefore);
    expect(rig.a.installed.application.proof).toBeUndefined();
    expect(await headOf(rig.a)).toEqual(headBefore);
    const work = await rig.a.installed.application.projections!.work();
    expect(work.nodes.filter((node) => node.kind === "task")).toHaveLength(0);
    // Re-receiving is idempotent and does not add a second acknowledgement.
    await rig.appA.receive(requestId);
    const after = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly acks: readonly unknown[] };
    expect(after.acks).toHaveLength(1);
  });
});

describe("UXB-N21 a replayed request forces NO duplicate cognition", () => {
  it("derives ONE pending request and sends ONE answer", async () => {
    const rig = twoProjectRig();
    const asked = await rig.appA.ask({ target: "sensing", task: "replay me", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    await rig.b.pumpAndActivate();
    const pending = await rig.appB.pending();
    expect(pending).toHaveLength(1);

    // Replay the SAME logical request as a second real authenticated ingest with a
    // NEW transport message id (what a transport retry looks like at this boundary).
    const body = rawBodies(await rawMailbox(rig, PEER_SENSING))[0]!;
    const replay = materializePeerMessage({
      messageId: "replay-ask-1",
      thread: materializeThreadRef({ threadId: pending[0]!.threadId }),
      from: PEER_OPTICS,
      to: PEER_SENSING,
      body,
    });
    await rig.b.installed.federation!.recordInboundMessage({
      transportMessageId: "replay-ask-1",
      authenticatedPeer: PEER_OPTICS,
      message: replay,
    });
    const afterReplay = await rig.appB.pending();
    expect(afterReplay).toHaveLength(1);
    expect(afterReplay[0]!.requestId).toBe(requestId);

    await rig.appB.respond(requestId, { status: "ANSWERED", answer: "answered once" });
    // After answering, the request is no longer pending — derived, with no store.
    expect(await rig.appB.pending()).toHaveLength(0);
    // A second respond with the SAME draft is idempotent: no second answer.
    const again = await rig.appB.respond(requestId, { status: "ANSWERED", answer: "answered once" });
    expect(again.warnings.join(" ")).toMatch(/already had this exact terminal answer/u);
    const replyBodies = rawBodies(await rawMailbox(rig, PEER_OPTICS));
    expect(replyBodies.map((entry) => parseProjectAnswerEnvelope(JSON.parse(entry))).filter((entry) => entry.requestId === requestId)).toHaveLength(1);
  });
});

describe("UXB-N22 identical duplicate answers COLLAPSE", () => {
  it("still reports ANSWERED when the same answer arrives twice", async () => {
    const rig = twoProjectRig();
    const asked = await rig.appA.ask({ target: "sensing", task: "duplicate answers?", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    const threadId = asked.details.threadId;
    await rig.b.pumpAndActivate();
    await rig.appB.respond(requestId, { status: "ANSWERED", answer: "one answer" });

    // A REAL second federation send from B with a byte-identical envelope.
    const identical = serializeCrossProjectEnvelope(
      materializeProjectAnswerEnvelope({
        requestId,
        sourceProjectId: PROJECT_OPTICS,
        responderProjectId: PROJECT_SENSING,
        status: "ANSWERED",
        answer: "one answer",
      }),
    );
    await rig.b.installed.application.federation!.sendMessage({ to: PEER_OPTICS, threadId, body: identical });
    await rig.a.pumpAndActivate();

    const status = await rig.appA.status(requestId);
    expect(status.status).toBe("ANSWERED");
    expect(status.answer).toBe("one answer");
    expect(status.details.messageRefs.length).toBeGreaterThanOrEqual(3);
  });
});

describe("UXB-N23 materially different answers are a CONFLICT", () => {
  it("never silently picks first or latest, and acknowledges nothing", async () => {
    const rig = twoProjectRig();
    const asked = await rig.appA.ask({ target: "sensing", task: "conflicting answers?", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    const threadId = asked.details.threadId;
    await rig.b.pumpAndActivate();
    await rig.appB.respond(requestId, { status: "ANSWERED", answer: "the answer is A" });
    // A genuinely different terminal answer from the SAME expected peer.
    const different = serializeCrossProjectEnvelope(
      materializeProjectAnswerEnvelope({
        requestId,
        sourceProjectId: PROJECT_OPTICS,
        responderProjectId: PROJECT_SENSING,
        status: "ANSWERED",
        answer: "the answer is B",
      }),
    );
    await rig.b.installed.application.federation!.sendMessage({ to: PEER_OPTICS, threadId, body: different });
    await rig.a.pumpAndActivate();

    const status = await rig.appA.status(requestId);
    expect(status.status).toBe("CONFLICT");
    expect(status.answer).toBeUndefined();
    expect(status.summary).toMatch(/Conflicting answers/u);
    expect(status.warnings.join(" ")).toMatch(/none of them was chosen/u);

    const received = await rig.appA.receive(requestId);
    expect(received.status).toBe("CONFLICT");
    const inbox = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly acks: readonly unknown[] };
    expect(inbox.acks).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * G. Wrong / unverified peers (N24/N25)
 * ------------------------------------------------------------------ */

describe("UXB-N24 a WRONG PEER's answer is rejected", () => {
  it("accepts nothing from a known project that is not the addressee", async () => {
    const rig = twoProjectRig({ withThirdPeer: true });
    const asked = await rig.appA.ask({ target: "sensing", task: "who may answer?", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    const threadId = asked.details.threadId;
    expect(rig.c).toBeDefined();

    // A REAL third peer (bound to the thermo PROJECT in A's directory) answers on
    // the right thread with a perfectly valid envelope.
    const body = serializeCrossProjectEnvelope(
      materializeProjectAnswerEnvelope({
        requestId,
        sourceProjectId: PROJECT_OPTICS,
        responderProjectId: PROJECT_THERMO,
        status: "ANSWERED",
        answer: "I am not the project you asked",
      }),
    );
    await rig.c!.installed.application.federation!.sendMessage({ to: PEER_OPTICS, threadId, body });
    await rig.a.pumpAndActivate();

    const inbox = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly received: readonly unknown[] };
    expect(inbox.received.length).toBe(1);
    const status = await rig.appA.status(requestId);
    expect(status.status).toBe("WAITING");
    expect(status.warnings.join(" ")).toMatch(/NOT accepted/u);
    expect(await rig.appA.receive(requestId)).toMatchObject({ status: "WAITING" });
  });
});

describe("UXB-N25 an UNVERIFIED answer is rejected", () => {
  it("never completes a request from inbox.unverified, injected honestly", async () => {
    const rig = twoProjectRig();
    const asked = await rig.appA.ask({ target: "sensing", task: "unverified answer?", requestedBy: "user:test" });
    const requestId = asked.details.requestId;
    const threadId = asked.details.threadId;

    const body = serializeCrossProjectEnvelope(
      materializeProjectAnswerEnvelope({
        requestId,
        sourceProjectId: PROJECT_OPTICS,
        responderProjectId: PROJECT_SENSING,
        status: "ANSWERED",
        answer: "plausible but unauthenticated",
      }),
    );
    const message = materializePeerMessage({
      messageId: "unverified-answer-1",
      thread: materializeThreadRef({ threadId }),
      from: PEER_SENSING,
      to: PEER_OPTICS,
      body,
    });
    // HONEST NOTE (audit SC-5): the durable pump always asserts the sender, so an
    // `unverified` record cannot be produced by a real two-peer run. This test
    // injects it through the REAL ingest call with `authenticatedPeer: null` and
    // asserts the product still refuses to complete the request.
    await rig.a.installed.federation!.recordInboundMessage({
      transportMessageId: "unverified-answer-1",
      authenticatedPeer: null,
      message,
    });
    const inbox = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as {
      readonly received: readonly unknown[];
      readonly unverified: readonly unknown[];
    };
    expect(inbox.unverified).toHaveLength(1);
    expect(inbox.received).toHaveLength(0);

    expect((await rig.appA.status(requestId)).status).toBe("WAITING");
    expect((await rig.appA.receive(requestId)).status).toBe("WAITING");
    const acked = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly acks: readonly unknown[] };
    expect(acked.acks).toHaveLength(0);
  });
});

/* ------------------------------------------------------------------ *
 * H. Remote answer paths (§52/§53 → N26/N27) and one-request UX (N28)
 * ------------------------------------------------------------------ */

describe("UXB-N26 the remote project can answer using its EXISTING local collaboration", () => {
  it("composes the answer from application.collaboration.run with no new remote protocol", async () => {
    const askedRuns: unknown[] = [];
    const service = makeCrossProjectService({
      projectId: PROJECT_SENSING,
      localPeer: PEER_SENSING,
      clock: () => "2026-09-16T00:00:00Z",
      directory: staticProjectPeerDirectory([
        { projectId: PROJECT_OPTICS, aliases: [], peer: PEER_OPTICS, competenceTags: [] },
      ]),
      federation: fakeFederation({ sent: [], acks: [], received: [craftedInboundAsk()] }),
      collaboration: {
        run: async (request) => {
          askedRuns.push(request);
          return {
            status: "COMPLETED",
            summary: "Ran a bounded local exploration and admitted two findings about the aperture issue.",
            unresolved: [],
          };
        },
      },
    });
    const result = await service.respond("cpq-n18-ask", { compose: { task: "what do we know about apertures?", intent: "PARALLEL" } });
    expect(askedRuns).toHaveLength(1);
    expect(askedRuns[0]).toMatchObject({ task: "what do we know about apertures?", intent: "PARALLEL" });
    expect(result.status).toBe("ANSWERED");
    expect(result.answer).toContain("bounded local exploration");
  });
});

describe("UXB-N27 the remote project can answer DIRECTLY with no Explore", () => {
  it("sends authored text and never runs local collaboration", async () => {
    let runs = 0;
    const sent: string[] = [];
    const acks: string[] = [];
    const service = makeCrossProjectService({
      projectId: PROJECT_SENSING,
      localPeer: PEER_SENSING,
      clock: () => "2026-09-16T00:00:00Z",
      directory: staticProjectPeerDirectory([
        { projectId: PROJECT_OPTICS, aliases: [], peer: PEER_OPTICS, competenceTags: [] },
      ]),
      federation: {
        sendMessage: async (input) => {
          sent.push(input.body);
          return {
            message: materializePeerMessage({
              messageId: "msg-n27",
              thread: materializeThreadRef({ threadId: input.threadId }),
              from: PEER_SENSING,
              to: input.to,
              body: input.body,
            }),
            delivered: true,
          };
        },
        thread: async () => ({ messages: [], deliveredMessageIds: [], ackedMessageIds: [] }),
        inbox: async () => ({ received: [craftedInboundAsk()], unverified: [], acks: [] }),
        acknowledge: async () => {
          acks.push("ack");
          return {};
        },
      },
      collaboration: {
        run: async () => {
          runs += 1;
          return { status: "COMPLETED", summary: "should not run", unresolved: [] };
        },
      },
    });
    const result = await service.respond("cpq-n18-ask", { status: "ANSWERED", answer: "Yes: the 2024 study covers it." });
    expect(runs).toBe(0);
    expect(result.status).toBe("ANSWERED");
    expect(result.answer).toBe("Yes: the 2024 study covers it.");
    const answer = parseProjectAnswerEnvelope(JSON.parse(sent[0]!));
    expect(answer.answer).toBe("Yes: the 2024 study covers it.");
    expect(acks).toHaveLength(1);
  });
});

describe("UXB-N28 one user request needs no project switching, and AUTO cannot cross projects", () => {
  it("AUTO stops at CROSS_PROJECT_REQUIRED while the peers ARE really observable, then one Ask sends", async () => {
    const dir = freshDir("n28");
    const sent: unknown[] = [];
    const installed = installPalimpsest({ tools: { register: () => undefined } } as never, {
      projectId: PROJECT_OPTICS,
      databasePath: join(dir, "state.sqlite"),
      ordariumDatabasePath: join(dir, "ordarium.sqlite"),
      clock: () => "2026-09-16T00:00:00Z",
      git: new FakeGitPort("c".repeat(40)),
      localPeer: PEER_OPTICS,
      coordinationStore: new SqliteCoordinationStore(join(dir, "coordination.sqlite")),
      peerTransportPort: {
        adapterId: "uxb-test-transport",
        send: async (message: unknown) => {
          sent.push(message);
          return { transportMessageId: `t-${sent.length}`, delivered: true };
        },
      },
      peerDirectoryPort: {
        observePeers: async () => ({ state: "known" as const, value: [materializePeerAdvertisement({ peer: PEER_SENSING, competenceTags: [] })] }),
      },
      attemptCatalog: { assertAdmissibleAttempt: async () => undefined },
      // SC-9: the SAME declared bindings are the deployment's known independent
      // peers, so COORDINATE is genuinely reachable here (not vacuously blocked).
      knownIndependentPeers: [{ peerId: PEER_SENSING.peerId }],
      organizationMemoryStore: new SqliteOrganizationMemoryStore(join(dir, "memory.sqlite")),
      projectPeerDirectory: staticProjectPeerDirectory([
        { projectId: PROJECT_OPTICS, displayName: "optics", aliases: [], peer: PEER_OPTICS, competenceTags: [] },
        { projectId: PROJECT_SENSING, displayName: "sensing", aliases: [], peer: PEER_SENSING, competenceTags: [] },
      ]),
      projectAssociationStore: new SqliteProjectAssetAssociationStore(join(dir, "associations.sqlite")),
      projectJournalStore: new SqliteProjectJournalStore(join(dir, "journal.sqlite")),
    });
    OPEN.push({ close: () => installed.dispose() });

    expect(installed.application.crossProject).toBeDefined();
    expect(installed.application.collaboration).toBeDefined();

    // §27/§65: AUTO reaches CROSS_PROJECT_REQUIRED and sends NOTHING.
    const planned = await installed.application.collaboration!.run({
      task: "Get an independent review by another team of the shared state migration.",
      intent: "AUTO",
      requestedBy: "user:test",
    });
    expect(planned.status).toBe("CROSS_PROJECT_REQUIRED");
    expect(sent).toHaveLength(0);
    expect((await installed.federation!.commitments()).length).toBe(0);

    // The explicit Ask is the ONLY thing that sends, and it sends exactly once.
    const asked = await installed.application.crossProject!.ask({
      target: "sensing",
      task: "does the previous optics project know about the aperture issue?",
      requestedBy: "user:test",
    });
    expect(asked.status).toBe("RESOLVED");
    expect(sent).toHaveLength(1);
    // §60: the user-facing summary is plain language, with no federation vocabulary.
    expect(asked.summary).toBe("Asked the sensing project.");
    expect(asked.summary).not.toMatch(/peer|thread|federation|transport|ack/iu);
    // The caller never supplied a peer id, a thread id or a message id.
    expect(asked.details.peerId).toBe(PEER_SENSING.peerId);
  });
});

/* ------------------------------------------------------------------ *
 * I. CF-AE-R-05 at unit level (N29) and the protocol surface
 * ------------------------------------------------------------------ */

describe("UXB-N29 CF-AE-R-05 properties over SHARED physical workspace files", () => {
  it("holds both scopes in one file, fences each from the other and leaks no sentinel", async () => {
    const rig = twoProjectRig();
    await rig.a.installed.application.projectWorkspace!.recordJournalEntry({
      kind: "NEGATIVE_RESULT",
      title: "aperture",
      body: "A_ONLY_SECRET: aperture 12mm shim drift",
      provenance: "test:uxb",
    });
    await rig.a.installed.application.projectWorkspace!.associateAsset({
      assetKind: "PRODUCED_ARTIFACT",
      canonicalRef: { kind: "artifact", id: "asset-A" },
      associationKind: "MANUAL",
      provenance: "test:uxb",
    });
    await rig.b.installed.application.projectWorkspace!.recordJournalEntry({
      kind: "NEGATIVE_RESULT",
      title: "calibration",
      body: "B_ONLY_SECRET: calibration table",
      provenance: "test:uxb",
    });
    await rig.b.installed.application.projectWorkspace!.associateAsset({
      assetKind: "PRODUCED_ARTIFACT",
      canonicalRef: { kind: "artifact", id: "asset-B" },
      associationKind: "MANUAL",
      provenance: "test:uxb",
    });

    // A THIRD direct handle proves the SHARED PHYSICAL FILES really hold both scopes.
    const journalProbe = new SqliteProjectJournalStore(rig.journalPath);
    const associationProbe = new SqliteProjectAssetAssociationStore(rig.associationPath);
    OPEN.push({ close: () => journalProbe.close() });
    OPEN.push({ close: () => associationProbe.close() });
    expect([...(await journalProbe.projects())].sort()).toEqual([PROJECT_OPTICS, PROJECT_SENSING]);
    expect([...(await associationProbe.projects())].sort()).toEqual([PROJECT_OPTICS, PROJECT_SENSING]);

    // Each installation's derived reads stay bound to its OWN scope.
    expect(JSON.stringify(await rig.a.installed.application.projectWorkspace!.journal())).toContain("A_ONLY_SECRET");
    expect(JSON.stringify(await rig.a.installed.application.projectWorkspace!.journal())).not.toContain("B_ONLY_SECRET");
    expect(JSON.stringify(await rig.b.installed.application.projectWorkspace!.journal())).toContain("B_ONLY_SECRET");
    expect(JSON.stringify(await rig.b.installed.application.projectWorkspace!.journal())).not.toContain("A_ONLY_SECRET");
    const assetsA = await rig.a.installed.application.projectWorkspace!.assets();
    expect(assetsA.map((entry) => entry.canonicalRef.id)).toEqual(["asset-A"]);
    const assetsB = await rig.b.installed.application.projectWorkspace!.assets();
    expect(assetsB.map((entry) => entry.canonicalRef.id)).toEqual(["asset-B"]);

    // Foreign scope reads fail CLOSED, and federation is really active on both sides.
    expect(rig.a.installed.application.federation).toBeDefined();
    expect(rig.b.installed.application.federation).toBeDefined();
    await expect(rig.a.installed.application.projectWorkspace!.journal(PROJECT_SENSING)).rejects.toBeDefined();
    await expect(rig.b.installed.application.projectWorkspace!.journal(PROJECT_OPTICS)).rejects.toBeDefined();

    // A real authenticated cross-project message crosses, and a hostile
    // `sourceProjectId` in it widens NOTHING on the receiver.
    const asked = await rig.appA.ask({ target: "sensing", task: "aperture?", requestedBy: "user:test" });
    const pumpReport = await rig.b.pumpAndActivate();
    expect(pumpReport.pump.ingested).toBe(1);
    const pending = await rig.appB.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]!.sourceProjectId).toBe(PROJECT_OPTICS);
    expect(JSON.stringify(await rig.b.installed.application.projectWorkspace!.journal())).not.toContain("A_ONLY_SECRET");
    // The inbound packet itself carried no scope content.
    const inboundToB = await rawMailbox(rig, PEER_SENSING);
    for (const body of rawBodies(inboundToB)) {
      expect(body).not.toContain("A_ONLY_SECRET");
      expect(body).not.toContain("B_ONLY_SECRET");
    }
    // Attention really observed the inbound message (activation owner unchanged).
    const signals = await rig.b.installed.attention!.pending();
    expect(signals.some((signal) => signal.kind === "inbound_peer_message")).toBe(true);
    // §39/§61: the host instruction tells the principal to go and look — it can carry
    // no message content, because the signal has none.
    const text = crossProjectAttentionText(signals.find((signal) => signal.kind === "inbound_peer_message")!);
    expect(text).toMatch(/pending request/u);
    expect(text).not.toContain("A_ONLY_SECRET");
    expect(asked.details.requestId).toBe(pending[0]!.requestId);
  });
});

/* ------------------------------------------------------------------ *
 * J. The strict envelope layer (falsifiable on its own)
 * ------------------------------------------------------------------ */

describe("UX-B protocol: strict parsing, maxima and identity derivation", () => {
  const validAsk = {
    schemaVersion: 1,
    kind: "PROJECT_ASK",
    requestId: "cpq-abcdef",
    sourceProjectId: "project-a",
    targetProjectId: "project-b",
    task: "a question",
    protocolDigest: CROSS_PROJECT_PROTOCOL_DIGEST,
  };

  it("fails closed on unknown fields, a bad version, an unknown kind and missing fields", () => {
    expect(() => parseProjectAskEnvelope({ ...validAsk, extra: 1 })).toThrow(CrossProjectProtocolError);
    expect(() => parseProjectAskEnvelope({ ...validAsk, schemaVersion: 2 })).toThrow(/schemaVersion/u);
    expect(() => parseProjectAskEnvelope({ ...validAsk, kind: "PROJECT_COMMAND" })).toThrow(/kind/u);
    const { task: _task, ...missing } = validAsk;
    expect(() => parseProjectAskEnvelope(missing)).toThrow(/task/u);
    expect(() => parseProjectAskEnvelope({ ...validAsk, contextText: "   " })).toThrow(/non-empty/u);
  });

  it("fails closed on an ANSWERED answer with no answer and a DECLINED with no detail", () => {
    const base = {
      schemaVersion: 1,
      kind: "PROJECT_ANSWER",
      requestId: "cpq-abcdef",
      sourceProjectId: "project-a",
      responderProjectId: "project-b",
      protocolDigest: CROSS_PROJECT_PROTOCOL_DIGEST,
    };
    expect(() => parseProjectAnswerEnvelope({ ...base, status: "ANSWERED" })).toThrow(/must carry the answer/u);
    expect(() => parseProjectAnswerEnvelope({ ...base, status: "PARTIAL" })).toThrow(/detail/u);
    expect(() => parseProjectAnswerEnvelope({ ...base, status: "DECLINED", detail: "cannot" })).not.toThrow();
    expect(() => parseProjectAnswerEnvelope({ ...base, status: "DECLINED", detail: "no", answer: "smuggled" })).toThrow(
      /must not carry answer/u,
    );
  });

  it("REFUSES an oversize packet instead of truncating it, and bounds are explicit", () => {
    expect(() =>
      materializeProjectAskEnvelope({
        requestId: "cpq-abcdef",
        sourceProjectId: "project-a",
        targetProjectId: "project-b",
        task: "x".repeat(4_001),
      }),
    ).toThrow(/product maximum/u);
    expect(CROSS_PROJECT_MAX_BODY_BYTES).toBe(32_768);
    // The serialized body bound is enforced too.
    const huge = materializeProjectAnswerEnvelope({
      requestId: "cpq-abcdef",
      sourceProjectId: "project-a",
      responderProjectId: "project-b",
      status: "ANSWERED",
      answer: "y".repeat(8_000),
    });
    expect(() => serializeCrossProjectEnvelope(huge)).not.toThrow();
  });

  it("derives a deterministic requestId and a ThreadRef-grammar thread, and keeps the protocol digest stable", () => {
    const first = allocateCrossProjectRequestId({
      sourceProjectId: "project-a",
      targetProjectId: "project-b",
      task: "t",
      requestedBy: "user:test",
      nonce: "0",
    });
    const second = allocateCrossProjectRequestId({
      sourceProjectId: "project-a",
      targetProjectId: "project-b",
      task: "t",
      requestedBy: "user:test",
      nonce: "0",
    });
    const third = allocateCrossProjectRequestId({
      sourceProjectId: "project-a",
      targetProjectId: "project-b",
      task: "t",
      requestedBy: "user:test",
      nonce: "1",
    });
    expect(first).toBe(second);
    expect(third).not.toBe(first);
    expect(threadIdForRequest(first)).toBe(`thr-${first}`);
    expect(crossProjectProtocolDigest()).toBe(CROSS_PROJECT_PROTOCOL_DIGEST);
    expect(INBOUND_ASK_CLASSIFICATIONS).toContain("SOURCE_BINDING_MISMATCH");
  });

  it("validates a whole descriptor set and refuses a malformed one", () => {
    expect(() =>
      validateProjectPeerDescriptors([
        { projectId: "a", aliases: [], peer: PEER_OPTICS, competenceTags: [] },
        { projectId: "a", aliases: [], peer: PEER_SENSING, competenceTags: [] },
      ]),
    ).toThrow(/duplicate projectId/u);
    expect(() =>
      validateProjectPeerDescriptors([
        { projectId: "a", aliases: ["same"], peer: PEER_OPTICS, competenceTags: [] },
        { projectId: "b", aliases: ["same"], peer: PEER_SENSING, competenceTags: [] },
      ]),
    ).toThrow(/more than one project/u);
    expect(() => materializeProjectPeerDescriptor({ projectId: "a", aliases: [] })).toThrow(/missing required field/u);
    expect(() => materializeProjectPeerDescriptor({ projectId: "1 bad", aliases: [], peer: PEER_OPTICS, competenceTags: [] })).toThrow(
      /stable identifier/u,
    );
  });

  it("rejects a request that carries an intent or an authority field (V1 is ASK_PROJECT only)", () => {
    expect(() =>
      parseCrossProjectAskRequest({ target: "optics", task: "t", requestedBy: "user", intent: "DELEGATE_PROJECT" }),
    ).toThrow(/unknown field "intent"/u);
    expect(() => parseCrossProjectAskRequest({ target: "optics", task: "t", requestedBy: "user", commitment: {} })).toThrow(
      /unknown field "commitment"/u,
    );
    expect(() => parseCrossProjectAskRequest({ target: { schemaVersion: 1, peerId: "peer-1" }, task: "t", requestedBy: "user" })).toThrow(
      /never a peer reference/u,
    );
  });
});

/* ------------------------------------------------------------------ *
 * K. Test doubles (clearly NOT the product path)
 * ------------------------------------------------------------------ */

interface FakeFederationOptions {
  readonly sent: { readonly to: PeerRef; readonly body: string }[];
  readonly acks?: string[];
  /** Inbound authenticated messages this double reports (default: none). */
  readonly received?: readonly PeerMessage[];
}

/**
 * A recording `CrossProjectFederationPort` used ONLY for service-level properties
 * that need deterministic zero-send / ordering assertions. It is not a substitute
 * for the real two-project rig above: every claim about real delivery uses the
 * real deployments.
 */
function fakeFederation(options: FakeFederationOptions): CrossProjectFederationPort {
  let counter = 0;
  return {
    sendMessage: async (input) => {
      counter += 1;
      options.sent.push({ to: input.to, body: input.body });
      return {
        message: materializePeerMessage({
          messageId: `fake-msg-${counter}`,
          thread: materializeThreadRef({ threadId: input.threadId }),
          from: PEER_SENSING,
          to: input.to,
          body: input.body,
        }),
        delivered: true,
      };
    },
    thread: async () => ({ messages: [], deliveredMessageIds: [], ackedMessageIds: [] }),
    inbox: async () => ({ received: options.received ?? [], unverified: [], acks: [] }),
    acknowledge: async (input) => {
      options.acks?.push(input.message.messageId);
      return {};
    },
  };
}

/** A valid, authenticated inbound `PROJECT_ASK` for the service-level doubles. */
function craftedInboundAsk(): PeerMessage {
  const requestId = "cpq-n18-ask";
  const threadId = threadIdForRequest(requestId);
  return materializePeerMessage({
    messageId: "inbound-ask-n18",
    thread: materializeThreadRef({ threadId }),
    from: PEER_OPTICS,
    to: PEER_SENSING,
    body: serializeCrossProjectEnvelope(
      materializeProjectAskEnvelope({
        requestId,
        sourceProjectId: PROJECT_OPTICS,
        targetProjectId: PROJECT_SENSING,
        task: "a question from the other project",
      }),
    ),
  });
}

/* ------------------------------------------------------------------ *
 * L. THE §47 context-disclosure proof, at unit level
 * ------------------------------------------------------------------ */

describe("UX-B §47 the raw outbound envelope is minimal by construction", () => {
  it("carries only protocol/request ids, routing metadata and the exact task", async () => {
    const rig = twoProjectRig();
    // Sentinels in every place a naive implementation would dump from.
    const workspace = rig.a.installed.application.projectWorkspace!;
    await workspace.recordJournalEntry({
      kind: "OPEN_QUESTION",
      title: "JOURNAL_TITLE_SENTINEL",
      body: "JOURNAL_BODY_SENTINEL",
      provenance: "test:uxb",
    });
    await workspace.appendDecision({
      statement: "DECISION_SENTINEL",
      rationale: "RATIONALE_SENTINEL",
      evidenceIds: [],
    });

    // §26: the READ-ONLY preview shows EXACTLY the packet that the immediately
    // following one-click Ask materializes — same requestId, same task, same context.
    const preview = await rig.appA.prepareAsk({
      target: "sensing",
      task: "TASK_SENTINEL_IS_ALLOWED",
      contextText: "CONTEXT_SENTINEL_IS_ALLOWED",
      requestedBy: "user:test",
    });
    expect(preview.status).toBe("PREPARED");
    // Preparing sends NOTHING (it is a pure read).
    expect(await rawMailbox(rig, PEER_SENSING)).toHaveLength(0);

    const asked = await rig.appA.ask({
      target: "sensing",
      task: "TASK_SENTINEL_IS_ALLOWED",
      contextText: "CONTEXT_SENTINEL_IS_ALLOWED",
      requestedBy: "user:test",
    });
    const envelopes = await rawMailbox(rig, PEER_SENSING);
    expect(envelopes).toHaveLength(1);
    const envelope = envelopes[0]!;
    const allowedBody = rawBodies(envelopes)[0]!;

    expect(preview.details.requestId).toBe(asked.details.requestId);
    expect(preview.details.threadId).toBe(asked.details.threadId);
    expect(preview.outbound!.task).toBe("TASK_SENTINEL_IS_ALLOWED");
    expect(preview.outbound!.contextText).toBe("CONTEXT_SENTINEL_IS_ALLOWED");
    expect(preview.outbound!.requestId).toBe(asked.details.requestId);
    // The preview's body is byte-identical to the packet the Ask really sent.
    expect(preview.outbound!.body).toBe(rawBodies(await rawMailbox(rig, PEER_SENSING))[0]!);

    // Routing metadata the transport adds (mechanical, not content).
    expect(Object.keys(envelope).sort()).toEqual(["from", "operation", "operationId", "schemaVersion", "sentAt", "to"]);
    expect(envelope.from.peerId).toBe(PEER_OPTICS.peerId);
    expect(envelope.to.peerId).toBe(PEER_SENSING.peerId);
    expect(Object.keys(envelope.operation).sort()).toEqual(["body", "kind", "threadId"]);

    const parsed = JSON.parse(allowedBody) as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      expect([
        "schemaVersion",
        "kind",
        "requestId",
        "sourceProjectId",
        "targetProjectId",
        "task",
        "contextText",
        "protocolDigest",
      ]).toContain(key);
    }
    expect(parsed.task).toBe("TASK_SENTINEL_IS_ALLOWED");
    expect(parsed.contextText).toBe("CONTEXT_SENTINEL_IS_ALLOWED");
    for (const sentinel of [
      "JOURNAL_TITLE_SENTINEL",
      "JOURNAL_BODY_SENTINEL",
      "DECISION_SENTINEL",
      "RATIONALE_SENTINEL",
    ]) {
      expect(allowedBody).not.toContain(sentinel);
    }
  });
});

/* ------------------------------------------------------------------ *
 * M. The product faces (SC-15: an unwired face is an invisible face)
 * ------------------------------------------------------------------ */

describe("UX-B product faces: discovery, HTTP routes and the agent tool", () => {
  it("exposes the surface in discovery, serves every route and composes the tool", async () => {
    const rig = twoProjectRig();
    const app = rig.a.installed.application;
    // Two applications, because `pending`/`respond` are addressed to the OTHER
    // project: the route layer is per-installation.
    const callOn = (
      target: typeof app,
      input: {
        readonly method: string;
        readonly pathname: string;
        readonly body?: unknown;
        readonly query?: Record<string, string>;
      },
    ): Promise<{ readonly status: number; readonly body: unknown } | undefined> =>
      handleApplicationRequest({
        application: target,
        method: input.method,
        pathname: input.pathname,
        query: new URLSearchParams(input.query ?? {}),
        body: input.body,
      });
    const call = (input: Parameters<typeof callOn>[1]) => callOn(app, input);
    const appB = rig.b.installed.application;
    const callB = (input: Parameters<typeof callOn>[1]) => callOn(appB, input);

    // SC-15: the discovery list must name the face (the monitor 501 lesson).
    const surfaces = await call({ method: "GET", pathname: "/api/application/surfaces" });
    expect(surfaces!.status).toBe(200);
    expect((surfaces!.body as Record<string, unknown>).crossProject).toBe(true);

    const projects = await call({ method: "GET", pathname: "/api/cross-project/projects" });
    expect(projects!.status).toBe(200);
    expect((projects!.body as { readonly state: string }).state).toBe("known");

    const prepare = await call({
      method: "POST",
      pathname: "/api/cross-project/prepare",
      body: { target: "sensing", task: "http preview", requestedBy: "user:test" },
    });
    expect((prepare!.body as { readonly status: string }).status).toBe("PREPARED");

    const askRoute = await call({
      method: "POST",
      pathname: "/api/cross-project/ask",
      body: { target: "sensing", task: "asked over the product route", requestedBy: "user:test" },
    });
    expect(askRoute!.status).toBe(200);
    const requestId = (askRoute!.body as { readonly details: { readonly requestId: string } }).details.requestId;

    // §67: a caller cannot smuggle an authority field through the route (400).
    const refused = await call({
      method: "POST",
      pathname: "/api/cross-project/ask",
      body: { target: "sensing", task: "t", requestedBy: "user:test", peerId: "peer-x" },
    });
    expect(refused!.status).toBe(400);

    await rig.b.pumpAndActivate();
    const inbound = (await rig.b.installed.federation!.inbox(PEER_SENSING)) as { readonly received: readonly PeerMessage[] };
    expect(inbound.received).toHaveLength(1);
    const status = await call({ method: "GET", pathname: "/api/cross-project/status", query: { requestId } });
    expect((status!.body as { readonly status: string }).status).toBe("WAITING");
    const pending = await callB({ method: "GET", pathname: "/api/cross-project/pending" });
    expect(pending!.body).toHaveLength(1);

    // `respond` is mutating (it sends and then acknowledges) and the acknowledgement
    // is recorded only after the send resolved.
    const respond = await callB({
      method: "POST",
      pathname: "/api/cross-project/respond",
      body: { requestId, answer: { status: "ANSWERED", answer: "answered over http" } },
    });
    expect((respond!.body as { readonly status: string }).status).toBe("ANSWERED");
    const inboundAcks = (await rig.b.installed.federation!.inbox(PEER_SENSING)) as { readonly acks: readonly unknown[] };
    expect(inboundAcks.acks).toHaveLength(1);
    expect(await rig.b.installed.application.crossProject!.pending()).toHaveLength(0);

    await rig.a.pumpAndActivate();
    const receive = await call({ method: "POST", pathname: "/api/cross-project/receive", body: { requestId } });
    expect(receive!.status).toBe(200);
    expect((receive!.body as { readonly status: string }).status).toBe("ANSWERED");
    expect((receive!.body as { readonly answer: string }).answer).toBe("answered over http");

    // SC-7: the explicit acknowledge product path (per PeerMessage).
    const inbox = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly received: readonly PeerMessage[] };
    const ackRoute = await call({
      method: "POST",
      pathname: "/api/cross-project/acknowledge",
      body: { message: inbox.received[0]! },
    });
    expect(ackRoute!.status).toBe(200);
    const acked = (await rig.a.installed.federation!.inbox(PEER_OPTICS)) as { readonly acks: readonly unknown[] };
    expect(acked.acks).toHaveLength(1);
    // A malformed message cannot be acknowledged (strict parse at the boundary).
    const badAck = await call({
      method: "POST",
      pathname: "/api/cross-project/acknowledge",
      body: { message: { messageId: "msg-x", body: "x" } },
    });
    expect(badAck!.status).toBeGreaterThanOrEqual(400);

    // §29: the agent tool, with its declared action set and mutating mode.
    const tools = defineApplicationTools(app);
    const tool = tools.find((entry) => entry.name === "palimpsest_cross_project");
    expect(tool).toBeDefined();
    expect(tool!.mode).toBe("mutating");
    const actionProperty = (tool!.parameters as { readonly properties: Record<string, { readonly enum: readonly string[] }> }).properties.action!;
    expect([...actionProperty.enum]).toEqual([
      "projects",
      "prepare",
      "ask",
      "status",
      "pending",
      "respond",
      "receive",
      "acknowledge",
    ]);
    const toolProjects = await tool!.execute({ action: "projects" }, {} as never);
    expect((toolProjects as { readonly state: string }).state).toBe("known");
    // The tool derives `requestedBy`; an authority-ish argument is rejected.
    await expect(tool!.execute({ action: "ask", target: "sensing", task: "x", peerId: "peer-x" }, {} as never)).rejects.toThrow(
      /unknown argument/u,
    );
    // The tool face is only composed when the surface is.
    expect(tools.some((entry) => entry.name === "palimpsest_surfaces")).toBe(true);
    const surfacesTool = tools.find((entry) => entry.name === "palimpsest_surfaces")!;
    const reported = (await surfacesTool.execute({ action: "list" }, {} as never)) as Record<string, unknown>;
    expect(reported.crossProject).toBe(true);
  });
});

/* ------------------------------------------------------------------ *
 * N. The §10 untrusted resolver seam and the §61 host texts
 * ------------------------------------------------------------------ */

describe("UX-B §10 an untrusted resolver proposes; the DIRECTORY decides", () => {
  const directory = () =>
    staticProjectPeerDirectory([
      { projectId: "optics-eu", displayName: "optics", aliases: ["optics-project"], peer: { schemaVersion: 1, peerId: "peer-1" }, competenceTags: [] },
      { projectId: "sensing", aliases: [], peer: { schemaVersion: 1, peerId: "peer-2" }, competenceTags: [] },
    ]);

  it("rejects a resolver proposal the directory does not bind, and sends nothing", async () => {
    const sent: { readonly to: PeerRef; readonly body: string }[] = [];
    const service = makeCrossProjectService({
      projectId: PROJECT_OPTICS,
      localPeer: PEER_OPTICS,
      clock: () => "2026-09-16T00:00:00Z",
      directory: directory(),
      federation: fakeFederation({ sent }),
      targetResolver: { resolverId: "test-model", resolveTarget: async () => ({ projectId: "project-invented" }) },
    });
    const asked = await service.ask({ target: "that project from last time", task: "hello?", requestedBy: "user:test" });
    expect(asked.status).toBe("TARGET_UNKNOWN");
    expect(asked.warnings.join(" ")).toMatch(/grants no authority/u);
    expect(sent).toHaveLength(0);
  });

  it("uses the DIRECTORY's peer binding and never the resolver's claimed one", async () => {
    const sent: { readonly to: PeerRef; readonly body: string }[] = [];
    const service = makeCrossProjectService({
      projectId: PROJECT_OPTICS,
      localPeer: PEER_OPTICS,
      clock: () => "2026-09-16T00:00:00Z",
      directory: directory(),
      federation: fakeFederation({ sent }),
      // The resolver names the right project but a peer the directory does not bind.
      targetResolver: { resolverId: "test-model", resolveTarget: async () => ({ projectId: "sensing", peerId: "peer-stale" }) },
    });
    const asked = await service.ask({ target: "the sensing one", task: "hello?", requestedBy: "user:test" });
    expect(asked.status).toBe("RESOLVED");
    expect(asked.details.peerId).toBe("peer-2");
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to.peerId).toBe("peer-2");
  });

  it("treats a resolver that cannot choose as a refusal, not as a silent pick", async () => {
    const sent: { readonly to: PeerRef; readonly body: string }[] = [];
    const service = makeCrossProjectService({
      projectId: PROJECT_OPTICS,
      localPeer: PEER_OPTICS,
      clock: () => "2026-09-16T00:00:00Z",
      directory: directory(),
      federation: fakeFederation({ sent }),
      targetResolver: { resolverId: "test-model", resolveTarget: async () => undefined },
    });
    const asked = await service.ask({ target: "someone", task: "hello?", requestedBy: "user:test" });
    expect(asked.status).toBe("TARGET_AMBIGUOUS");
    expect(asked.candidates).toEqual(["optics", "sensing"]);
    expect(sent).toHaveLength(0);
  });
});

describe("UX-B §61 the host instruction texts carry no message content (SC-21)", () => {
  it("instructs the principal without embedding an ask body", () => {
    const signal = {
      schemaVersion: 1 as const,
      signalId: "sig-1",
      kind: "inbound_peer_message" as const,
      peer: PEER_OPTICS,
      threadId: "thr-cpq-abc",
      subjects: [{ kind: "peer_message", id: "msg-1" }],
      reason: "inbound message from \"peer-optics\" awaits local attention",
      requiresUserAttention: false,
      createdAt: "2026-09-16T00:00:00Z",
    };
    const request = crossProjectAttentionText(signal, "request");
    const answer = crossProjectAttentionText(signal, "answer");
    const either = crossProjectAttentionText(signal);
    expect(request).toBe(
      `[palimpsest cross-project] ${CROSS_PROJECT_INBOUND_REQUEST_TEXT} Signalled by "peer-optics" (thread thr-cpq-abc) about msg-1. ` +
        'Use the palimpsest_cross_project tool: action "pending" for a request addressed to this project, ' +
        'or action "status"/"receive" for an answer to a question this project asked.',
    );
    expect(answer).toContain(CROSS_PROJECT_INBOUND_ANSWER_TEXT);
    expect(either).toContain(CROSS_PROJECT_INBOUND_REQUEST_TEXT);
    expect(either).toContain(CROSS_PROJECT_INBOUND_ANSWER_TEXT);
    // The signal has no content and neither does the instruction.
    expect(request).not.toContain("A_ONLY_SECRET");
    expect(CROSS_PROJECT_HOST_TEXTS.request).toBe(CROSS_PROJECT_INBOUND_REQUEST_TEXT);
    expect(CROSS_PROJECT_HOST_TEXTS.answer).toBe(CROSS_PROJECT_INBOUND_ANSWER_TEXT);
  });
});

/* ================================================================== *
 * Gate-review regressions (UX-B review findings M1-M4)
 * ================================================================== */

describe("UX-B gate-review regressions", () => {
  it("M1: refuses a directory that binds one peer to more than one project", () => {
    // A peer bound twice makes "which project answered" ambiguous, so the routing table
    // fails closed at construction rather than at answer time.
    expect(() =>
      validateProjectPeerDescriptors([
        { projectId: "project-a", peer: materializePeerRef({ peerId: "peer-x" }), aliases: [], competenceTags: [] },
        { projectId: "project-b", peer: materializePeerRef({ peerId: "peer-x" }), aliases: [], competenceTags: [] },
      ]),
    ).toThrow(/more than one project/u);
  });

  it("M2: an envelope naming a DIFFERENT protocol is refused, not accepted on shape", () => {
    const envelope = materializeProjectAskEnvelope({
      requestId: "req-protocol-mismatch",
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_SENSING,
      task: "a task",
    });
    // The shape is valid and the digest is a well-formed sha256 — but it is not ours.
    expect(() =>
      parseProjectAskEnvelope({ ...envelope, protocolDigest: "0".repeat(64) }),
    ).toThrow(/protocol/u);
    // The genuine digest parses.
    expect(parseProjectAskEnvelope(envelope).protocolDigest).toBe(CROSS_PROJECT_PROTOCOL_DIGEST);
  });

  it("M3: cross-kind fields fail closed — a PROJECT_ASK cannot carry answer fields", () => {
    const envelope = materializeProjectAskEnvelope({
      requestId: "req-cross-kind",
      sourceProjectId: PROJECT_OPTICS,
      targetProjectId: PROJECT_SENSING,
      task: "a task",
    });
    expect(() =>
      parseProjectAskEnvelope({ ...envelope, status: "ANSWERED", answer: "SMUGGLED" }),
    ).toThrow(/unknown field/u);
    const answer = materializeProjectAnswerEnvelope({
      requestId: "req-cross-kind",
      sourceProjectId: PROJECT_OPTICS,
      responderProjectId: PROJECT_SENSING,
      status: "ANSWERED",
      answer: "the answer",
    });
    expect(() => parseProjectAnswerEnvelope({ ...answer, task: "smuggled" })).toThrow(/unknown field/u);
  });

  it("M4: a display name that is already a phrase is not doubled", () => {
    expect(projectPhrase("the detector project")).toBe("the detector project");
    expect(projectPhrase("detector")).toBe("the detector project");
    expect(projectPhrase("the optics team")).toBe("the optics team");
    expect(projectPhrase("project-a")).toBe("the project-a project");
  });
});
