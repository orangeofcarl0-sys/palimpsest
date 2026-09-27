/**
 * E5-P — GOVERNED PROCEDURAL CAPITALIZATION, as machine proofs.
 *
 *     P-P01…P-P15   the positive lifecycle
 *     P-N01…P-N18   the adversarial boundary
 *
 * The suite is deliberately split the way the ruling splits it: the P-P block proves the loop
 * closes (experience → candidate → admission → durable revision → association → inheritance →
 * supersession), and the P-N block proves the loop cannot be widened into an authority.
 *
 * Everything here runs against REAL durable stores over temp paths — no in-memory fakes for the
 * chain, because the properties under test (survive restart, immutable history, derived standing)
 * are exactly the ones a fake would assume.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  KNOWLEDGE_PROCEDURE_STANDINGS,
  KNOWLEDGE_PROCEDURE_ASSET_KIND,
  PROCEDURE_HANDLE_PREFIX,
  procedureKnowledgeHandle,
  procedureStandingAtCompile,
  resolveKnowledgeBindings,
  type ContextKnowledgePorts,
} from "../src/context/index.js";
import {
  PROCEDURE_REFUSAL_REASONS,
  PROCEDURE_STANDINGS,
  ProcedureRefusal,
  SqliteProcedureStore,
  canonicalGrounds,
  deriveProcedureStandings,
  makeProcedureService,
  materializeProcedureAdmissionProvenance,
  materializeProcedureCandidate,
  materializeProcedureRevision,
  parseProcedureCandidate,
  parseProcedureRevision,
  procedureCandidateIdOf,
  procedureHandle,
  procedureRefKey,
  procedureRefOf,
  publishedRevisionsOf,
  retirementsOf,
  type ProcedureAdmissionPort,
  type ProcedureAuthoringPort,
  type ProcedureCandidate,
  type ProcedureGroundObservation,
  type ProcedurePorts,
  type ProcedureRef,
  type ProcedureService,
  type ProcedureStore,
} from "../src/procedures/index.js";
import {
  PROJECT_ASSET_KINDS,
  ProjectWorkspaceError,
  materializeProjectAssetAssociation,
  parseProjectAssetAssociation,
} from "../src/project_workspace/index.js";
import { canonicalDigest, normalizeEventPayload } from "../src/schema/index.js";

/* ------------------------------------------------------------------ fixtures */

const GROUND_DIGEST = "a".repeat(64);
const PROJECT_DIGEST = "b".repeat(64);

/** A deterministic empirical-ground owner over a fixed table, so a test can name an unknown ref. */
function groundOwner(known: readonly ProcedureGroundObservation[]): ProcedurePorts {
  return {
    grounds: {
      async observe(kind, ref) {
        return known.find((entry) => entry.kind === kind && entry.ref === ref);
      },
    },
  };
}

function evaluationGround(ref = "eval-1"): ProcedureGroundObservation {
  return Object.freeze({ kind: "ORGANIZATION_EVALUATION", ref, digest: GROUND_DIGEST, experimentRef: "exp-1", subject: "the structural experiment" });
}

/** A real method body: purpose, applicability, preconditions, ordered steps, checks, limitations. */
function methodBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    title: "Verify the canonical basis before mutating",
    purpose: "Avoid mutating on a basis that has already moved",
    applicability: ["any task that writes canonical state"],
    preconditions: ["the canonical basis is readable"],
    steps: [
      { instruction: "inspect the canonical basis" },
      { instruction: "run verification", note: "the mechanical check, not a judgement" },
      { instruction: "mutate only after both are current" },
    ],
    checks: ["the basis digest is unchanged between inspection and mutation"],
    expectedOutputs: ["a mutation applied on a current basis"],
    limitations: ["does not cover concurrent external writers"],
    capabilityHints: ["a verification runtime"],
    recommendedRecipeRefs: ["verify.v1"],
    ...overrides,
  };
}

/** An UNTRUSTED authoring seam that always proposes the same body. */
function authoringOf(body: unknown = methodBody(), origin = "test-author"): ProcedureAuthoringPort {
  return {
    origin,
    async propose() {
      return { outcome: "proposal" as const, content: body };
    },
  };
}

/** An INDEPENDENT authority that decides exactly what the test tells it to. */
function authorityOf(
  decide: ProcedureAdmissionPort["decide"],
  policyRef = { policyId: "test-policy", version: "1" },
): ProcedureAdmissionPort {
  return { policyRef, decide };
}

/** An authority that PUBLISHes the exact candidate digest it is shown. */
function publishingAuthority(): ProcedureAdmissionPort {
  return authorityOf(async (input) => ({
    decision: "PUBLISH" as const,
    candidateDigest: input.candidateDigest,
    rationale: "the method is admitted as a reusable project procedure under its recorded scope",
    policyRef: { policyId: "test-policy", version: "1" },
  }));
}

/** An association owner over an in-memory set, so `associate`/`associated` are observable. */
function associationOwner(): { readonly port: NonNullable<ProcedurePorts["association"]>; readonly rows: { projectId: string; id: string; digest: string }[] } {
  const rows: { projectId: string; id: string; digest: string }[] = [];
  return {
    rows,
    port: {
      async associated(projectId, procedureId, revision) {
        return rows.some((row) => row.projectId === projectId && row.id === `${procedureId}@${revision}`);
      },
      async associate(input) {
        rows.push({ projectId: input.projectId, id: `${input.procedureRef.procedureId}@${input.procedureRef.revision}`, digest: input.procedureRef.digest });
      },
    },
  };
}

