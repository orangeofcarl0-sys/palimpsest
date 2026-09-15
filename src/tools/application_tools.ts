/**
 * G10-O application tools — few, cohesive, STRICT tools over the application surface.
 *
 * A tool caller can never supply local-peer identity, an authentication flag, a
 * VerificationResult, an AdmissionDecision, an evolution authority, or a raw store event;
 * the application surface derives all of those internally.
 */

import type { DshContentBlock, DshToolDefinition, DshToolRunContext } from "./dsh_types.js";
import type { PalimpsestApplicationSurface } from "../application/surface.js";
import type { VariantKind } from "../organization_memory/index.js";
import { VARIANT_KINDS } from "../organization_memory/index.js";
import { SOURCE_PROVENANCES, materializeProofSourceRevisionRef } from "../proof_asset/index.js";
import { PROJECT_JOURNAL_KINDS } from "../project_workspace/index.js";
import { MANAGEMENT_INVOLVEMENTS } from "../project_management/index.js";

function textBlock(value: unknown): DshContentBlock[] {
  return [{ type: "text", text: JSON.stringify(value, null, 2) }];
}

class ToolArgsError extends TypeError {}

function argsObject(args: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (typeof args !== "object" || args === null || Array.isArray(args)) throw new ToolArgsError("tool arguments must be an object");
  const object = args as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) throw new ToolArgsError(`unknown argument "${key}"`);
  }
  return object;
}

function required(object: Record<string, unknown>, name: string): unknown {
  if (object[name] === undefined || object[name] === null) throw new ToolArgsError(`argument "${name}" is required`);
  return object[name];
}

function requiredString(object: Record<string, unknown>, name: string): string {
  const value = required(object, name);
  if (typeof value !== "string" || value.trim() === "") throw new ToolArgsError(`argument "${name}" must be a non-empty string`);
  return value;
}

function requiredNumber(object: Record<string, unknown>, name: string): number {
  const value = required(object, name);
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new ToolArgsError(`argument "${name}" must be a non-negative integer`);
  return value;
}

function requiredRevisionRef(object: Record<string, unknown>) {
  return materializeProofSourceRevisionRef({
    sourceId: requiredString(object, "sourceId"),
    revision: requiredNumber(object, "revision"),
    contentDigest: requiredString(object, "contentDigest"),
  });
}

function stringArray(value: unknown, what: string): readonly string[] {
  if (!Array.isArray(value)) throw new ToolArgsError(`${what} must be an array of strings`);
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.trim() === "") throw new ToolArgsError(`${what} must contain non-empty strings`);
    return entry;
  });
}

function tool(input: {
  readonly name: string;
  readonly description: string;
  readonly mode: "read-only" | "mutating";
  readonly actions: readonly string[];
  readonly extraProperties?: Readonly<Record<string, unknown>>;
  readonly run: (action: string, object: Record<string, unknown>, context: DshToolRunContext) => Promise<unknown>;
}): DshToolDefinition {
  const properties: Record<string, unknown> = {
    action: { type: "string", enum: [...input.actions], description: "the semantic action to perform" },
    ...(input.extraProperties ?? {}),
  };
  const allowed = ["action", ...Object.keys(input.extraProperties ?? {})];
  return {
    name: input.name,
    description: `${input.description} — [${input.mode}]`,
    parameters: { type: "object", properties, required: ["action"], additionalProperties: false },
    output: { schema: { type: "object" }, render: (_args, value) => textBlock(value) },
    mode: input.mode,
    async execute(args: unknown, context: DshToolRunContext): Promise<unknown> {
      const object = argsObject(args, allowed);
      const action = requiredString(object, "action");
      if (!input.actions.includes(action)) throw new ToolArgsError(`unknown action "${action}"`);
      return input.run(action, object, context);
    },
  };
}

