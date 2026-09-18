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
//
// UX-C §16/§18/SC-7: the MODE is dispatched BEFORE any deployment composition.
// `dsh --profile <p> --branch <file>` composes ONLY the minimal branch environment
// (one strict `palimpsest_branch_result` tool and the frozen brief); it never
// launches the durable project stack, never registers a principal tool, and never
// composes a ReasoningCell service.

import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import z from '@deepseek-ai/schemastery';

export const name = 'palimpsest-tools';
export const inject = ['tools', 'agents'];

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
   * Advanced: an explicit path to a DSH bin for branch execution. Absent ⇒ this
   * host derives it from its own invocation (`process.argv[1]`) plus `--profile`.
   */
  dshBin: z.string().default(''),
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

/** Read one `--flag value` from the raw command line (no semantic effect). */
function flagValue(name) {
  const argv = process.argv;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) {
      const value = argv[index + 1];
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    }
    if (typeof argv[index] === 'string' && argv[index].startsWith(`${name}=`)) {
      const value = argv[index].slice(name.length + 1);
      return value.length > 0 ? value : undefined;
    }
  }
  return undefined;
}

/**
 * UX-C §20: the HOST derives the ephemeral branch execution port from its own
 * runtime knowledge — the DSH bin it was launched with and the profile it runs
 * under. A normal user supplies neither the bin path nor a separate branch profile.
 */
function deriveBranchExecution(palimpsest, profile) {
  if (profile.reasoning === undefined) return undefined;
  const profileName = flagValue('--profile');
  const bin = process.env.PALIMPSEST_DSH_BIN?.trim() || (typeof process.argv[1] === 'string' && process.argv[1].endsWith('.js') ? process.argv[1] : undefined);
  if (profileName === undefined || bin === undefined) return undefined;
  if (typeof palimpsest.dshSubprocessBranchExecutionPort !== 'function') return undefined;
  try {
    return palimpsest.dshSubprocessBranchExecutionPort({
      dshBin: bin,
      profile: profileName,
      workDir: process.cwd(),
    });
  } catch {
    return undefined;
  }
}

/**
 * BRANCH MODE: compose the minimal branch environment and nothing else. The
 * runner reads `host.branch` and prints the ONE result line.
 */
async function applyBranch(ctx, palimpsest, branchFile) {
  const toolNames = [];
  const context = {
    tools: {
      register(definition) {
        toolNames.push(definition.name);
        return ctx.tools.register(toRealTool(definition));
      },
    },
  };
  let raw;
  try {
    raw = JSON.parse(readFileSync(branchFile, 'utf8'));
  } catch (error) {
    ctx.provide('palimpsestHost', {
      branch: { error: `the branch payload could not be read: ${error?.message ?? String(error)}` },
      palimpsest,
      toolNames,
    });
    return;
  }
  const composed = palimpsest.composeBranchHostEnvironment(raw);
  if (composed.ok !== true) {
    ctx.provide('palimpsestHost', { branch: { error: composed.detail }, palimpsest, toolNames });
    return;
  }
  const environment = composed.environment;
  context.tools.register(environment.tool);
  ctx.provide('palimpsestHost', { palimpsest, branch: environment, toolNames });
  // A branch holds NO deployment, NO store and NO durable identity, so there is no
  // lifecycle effect to register: the process simply exits after printing its result.
}

export async function apply(ctx, config) {
  const palimpsest = await import(pathToFileURL(config.palimpsestEntry).href);

  // §18/SC-7: dispatch BEFORE composing anything.
  const branchFile = flagValue('--branch');
  if (branchFile !== undefined) {
    return applyBranch(ctx, palimpsest, branchFile);
  }

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

  // UX-C §20/§26: the host supplies the agents service (used only when the profile
  // explicitly binds a DSH session) and the host-derived branch execution port. The
  // packaged reasoning policies and store come from the DEPLOYMENT PROFILE, not from
  // any hard-coded host policy: the fabricating SUPPORTED policy is gone (SC-5).
  const agents = ctx.get('agents');
  const branchExecution = deriveBranchExecution(palimpsest, profile);
  const deployment = palimpsest.launchDeployment(profile, {
    context,
    host: {
      ...(agents === undefined ? {} : { dshAgents: agents }),
      ...(branchExecution === undefined ? {} : { branchExecution }),
    },
  });

  let serve;
  if (config.serve === true) {
    serve = await palimpsest.serveOrchestration(deployment.installed.controller, {
      port: config.port,
      host: config.host,
      token: config.token,
      application: deployment.installed.application,
    });
    // The dashboard is behind a bearer token. `palimpsest serve` prints the url AND the token; this
    // path exposed the url only (in the readiness record), so the page was reachable only by knowing
    // the configured default — which is how I reached it, and no user can. Print both, in the same
    // line shape the CLI already uses, where the operator is already looking.
    process.stdout.write(`PALIMPSEST_DASHBOARD ${JSON.stringify({ url: serve.url, token: serve.token })}\n`);
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
    };
  }, 'palimpsest-host lifecycle');
}

export { toRealTool, flagValue, deriveBranchExecution };
