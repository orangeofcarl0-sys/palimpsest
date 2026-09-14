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
    };
  }, 'palimpsest-host lifecycle');
}

export { toRealTool };
