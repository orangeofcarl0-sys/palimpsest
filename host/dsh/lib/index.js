// palimpsest-dsh-host — register the Palimpsest product tools into the REAL DSH
// tool registry and (optionally) serve the application surface over HTTP.
//
// This is the contract-zero switch the structural DshPluginContext anticipated:
// Palimpsest's tool definitions already match @deepseek-ai/dsh-tools'
// ToolDefinition shape, so registration is a passthrough. Only `output.schema`
// is relaxed to `{}` because the host validates the returned value against it
// and Palimpsest tools legitimately return arrays as well as objects.
//
// The deployment is built by Palimpsest itself (launchDeployment) from a typed
// deployment profile; this plugin never carries semantic authority.

import { pathToFileURL } from 'node:url';
import z from '@deepseek-ai/schemastery';

export const name = 'palimpsest-tools';
export const inject = ['tools'];

export const Config = z.object({
  /** Absolute path to Palimpsest's built `dist/src/advanced.js`. */
  palimpsestEntry: z.string().required(),
  /** Absolute path to the deployment profile JSON for THIS principal. */
  deploymentProfile: z.string().required(),
  serve: z.boolean().default(false),
  port: z.number().default(0),
  host: z.string().default('127.0.0.1'),
  token: z.string().default('palimpsest-dogfood'),
  /**
   * Optional absolute path to the canonical SQLite ReasoningCell store. When set,
   * this bundle also registers `palimpsest_reasoning` against that store so an
   * EPHEMERAL branch agent can read a frozen brief and submit structured
   * candidates. The store is SHARED with the calling harness; a branch can never
   * admit (only the harness's own ReasoningCellService evaluates).
   */
  reasoningCellStore: z.string().default(''),
});

function toRealTool(definition) {
  return {
    name: definition.name,
    description: definition.description,
    parameters: definition.parameters,
    // The host validates the returned canonical value against output.schema and
    // renders it through render(); Palimpsest's schema is a permissive object.
    output: { schema: {}, render: definition.output.render },
    ...(definition.timeoutMs === undefined ? {} : { timeoutMs: definition.timeoutMs }),
    ...(definition.isConcurrencySafe === undefined ? {} : { isConcurrencySafe: definition.isConcurrencySafe }),
    execute: definition.execute,
  };
}

export async function apply(ctx, config) {
  const palimpsest = await import(pathToFileURL(config.palimpsestEntry).href);
  const profile = palimpsest.loadDeploymentProfile(config.deploymentProfile);

  const toolNames = [];
  const context = {
    tools: {
      register(definition) {
        toolNames.push(definition.name);
        // Register into the REAL DSH registry; its disposer is honoured on teardown.
        return ctx.tools.register(toRealTool(definition));
      },
    },
  };

  const deployment = palimpsest.launchDeployment(profile, { context });

  // Optional EPHEMERAL branch-cognition wiring. A branch is NOT a principal: it
  // can read the frozen brief and submit structured candidates through the REAL
  // ReasoningCell service, but it can NEVER open a branch, evaluate/admit, or
  // invalidate. The store is shared with the calling harness, which owns
  // verification and admission.
  let reasoningStore;
  if (config.reasoningCellStore.length > 0) {
    reasoningStore = new palimpsest.SqliteReasoningCellStore(config.reasoningCellStore);
    const verificationPolicy = {
      verify: async ({ definition, candidate, frontierBasis }) => {
        const base = {
          schemaVersion: 1,
          cell: candidate.cell,
          candidateDigest: candidate.candidateDigest,
          frontierBasis,
          verificationPolicyRef: definition.verificationPolicyRef,
          standing: 'SUPPORTED',
          supportingEvidenceIds: [],
          contradictingEvidenceIds: [],
          provenanceDigest: '0'.repeat(64),
        };
        return { ...base, digest: palimpsest.reasoningVerificationDigestOf(base) };
      },
    };
    const admissionPolicy = {
      admit: async ({ definition, candidate, verification, frontierBasis }) => {
        const base = {
          schemaVersion: 1,
          cell: candidate.cell,
          candidateDigest: candidate.candidateDigest,
          verificationResultDigest: verification.digest,
          frontierBasis,
          admissionPolicyRef: definition.admissionPolicyRef,
          decision: 'ADMIT',
          provenanceDigest: '1'.repeat(64),
        };
        return { ...base, digest: palimpsest.reasoningAdmissionDigestOf(base) };
      },
    };
    const reasoningService = palimpsest.makeReasoningCellService({ store: reasoningStore, verificationPolicy, admissionPolicy });
    const forbidden = (what) => async () => {
      throw new Error(`EPHEMERAL_BRANCH_FORBIDDEN: a branch may not ${what}; it may only read the frozen brief and submit one candidate`);
    };
    const reasoningSurface = {
      view: (cellId) => reasoningService.cellView({ cellId }),
      frontier: (cellId) => reasoningService.frontier({ cellId }),
      graph: (cellId) => reasoningService.claimGraph({ cellId }),
      brief: (input) => reasoningService.branchBrief(input),
      openBranch: forbidden('open a branch'),
      // A branch MAY submit exactly one structured candidate, INCLUDING the opaque
      // `externalEvidenceRefs` it actually used. The runner enforces that those
      // refs stay inside the frozen allowlist; the tool surface grants no proof or
      // publication capability to a branch.
      submitCandidate: (input) =>
        reasoningService.submitCandidate({
          ...input,
          ...(Array.isArray(input?.externalEvidenceRefs) ? { externalEvidenceRefs: input.externalEvidenceRefs } : {}),
        }),
      evaluate: forbidden('evaluate or admit'),
      invalidate: forbidden('invalidate a claim'),
    };
    const reasoningDefinition = palimpsest
      .defineApplicationTools({ reasoning: reasoningSurface })
      .find((definition) => definition.name === 'palimpsest_reasoning');
    if (reasoningDefinition !== undefined) {
      context.tools.register(reasoningDefinition);
    }
  }

  let serve;
  if (config.serve === true) {
    serve = await palimpsest.serveOrchestration(deployment.installed.controller, {
      port: config.port,
      host: config.host,
      token: config.token,
      application: deployment.installed.application,
    });
  }

  ctx.provide('palimpsestHost', {
    deployment,
    profile,
    serve,
    toolNames,
    palimpsest,
  });

  ctx.effect(function* () {
    yield async () => {
      try {
        await serve?.close?.();
      } catch {
        /* the harness may already have closed the socket */
      }
      await deployment.close();
      try {
        reasoningStore?.close?.();
      } catch {
        /* the store may already be closed */
      }
    };
  }, 'palimpsest-host lifecycle');
}

export { toRealTool };