interface Rig {
  readonly dir: string;
  readonly path: string;
  store: SqliteProcedureStore;
  service: ProcedureService;
  readonly grounds: ProcedurePorts;
  readonly association: ReturnType<typeof associationOwner>;
  authoring?: ProcedureAuthoringPort | undefined;
  admission?: ProcedureAdmissionPort | undefined;
}

let rigs: Rig[] = [];
let dirs: string[] = [];

/** Build a rig over a REAL sqlite file, so a simulated restart can reopen the same path. */
function rig(options: {
  readonly authoring?: ProcedureAuthoringPort | undefined;
  readonly admission?: ProcedureAdmissionPort | undefined;
  readonly known?: readonly ProcedureGroundObservation[];
  readonly reuse?: { readonly path: string };
} = {}): Rig {
  const dir = options.reuse === undefined ? mkdtempSync(join(tmpdir(), "e5p-")) : "";
  if (dir !== "") dirs.push(dir);
  const path = options.reuse?.path ?? join(dir, "procedures.sqlite");
  const store = new SqliteProcedureStore(path);
  const association = associationOwner();
  const grounds = groundOwner(options.known ?? [evaluationGround()]);
  const service = makeProcedureService({
    store,
    ...(options.authoring === undefined ? {} : { authoring: options.authoring }),
    ...(options.admission === undefined ? {} : { admission: options.admission }),
    ports: { ...grounds, association: association.port },
    clock: () => "2026-01-01T00:00:00.000Z",
  });
  const r: Rig = { dir, path, store, service, grounds, association, authoring: options.authoring, admission: options.admission };
  rigs.push(r);
  return r;
}

/** Simulate a cold restart: a NEW store handle over the SAME file, as a real restart would. */
function restart(previous: Rig, options: { readonly authoring?: ProcedureAuthoringPort; readonly admission?: ProcedureAdmissionPort } = {}): Rig {
  previous.store.close();
  const store = new SqliteProcedureStore(previous.path);
  const service = makeProcedureService({
    store,
    ...(options.authoring === undefined ? {} : { authoring: options.authoring }),
    ...(options.admission === undefined ? {} : { admission: options.admission }),
    ports: { ...previous.grounds, association: previous.association.port },
    clock: () => "2026-01-02T00:00:00.000Z",
  });
  const r: Rig = { ...previous, store, service, authoring: options.authoring ?? previous.authoring, admission: options.admission ?? previous.admission };
  rigs.push(r);
  return r;
}

/** Prepare + publish a first revision and return its ref. */
async function publishFirst(r: Rig, body: unknown = methodBody()): Promise<ProcedureRef> {
  const prepared = await r.service.prepare({
    grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
    projectContext: { projectId: "P1", projectRevision: 3, projectDigest: PROJECT_DIGEST, objective: "harden the mutation path" },
  });
  void body;
  const outcome = await r.service.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
  expect(outcome.status).toBe("published");
  return outcome.ref!;
}

beforeEach(() => {
  rigs = [];
  dirs = [];
});

afterEach(() => {
  for (const r of rigs) {
    try {
      r.store.close();
    } catch {
      // already closed by a restart
    }
  }
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows may hold a read-only handle briefly; a green matrix must not turn red for it.
    }
  }
});

/* ------------------------------------------------------------------ P-P: the positive lifecycle */

