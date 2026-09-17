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
import { PROJECT_JOURNAL_KINDS, ProjectWorkspaceError } from "../project_workspace/index.js";
import { MANAGEMENT_INVOLVEMENTS } from "../project_management/index.js";
import { COLLABORATION_INTENTS, MAX_BRANCH_HINT, MIN_BRANCH_HINT } from "../interaction/index.js";
import {
  WORK_MODE_BASE_MODES,
  WORK_MODE_MODIFIERS,
} from "../project_operating/work_mode_profile.js";

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
        collaboration: application.collaboration !== undefined,
        // UX-B §28: the cross-project face (a missing one is never an empty directory).
        crossProject: application.crossProject !== undefined,
        proof: application.proof !== undefined,
        disclosure: application.disclosure !== undefined,
        projectWorkspace: application.projectWorkspace !== undefined,
        projectManagement: application.projectManagement !== undefined,
        // G10-AD §23: the project-head verification face (status/history/request).
        verification: application.verification !== undefined,
        // G10-AE §28: the external asset library bridge (read/prepare face only).
        externalAssets: application.externalAssets !== undefined,
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

  if (application.collaboration !== undefined) {
    const collaboration = application.collaboration;
    tools.push(
      tool({
        name: "palimpsest_collaborate",
        description:
          "ONE-REQUEST LOCAL COLLABORATION (UX-A): use this when the user asks, in ordinary language, for parallel or multi-agent work on the CURRENT project — 并行探索 / 同时研究多种方案 / 给我多个相互独立的思路 / 多角度分析 / 比较几种方案 and English equivalents such as parallel investigation, several independent approaches, compare the options, break this into independent parts, or get a second independent line of reasoning. It also answers a request to verify the CURRENT project state (检查当前项目状态是否通过验证 / check the current project state / is this still valid?). State the task in the user's own words and Palimpsest decides, through the existing architecture advisor, whether another collaboration boundary has engineering value. `plan` is a read-only derivation (it profiles the task, consults the architecture advisor and the derived posture/verification availability, and returns the structure chosen, why, and any capability warning); `run` [mutating] executes only the EXISTING governed recipe/verification paths and returns the findings and any verification result in plain language. intent AUTO (default; the advisor selects) | FOCUS | PARALLEL | CHECK | PARALLEL_AND_CHECK. FOCUS creates no branch and no agent. PARALLEL uses bounded EPHEMERAL reasoning branches: their findings are EXPLORATORY, are NOT Evidence and are not verified truth, and no durable peer, agent identity or commitment is minted. CHECK runs the REAL Project Verification runtime against the EXACT current Project Head: it verifies PROJECT STATE, never the PARALLEL findings. `run` may honestly answer CAPABILITY_REQUIRED / CROSS_PROJECT_REQUIRED / PARTIAL. Raw recipe ids, plan objects, agent ids, commands, authority flags, peer refs and verification results are NOT accepted — the advisor still selects, the compiler still compiles, and ReasoningCell/ProjectVerification still own their semantics. Use `palimpsest_recipe`/`palimpsest_reasoning` only for expert, step-by-step control; `truth` is never returned (a PASS is a protocol result)",
        mode: "mutating",
        actions: ["plan", "run"],
        extraProperties: {
          task: {
            type: "string",
            description:
              "the task or question in the user's own words (e.g. “并行研究这个问题，给我两种独立思路” / “check whether the current project state still passes”)",
          },
          intent: {
            type: "string",
            enum: [...COLLABORATION_INTENTS],
            description: "AUTO (default; let the advisor decide) | FOCUS | PARALLEL | CHECK | PARALLEL_AND_CHECK",
          },
          branchCountHint: {
            type: "number",
            description: `advanced, bounded local branch count (${MIN_BRANCH_HINT}..${MAX_BRANCH_HINT}); out-of-range is refused, never clamped`,
          },
          verifierRef: { type: "string", description: "an already-REGISTERED verifier ref that CHECK may bind" },
          values: {
            type: "object",
            description:
              "explicit task-feature values (USER_DECLARED) that override the untrusted profiler proposal; keys are the nine task feature names",
          },
        },
        run: async (action, object) => {
          const intent = object.intent;
          if (
            intent !== undefined &&
            (typeof intent !== "string" || !(COLLABORATION_INTENTS as readonly string[]).includes(intent))
          ) {
            throw new ToolArgsError(`argument "intent" must be one of ${COLLABORATION_INTENTS.join(", ")}`);
          }
          const branchCountHint = object.branchCountHint;
          if (branchCountHint !== undefined && (typeof branchCountHint !== "number" || !Number.isSafeInteger(branchCountHint))) {
            throw new ToolArgsError('argument "branchCountHint" must be an integer');
          }
          const values = object.values;
          if (values !== undefined && (typeof values !== "object" || values === null || Array.isArray(values))) {
            throw new ToolArgsError('argument "values" must be an object');
          }
          const verifierRef = object.verifierRef;
          if (verifierRef !== undefined && (typeof verifierRef !== "string" || verifierRef.trim() === "")) {
            throw new ToolArgsError('argument "verifierRef" must be a non-empty string');
          }
          // The caller supplies the task, an optional intent and the bounded hints —
          // never an identity, a plan or an authority. `requestedBy` is derived here.
          const request = {
            task: requiredString(object, "task"),
            requestedBy: "agent:palimpsest_collaborate",
            ...(intent === undefined ? {} : { intent: intent as (typeof COLLABORATION_INTENTS)[number] }),
            ...(branchCountHint === undefined ? {} : { branchCountHint }),
            ...(verifierRef === undefined ? {} : { verifierRef }),
            ...(values === undefined ? {} : { taskProfileOverrides: values as Readonly<Record<string, string>> }),
          };
          return action === "plan" ? collaboration.plan(request) : collaboration.run(request);
        },
      }),
    );
  }

  if (application.crossProject !== undefined) {
    const crossProject = application.crossProject;
    tools.push(
      tool({
        name: "palimpsest_cross_project",
        description:
          "ONE-REQUEST CROSS-PROJECT COLLABORATION (UX-B): use this when the user wants to ask, consult or check ANOTHER project in ordinary language — 问一下另一个项目 / 咨询一下 optics 项目 / 别的项目之前是否研究过这个问题 / ask the optics project / consult the other project / did the other project already look into this? — without knowing peer ids, threads or federation mechanics and without switching project. `projects` is the READ-ONLY deployment directory of projects this installation may reach; `prepare` is a READ-ONLY preview of the EXACT packet that would be sent (task text plus any explicitly supplied context, and nothing else — no workspace, journal, asset or proof data is ever attached automatically); `ask` [mutating] sends ONE ordinary peer message and returns immediately (one request is NOT one round trip, and no answer is awaited; asking creates NO commitment, Work task, ProjectIR revision, boundary change, Evidence or Proof — Ask stays Ask); `status` is a READ-ONLY derivation of what is known so far (no response yet means WAITING, not failure, and materially different answers are reported as CONFLICT rather than picked); `pending` lists the authenticated questions OTHER projects have asked THIS one; `respond` [mutating] answers one of them on its own thread (use compose.{\"task\",\"intent\"} to answer with this project's own local collaboration instead of authoring text); `receive` [mutating] surfaces the terminal answer and marks that answer processed; `acknowledge` [mutating] marks ONE consumed peer message as processed. `target` is the other project's NAME as the user would say it (its id, display name or alias) — never a peer id; an unknown or ambiguous name sends nothing. An answer is peer communication, not Evidence, Proof, Decision or Commitment, and is never imported automatically.",
        mode: "mutating",
        actions: ["projects", "prepare", "ask", "status", "pending", "respond", "receive", "acknowledge"],
        extraProperties: {
          target: {
            type: "string",
            description:
              "the other project's name as the user would say it, e.g. \"optics\" (its id, display name or alias) — never a peer id",
          },
          task: {
            type: "string",
            description:
              "the question in the user's own words (e.g. “我们之前是否研究过探测器孔径对接收稳定性的影响？” / “has this been investigated before?”)",
          },
          contextText: { type: "string", description: "optional context text to include EXACTLY as given; nothing else is sent" },
          requestId: { type: "string", description: "the cross-project request id (from `ask`, `pending` or `prepare`)" },
          answer: {
            type: "object",
            description:
              "what to reply with: {status?: ANSWERED|PARTIAL|DECLINED|ERROR, answer?, detail?} for authored text, or {compose:{task?,intent?}} to answer using this project's own local collaboration",
          },
          message: {
            type: "object",
            description: "the full peer message to acknowledge (the object returned by `pending`/`status`/`receive` is not it — use the message the inbox returned)",
          },
        },
        run: async (action, object) => {
          if (action === "projects") return crossProject.projects();
          if (action === "pending") return crossProject.pending();
          if (action === "prepare") {
            return crossProject.prepareAsk({
              target: requiredString(object, "target"),
              task: requiredString(object, "task"),
              ...(object.contextText === undefined ? {} : { contextText: requiredString(object, "contextText") }),
              requestedBy: "agent:palimpsest_cross_project",
            });
          }
          if (action === "ask") {
            return crossProject.ask({
              target: requiredString(object, "target"),
              task: requiredString(object, "task"),
              ...(object.contextText === undefined ? {} : { contextText: requiredString(object, "contextText") }),
              requestedBy: "agent:palimpsest_cross_project",
            });
          }
          if (action === "status") return crossProject.status(requiredString(object, "requestId"));
          if (action === "receive") return crossProject.receive(requiredString(object, "requestId"));
          if (action === "respond") {
            return crossProject.respond(requiredString(object, "requestId"), object.answer);
          }
          return crossProject.acknowledge(required(object, "message"));
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
          // G10-AE-R §9/§15: a NAMED project is never silently ignored. Every action
          // below is scoped to THIS installation's project, so a caller naming another
          // project must be refused rather than handed this project's data as if it
          // were that one's (the baseline silently dropped the parameter on the read
          // actions, so `{action:"assets", projectId:"project-B"}` answered with A's
          // assets and no indication the scope had been ignored). The mutating actions
          // below forward the id to the service's own fence; this one guard covers both.
          const named =
            typeof object.projectId === "string" && object.projectId.length > 0
              ? object.projectId
              : undefined;
          if (named !== undefined) {
            const current = (await workspace.view()).projectId;
            if (named !== current) {
              throw new ProjectWorkspaceError(
                "invalid_registration",
                `project "${named}" is not this installation's project "${current}"`,
              );
            }
          }
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
        actions: [
          "status",
          "recommend",
          "preview",
          "step",
          "run",
          "request_mode_change",
          "reconcile_project_head",
          // G10-AB (additive): the derived operating posture, the durable management activity
          // history, and a Work Mode REQUEST. Reading is read-only; the request never persists
          // the user-level default - only the operator control plane does.
          "posture",
          "activity",
          "request_work_mode_change",
        ],
        extraProperties: {
          confirmed: { type: "boolean", description: "confirms a step that sits on a confirmation boundary" },
          maxSteps: { type: "number", description: "bounded run budget; never exceeds the operator profile budget" },
          to: { type: "string", enum: [...MANAGEMENT_INVOLVEMENTS], description: "the involvement being REQUESTED (a request only; never applied here)" },
          baseMode: { type: "string", enum: ["FOCUS", "EXPLORE", "COORDINATE"], description: "the Work Mode being REQUESTED (a request only; never persisted here)" },
          modifiers: { type: "array", items: { type: "string", enum: ["VERIFY", "MONITOR"] }, description: "the Work Mode modifiers being REQUESTED" },
          limit: { type: "number", description: "how many recent activity records to return" },
        },
        run: async (action, object) => {
          if (action === "status") return management.status();
          if (action === "recommend") return management.recommend();
          if (action === "preview") return management.preview();
          // G10-X: the mechanical head reconciliation. No caller head/commit/plan
          // is accepted; it delegates to the canonical controller derivation.
          if (action === "reconcile_project_head") return management.reconcileProjectHead();
          if (action === "posture") return management.posture();
          if (action === "activity") {
            const limit = object.limit;
            if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1)) {
              throw new ToolArgsError('argument "limit" must be a positive integer');
            }
            return management.activity(limit === undefined ? undefined : limit);
          }
          if (action === "request_work_mode_change") {
            const baseMode = requiredString(object, "baseMode");
            if (!WORK_MODE_BASE_MODES.includes(baseMode as never)) {
              throw new ToolArgsError(`argument "baseMode" must be one of ${WORK_MODE_BASE_MODES.join(", ")}`);
            }
            const modifiers = stringArray(object.modifiers ?? [], "modifiers");
            for (const modifier of modifiers) {
              if (!WORK_MODE_MODIFIERS.includes(modifier as never)) {
                throw new ToolArgsError(`argument "modifiers" entries must be one of ${WORK_MODE_MODIFIERS.join(", ")}`);
              }
            }
            // A REQUEST only: an agent recommendation is never an operator preference change.
            return management.requestWorkModeChange({
              baseMode: baseMode as (typeof WORK_MODE_BASE_MODES)[number],
              modifiers: modifiers as readonly (typeof WORK_MODE_MODIFIERS)[number][],
            });
          }
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

  /*
   * G10-AD §22/§23: the AGENT face of Project Verification.
   *
   *   VerificationResult ≠ Truth, ≠ Work Evidence, ≠ Proof publication,
   *   ≠ Reasoning admission, ≠ task state, ≠ authority
   *
   * The tool can read the DERIVED current-head status and the append-only
   * history, and it can REQUEST a verification of the exact current project head
   * under a REGISTERED verifier ref. It cannot register a verifier, change an
   * independence class, supply a command, or claim its own context is independent:
   * the only verifier-shaped input is a registered `verifierRef` the runtime
   * resolves (and refuses when unknown).
   */
  if (application.verification !== undefined) {
    const verification = application.verification;
    tools.push(
      tool({
        name: "palimpsest_verification",
        description:
          "Project-head verification: read the DERIVED status of the exact current ProjectIR head, read the append-only run history, or request a verification under a REGISTERED verifier protocol. A PASS means only 'that named protocol passed' — it is not truth, not Work Evidence, not Proof publication, not Reasoning admission, not task state and not authority. An agent can never register a verifier, change an independence class, supply a command, or verify an arbitrary commit",
        mode: "mutating",
        actions: ["status", "history", "verify_current_head"],
        extraProperties: {
          verifierRef: { type: "string", description: "a REGISTERED verifier ref to select; never a command" },
          reason: { type: "string" },
          limit: { type: "number", description: "how many recent runs to return (newest first)" },
        },
        run: async (action, object) => {
          if (action === "status") return verification.status();
          if (action === "history") {
            const limit = object.limit;
            if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1)) {
              throw new ToolArgsError('argument "limit" must be a positive integer');
            }
            return verification.history(limit === undefined ? undefined : limit);
          }
          return verification.verifyCurrentHead({
            ...(object.verifierRef === undefined ? {} : { verifierRef: requiredString(object, "verifierRef") }),
            ...(object.reason === undefined ? {} : { reason: requiredString(object, "reason") }),
          });
        },
      }),
    );
  }

  /*
   * G10-AE §13/§28: the AGENT face of the External Asset Library bridge.
   *
   *   SearchResult != StableAssetRef      ExternalAsset != ProjectContext
   *   Reference != Import                 Import != TruthAdmission
   *   PublicationPreview != Publication   AgentPrepare != OperatorApproval
   *
   * The tool can list providers, search the external library, inspect an exact
   * revision and PREPARE a reference / an import / a publication preview. It
   * deliberately has NO `commit_reference`, NO `commit_import` and NO
   * `approve_publish`: those are operator-explicit operations on the application
   * surface, and publication approval additionally lives behind the plane's
   * separate admission port. The tool is `read-only` in mode because every action
   * it exposes persists nothing — a search page is ephemeral, an inspection is a
   * snapshot, and a prepared candidate is a candidate.
   */
  if (application.externalAssets !== undefined) {
    const externalAssets = application.externalAssets;
    tools.push(
      tool({
        name: "palimpsest_external_assets",
        description:
          "The external asset library bridge (READ/PREPARE ONLY): list the configured providers and their capabilities, search an external library (ephemeral hits, zero project mutation), inspect the EXACT digest-bound revision of one asset, and prepare a read-only reference candidate, import candidate or publication preview for an operator to commit. Search and inspect never enter project context; a search hit is never a durable reference; a prepared preview is not a publication. This tool can NOT commit a reference, can NOT import into the Journal and can NOT approve a publication",
        mode: "read-only",
        actions: ["providers", "search", "inspect", "prepare_reference", "prepare_import", "prepare_publication"],
        extraProperties: {
          providerId: { type: "string", description: "a CONFIGURED provider id (never a URL or a credential)" },
          text: { type: "string", description: "the search text; queries are never persisted by Palimpsest" },
          limit: { type: "number", description: "a positive page bound" },
          assetTypes: { type: "array", items: { type: "string" }, description: "provider-owned asset types to filter by" },
          assetId: { type: "string" },
          contentDigest: { type: "string", description: "the EXACT sha256 revision to resolve; a newer revision never substitutes" },
          externalRef: { type: "object", description: "an exact ExternalAssetStableRef (providerId/assetId/contentDigest/refDigest)" },
          journalKind: { type: "string", enum: [...PROJECT_JOURNAL_KINDS], description: "the EXPLICIT Journal kind an import would target; never derived from a provider type" },
          title: { type: "string" },
          sourceLocator: { type: "string" },
          targetAssetType: { type: "string", description: "the provider-owned type the outbound publication would declare" },
          journalEntryId: { type: "string", description: "the LOCAL journal entry a publication preview would export" },
          projectId: { type: "string", description: "defaults to this installation's project" },
        },
        run: async (action, object) => {
          if (action === "providers") return externalAssets.providers();
          const projectId = typeof object.projectId === "string" && object.projectId.length > 0 ? object.projectId : undefined;
          if (action === "search") {
            const limit = object.limit;
            if (limit !== undefined && (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1)) {
              throw new ToolArgsError('argument "limit" must be a positive integer');
            }
            const assetTypes = Array.isArray(object.assetTypes) ? stringArray(object.assetTypes, "assetTypes") : [];
            return externalAssets.search({
              providerId: requiredString(object, "providerId"),
              text: requiredString(object, "text"),
              ...(limit === undefined ? {} : { limit }),
              ...(assetTypes.length === 0 ? {} : { assetTypes }),
            });
          }
          if (action === "inspect") {
            return externalAssets.inspect({
              providerId: requiredString(object, "providerId"),
              assetId: requiredString(object, "assetId"),
              ...(object.contentDigest === undefined
                ? {}
                : { contentDigest: requiredString(object, "contentDigest") }),
            });
          }
          if (action === "prepare_reference") {
            return externalAssets.prepareReference({
              providerId: requiredString(object, "providerId"),
              assetId: requiredString(object, "assetId"),
              ...(object.contentDigest === undefined
                ? {}
                : { contentDigest: requiredString(object, "contentDigest") }),
              ...(projectId === undefined ? {} : { projectId }),
            });
          }
          if (action === "prepare_import") {
            const journalKind = requiredString(object, "journalKind");
            if (!(PROJECT_JOURNAL_KINDS as readonly string[]).includes(journalKind)) {
              throw new ToolArgsError(`argument "journalKind" must be one of ${PROJECT_JOURNAL_KINDS.join(", ")}`);
            }
            return externalAssets.prepareImport({
              externalRef: required(object, "externalRef") as never,
              journalKind: journalKind as (typeof PROJECT_JOURNAL_KINDS)[number],
              title: requiredString(object, "title"),
              ...(object.sourceLocator === undefined
                ? {}
                : { sourceLocator: requiredString(object, "sourceLocator") }),
              ...(projectId === undefined ? {} : { projectId }),
            });
          }
          return externalAssets.preparePublication({
            providerId: requiredString(object, "providerId"),
            targetAssetType: requiredString(object, "targetAssetType"),
            journalEntryId: requiredString(object, "journalEntryId"),
            ...(projectId === undefined ? {} : { projectId }),
          });
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