export function defineApplicationTools(application: PalimpsestApplicationSurface): DshToolDefinition[] {
  const tools: DshToolDefinition[] = [];

  tools.push(
    tool({
      name: "palimpsest_surfaces",
      description: "Report which advanced Palimpsest surfaces are configured for this installation (a missing surface is never an empty known state)",
      mode: "read-only",
      actions: ["list"],
      run: async () => ({
        work: true,
        federation: application.federation !== undefined,
        boundary: application.boundary !== undefined,
        runtime: application.runtime !== undefined,
        organization: application.organization !== undefined,
        campaign: application.campaign !== undefined,
        dynamics: application.dynamics !== undefined,
        evolution: application.evolution !== undefined,
        reasoning: application.reasoning !== undefined,
        attention: application.attention !== undefined,
        experiments: application.empirical !== undefined,
        recipes: application.recipes !== undefined,
        advisor: application.advisor !== undefined,
        recipeExecution: application.recipeExecution !== undefined,
        proof: application.proof !== undefined,
        disclosure: application.disclosure !== undefined,
        projectWorkspace: application.projectWorkspace !== undefined,
        projectManagement: application.projectManagement !== undefined,
        projections: application.projections !== undefined,
      }),
    }),
  );

  if (application.attention !== undefined) {
    const attention = application.attention;
    tools.push(
      tool({
        name: "palimpsest_attention",
        description: "What currently deserves this peer's attention (derived from canonical state): unacked inbound messages, boundary decisions required, commitment offers requiring a decision, and newly relevant accepted boundary revisions. Read-only; host activation is a separate step",
        mode: "read-only",
        actions: ["pending"],
        extraProperties: {},
        run: async (action) => {
          if (action !== "pending") throw new ToolArgsError(`unsupported attention action "${action}"`);
          return { policyId: attention.policyId, pending: await attention.pending() };
        },
      }),
    );
  }

  if (application.federation !== undefined) {
    const federation = application.federation;
    tools.push(
      tool({
        name: "palimpsest_federation",
        description: "Peer collaboration: read your inbox/threads, contact peers, exchange messages, and act on explicit commitments (local identity is derived, never supplied)",
        mode: "mutating",
        actions: ["inbox", "thread", "message", "contact", "commitment", "commitments", "remote_decision"],
        extraProperties: {
          threadId: { type: "string" },
          to: { type: "string" },
          body: { type: "string" },
          competenceTags: { type: "array", items: { type: "string" } },
          reason: { type: "string" },
          commitmentAction: { type: "string", enum: ["offer", "accept", "reject", "release", "handoff_offer", "handoff_accept"] },
          commitmentId: { type: "string" },
          handoffId: { type: "string" },
          proposedHolder: { type: "string" },
          scope: { type: "object" },
          statement: { type: "string" },
          remoteDecision: { type: "string", enum: ["accept", "reject", "release"] },
        },
        run: async (action, object) => {
          if (action === "inbox") return federation.inbox();
          if (action === "commitments") return federation.commitments();
          if (action === "thread") return federation.thread(requiredString(object, "threadId"));
          if (action === "message") return federation.sendMessage({ to: { schemaVersion: 1, peerId: requiredString(object, "to") }, threadId: requiredString(object, "threadId"), body: requiredString(object, "body") });
          if (action === "contact") return federation.findCandidates({ competenceTags: stringArray(object.competenceTags ?? [], "competenceTags"), origin: object.origin ?? { kind: "runtime_scope", scope: { schemaVersion: 1, scopeId: "unscoped" } }, reason: requiredString(object, "reason") });
          if (action === "remote_decision") {
            if (federation.submitRemoteDecision === undefined) throw new ToolArgsError("remote commitment decisions are not configured for this installation");
            const decision = requiredString(object, "remoteDecision");
            if (decision !== "accept" && decision !== "reject" && decision !== "release") throw new ToolArgsError('remoteDecision must be "accept" | "reject" | "release"');
            return federation.submitRemoteDecision({ to: { schemaVersion: 1, peerId: requiredString(object, "to") }, commitmentId: requiredString(object, "commitmentId"), decision });
          }
          const commitmentAction = requiredString(object, "commitmentAction");
          if (commitmentAction === "offer") {
            const scope = required(object, "scope");
            if (typeof scope !== "object" || scope === null) throw new ToolArgsError("scope must be an object");
            return federation.offerCommitment({ proposedHolder: { schemaVersion: 1, peerId: requiredString(object, "proposedHolder") }, scope: scope as never, statement: requiredString(object, "statement") });
          }
          if (commitmentAction === "accept") return federation.acceptCommitment(requiredString(object, "commitmentId"));
          if (commitmentAction === "reject") return federation.rejectCommitment(requiredString(object, "commitmentId"));
          if (commitmentAction === "release") {
            await federation.releaseCommitment(requiredString(object, "commitmentId"));
            return { released: true };
          }
          if (commitmentAction === "handoff_offer") return federation.offerHandoff({ commitmentId: requiredString(object, "commitmentId"), to: { schemaVersion: 1, peerId: requiredString(object, "to") } });
          return federation.acceptHandoff(requiredString(object, "handoffId"));
        },
      }),
    );
  }

  if (application.boundary !== undefined) {
    const boundary = application.boundary;
    tools.push(
      tool({
        name: "palimpsest_boundary",
        description: "Shared boundary memory: inspect a workspace/artifact, propose a candidate revision, and explicitly accept or reject an exact candidate (authorship/acceptor identity is derived)",
        mode: "mutating",
        actions: ["view", "current", "pending", "membership", "observation", "propose", "decide", "submit_remote"],
        extraProperties: {
          workspaceId: { type: "string" },
          artifactId: { type: "string" },
          base: { type: "object" },
          content: { type: "object" },
          requiredAcceptors: { type: "array", items: { type: "string" } },
          intent: { type: "string" },
          candidateDigest: { type: "string" },
          decision: { type: "string", enum: ["accept", "reject"] },
          operation: { type: "object" },
          operationId: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "view") return boundary.view(requiredString(object, "workspaceId"));
          if (action === "current") return boundary.currentAccepted({ workspaceId: requiredString(object, "workspaceId"), artifactId: requiredString(object, "artifactId") });
          if (action === "pending") return boundary.pendingCandidates({ workspaceId: requiredString(object, "workspaceId"), artifactId: requiredString(object, "artifactId") });
          if (action === "membership") return boundary.membership(requiredString(object, "workspaceId"));
          if (action === "observation") return boundary.observation(requiredString(object, "workspaceId"));
          if (action === "propose") {
            return boundary.proposeRevision({
              workspaceId: requiredString(object, "workspaceId"),
              artifactId: requiredString(object, "artifactId"),
              base: object.base ?? null,
              content: required(object, "content"),
              requiredAcceptors: stringArray(object.requiredAcceptors ?? [], "requiredAcceptors").map((peerId) => ({ schemaVersion: 1 as const, peerId })),
              intent: requiredString(object, "intent"),
            });
          }
          if (action === "submit_remote") {
            if (boundary.submitRemote === undefined) throw new ToolArgsError("remote boundary submission is not configured for this installation");
            const operation = required(object, "operation");
            if (typeof operation !== "object" || operation === null) throw new ToolArgsError("operation must be an object");
            return boundary.submitRemote({
              workspaceId: requiredString(object, "workspaceId"),
              operation: operation as never,
              ...(typeof object.operationId === "string" && object.operationId.length > 0 ? { operationId: object.operationId } : {}),
            });
          }
          const decision = requiredString(object, "decision");
          if (decision !== "accept" && decision !== "reject") throw new ToolArgsError('decision must be "accept" or "reject"');
          return boundary.decide({ workspaceId: requiredString(object, "workspaceId"), artifactId: requiredString(object, "artifactId"), candidateDigest: requiredString(object, "candidateDigest"), decision });
        },
      }),
    );
  }

  if (application.runtime !== undefined) {
    const runtime = application.runtime;
    tools.push(
      tool({
        name: "palimpsest_runtime_view",
        description: "Read-only runtime organization: the RuntimeScope list/state and the derived external Holon view (internal structure vs external surface)",
        mode: "read-only",
        actions: ["scopes", "scope", "holon"],
        extraProperties: { scopeId: { type: "string" } },
        run: async (action, object) => {
          if (action === "scopes") return runtime.list();
          if (action === "scope") return runtime.view(requiredString(object, "scopeId"));
          return runtime.holon(requiredString(object, "scopeId"));
        },
      }),
    );
  }

  if (application.organization !== undefined) {
    const organization = application.organization;
    tools.push(
      tool({
        name: "palimpsest_organization_view",
        description: "Read-only organization/institution: definition head, ACTIVE/RETIRED lifecycle, retirements, and institution current bodies",
        mode: "read-only",
        actions: ["view", "retirements", "institutions", "institution"],
        extraProperties: { organizationDefinitionId: { type: "string" }, institutionId: { type: "string" } },
        run: async (action, object) => {
          if (action === "view") return organization.view(requiredString(object, "organizationDefinitionId"));
          if (action === "retirements") return organization.retirements();
          if (action === "institutions") return organization.institutions();
          return organization.institutionView(requiredString(object, "institutionId"));
        },
      }),
    );
  }

  if (application.campaign !== undefined) {
    const campaign = application.campaign;
    tools.push(
      tool({
        name: "palimpsest_campaign_view",
        description: "Read-only campaign: lifecycle, basis, commitment states, and hypotheses",
        mode: "read-only",
        actions: ["view"],
        extraProperties: { campaignId: { type: "string" } },
        run: async (action, object) => campaign.view(requiredString(object, "campaignId")),
      }),
    );
  }

  if (application.dynamics !== undefined) {
    const dynamics = application.dynamics;
    tools.push(
      tool({
        name: "palimpsest_dynamics",
        description: "Read-only organization dynamics: observe/diagnose a subject, produce a non-canonical proposal, inspect its impact, and check proposal freshness (the pressure vector is never a scalar score)",
        mode: "read-only",
        actions: ["observe", "diagnose", "propose", "impact", "freshness"],
        extraProperties: { subject: { type: "object" }, proposal: { type: "object" }, advisor: { type: "object" } },
        run: async (action, object) => {
          if (action === "observe") return dynamics.observe(required(object, "subject"));
          if (action === "diagnose") return dynamics.diagnose(required(object, "subject"));
          if (action === "propose") return dynamics.propose({ subject: required(object, "subject"), ...(object.advisor === undefined ? {} : { advisor: object.advisor }) });
          if (action === "impact") return dynamics.proposalImpact({ proposal: required(object, "proposal"), subject: required(object, "subject") });
          return dynamics.freshness(required(object, "proposal"));
        },
      }),
    );
  }

  if (application.evolution !== undefined) {
    const evolution = application.evolution;
    tools.push(
      tool({
        name: "palimpsest_evolution",
        description: "Governed structural evolution: inspect a case, and prepare/advance an assessed candidate through the EXISTING authority and governance path (a caller can never self-authorize)",
        mode: "mutating",
        actions: ["inspect", "prepare", "advance", "inspect_runtime", "advance_runtime"],
        extraProperties: { caseRef: { type: "string" }, proposal: { type: "object" } },
        run: async (action, object) => {
          if (action === "inspect") return evolution.inspectOrganization(requiredString(object, "caseRef"));
          if (action === "prepare") return evolution.prepareOrganization(required(object, "proposal") as never);
          if (action === "advance") return evolution.advanceOrganization(required(object, "proposal") as never);
          if (action === "inspect_runtime") return evolution.inspectRuntime(requiredString(object, "caseRef"));
          return evolution.advanceRuntime(required(object, "proposal") as never);
        },
      }),
    );
  }

  if (application.reasoning !== undefined) {
    const reasoning = application.reasoning;
    tools.push(
      tool({
        name: "palimpsest_reasoning",
        description: "Collaborative reasoning: view a cell, open a branch and read its FROZEN brief, submit a structured candidate, and request evaluation (the service performs verification then epistemic admission; no chain-of-thought is ever stored)",
        mode: "mutating",
        actions: ["view", "frontier", "graph", "brief", "branch", "candidate", "evaluate", "invalidate"],
        extraProperties: {
          cellId: { type: "string" },
          branchId: { type: "string" },
          question: { type: "string" },
          type: { type: "object" },
          content: { type: "object" },
          dependencies: { type: "array", items: { type: "object" } },
          externalEvidenceRefs: { type: "array", items: { type: "string" }, description: "opaque Proof-plane evidence ids this candidate actually used (selector-only)" },
          candidateDigest: { type: "string" },
          targetClaimId: { type: "string" },
          reason: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "view") return reasoning.view(requiredString(object, "cellId"));
          if (action === "frontier") return reasoning.frontier(requiredString(object, "cellId"));
          if (action === "graph") return reasoning.graph(requiredString(object, "cellId"));
          if (action === "brief") return reasoning.brief({ cellId: requiredString(object, "cellId"), branchId: requiredString(object, "branchId") });
          if (action === "branch") return reasoning.openBranch({ cellId: requiredString(object, "cellId"), question: requiredString(object, "question") });
          if (action === "candidate") {
            const refs = Array.isArray(object.externalEvidenceRefs) ? stringArray(object.externalEvidenceRefs, "externalEvidenceRefs") : [];
            return reasoning.submitCandidate({
              cellId: requiredString(object, "cellId"),
              branchId: requiredString(object, "branchId"),
              type: required(object, "type") as never,
              content: required(object, "content"),
              ...(Array.isArray(object.dependencies) ? { dependencies: object.dependencies as never } : {}),
              ...(refs.length === 0 ? {} : { externalEvidenceRefs: refs.map((evidenceId) => ({ evidenceId })) }),
            });
          }
          if (action === "evaluate") return reasoning.evaluate({ cellId: requiredString(object, "cellId"), candidateDigest: requiredString(object, "candidateDigest") });
          return reasoning.invalidate({ cellId: requiredString(object, "cellId"), targetClaimId: requiredString(object, "targetClaimId"), reason: requiredString(object, "reason") });
        },
      }),
    );
  }

  if (application.empirical !== undefined) {
    const empirical = application.empirical;
    tools.push(
      tool({
        name: "palimpsest_experiments",
        description: "Read-only empirical history: experiment/scenario/variant definitions, observed run results, derived evaluations, measurement corrections, structural interventions, and deterministic similar-run/structural-history queries (evaluation ≠ governance; memory ≠ authority)",
        mode: "read-only",
        actions: ["experiments", "experiment", "scenarios", "variants", "runs", "run", "evaluations", "corrections", "interventions", "similar_runs", "structural_history"],
        extraProperties: {
          experimentId: { type: "string" },
          runRef: { type: "string" },
          subjectRef: { type: "string" },
          scenarioId: { type: "string" },
          variantKind: { type: "string", enum: [...VARIANT_KINDS] },
          provider: { type: "string" },
          model: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "experiments") return empirical.experiments();
          if (action === "experiment") return empirical.experiment(requiredString(object, "experimentId"));
          if (action === "scenarios") return empirical.scenarios(requiredString(object, "experimentId"));
          if (action === "variants") return empirical.variants(requiredString(object, "experimentId"));
          if (action === "runs") return empirical.runs(requiredString(object, "experimentId"));
          if (action === "run") return empirical.run(requiredString(object, "runRef"));
          if (action === "evaluations") return empirical.evaluations(requiredString(object, "experimentId"));
          if (action === "corrections") return empirical.corrections(requiredString(object, "experimentId"));
          if (action === "interventions") return empirical.interventions();
          if (action === "structural_history") return empirical.structuralHistory(requiredString(object, "subjectRef"));
          const variantKind = object.variantKind;
          if (variantKind !== undefined && (typeof variantKind !== "string" || !(VARIANT_KINDS as readonly string[]).includes(variantKind))) {
            throw new ToolArgsError(`argument "variantKind" must be one of ${VARIANT_KINDS.join(", ")}`);
          }
          return empirical.similarRuns({
            ...(typeof object.scenarioId === "string" ? { scenarioId: object.scenarioId } : {}),
            ...(variantKind === undefined ? {} : { variantKind: variantKind as VariantKind }),
            ...(typeof object.provider === "string" ? { provider: object.provider } : {}),
            ...(typeof object.model === "string" ? { model: object.model } : {}),
          });
        },
      }),
    );
  }

  if (application.recipes !== undefined) {
    const recipes = application.recipes;
    tools.push(
      tool({
        name: "palimpsest_recipes",
        description: "Read-only recipe catalog: the versioned modes of working, their supported modifiers, honest per-capability readiness, and stated limitations (a recipe is descriptive product config, never authority)",
        mode: "read-only",
        actions: ["list", "inspect", "readiness"],
        extraProperties: { recipeId: { type: "string" } },
        run: async (action, object) => {
          if (action === "list") return recipes.list();
          if (action === "readiness") return recipes.readiness();
          return recipes.inspect(requiredString(object, "recipeId")) ?? null;
        },
      }),
    );
  }

  if (application.advisor !== undefined) {
    const advisor = application.advisor;
    tools.push(
      tool({
        name: "palimpsest_advisor",
        description: "Read-only empirical architecture advisor: profile a task and get eligible recipe plans with one plain-language recommendation, non-overridable blockers, and disclosed empirical uncertainty (a suggestion, never a chooser; no score/weight/health)",
        mode: "read-only",
        actions: ["profile", "recommend", "explain"],
        extraProperties: {
          task: { type: "string" },
          values: { type: "object" },
          taskProfile: { type: "object" },
          preferences: { type: "object" },
          userRequestedMultiAgent: { type: "boolean" },
        },
        run: async (action, object) => {
          if (action === "profile") {
            return advisor.profile({
              ...(typeof object.task === "string" ? { task: object.task } : {}),
              ...(object.values === undefined ? {} : { values: required(object, "values") as Readonly<Record<string, string>> }),
            });
          }
          const taskProfile = required(object, "taskProfile");
          if (typeof taskProfile !== "object" || taskProfile === null) throw new ToolArgsError("taskProfile must be an object");
          const input = {
            taskProfile: taskProfile as never,
            ...(object.preferences === undefined ? {} : { preferences: object.preferences as never }),
            ...(typeof object.userRequestedMultiAgent === "boolean" ? { userRequestedMultiAgent: object.userRequestedMultiAgent } : {}),
          };
          if (action === "recommend") return advisor.recommend(input);
          return advisor.explain(input);
        },
      }),
    );
  }

  if (application.recipeExecution !== undefined) {
    const recipeExecution = application.recipeExecution;
    tools.push(
      tool({
        name: "palimpsest_recipe",
        description: "Compile a recipe plan into a descriptive plan, report the execution bindings actually wired, and START it through the EXISTING governed services (compilation grants no authority; start never admits a claim, accepts a boundary, evolves anything, or forces a peer)",
        mode: "mutating",
        actions: ["compile", "start", "status"],
        extraProperties: { plan: { type: "object" }, compiled: { type: "object" }, context: { type: "object" } },
        run: async (action, object) => {
          if (action === "status") return recipeExecution.status();
          if (action === "compile") {
            const plan = required(object, "plan");
            if (typeof plan !== "object" || plan === null) throw new ToolArgsError("plan must be an object");
            return recipeExecution.compile(plan as never);
          }
          const compiled = required(object, "compiled");
          if (typeof compiled !== "object" || compiled === null) throw new ToolArgsError("compiled must be an object");
          const context = object.context;
          return recipeExecution.start(compiled as never, (typeof context === "object" && context !== null ? context : {}) as never);
        },
      }),
    );
  }

  if (application.proof !== undefined) {
    const proof = application.proof;
    tools.push(
      tool({
        name: "palimpsest_proof_source",
        description:
          "Authoritative source/evidence plane: explicitly import opaque source bytes, list known sources, inspect immutable revisions, and read source content ONLY through the explicit content port (source ≠ evidence; content access is never implicit; import triggers no model call)",
        mode: "mutating",
        actions: ["import", "list", "revisions", "inspect", "read_explicit"],
        extraProperties: {
          sourceId: { type: "string" },
          mediaType: { type: "string" },
          label: { type: "string" },
          provenance: { type: "string", enum: [...SOURCE_PROVENANCES] },
          content: { type: "string" },
          metadata: { type: "object" },
          revision: { type: "number" },
          contentDigest: { type: "string" },
          selector: { type: "object" },
        },
        run: async (action, object) => {
          if (action === "list") return proof.sources();
          if (action === "revisions") return proof.sourceRevisions(requiredString(object, "sourceId"));
          if (action === "inspect") {
            const sourceId = requiredString(object, "sourceId");
            const revision = requiredNumber(object, "revision");
            const revisions = await proof.sourceRevisions(sourceId);
            const found = revisions.find((entry) => entry.revision === revision);
            return found === undefined ? null : proof.inspectSource(found);
          }
          if (action === "read_explicit") {
            const ref = requiredRevisionRef(object);
            const bytes = await proof.readContentExplicit(ref);
            return bytes === undefined
              ? { state: "unavailable", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest }
              : { state: "available", sourceId: ref.sourceId, revision: ref.revision, contentDigest: ref.contentDigest, content: Buffer.from(bytes).toString("base64") };
          }
          const provenance = requiredString(object, "provenance");
          if (!(SOURCE_PROVENANCES as readonly string[]).includes(provenance)) throw new ToolArgsError(`argument "provenance" must be one of ${SOURCE_PROVENANCES.join(", ")}`);
          const metadata = object.metadata;
          return proof.importSource({
            bytes: new Uint8Array(Buffer.from(requiredString(object, "content"), "base64")),
            mediaType: requiredString(object, "mediaType"),
            label: requiredString(object, "label"),
            provenance: provenance as (typeof SOURCE_PROVENANCES)[number],
            sourceId: requiredString(object, "sourceId"),
            ...(metadata === undefined ? {} : { metadata: metadata as Readonly<Record<string, string>> }),
          });
        },
      }),
    );

    tools.push(
      tool({
        name: "palimpsest_proof",
        description:
          "Authoritative proof claims: list published claims, inspect derived standing/why, prepare a candidate from an ACTIVE reasoning claim, evaluate it through verification then a SEPARATE publication admission, and reassess. No caller-supplied standing or decision is ever accepted",
        mode: "mutating",
        actions: ["list", "inspect", "why", "prepare_publication", "evaluate_publication", "reassess", "analyze"],
        extraProperties: {
          claimId: { type: "string" },
          cellId: { type: "string" },
          candidateId: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" }, description: "Proof-plane evidence ids to analyze (allowlist)" },
          objective: { type: "string" },
          branchCount: { type: "number" },
        },
        run: async (action, object) => {
          if (action === "list") return proof.claims();
          if (action === "inspect") return proof.inspectClaim(requiredString(object, "claimId"));
          if (action === "why") return proof.why(requiredString(object, "claimId"));
          if (action === "prepare_publication") return proof.preparePublication({ cellId: requiredString(object, "cellId"), claimId: requiredString(object, "claimId") });
          if (action === "evaluate_publication") return proof.evaluatePublication({ candidateId: requiredString(object, "candidateId") });
          if (action === "analyze") {
            const evidenceIds = stringArray(object.evidenceIds ?? [], "evidenceIds");
            const branchCount = object.branchCount;
            if (branchCount !== undefined && (typeof branchCount !== "number" || !Number.isSafeInteger(branchCount) || branchCount < 1)) {
              throw new ToolArgsError('argument "branchCount" must be a positive integer');
            }
            return proof.analyzeEvidence({
              evidenceIds,
              objective: requiredString(object, "objective"),
              ...(branchCount === undefined ? {} : { branchCount }),
            });
          }
          return proof.reassess({ claimId: requiredString(object, "claimId") });
        },
      }),
    );
  }

  if (application.disclosure !== undefined) {
    const disclosure = application.disclosure;
    tools.push(
      tool({
        name: "palimpsest_disclosure",
        description:
          "Local, purpose-scoped disclosure over published proof claims: preview exactly what would be disclosed (with whole-source and staleness warnings), then approve-and-export through a SEPARATE admission to a local root. Preview ≠ approval; export ≠ recipient receipt; no federation send occurs",
        mode: "mutating",
        actions: ["preview", "approve_export", "history"],
        extraProperties: {
          purpose: { type: "string" },
          audienceLabel: { type: "string" },
          requestedClaimIds: { type: "array", items: { type: "string" } },
          previewId: { type: "string" },
        },
        run: async (action, object) => {
          if (action === "history") return disclosure.history();
          if (action === "approve_export") return disclosure.approveAndExport({ previewId: requiredString(object, "previewId") });
          return disclosure.preview({
            purpose: requiredString(object, "purpose"),
            audienceLabel: requiredString(object, "audienceLabel"),
            requestedClaimIds: stringArray(object.requestedClaimIds ?? [], "requestedClaimIds"),
          });
        },
      }),
    );
  }

  if (application.projectWorkspace !== undefined) {
    const workspace = application.projectWorkspace;
    tools.push(
      tool({
        name: "palimpsest_project",
        description:
          "The DERIVED project workspace: read the project overview, associated assets, derived open loops, and history; append a decision through the EXISTING ProjectIR validation; or record a journal entry. It owns no truth and copies no canonical fact. A decision is a ProjectIR lineage append (never an authority grant) and a journal entry is knowledge with no other canonical owner",
        mode: "mutating",
        actions: ["overview", "assets", "open_loops", "history", "decision", "journal"],
        extraProperties: {
          projectId: { type: "string", description: "defaults to this installation's project" },
          statement: { type: "string" },
          rationale: { type: "string" },
          evidenceIds: { type: "array", items: { type: "string" } },
          supersedes: { type: "string" },
          kind: { type: "string", enum: [...PROJECT_JOURNAL_KINDS] },
          title: { type: "string" },
          body: { type: "string" },
          provenance: { type: "string" },
          relatedRefs: { type: "array", items: { type: "object" }, description: "references to assets owned elsewhere (kind/id only; never a copy)" },
        },
        run: async (action, object) => {
          if (action === "overview") return workspace.view();
          if (action === "assets") return workspace.assets();
          if (action === "open_loops") return workspace.openLoops();
          if (action === "history") return workspace.history();
          if (action === "decision") {
            const evidenceIds = Array.isArray(object.evidenceIds) ? stringArray(object.evidenceIds, "evidenceIds") : [];
            return workspace.appendDecision({
              ...(typeof object.projectId === "string" && object.projectId.length > 0 ? { projectId: object.projectId } : {}),
              statement: requiredString(object, "statement"),
              rationale: requiredString(object, "rationale"),
              evidenceIds,
              ...(object.supersedes === undefined ? {} : { supersedes: requiredString(object, "supersedes") }),
            });
          }
          return workspace.recordJournalEntry({
            ...(typeof object.projectId === "string" && object.projectId.length > 0 ? { projectId: object.projectId } : {}),
            kind: requiredString(object, "kind") as (typeof PROJECT_JOURNAL_KINDS)[number],
            title: requiredString(object, "title"),
            body: requiredString(object, "body"),
            provenance: requiredString(object, "provenance"),
            ...(object.relatedRefs === undefined ? {} : { relatedRefs: object.relatedRefs as never }),
          });
        },
      }),
    );
  }

  if (application.projectManagement !== undefined) {
    const management = application.projectManagement;
    tools.push(
      tool({
        name: "palimpsest_manage",
        description:
          "Graduated project-management autonomy (mode ≠ authority): inspect status, list recommendations, preview the next bounded step, execute one bounded local step or a bounded run through the EXISTING governed services, REQUEST an involvement change, or run the mechanical project-head reconciliation. It can never grant authority/commitment/disclosure, can never set the mode upward — only the operator control plane does — and reconciling the head never promotes an attempt",
        mode: "mutating",
        actions: ["status", "recommend", "preview", "step", "run", "request_mode_change", "reconcile_project_head"],
        extraProperties: {
          confirmed: { type: "boolean", description: "confirms a step that sits on a confirmation boundary" },
          maxSteps: { type: "number", description: "bounded run budget; never exceeds the operator profile budget" },
          to: { type: "string", enum: [...MANAGEMENT_INVOLVEMENTS], description: "the involvement being REQUESTED (a request only; never applied here)" },
        },
        run: async (action, object) => {
          if (action === "status") return management.status();
          if (action === "recommend") return management.recommend();
          if (action === "preview") return management.preview();
          // G10-X: the mechanical head reconciliation. No caller head/commit/plan
          // is accepted; it delegates to the canonical controller derivation.
          if (action === "reconcile_project_head") return management.reconcileProjectHead();
          if (action === "request_mode_change") {
            const to = requiredString(object, "to");
            if (!(MANAGEMENT_INVOLVEMENTS as readonly string[]).includes(to)) {
              throw new ToolArgsError(`argument "to" must be one of ${MANAGEMENT_INVOLVEMENTS.join(", ")}`);
            }
            return management.requestModeChange({ to: to as (typeof MANAGEMENT_INVOLVEMENTS)[number] });
          }
          if (action === "step") {
            if (object.confirmed !== undefined && typeof object.confirmed !== "boolean") throw new ToolArgsError('argument "confirmed" must be a boolean');
            return management.step(object.confirmed === undefined ? {} : { confirmed: object.confirmed });
          }
          const maxSteps = object.maxSteps;
          if (maxSteps !== undefined && (typeof maxSteps !== "number" || !Number.isSafeInteger(maxSteps) || maxSteps < 1)) {
            throw new ToolArgsError('argument "maxSteps" must be a positive integer');
          }
          return management.run(maxSteps === undefined ? {} : { maxSteps });
        },
      }),
    );
  }

  if (application.projections !== undefined) {
    const projections = application.projections;    tools.push(
      tool({
        name: "palimpsest_graph",
        description: "Read-only MultiGraph projections: typed nodes/edges per species with canonical refs, per-source bases, and an honest known/unknown/error/stale knowledge state (never a canonical graph)",
        mode: "read-only",
        actions: ["work", "organization", "collaboration", "runtime", "reasoning"],
        extraProperties: { organizationDefinitionId: { type: "string" }, cellId: { type: "string" } },
        run: async (action, object) => {
          if (action === "work") return projections.work();
          if (action === "organization") return projections.organization({ organizationDefinitionId: requiredString(object, "organizationDefinitionId") });
          if (action === "collaboration") return projections.collaboration();
          if (action === "runtime") return projections.runtime();
          return projections.reasoning({ cellId: requiredString(object, "cellId") });
        },
      }),
    );
  }

  return tools;
}