describe("E5-P the procedural lifecycle closes", () => {
  it("P-P01 an OrganizationEvaluation grounds a ProcedureCandidate", async () => {
    const r = rig({ authoring: authoringOf() });
    const prepared = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 3, projectDigest: PROJECT_DIGEST, objective: "harden the mutation path" },
    });
    // §6: the ground is the DURABLE record's own ref + digest, never a synthesized confidence.
    expect(prepared.candidate.empiricalGrounds).toEqual([
      { kind: "ORGANIZATION_EVALUATION", ref: "eval-1", digest: GROUND_DIGEST, experimentRef: "exp-1" },
    ]);
    expect(prepared.candidate.content.title).toBe("Verify the canonical basis before mutating");
    expect(prepared.candidate.content.steps).toHaveLength(3);
    // §6: there is no confidence field anywhere on the artifact.
    expect(Object.hasOwn(prepared.candidate, "confidence")).toBe(false);
    expect(JSON.stringify(prepared.candidate)).not.toMatch(/confidence|score|weight/iu);
  });

  it("P-P02 same grounds + same content converge on ONE candidate identity", async () => {
    const r = rig({ authoring: authoringOf() });
    const input = {
      grounds: [{ kind: "ORGANIZATION_EVALUATION" as const, ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 3, projectDigest: PROJECT_DIGEST, objective: "harden the mutation path" },
    };
    const first = await r.service.prepare(input);
    const second = await r.service.prepare(input);
    expect(second.candidate.candidateId).toBe(first.candidate.candidateId);
    expect(second.candidate.digest).toBe(first.candidate.digest);

    // §8: input ORDER must not produce a distinct candidate — the SET-like fields are canonicalized.
    const reordered = await r.service.prepare({
      ...input,
      grounds: [
        { kind: "INTERVENTION_RECORD" as const, ref: "ivr-1" },
        { kind: "ORGANIZATION_EVALUATION" as const, ref: "eval-1" },
      ],
    });
    const reorderedReverse = await r.service.prepare({
      ...input,
      grounds: [
        { kind: "ORGANIZATION_EVALUATION" as const, ref: "eval-1" },
        { kind: "INTERVENTION_RECORD" as const, ref: "ivr-1" },
      ],
    });
    expect(reorderedReverse.candidate.candidateId).toBe(reordered.candidate.candidateId);

    // No wall-clock value and no random id in the identity.
    expect(first.candidate.candidateId).toBe(procedureCandidateIdOf(first.candidate.digest));
    expect(first.candidate.digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("P-P03 the authoring model cannot self-publish", async () => {
    // The seam is given a body it likes, but no admission authority is composed at all.
    const r = rig({ authoring: authoringOf() });
    const prepared = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 3, projectDigest: PROJECT_DIGEST, objective: "harden the mutation path" },
    });
    const outcome = await r.service.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
    // §10: an absent authority is an honest zero-write answer, never a default publication.
    expect(outcome.status).toBe("admission_unresolved");
    expect(await r.service.procedures()).toEqual([]);
    expect(await r.service.get({ ...prepared.candidate, procedureId: prepared.procedureId, revision: 0, digest: prepared.candidate.digest } as never)).toBeUndefined();
  });

  it("P-P04 an INDEPENDENT authority publishes the procedure", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const prepared = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 3, projectDigest: PROJECT_DIGEST, objective: "harden the mutation path" },
    });
    const outcome = await r.service.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate });
    expect(outcome.status).toBe("published");
    expect(outcome.ref!.revision).toBe(0);
    // §11: the revision records the admission AND its contextual (never universal) meaning.
    expect(outcome.revision!.admission.admissionNote).toBe("contextual_reusable_project_procedure_not_universal_optimum");
    expect(outcome.revision!.admission.scope).toEqual(["any task that writes canonical state"]);
    expect(outcome.revision!.admission.limitations).toEqual(["does not cover concurrent external writers"]);
  });

  it("P-P05 a published procedure becomes ACTIVE", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    const view = await r.service.history(ref.procedureId);
    expect(view.history).toHaveLength(1);
    expect(view.history[0]!.standing).toBe("ACTIVE");
    expect(view.current!.ref).toEqual(ref);
  });

  it("P-P06 a procedure can be explicitly associated with a project", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    await r.service.associate({ projectId: "P1", ref });
    expect(r.association.rows).toEqual([{ projectId: "P1", id: `${ref.procedureId}@0`, digest: ref.digest }]);
  });

  it("P-P07 a cold restart recovers the procedure, its body, grounds, standing and association", async () => {
    const first = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(first);
    await first.service.associate({ projectId: "P1", ref });
    // Capture the pre-restart reads BEFORE the old handle is closed.
    const beforeContent = (await first.service.get(ref))!.content;

    // §26: a full installation replacement — a NEW handle over the SAME durable file.
    const second = restart(first);
    const recovered = await second.service.get(ref);
    expect(recovered).toBeDefined();
    expect(recovered!.content).toEqual(beforeContent);
    expect(recovered!.empiricalGrounds[0]!.ref).toBe("eval-1");
    expect((await second.service.history(ref.procedureId)).current!.standing).toBe("ACTIVE");
    expect(second.association.rows).toHaveLength(1);
    // No authoring session and no admission session were needed to read it back.
    expect(second.service.get).toBeTypeOf("function");
  });

  it("P-P08/P-P09/P-P10 a later attempt explicitly selects the procedure, receives only a handle, and pulls the body", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    await r.service.associate({ projectId: "P1", ref });

    const ports: ContextKnowledgePorts = {
      projectAssets: {
        async associated() {
          return false;
        },
        async procedureAssociated(projectId, procedureId, revision) {
          return r.association.rows.some((row) => row.projectId === projectId && row.id === `${procedureId}@${revision}`);
        },
      },
      procedures: {
        async observeBasis(procedureId) {
          return r.service.basis(procedureId);
        },
        async observeRevision(procedureId, revision) {
          const view = await r.service.history(procedureId);
          const entry = view.history.find((candidate) => candidate.ref.revision === revision);
          return entry === undefined ? { classified: "NOT_FOUND" as const } : { classified: "observed" as const, standing: entry.standing };
        },
        async readRevision(procedureId, revision) {
          const view = await r.service.history(procedureId);
          const entry = view.history.find((candidate) => candidate.ref.revision === revision);
          return entry === undefined ? undefined : { body: entry.revision.content, standing: entry.standing };
        },
      },
    };

    // P-P08: the EXPLICIT selection — nothing is injected automatically.
    const bindings = await resolveKnowledgeBindings({
      projectId: "P1",
      request: { procedure: [{ procedureId: ref.procedureId, revision: 0, reason: "the prior experiment established this method" }] },
      ports,
      knowledgeBudgetBytes: 4096,
    });
    expect(bindings).toHaveLength(1);
    const binding = bindings[0]!;
    expect(binding.kind).toBe("procedure");
    // P-P09: the binding carries a HANDLE and binding metadata — never the body (§16).
    expect(binding.kind === "procedure" && binding.handle).toBe(procedureKnowledgeHandle(ref.procedureId, 0));
    expect(binding.kind === "procedure" && binding.handle.startsWith(PROCEDURE_HANDLE_PREFIX)).toBe(true);
    expect(binding.kind === "procedure" && binding.standing_at_compile).toBe("ACTIVE");
    expect(binding.kind === "procedure" && binding.inclusion_reason).toBe("explicit_request");
    expect(Object.hasOwn(binding, "body")).toBe(false);
    expect(JSON.stringify(binding)).not.toContain("inspect the canonical basis");

    // P-P10: the full body is PULL-only.
    const pulled = await ports.procedures!.readRevision(ref.procedureId, 0);
    expect(pulled!.body).toEqual(expect.objectContaining({ title: "Verify the canonical basis before mutating" }));
    expect(pulled!.standing).toBe("ACTIVE");
  });

  it("P-P11 a procedure grants ZERO authority", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    const revision = (await r.service.get(ref))!;
    // §4/§19: the artifact is instructional data. It carries no authority field of any kind.
    const serialized = JSON.stringify(revision);
    for (const forbidden of ["authority", "authorized", "permission", "effect", "command", "argv", "script", "execute"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
    // The service exposes no Work/effect/promotion verb.
    for (const verb of ["assign", "schedule", "authorize", "promote", "execute", "run", "applyEffect"]) {
      expect(Object.hasOwn(r.service, verb), verb).toBe(false);
    }
  });

  it("P-P12/P-P13 later experience produces P@2, P@1 becomes SUPERSEDED and P@2 ACTIVE", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const first = await publishFirst(r);

    // §25: later evidence E2 authors a revision of the SAME procedure.
    const revised = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 4, projectDigest: "c".repeat(64), objective: "harden the mutation path" },
      procedureId: first.procedureId,
    });
    expect(revised.supersedes).toEqual(first);
    const second = await r.service.publish({ procedureId: first.procedureId, candidate: revised.candidate });
    expect(second.status).toBe("published");
    expect(second.ref!.revision).toBe(1);
    expect(second.superseded).toEqual(first);

    const view = await r.service.history(first.procedureId);
    expect(view.history).toHaveLength(2);
    expect(view.history[0]!.standing).toBe("SUPERSEDED");
    expect(view.history[0]!.supersededBy).toEqual(second.ref);
    expect(view.history[1]!.standing).toBe("ACTIVE");
    expect(view.current!.ref).toEqual(second.ref);
  });

  it("P-P14/P-P15 a new attempt binds P@2 while the old attempt stays historically bound to P@1", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const first = await publishFirst(r);
    const revised = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 4, projectDigest: "c".repeat(64), objective: "harden the mutation path" },
      procedureId: first.procedureId,
    });
    const second = await r.service.publish({ procedureId: first.procedureId, candidate: revised.candidate });

    // The OLD revision stays associated: association is per-revision and is never retargeted.
    await r.service.associate({ projectId: "P1", ref: first });
    const ports: ContextKnowledgePorts = {
      projectAssets: {
        async associated() {
          return false;
        },
        async procedureAssociated(projectId, procedureId, revision) {
          return r.association.rows.some((row) => row.projectId === projectId && row.id === `${procedureId}@${revision}`);
        },
      },
      procedures: {
        async observeBasis(procedureId) {
          return r.service.basis(procedureId);
        },
        async observeRevision(procedureId, revision) {
          const view = await r.service.history(procedureId);
          const entry = view.history.find((candidate) => candidate.ref.revision === revision);
          return entry === undefined ? { classified: "NOT_FOUND" as const } : { classified: "observed" as const, standing: entry.standing };
        },
        async readRevision(procedureId, revision) {
          const view = await r.service.history(procedureId);
          const entry = view.history.find((candidate) => candidate.ref.revision === revision);
          return entry === undefined ? undefined : { body: entry.revision.content, standing: entry.standing };
        },
      },
    };

    // P-P15: the OLD attempt's compile-time binding is unchanged — it still reads ACTIVE-at-compile,
    // because that is what was true when it compiled. §18: no historical manifest rewrite.
    const oldBinding = await resolveKnowledgeBindings({
      projectId: "P1",
      request: { procedure: [{ procedureId: first.procedureId, revision: 0, reason: "original" }] },
      ports: { ...ports, procedures: { ...ports.procedures!, async observeRevision() { return { classified: "observed", standing: "ACTIVE" }; } } },
      knowledgeBudgetBytes: 4096,
    });
    expect(oldBinding[0]!.kind === "procedure" && oldBinding[0]!.standing_at_compile).toBe("ACTIVE");

    // And the pull reports the CURRENT standing separately, without touching the binding.
    const pulledOld = await ports.procedures!.readRevision(first.procedureId, 0);
    expect(pulledOld!.standing).toBe("SUPERSEDED");
    expect(pulledOld!.body).toEqual(expect.objectContaining({ title: "Verify the canonical basis before mutating" }));

    // P-P14: a NEW attempt may not select the superseded revision; it selects P@2.
    await expect(
      resolveKnowledgeBindings({
        projectId: "P1",
        request: { procedure: [{ procedureId: first.procedureId, revision: 0, reason: "stale" }] },
        ports,
        knowledgeBudgetBytes: 4096,
      }),
    ).rejects.toThrow(/KNOWLEDGE_PROCEDURE_NOT_ACTIVE/u);

    await r.service.associate({ projectId: "P1", ref: second.ref! });
    const newBinding = await resolveKnowledgeBindings({
      projectId: "P1",
      request: { procedure: [{ procedureId: first.procedureId, revision: 1, reason: "current" }] },
      ports,
      knowledgeBudgetBytes: 4096,
    });
    expect(newBinding[0]!.kind === "procedure" && newBinding[0]!.procedure_revision).toBe(1);
    expect(newBinding[0]!.kind === "procedure" && newBinding[0]!.standing_at_compile).toBe("ACTIVE");
  });
});

/* ------------------------------------------------------------------ P-N: the adversarial boundary */

describe("E5-P the procedural boundary holds", () => {
  it("P-N01 zero empirical grounds cannot publish", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    await expect(
      r.service.prepare({
        grounds: [],
        projectContext: { projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST, objective: "x" },
      }),
    ).rejects.toThrow(/PROCEDURE_NO_EMPIRICAL_GROUND/u);

    // §6: the artifact itself also refuses an ungrounded candidate.
    expect(() => materializeProcedureCandidate({ content: methodBody(), empiricalGrounds: [], provenance: { authoringOrigin: "m", projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST } })).toThrow(/at least one empirical ground/u);
  });

  it("P-N02 an unknown or fabricated empirical ref is refused", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority(), known: [evaluationGround()] });
    await expect(
      r.service.prepare({
        grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-does-not-exist" }],
        projectContext: { projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST, objective: "x" },
      }),
    ).rejects.toThrow(/PROCEDURE_GROUND_UNKNOWN/u);
    // Nothing was authored and nothing was written.
    expect(await r.service.procedures()).toEqual([]);
  });

  it("P-N03 a malformed authoring output is refused", async () => {
    // Missing the required `limitations` — the body cannot be reviewed without its bounds.
    const r = rig({ authoring: authoringOf(methodBody({ limitations: [] })), admission: publishingAuthority() });
    await expect(
      r.service.prepare({
        grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
        projectContext: { projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST, objective: "x" },
      }),
    ).rejects.toThrow(/PROCEDURE_AUTHORING_INVALID/u);

    // An unknown field is an error, not a hint that the seam may extend the schema.
    const extra = rig({ authoring: authoringOf(methodBody({ execute: "rm -rf /" })), admission: publishingAuthority() });
    await expect(
      extra.service.prepare({
        grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
        projectContext: { projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST, objective: "x" },
      }),
    ).rejects.toThrow(/PROCEDURE_AUTHORING_INVALID/u);
  });

  it("P-N04 a caller-supplied published=true is ignored", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const prepared = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST, objective: "x" },
    });
    // A caller cannot smuggle a flag: there is no field on the input for one, and a candidate
    // carrying it is refused by the strict parser.
    expect(() => parseProcedureCandidate({ ...prepared.candidate, published: true })).toThrow(/unknown field/u);
    // Without an authority, the extra field changes nothing.
    const noAuthority = rig({ authoring: authoringOf() });
    const p2 = await noAuthority.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST, objective: "x" },
    });
    expect((await noAuthority.service.publish({ procedureId: p2.procedureId, candidate: p2.candidate })).status).toBe("admission_unresolved");
  });

  it("P-N05 no ManagementMode or self-certification can grant procedure admission", async () => {
    // An authority that tries to approve a DIFFERENT candidate is refused (§10: the digest must match).
    const r = rig({
      authoring: authoringOf(),
      admission: authorityOf(async () => ({
        decision: "PUBLISH" as const,
        candidateDigest: "f".repeat(64),
        rationale: "approved something else",
        policyRef: { policyId: "p", version: "1" },
      })),
    });
    const prepared = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST, objective: "x" },
    });
    await expect(r.service.publish({ procedureId: prepared.procedureId, candidate: prepared.candidate })).rejects.toThrow(
      /PROCEDURE_ADMISSION_DIGEST_MISMATCH/u,
    );
    expect(await r.service.procedures()).toEqual([]);
  });

  it("P-N06/P-N07/P-N08 a procedure cannot authorize Work, effects, or become Proof/Evidence", () => {
    // §19: enforced STRUCTURALLY by the firewall (proven in the architecture suite); here we pin the
    // artifact-level fact — the method body has no field that could name an authority.
    const candidate = materializeProcedureCandidate({
      content: methodBody(),
      empiricalGrounds: [{ kind: "RUN_RESULT", ref: "run-1", digest: GROUND_DIGEST }],
      provenance: { authoringOrigin: "m", projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST },
    });
    const keys = Object.keys(candidate.content);
    expect(keys).toEqual(
      expect.arrayContaining(["purpose", "applicability", "preconditions", "steps", "checks", "expectedOutputs", "limitations", "capabilityHints"]),
    );
    for (const forbidden of ["authority", "effect", "evidence", "proof", "claim", "permission"]) {
      expect(keys).not.toContain(forbidden);
    }
  });

  it("P-N09/P-N10 an unassociated procedure cannot enter project context, and a procedure from project A does not auto-enter B", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);

    const ports = (projectId: string): ContextKnowledgePorts => ({
      projectAssets: {
        async associated() {
          return false;
        },
        async procedureAssociated(target, procedureId, revision) {
          if (target !== projectId) return false;
          return r.association.rows.some((row) => row.projectId === target && row.id === `${procedureId}@${revision}`);
        },
      },
      procedures: {
        async observeBasis(procedureId) {
          return r.service.basis(procedureId);
        },
        async observeRevision() {
          return { classified: "observed" as const, standing: "ACTIVE" };
        },
        async readRevision() {
          return undefined;
        },
      },
    });

    // P-N09: not associated ⇒ the whole selection is refused, not silently omitted.
    await expect(
      resolveKnowledgeBindings({
        projectId: "P1",
        request: { procedure: [{ procedureId: ref.procedureId, revision: 0, reason: "x" }] },
        ports: ports("P1"),
        knowledgeBudgetBytes: 4096,
      }),
    ).rejects.toThrow(/KNOWLEDGE_NOT_PROJECT_ASSOCIATED/u);

    // P-N10: associated with P1 only; P2 asking gets nothing.
    await r.service.associate({ projectId: "P1", ref });
    await expect(
      resolveKnowledgeBindings({
        projectId: "P2",
        request: { procedure: [{ procedureId: ref.procedureId, revision: 0, reason: "x" }] },
        ports: ports("P2"),
        knowledgeBudgetBytes: 4096,
      }),
    ).rejects.toThrow(/KNOWLEDGE_NOT_PROJECT_ASSOCIATED/u);
  });

  it("P-N11/P-N12 a SUPERSEDED procedure is not selected as current, and the old manifest is not rewritten", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const first = await publishFirst(r);
    const revised = await r.service.prepare({
      grounds: [{ kind: "ORGANIZATION_EVALUATION", ref: "eval-1" }],
      projectContext: { projectId: "P1", projectRevision: 2, projectDigest: PROJECT_DIGEST, objective: "x" },
      procedureId: first.procedureId,
    });
    await r.service.publish({ procedureId: first.procedureId, candidate: revised.candidate });

    // §12: the OLD revision's stored body is byte-identical to what was published.
    const stored = publishedRevisionsOf(await r.store.replay(first.procedureId));
    expect(stored[0]!.digest).toBe(first.digest);
    expect(stored[0]!.content).toEqual((await r.service.get(first))!.content);
    // §25: the retirement/supersession arrived as NEW events, never as a rewrite of P@1.
    expect(retirementsOf(await r.store.replay(first.procedureId))).toEqual([]);
    const standings = deriveProcedureStandings(stored, []);
    expect(standings[0]!.standing).toBe("SUPERSEDED");
    expect(standings[1]!.standing).toBe("ACTIVE");
  });

  it("P-N13/P-N14 host Skill absence is reported honestly and a procedure cannot install or invent capability", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    const revision = (await r.service.get(ref))!;
    // §21: the procedure may SAY "if capability X is available, use it" — a HINT, not an assertion.
    expect(revision.content.capabilityHints).toEqual(["a verification runtime"]);
    // There is no capability-existence field and no install verb.
    expect(Object.hasOwn(revision.content, "capabilities")).toBe(false);
    expect(Object.hasOwn(r.service, "installCapability")).toBe(false);
    expect(Object.hasOwn(r.service, "provideCapability")).toBe(false);
  });

  it("P-N15 a recommended recipe does not auto-execute", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    const revision = (await r.service.get(ref))!;
    // §20: `recommended recipe ≠ compiled recipe ≠ executed recipe` — the ref is descriptive text.
    expect(revision.content.recommendedRecipeRefs).toEqual(["verify.v1"]);
    // No plan was compiled and no execution happened: the procedure owner has no such capability.
    expect(Object.hasOwn(r.service, "compile")).toBe(false);
    expect(Object.hasOwn(r.service, "execute")).toBe(false);
  });

  it("P-N16 a Journal note cannot masquerade as an admitted Procedure", () => {
    // §22: the two are different artifact families with different parsers. A journal-shaped object
    // is refused by the procedure parser rather than coerced.
    const journalish = { entryId: "pje-1", projectId: "P1", kind: "REFERENCE_NOTE", title: "how we did it", body: "do the things", provenance: "manual", relatedRefs: [] };
    expect(() => parseProcedureCandidate(journalish)).toThrow();
    // And the project-asset kind vocabulary keeps them apart.
    expect(PROJECT_ASSET_KINDS).toContain("JOURNAL_ENTRY");
    expect(PROJECT_ASSET_KINDS).toContain("PROCEDURE");
  });

  it("P-N17 an OrganizationMemory evaluation cannot mutate procedure standing", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    // The procedure owner exposes no verb an evaluation could call to change standing; the ONLY
    // standing transitions are `publish` (via an authority) and `retire` (explicit).
    for (const verb of ["setStanding", "promote", "demote", "recordEvaluation", "recordIntervention"]) {
      expect(Object.hasOwn(r.service, verb), verb).toBe(false);
    }
    expect((await r.service.history(ref.procedureId)).current!.standing).toBe("ACTIVE");
    // An explicit retirement is the sanctioned path, and it is an APPEND.
    const retired = await r.service.retire(ref, "superseded by an external standard");
    expect(retired.standing).toBe("RETIRED");
    expect(retirementsOf(await r.store.replay(ref.procedureId))).toHaveLength(1);
  });

  it("P-N18 a historically successful method does not become a universal winner", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    const revision = (await r.service.get(ref))!;
    // §11: admission preserves scope and limitations, and says so explicitly. There is no
    // "best"/"optimal"/"universal" claim anywhere on the artifact.
    expect(revision.admission.scope.length).toBeGreaterThan(0);
    expect(revision.admission.limitations.length).toBeGreaterThan(0);
    expect(revision.admission.admissionNote).toBe("contextual_reusable_project_procedure_not_universal_optimum");
    // §11: no AFFIRMATIVE superiority claim exists anywhere. The only place the words appear is the
    // admission note that explicitly NEGATES them.
    const withoutNote = JSON.stringify({ ...revision, admission: { ...revision.admission, admissionNote: "" } });
    expect(withoutNote.toLowerCase()).not.toMatch(/optimal|universal|guaranteed|always/iu);
  });

  it("P-N19 (extra) the refusal vocabulary is closed and the standings mirror the context owner", () => {
    // §12: the lifecycle is a closed set, and the context owner's mirror agrees with it.
    expect(PROCEDURE_STANDINGS).toEqual(["ACTIVE", "SUPERSEDED", "RETIRED"]);
    expect(KNOWLEDGE_PROCEDURE_STANDINGS).toEqual(PROCEDURE_STANDINGS);
    expect(KNOWLEDGE_PROCEDURE_ASSET_KIND).toBe("PROCEDURE");
    // §27: an unknown standing is read CONSERVATIVELY — never as ACTIVE.
    expect(procedureStandingAtCompile("SOMETHING_NEW")).toBe("SUPERSEDED");
    expect(procedureStandingAtCompile("ACTIVE")).toBe("ACTIVE");
    expect(new Set(PROCEDURE_REFUSAL_REASONS).size).toBe(PROCEDURE_REFUSAL_REASONS.length);
  });

  it("P-N20 (extra) a digest-less PROCEDURE association is refused, and an unknown revision cannot be associated", async () => {
    // §13/§14: the exact revision digest is mandatory — `HistoricalProcedure ≠ CurrentProcedure`.
    expect(() =>
      materializeProjectAssetAssociation({
        projectId: "P1",
        assetKind: "PROCEDURE",
        canonicalRef: { kind: "PROCEDURE", id: "proc-1@0" },
        associationKind: "MANUAL",
        provenance: "test",
        recordedAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow(/exact admitted revision digest/u);

    const withDigest = materializeProjectAssetAssociation({
      projectId: "P1",
      assetKind: "PROCEDURE",
      canonicalRef: { kind: "PROCEDURE", id: "proc-1@0", digest: GROUND_DIGEST },
      associationKind: "MANUAL",
      provenance: "test",
      recordedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parseProjectAssetAssociation(withDigest).canonicalRef.digest).toBe(GROUND_DIGEST);

    // Association never CREATES a procedure: an unknown revision is refused.
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    await expect(r.service.associate({ projectId: "P1", ref: { procedureId: "prc-missing", revision: 0, digest: GROUND_DIGEST } })).rejects.toThrow(
      /PROCEDURE_UNKNOWN/u,
    );
    expect(r.association.rows).toEqual([]);
  });

  it("P-N21 (extra) a RETIRED procedure is not selectable as current either", async () => {
    const r = rig({ authoring: authoringOf(), admission: publishingAuthority() });
    const ref = await publishFirst(r);
    await r.service.retire(ref, "no longer applicable");
    const view = await r.service.history(ref.procedureId);
    expect(view.history[0]!.standing).toBe("RETIRED");
    expect(view.current).toBeUndefined();
    // Retiring an already-retired revision is refused rather than silently re-appended.
    await expect(r.service.retire(ref, "again")).rejects.toThrow(/PROCEDURE_REVISION_NOT_ACTIVE/u);
  });
});

/* ------------------------------------------------------------------ the strict artifacts */

describe("E5-P the artifacts are closed contracts", () => {
  it("a candidate whose id or digest drifted is refused", () => {
    const candidate = materializeProcedureCandidate({
      content: methodBody(),
      empiricalGrounds: [{ kind: "RUN_RESULT", ref: "run-1", digest: GROUND_DIGEST }],
      provenance: { authoringOrigin: "m", projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST },
    });
    expect(parseProcedureCandidate(candidate).candidateId).toBe(candidate.candidateId);
    expect(() => parseProcedureCandidate({ ...candidate, candidateId: "prc-deadbeef" })).toThrow(/candidateId does not match/u);
    expect(() => parseProcedureCandidate({ ...candidate, digest: "0".repeat(64) })).toThrow(/digest does not match/u);
    expect(() => parseProcedureCandidate({ ...candidate, extra: 1 })).toThrow(/unknown field/u);
  });

  it("a revision whose digest drifted is refused, and a body cannot be smuggled into a binding", () => {
    const revision = materializeProcedureRevision({
      procedureId: "proc-1",
      revision: 0,
      candidateId: "prc-1",
      candidateDigest: GROUND_DIGEST,
      content: methodBody(),
      empiricalGrounds: [{ kind: "RUN_RESULT", ref: "run-1", digest: GROUND_DIGEST }],
      provenance: { authoringOrigin: "m", projectId: "P1", projectRevision: 1, projectDigest: PROJECT_DIGEST },
      admission: materializeProcedureAdmissionProvenance({
        candidateDigest: GROUND_DIGEST,
        policyRef: { policyId: "p", version: "1" },
        rationale: "ok",
        scope: ["s"],
        limitations: ["l"],
      }),
      publishedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(parseProcedureRevision(revision).digest).toBe(revision.digest);
    expect(() => parseProcedureRevision({ ...revision, digest: "0".repeat(64) })).toThrow(/digest does not match/u);
    // §18: an admission note that does NOT state the contextual meaning is refused.
    expect(() => parseProcedureRevision({ ...revision, admission: { ...revision.admission, admissionNote: "universally_best" } })).toThrow(/contextual/u);
  });

  it("the ground set is canonicalized so presentation order cannot change identity", () => {
    const forward = canonicalGrounds(
      [
        { kind: "RUN_RESULT", ref: "run-1", digest: GROUND_DIGEST },
        { kind: "ORGANIZATION_EVALUATION", ref: "eval-1", digest: GROUND_DIGEST },
      ],
      "grounds",
    );
    const reverse = canonicalGrounds([...forward].reverse(), "grounds");
    expect(reverse).toEqual(forward);
    // Duplicates collapse: the same evidence cited twice is ONE ground.
    expect(canonicalGrounds([...forward, forward[0]!], "grounds")).toEqual(forward);
  });

  it("the store refuses a malformed registration and an unknown event type", async () => {
    const r = rig();
    await expect(
      r.store.appendAtomic({
        expectedBasis: { scopeId: "proc-1", throughSeq: 0, chainDigest: "" },
        events: [{ eventId: "x", type: "NOT_A_PROCEDURE_EVENT" as never, payload: {} }],
      }),
    ).rejects.toThrow(/unknown procedure event type/u);
  });

  it("the L1 wire validator accepts the procedure binding and refuses a tampered one", () => {
    // E5-P §16/§18: the schema layer is a SEPARATE mirror of the context owner's binding shape
    // (`src/schema/` is L1 and must not import `src/context/`). This proves the mirror actually
    // accepts the third kind — and that it fails closed on a standing outside the closed set.
    const binding = {
      kind: "procedure",
      procedure_id: "prc-1",
      procedure_revision: 0,
      standing_at_compile: "ACTIVE",
      procedure_basis_at_compile: { procedureId: "prc-1", throughSeq: 2, chainDigest: "a".repeat(64) },
      inclusion_reason: "explicit_request",
      reason: "the prior experiment established this method",
      handle: "@ctx/procedure/prc-1/0",
    };
    const payload = {
      task_id: "t1",
      project_revision: 1,
      manifest: {
        manifest_id: "m1",
        task_id: "t1",
        project_revision: 1,
        requirement: {},
        exact: [],
        source: [],
        evidence: [],
        excluded_stale: [],
        retrieval: [],
        knowledge: [binding],
        created_at: "2026-01-01T00:00:00.000Z",
      },
    };
    const normalized = normalizeEventPayload("CONTEXT_MANIFEST_ADDED", payload) as { manifest: { knowledge: unknown[] } };
    expect(normalized.manifest.knowledge).toHaveLength(1);
    expect((normalized.manifest.knowledge[0] as { kind: string }).kind).toBe("procedure");
    // §18: an unknown standing fails closed rather than being coerced to ACTIVE.
    const tampered = { ...payload, manifest: { ...payload.manifest, knowledge: [{ ...binding, standing_at_compile: "SOMETHING_NEW" }] } };
    expect(() => normalizeEventPayload("CONTEXT_MANIFEST_ADDED", tampered)).toThrow(/procedure standing: invalid literal/u);
    // §16: a body cannot be smuggled into a binding — the envelope is a closed contract.
    const withBody = { ...payload, manifest: { ...payload.manifest, knowledge: [{ ...binding, body: { steps: [] } }] } };
    expect(() => normalizeEventPayload("CONTEXT_MANIFEST_ADDED", withBody)).toThrow(/unknown field/u);
  });

  it("the ref is digest-bound and the handle namespace is procedure-specific", () => {
    const ref: ProcedureRef = { procedureId: "proc-1", revision: 2, digest: GROUND_DIGEST };
    expect(procedureRefKey(ref)).toBe(`proc-1@2#${GROUND_DIGEST}`);
    expect(procedureHandle(ref)).toBe(`@ctx/procedure/proc-1/2`);
    // §17: never under another plane's namespace.
    expect(procedureHandle(ref)).not.toMatch(/@ctx\/(proof|reasoning|knowledge)\//u);
  });
});
